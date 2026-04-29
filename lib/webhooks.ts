import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

export type WebhookEventType =
  | 'lead.created'
  | 'lead.stage_changed'
  | 'lead.won'
  | 'lead.lost'
  | 'raiox.completed';

const MAX_ATTEMPTS = 3;
// Backoff em minutos por número de tentativa: 1, 5, 30 (total ~36min de retries antes de DLQ).
// Trocou-se de 5^n (que dava 155min total) por escala razoável para webhook crítico.
const BACKOFF_MIN: Record<number, number> = { 1: 1, 2: 5, 3: 30 };

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * Registra um evento de webhook na fila (webhook_events) e tenta entregar
 * imediatamente. Falhas vão para retry com backoff (`processAllPendingWebhooks`
 * roda via pg_cron a cada minuto).
 */
export async function dispatchWebhook(
  organizacao_id: string,
  event_type: WebhookEventType,
  payload: any
) {
  const supabaseAdmin = admin();

  const { data: webhooks, error } = await supabaseAdmin
    .from('webhooks')
    .select('id')
    .eq('organizacao_id', organizacao_id)
    .eq('active', true)
    .contains('events', [event_type]);

  if (error || !webhooks || webhooks.length === 0) {
    return;
  }

  const eventsToInsert = webhooks.map((wh) => ({
    webhook_id: wh.id,
    organizacao_id,
    event_type,
    payload,
    status: 'pending',
  }));

  const { error: insertError } = await supabaseAdmin
    .from('webhook_events')
    .insert(eventsToInsert);

  if (!insertError) {
    // Tenta entregar agora; falhas reagendam via backoff e o cron job pega depois.
    processWebhookQueue({ organizacao_id }).catch(console.error);
  }
}

/**
 * Processa eventos pendentes. Se `organizacao_id` for fornecido, processa só
 * dela. Se não, processa pendentes de todas as orgs (modo cron).
 */
export async function processWebhookQueue(opts: {
  organizacao_id?: string;
  limit?: number;
} = {}): Promise<{ processed: number; succeeded: number; failed: number }> {
  const supabaseAdmin = admin();
  let q = supabaseAdmin
    .from('webhook_events')
    .select('id, event_type, payload, attempts, webhooks(url, secret)')
    .eq('status', 'pending')
    .lte('next_attempt_at', new Date().toISOString())
    .order('next_attempt_at', { ascending: true })
    .limit(opts.limit ?? 50);

  if (opts.organizacao_id) q = q.eq('organizacao_id', opts.organizacao_id);

  const { data: events, error } = await q;
  if (error || !events || events.length === 0) {
    return { processed: 0, succeeded: 0, failed: 0 };
  }

  let succeeded = 0;
  let failed = 0;

  for (const event of events) {
    const webhook = event.webhooks as any;
    if (!webhook) continue;

    const bodyStr = JSON.stringify(event.payload);
    const signature = crypto
      .createHmac('sha256', webhook.secret)
      .update(bodyStr)
      .digest('hex');

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10_000);
      const res = await fetch(webhook.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Guilds-Event': event.event_type,
          'X-Guilds-Signature': `sha256=${signature}`,
        },
        body: bodyStr,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        await supabaseAdmin
          .from('webhook_events')
          .update({
            status: 'success',
            attempts: event.attempts + 1,
            last_attempt_at: new Date().toISOString(),
            error_message: null,
          })
          .eq('id', event.id);
        succeeded++;
      } else {
        throw new Error(`HTTP ${res.status} ${res.statusText}`.slice(0, 300));
      }
    } catch (err: any) {
      const attempts = event.attempts + 1;
      const exhausted = attempts >= MAX_ATTEMPTS;
      const minutesAhead = BACKOFF_MIN[attempts] ?? 60;
      const nextAttempt = new Date(Date.now() + minutesAhead * 60_000);
      const message = (err?.message ?? String(err)).slice(0, 500);

      await supabaseAdmin
        .from('webhook_events')
        .update({
          status: exhausted ? 'failed' : 'pending',
          attempts,
          last_attempt_at: new Date().toISOString(),
          next_attempt_at: exhausted ? new Date().toISOString() : nextAttempt.toISOString(),
          error_message: message,
        })
        .eq('id', event.id);
      if (exhausted) failed++;
    }
  }

  return { processed: events.length, succeeded, failed };
}

/**
 * Reprocessa um evento failed (DLQ → retry). Usado por gestor via UI ou
 * suporte. Reseta status, zera tentativas e dispara processamento.
 */
export async function reprocessWebhookEvent(event_id: string): Promise<boolean> {
  const supabaseAdmin = admin();
  const { error } = await supabaseAdmin
    .from('webhook_events')
    .update({
      status: 'pending',
      attempts: 0,
      next_attempt_at: new Date().toISOString(),
      error_message: null,
    })
    .eq('id', event_id);

  if (error) return false;
  processWebhookQueue({}).catch(console.error);
  return true;
}
