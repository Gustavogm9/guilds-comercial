/**
 * Camada de Web Push Notifications.
 *
 * - Mantém subscriptions em `web_push_subscriptions` (1 por device)
 * - Respeita preferências em `notification_preferences` (opt-in granular,
 *   janela de horário no fuso do user, ativo on/off)
 * - Remove subscriptions expiradas (HTTP 404/410 do Push Service)
 *
 * Roda em Node runtime (web-push usa node:crypto). Não usar em Edge.
 */
import "server-only";
import webpush from "web-push";
import { createClient } from "@supabase/supabase-js";
import { dentroJanela } from "@/lib/utils/janela-horario";

export { dentroJanela };

export type PushEvento =
  | "cadencia_vencendo"
  | "resumo_diario"
  | "lead_fechado_proposta"
  | "lead_reabriu";

export interface PushPayload {
  evento: PushEvento;
  title: string;
  body: string;
  /** URL relativa para abrir ao clicar (ex: /pipeline/123) */
  url?: string;
  /** Tag para coalescer notificações duplicadas (ex: lead-123-cadencia) */
  tag?: string;
}

const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT ?? "mailto:contato@guilds.com.br";

let vapidConfigured = false;
function configureVapid() {
  if (vapidConfigured) return true;
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
    console.warn("[push] VAPID keys ausentes — push desabilitado");
    return false;
  }
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
  vapidConfigured = true;
  return true;
}

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * Envia push para todas as subscriptions de um user, respeitando preferências.
 * Retorna { enviados, falhas, removidas }.
 *
 * - Se prefs.ativo = false → não envia
 * - Se evento não está em prefs.eventos → não envia
 * - Se hora atual está fora da janela → não envia
 * - 410/404 → subscription expirou, removida silenciosamente
 */
export async function sendPushToUser(
  profile_id: string,
  payload: PushPayload
): Promise<{ enviados: number; falhas: number; removidas: number; pulado?: string }> {
  if (!configureVapid()) {
    return { enviados: 0, falhas: 0, removidas: 0, pulado: "vapid_nao_configurado" };
  }

  const supa = admin();

  // 1. Carrega prefs (cria default se não existir)
  let prefs = (
    await supa.from("notification_preferences").select("*").eq("profile_id", profile_id).maybeSingle()
  ).data as
    | {
        ativo: boolean;
        eventos: string[];
        janela_inicio: string;
        janela_fim: string;
        fuso_horario: string;
      }
    | null;

  if (!prefs) {
    // Default conservador: opt-in implícito não rola; user precisa visitar
    // /configuracoes/perfil e ativar. Aqui só pulamos.
    return { enviados: 0, falhas: 0, removidas: 0, pulado: "sem_preferencias" };
  }

  if (!prefs.ativo) return { enviados: 0, falhas: 0, removidas: 0, pulado: "desligado" };
  if (!prefs.eventos.includes(payload.evento)) {
    return { enviados: 0, falhas: 0, removidas: 0, pulado: `opt_out_${payload.evento}` };
  }
  if (!dentroJanela(prefs.janela_inicio, prefs.janela_fim, prefs.fuso_horario)) {
    return { enviados: 0, falhas: 0, removidas: 0, pulado: "fora_da_janela" };
  }

  // 2. Carrega subscriptions
  const { data: subs } = await supa
    .from("web_push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("profile_id", profile_id);

  if (!subs || subs.length === 0) {
    return { enviados: 0, falhas: 0, removidas: 0, pulado: "sem_subscription" };
  }

  // 3. Envia em paralelo, captura erros 410/404 pra remover
  const body = JSON.stringify(payload);
  let enviados = 0;
  let falhas = 0;
  let removidas = 0;

  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          body,
          { TTL: 60 * 60 } // 1h — push antigo perde valor
        );
        enviados++;
        // Atualiza last_seen_at (best-effort)
        supa
          .from("web_push_subscriptions")
          .update({ last_seen_at: new Date().toISOString() })
          .eq("id", s.id)
          .then();
      } catch (err: any) {
        const status = err?.statusCode ?? 0;
        if (status === 404 || status === 410) {
          // Subscription expirou no provider — remove
          await supa.from("web_push_subscriptions").delete().eq("id", s.id);
          removidas++;
        } else {
          falhas++;
          console.warn(`[push] falha ao enviar para ${s.endpoint.slice(0, 50)}...:`, err?.message ?? err);
        }
      }
    })
  );

  return { enviados, falhas, removidas };
}

/**
 * Envia push para múltiplos users em batch (ex: cron de cadência D-N).
 * Coleta totais e ignora erros individuais (loga via console).
 */
export async function sendPushToMany(
  profile_ids: string[],
  payload: PushPayload
): Promise<{ enviados: number; falhas: number; removidas: number; usuarios_alvo: number }> {
  let enviados = 0;
  let falhas = 0;
  let removidas = 0;
  await Promise.all(
    profile_ids.map(async (id) => {
      const r = await sendPushToUser(id, payload);
      enviados += r.enviados;
      falhas += r.falhas;
      removidas += r.removidas;
    })
  );
  return { enviados, falhas, removidas, usuarios_alvo: profile_ids.length };
}
