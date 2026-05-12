/**
 * Cron: processa email_outbox a cada 5 min.
 *
 * Acionado por pg_cron `email-outbox-process` (definido em
 * 20260506250000_email_outbox.sql). Auth via X-Cron-Secret.
 *
 * Lógica:
 *   - Busca até 50 emails com status='pending' e scheduled_for <= now()
 *   - Pra cada um: monta HTML baseado em `kind` + `payload` + `locale` e
 *     chama Brevo via sendTransactionalEmail
 *   - Sucesso: status='sent', sent_at=now()
 *   - Falha: incrementa attempts, registra last_error
 *     - 5+ tentativas → status='abandoned' (anti-loop)
 *
 * Templates suportados (kind):
 *   - indicacao_portal_recebida (item 3 do polish)
 *   - nps_pedido_d7 (item 1 do polish — futuro)
 *
 * Idempotência: status='pending' sai da lista assim que vira 'sent'/'failed'.
 */
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendTransactionalEmail, getAppUrl } from "@/lib/email";
import { validarEmail, emailEnviavel } from "@/lib/email-validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_ATTEMPTS = 5;
const BATCH_SIZE = 50;

interface OutboxRow {
  id: number;
  organizacao_id: string | null;
  kind: string;
  to_email: string;
  to_name: string | null;
  subject: string;
  payload: Record<string, any>;
  attempts: number;
  locale: "pt-BR" | "en-US";
  scheduled_for: string;
}

export async function POST(req: Request) {
  const expected = process.env.CRON_SECRET;
  const got =
    req.headers.get("x-cron-secret") ||
    req.headers.get("authorization")?.replace(/^Bearer /, "");
  if (!expected || got !== expected) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supa = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Pega lote de pendentes
  const { data: rows, error: fetchErr } = await supa
    .from("email_outbox")
    .select("*")
    .eq("status", "pending")
    .lte("scheduled_for", new Date().toISOString())
    .order("created_at", { ascending: true })
    .limit(BATCH_SIZE);

  if (fetchErr) {
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  }

  if (!rows || rows.length === 0) {
    return NextResponse.json({ ok: true, processed: 0 });
  }

  let sent = 0;
  let failed = 0;
  let abandoned = 0;

  for (const row of rows as OutboxRow[]) {
    try {
      // Validação pré-envio: bloqueia bounce_perm, no_mx, disposable, syntax inválida
      const validacao = await validarEmail(row.to_email);
      if (!emailEnviavel(validacao.status)) {
        await supa
          .from("email_outbox")
          .update({
            status: "abandoned",
            attempts: row.attempts + 1,
            last_error: `Bloqueado pela validação (${validacao.status}): ${validacao.motivo ?? ""}`,
          })
          .eq("id", row.id);
        abandoned += 1;
        continue;
      }

      const { subject, htmlContent } = buildEmail(row);

      const result = await sendTransactionalEmail({
        to: [{ email: row.to_email, name: row.to_name ?? undefined }],
        subject,
        htmlContent,
      });

      // Brevo skipped (sem API key) — não é falha, mas registra
      if (result.skipped) {
        await supa
          .from("email_outbox")
          .update({
            status: "abandoned",
            attempts: row.attempts + 1,
            last_error: "BREVO_API_KEY ausente — email pulado",
          })
          .eq("id", row.id);
        abandoned += 1;
        continue;
      }

      await supa
        .from("email_outbox")
        .update({
          status: "sent",
          sent_at: new Date().toISOString(),
          attempts: row.attempts + 1,
        })
        .eq("id", row.id);
      sent += 1;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "unknown";
      const attempts = row.attempts + 1;
      const novoStatus = attempts >= MAX_ATTEMPTS ? "abandoned" : "failed";

      // Backoff exponencial: 5min × 2^attempts
      const nextScheduled = new Date(
        Date.now() + 5 * 60 * 1000 * Math.pow(2, Math.min(attempts, 6)),
      );

      await supa
        .from("email_outbox")
        .update({
          status: novoStatus === "abandoned" ? "abandoned" : "pending",
          attempts,
          last_error: msg.slice(0, 500),
          scheduled_for: novoStatus === "abandoned" ? row.scheduled_for : nextScheduled.toISOString(),
        })
        .eq("id", row.id);

      if (novoStatus === "abandoned") abandoned += 1;
      else failed += 1;
    }
  }

  return NextResponse.json({
    ok: true,
    processed: rows.length,
    sent,
    failed,
    abandoned,
  });
}

