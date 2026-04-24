import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

export type WebhookEventType = 'lead.created' | 'lead.stage_changed' | 'lead.won' | 'lead.lost' | 'raiox.completed';

/**
 * Registra um evento de webhook na fila (webhook_events)
 * e aciona o processamento assíncrono.
 */
export async function dispatchWebhook(organizacao_id: string, event_type: WebhookEventType, payload: any) {
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // 1. Buscar webhooks ativos da organização inscritos neste evento
  const { data: webhooks, error } = await supabaseAdmin
    .from('webhooks')
    .select('id')
    .eq('organizacao_id', organizacao_id)
    .eq('active', true)
    .contains('events', [event_type]);

  if (error || !webhooks || webhooks.length === 0) {
    return; // Ninguém inscrito
  }

  // 2. Criar os eventos na fila
  const eventsToInsert = webhooks.map(wh => ({
    webhook_id: wh.id,
    organizacao_id,
    event_type,
    payload,
    status: 'pending'
  }));

  const { error: insertError } = await supabaseAdmin
    .from('webhook_events')
    .insert(eventsToInsert);

  if (!insertError) {
    // 3. Aciona o processamento assíncrono (não espera terminar)
    processWebhookQueue(organizacao_id).catch(console.error);
  }
}

/**
 * Processa a fila de webhooks pendentes para uma organização
 */
async function processWebhookQueue(organizacao_id: string) {
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Pega até 50 eventos pendentes
  const { data: events, error } = await supabaseAdmin
    .from('webhook_events')
    .select('id, event_type, payload, attempts, webhooks(url, secret)')
    .eq('organizacao_id', organizacao_id)
    .eq('status', 'pending')
    .lte('next_attempt_at', new Date().toISOString())
    .limit(50);

  if (error || !events || events.length === 0) return;

  for (const event of events) {
    const webhook = event.webhooks as any;
    if (!webhook) continue;

    const signature = crypto
      .createHmac('sha256', webhook.secret)
      .update(JSON.stringify(event.payload))
      .digest('hex');

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

      const res = await fetch(webhook.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Guilds-Event': event.event_type,
          'X-Guilds-Signature': `sha256=${signature}`
        },
        body: JSON.stringify(event.payload),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (res.ok) {
        await supabaseAdmin.from('webhook_events').update({ status: 'success', attempts: event.attempts + 1, last_attempt_at: new Date().toISOString() }).eq('id', event.id);
      } else {
        throw new Error(`HTTP ${res.status}`);
      }
    } catch (err: any) {
      const attempts = event.attempts + 1;
      const maxAttempts = 3;
      const status = attempts >= maxAttempts ? 'failed' : 'pending';
      
      // Exponential backoff
      const nextAttemptTime = new Date();
      nextAttemptTime.setMinutes(nextAttemptTime.getMinutes() + Math.pow(5, attempts));

      await supabaseAdmin.from('webhook_events').update({
        status,
        attempts,
        last_attempt_at: new Date().toISOString(),
        next_attempt_at: nextAttemptTime.toISOString()
      }).eq('id', event.id);
    }
  }
}