// =============================================================================
// Templates de email
// =============================================================================

function escapeHtml(value: string) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function buildEmail(row: OutboxRow): { subject: string; htmlContent: string } {
  const appUrl = getAppUrl();

  switch (row.kind) {
    case "indicacao_portal_recebida":
      return buildIndicacaoPortalRecebida(row, appUrl);
    case "nps_pedido_d7":
      return buildNpsPedidoD7(row, appUrl);
    case "indicacao_embaixador_fechou":
      return buildIndicacaoEmbaixadorFechou(row, appUrl);
    case "indicacao_embaixador_status":
      return buildIndicacaoEmbaixadorStatus(row, appUrl);
    default:
      // Fallback genérico — usa subject + payload.html ou payload.text
      return {
        subject: row.subject,
        htmlContent:
          row.payload?.html ??
          `<p>${escapeHtml(row.payload?.text ?? "(sem conteúdo)")}</p>`,
      };
  }
}

function buildIndicacaoPortalRecebida(row: OutboxRow, appUrl: string) {
  const p = row.payload;
  const en = row.locale === "en-US";

  const embaixadorLabel = p.embaixador_empresa ?? p.embaixador_nome ?? "cliente";
  const indicadoNome = escapeHtml(p.indicado_nome ?? "");
  const indicadoEmpresa = p.indicado_empresa ? escapeHtml(p.indicado_empresa) : null;
  const indicadoCargo = p.indicado_cargo ? escapeHtml(p.indicado_cargo) : null;
  const indicadoEmail = p.indicado_email ? escapeHtml(p.indicado_email) : null;
  const indicadoWhatsapp = p.indicado_whatsapp ? escapeHtml(p.indicado_whatsapp) : null;
  const contexto = p.contexto ? escapeHtml(p.contexto) : null;
  const orgNome = escapeHtml(p.org_nome ?? "");
  const respNome = p.responsavel_nome ? escapeHtml(p.responsavel_nome) : "";

  const indicacoesUrl = `${appUrl}/indicacoes`;

  if (en) {
    return {
      subject: `New referral from ${escapeHtml(embaixadorLabel)}`,
      htmlContent: `
<p>Hi ${respNome || "there"},</p>
<p><strong>${escapeHtml(embaixadorLabel)}</strong> just submitted a new referral via the ambassador portal.</p>
<table style="border-collapse:collapse;margin:16px 0;background:#f8fafc;padding:12px;border-radius:8px">
  <tr><td style="padding:4px 8px"><strong>Name:</strong></td><td style="padding:4px 8px">${indicadoNome}</td></tr>
  ${indicadoEmpresa ? `<tr><td style="padding:4px 8px"><strong>Company:</strong></td><td style="padding:4px 8px">${indicadoEmpresa}</td></tr>` : ""}
  ${indicadoCargo ? `<tr><td style="padding:4px 8px"><strong>Title:</strong></td><td style="padding:4px 8px">${indicadoCargo}</td></tr>` : ""}
  ${indicadoEmail ? `<tr><td style="padding:4px 8px"><strong>Email:</strong></td><td style="padding:4px 8px">${indicadoEmail}</td></tr>` : ""}
  ${indicadoWhatsapp ? `<tr><td style="padding:4px 8px"><strong>WhatsApp:</strong></td><td style="padding:4px 8px">${indicadoWhatsapp}</td></tr>` : ""}
  ${contexto ? `<tr><td style="padding:4px 8px;vertical-align:top"><strong>Context:</strong></td><td style="padding:4px 8px"><em>"${contexto}"</em></td></tr>` : ""}
</table>
<p><a href="${indicacoesUrl}" style="display:inline-block;padding:12px 18px;border-radius:8px;background:#2563eb;color:#fff;text-decoration:none;font-weight:600">Open referrals</a></p>
<p style="color:#64748b;font-size:12px">${orgNome} — Guilds Comercial</p>
`,
    };
  }

  return {
    subject: `Nova indicação de ${escapeHtml(embaixadorLabel)}`,
    htmlContent: `
<p>Olá ${respNome || ""},</p>
<p><strong>${escapeHtml(embaixadorLabel)}</strong> acabou de enviar uma indicação pelo portal de embaixadores.</p>
<table style="border-collapse:collapse;margin:16px 0;background:#f8fafc;padding:12px;border-radius:8px">
  <tr><td style="padding:4px 8px"><strong>Nome:</strong></td><td style="padding:4px 8px">${indicadoNome}</td></tr>
  ${indicadoEmpresa ? `<tr><td style="padding:4px 8px"><strong>Empresa:</strong></td><td style="padding:4px 8px">${indicadoEmpresa}</td></tr>` : ""}
  ${indicadoCargo ? `<tr><td style="padding:4px 8px"><strong>Cargo:</strong></td><td style="padding:4px 8px">${indicadoCargo}</td></tr>` : ""}
  ${indicadoEmail ? `<tr><td style="padding:4px 8px"><strong>Email:</strong></td><td style="padding:4px 8px">${indicadoEmail}</td></tr>` : ""}
  ${indicadoWhatsapp ? `<tr><td style="padding:4px 8px"><strong>WhatsApp:</strong></td><td style="padding:4px 8px">${indicadoWhatsapp}</td></tr>` : ""}
  ${contexto ? `<tr><td style="padding:4px 8px;vertical-align:top"><strong>Contexto:</strong></td><td style="padding:4px 8px"><em>"${contexto}"</em></td></tr>` : ""}
</table>
<p><a href="${indicacoesUrl}" style="display:inline-block;padding:12px 18px;border-radius:8px;background:#2563eb;color:#fff;text-decoration:none;font-weight:600">Abrir indicações</a></p>
<p style="color:#64748b;font-size:12px">${orgNome} — Guilds Comercial</p>
`,
  };
}

function buildIndicacaoEmbaixadorFechou(row: OutboxRow, _appUrl: string) {
  const p = row.payload;
  const en = row.locale === "en-US";
  const embaixadorNome = p.embaixador_nome ? escapeHtml(String(p.embaixador_nome).split(" ")[0]) : "";
  const indicadoNome = escapeHtml(p.indicado_nome ?? "");
  const indicadoEmpresa = p.indicado_empresa ? escapeHtml(p.indicado_empresa) : null;
  const orgNome = escapeHtml(p.org_nome ?? "");
  const recompensa = p.recompensa_valor != null && Number(p.recompensa_valor) > 0
    ? Number(p.recompensa_valor)
    : null;

  if (en) {
    return {
      subject: row.subject,
      htmlContent: `
<p>Hi ${embaixadorNome || "there"},</p>
<p>Great news — your referral <strong>${indicadoNome}</strong>${indicadoEmpresa ? ` (${indicadoEmpresa})` : ""} just became a customer of <strong>${orgNome}</strong>. Thanks for trusting us with your network!</p>
${recompensa ? `<p style="margin:20px 0;padding:12px;border-radius:8px;background:#ecfdf5;border:1px solid #6ee7b7"><strong>Reward:</strong> $${recompensa.toFixed(2)} ${p.recompensa_paga ? "— already paid 🎉" : "— we'll process it shortly."}</p>` : ""}
<p style="color:#64748b;font-size:12px">${orgNome} — Powered by Guilds Comercial</p>`,
    };
  }

  return {
    subject: row.subject,
    htmlContent: `
<p>Olá ${embaixadorNome || ""},</p>
<p>Boa notícia — sua indicação <strong>${indicadoNome}</strong>${indicadoEmpresa ? ` (${indicadoEmpresa})` : ""} acabou de virar cliente da <strong>${orgNome}</strong>. Obrigado por confiar na gente com sua rede!</p>
${recompensa ? `<p style="margin:20px 0;padding:12px;border-radius:8px;background:#ecfdf5;border:1px solid #6ee7b7"><strong>Recompensa:</strong> R$ ${recompensa.toFixed(2)} ${p.recompensa_paga ? "— já paga 🎉" : "— vamos processar em breve."}</p>` : ""}
<p style="color:#64748b;font-size:12px">${orgNome} — Powered by Guilds Comercial</p>`,
  };
}

function buildIndicacaoEmbaixadorStatus(row: OutboxRow, _appUrl: string) {
  const p = row.payload;
  const en = row.locale === "en-US";
  const embaixadorNome = p.embaixador_nome ? escapeHtml(String(p.embaixador_nome).split(" ")[0]) : "";
  const indicadoNome = escapeHtml(p.indicado_nome ?? "");
  const indicadoEmpresa = p.indicado_empresa ? escapeHtml(p.indicado_empresa) : null;
  const orgNome = escapeHtml(p.org_nome ?? "");
  const statusNovo = String(p.status_novo ?? "");

  const msgPt = statusNovo === "perdido"
    ? "infelizmente o time não conseguiu fechar o negócio nesta rodada"
    : "o time decidiu não dar sequência neste momento";
  const msgEn = statusNovo === "perdido"
    ? "unfortunately our team couldn't close this deal at this time"
    : "our team decided not to move forward at this time";

  if (en) {
    return {
      subject: row.subject,
      htmlContent: `
<p>Hi ${embaixadorNome || "there"},</p>
<p>Quick update on your referral <strong>${indicadoNome}</strong>${indicadoEmpresa ? ` (${indicadoEmpresa})` : ""}: ${msgEn}.</p>
<p>Thanks for sharing your network with <strong>${orgNome}</strong> — keep them coming, every introduction helps.</p>
<p style="color:#64748b;font-size:12px">${orgNome} — Powered by Guilds Comercial</p>`,
    };
  }

  return {
    subject: row.subject,
    htmlContent: `
<p>Olá ${embaixadorNome || ""},</p>
<p>Uma atualização sobre sua indicação <strong>${indicadoNome}</strong>${indicadoEmpresa ? ` (${indicadoEmpresa})` : ""}: ${msgPt}.</p>
<p>Obrigado por compartilhar sua rede com a <strong>${orgNome}</strong> — continue indicando, toda apresentação ajuda.</p>
<p style="color:#64748b;font-size:12px">${orgNome} — Powered by Guilds Comercial</p>`,
  };
}

function buildNpsPedidoD7(row: OutboxRow, appUrl: string) {
  const p = row.payload;
  const orgNome = escapeHtml(p.org_nome ?? "");
  const clienteNome = p.cliente_nome ? escapeHtml(p.cliente_nome).split(" ")[0] : "";
  const en = row.locale === "en-US";
  const token = String(p.token ?? "");
  const link = `${appUrl}/nps/${encodeURIComponent(token)}`;

  if (en) {
    return {
      subject: row.subject,
      htmlContent: `
<p>Hi ${clienteNome || "there"},</p>
<p>It's been about a week since you started working with <strong>${orgNome}</strong>. We'd love to know:</p>
<p style="font-size:18px;font-weight:600;margin:24px 0 12px">On a scale of 0 to 10, how likely are you to recommend us to a friend or colleague?</p>
<p style="margin:24px 0">
  <a href="${link}" style="display:inline-block;padding:14px 24px;border-radius:8px;background:#2563eb;color:#fff;text-decoration:none;font-weight:600;font-size:15px">Answer in 30 seconds</a>
</p>
<p style="color:#64748b;font-size:13px">Your answer goes straight to the team and helps us improve. No spam, ever.</p>
<p style="color:#94a3b8;font-size:11px;margin-top:32px">Powered by Guilds Comercial · ${orgNome}</p>
`,
    };
  }

  return {
    subject: row.subject,
    htmlContent: `
<p>Olá ${clienteNome || ""},</p>
<p>Faz cerca de uma semana que você começou a trabalhar com a <strong>${orgNome}</strong>. A gente queria saber:</p>
<p style="font-size:18px;font-weight:600;margin:24px 0 12px">De 0 a 10, qual a chance de você nos recomendar pra um amigo ou colega?</p>
<p style="margin:24px 0">
  <a href="${link}" style="display:inline-block;padding:14px 24px;border-radius:8px;background:#2563eb;color:#fff;text-decoration:none;font-weight:600;font-size:15px">Responder em 30 segundos</a>
</p>
<p style="color:#64748b;font-size:13px">Sua resposta vai direto pro time e ajuda a gente a melhorar. Não enviamos spam.</p>
<p style="color:#94a3b8;font-size:11px;margin-top:32px">Powered by Guilds Comercial · ${orgNome}</p>
`,
  };
}
