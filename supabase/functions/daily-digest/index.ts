// ===========================================================================
// EDGE FUNCTION — daily-digest
// ---------------------------------------------------------------------------
// Roda toda manhã (07:00 BRT) via Supabase Cron e envia, para cada vendedor:
//   - Ações VENCIDAS (críticas)
//   - Ações DE HOJE
//   - Cadências previstas pra hoje
//   - Newsletter devida hoje
// Email entregue via Brevo (https://www.brevo.com) — API transacional v3.
//
// Variáveis de ambiente esperadas (configure em Project Settings > Edge):
//   SUPABASE_URL              (auto)
//   SUPABASE_SERVICE_ROLE_KEY (auto)
//   BREVO_API_KEY             (criar no painel do Brevo > SMTP & API)
//   FROM_EMAIL                ex.: "comercial@guilds.com.br"
//   FROM_NAME                 ex.: "Guilds Comercial"
//   APP_URL                   ex.: "https://guilds-comercial.vercel.app"
// ===========================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

interface LeadEnriched {
  id: number;
  empresa: string | null;
  nome: string | null;
  crm_stage: string | null;
  proxima_acao: string | null;
  data_proxima_acao: string | null;
  responsavel_id: string | null;
  responsavel_nome: string | null;
  urgencia: string;
  dias_sem_tocar: number;
}

interface CadenciaRow {
  lead_id: number;
  passo: string;
  canal: string | null;
  data_prevista: string;
  leads: { empresa: string | null; nome: string | null; responsavel_id: string | null } | null;
}

interface NewsletterRow {
  lead_id: number;
  proxima_edicao_sugerida: string | null;
  responsavel_id: string | null;
  leads: { empresa: string | null; nome: string | null } | null;
}

interface Profile {
  id: string;
  display_name: string;
  email: string;
  role: string;
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY")!;
const FROM_EMAIL = Deno.env.get("FROM_EMAIL") ?? "comercial@guilds.com.br";
const FROM_NAME = Deno.env.get("FROM_NAME") ?? "Guilds Comercial";
const APP_URL = Deno.env.get("APP_URL") ?? "https://guilds-comercial.vercel.app";

// ---------------------------------------------------------------------------
// Brevo Transactional Email — POST https://api.brevo.com/v3/smtp/email
// Docs: https://developers.brevo.com/reference/sendtransacemail
// ---------------------------------------------------------------------------
async function sendEmailViaBrevo(to: { email: string; name?: string }, subject: string, htmlContent: string) {
  const payload = {
    sender: { name: FROM_NAME, email: FROM_EMAIL },
    to: [to],
    subject,
    htmlContent,
  };

  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": BREVO_API_KEY,
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
    body: JSON.stringify(payload),
  });

  return res;
}

Deno.serve(async (_req) => {
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
    const hoje = new Date().toISOString().slice(0, 10);

    // 1. Buscar todos os perfis ativos
    const { data: profilesData } = await supabase
      .from("profiles")
      .select("*")
      .eq("ativo", true);
    const profiles = (profilesData ?? []) as Profile[];

    // 2. Buscar leads com ações vencidas ou pra hoje (todo o time)
    const { data: leadsData } = await supabase
      .from("v_leads_enriched")
      .select("id, empresa, nome, crm_stage, proxima_acao, data_proxima_acao, responsavel_id, responsavel_nome, urgencia, dias_sem_tocar")
      .in("urgencia", ["vencida", "hoje"])
      .not("crm_stage", "in", '("Fechado","Perdido","Nutrição")');
    const leads = (leadsData ?? []) as LeadEnriched[];

    // 3. Cadências previstas pra hoje
    const { data: cadenciaData } = await supabase
      .from("cadencia")
      .select("lead_id, passo, canal, data_prevista, leads ( empresa, nome, responsavel_id )")
      .eq("status", "pendente")
      .eq("data_prevista", hoje);
    const cadencias = (cadenciaData ?? []) as unknown as CadenciaRow[];

    // 4. Newsletter devida hoje
    const { data: newsData } = await supabase
      .from("newsletter")
      .select("lead_id, proxima_edicao_sugerida, responsavel_id, leads ( empresa, nome )")
      .eq("status", "Ativo")
      .lte("proxima_edicao_sugerida", hoje);
    const newsletter = (newsData ?? []) as unknown as NewsletterRow[];

    const resultados: Array<{ email: string; status: string; quantidade: number }> = [];

    // 5. Para cada perfil, montar email personalizado
    for (const p of profiles) {
      const meusLeads = leads.filter(l => l.responsavel_id === p.id);
      const minhasCad = cadencias.filter(c => c.leads?.responsavel_id === p.id);
      const minhasNews = newsletter.filter(n => n.responsavel_id === p.id);

      const total = meusLeads.length + minhasCad.length + minhasNews.length;

      // Gestor sempre recebe (com visão de time se nada pessoal)
      if (total === 0 && p.role !== "gestor") {
        resultados.push({ email: p.email, status: "skip_sem_pendencias", quantidade: 0 });
        continue;
      }

      const html = renderDigest({
        nome: p.display_name,
        isGestor: p.role === "gestor",
        leads: meusLeads,
        cadencias: minhasCad,
        newsletter: minhasNews,
        leadsTime: p.role === "gestor" ? leads : [],
      });

      const r = await sendEmailViaBrevo(
        { email: p.email, name: p.display_name },
        `Guilds Comercial — ${total} ação(ões) hoje`,
        html,
      );

      resultados.push({
        email: p.email,
        status: r.ok ? "enviado" : `erro_${r.status}`,
        quantidade: total,
      });
    }

    return new Response(JSON.stringify({
      ok: true,
      hoje,
      enviados: resultados,
      totais: {
        leads_pendentes: leads.length,
        cadencias_hoje: cadencias.length,
        newsletter_devida: newsletter.length,
      },
    }, null, 2), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("daily-digest error", err);
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});

// ===========================================================================
// HTML do digest — clean, mobile-friendly
// ===========================================================================
function renderDigest(opts: {
  nome: string;
  isGestor: boolean;
  leads: LeadEnriched[];
  cadencias: CadenciaRow[];
  newsletter: NewsletterRow[];
  leadsTime: LeadEnriched[];
}) {
  const { nome, isGestor, leads, cadencias, newsletter, leadsTime } = opts;
  const vencidas = leads.filter(l => l.urgencia === "vencida");
  const hoje = leads.filter(l => l.urgencia === "hoje");
  const primeiro = nome.split(" ")[0];

  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Guilds Comercial — Hoje</title></head>
<body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#f8fafc;margin:0;padding:24px;color:#1e293b">
<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.05)">
  <div style="background:#0f172a;color:#fff;padding:20px 24px">
    <div style="font-size:12px;letter-spacing:.1em;text-transform:uppercase;opacity:.7">Guilds Comercial</div>
    <div style="font-size:22px;font-weight:600;margin-top:4px">Bom dia, ${primeiro}</div>
    <div style="font-size:13px;opacity:.8;margin-top:2px">${hojeFormatado()}</div>
  </div>

  <div style="padding:24px">
    ${section("Vencidas — atacar primeiro", vencidas, "#dc2626")}
    ${section("Hoje", hoje, "#d97706")}
    ${cadenciasSection(cadencias)}
    ${newsletterSection(newsletter)}
    ${isGestor ? gestorSection(leadsTime) : ""}

    <div style="text-align:center;margin-top:24px">
      <a href="${APP_URL}/hoje" style="display:inline-block;background:#7c3aed;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px">
        Abrir cockpit
      </a>
    </div>
  </div>

  <div style="padding:16px 24px;background:#f1f5f9;color:#64748b;font-size:11px;text-align:center">
    Você recebe este resumo todo dia útil às 7h.<br>
    Guilds Lab — Sistema Comercial Interno
  </div>
</div>
</body></html>`;
}

function section(titulo: string, items: LeadEnriched[], cor: string) {
  if (items.length === 0) return "";
  return `
  <div style="margin-bottom:24px">
    <h2 style="font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:${cor};margin:0 0 8px;font-weight:700">
      ${titulo} (${items.length})
    </h2>
    ${items.slice(0, 8).map(l => `
      <a href="${APP_URL}/pipeline/${l.id}" style="display:block;padding:10px 12px;border:1px solid #e2e8f0;border-radius:8px;margin-bottom:6px;text-decoration:none;color:inherit">
        <div style="font-weight:600;font-size:14px">${escapeHtml(l.empresa || l.nome || "(sem nome)")}</div>
        <div style="font-size:12px;color:#64748b;margin-top:2px">
          ${l.crm_stage ?? ""} ${l.proxima_acao ? `· → ${escapeHtml(l.proxima_acao)}` : ""}
          ${l.dias_sem_tocar > 0 ? `· ${l.dias_sem_tocar}d sem tocar` : ""}
        </div>
      </a>`).join("")}
    ${items.length > 8 ? `<div style="font-size:11px;color:#94a3b8;text-align:center;margin-top:6px">…e mais ${items.length - 8}</div>` : ""}
  </div>`;
}

function cadenciasSection(items: CadenciaRow[]) {
  if (items.length === 0) return "";
  return `
  <div style="margin-bottom:24px">
    <h2 style="font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#0f766e;margin:0 0 8px;font-weight:700">
      Cadências previstas hoje (${items.length})
    </h2>
    ${items.map(c => `
      <a href="${APP_URL}/pipeline/${c.lead_id}" style="display:block;padding:10px 12px;border:1px solid #e2e8f0;border-radius:8px;margin-bottom:6px;text-decoration:none;color:inherit">
        <span style="display:inline-block;background:#ccfbf1;color:#0f766e;padding:2px 8px;border-radius:6px;font-size:11px;font-weight:600;margin-right:6px">${c.passo}</span>
        <span style="font-weight:600;font-size:14px">${escapeHtml(c.leads?.empresa || c.leads?.nome || "(?)")}</span>
        <span style="font-size:12px;color:#64748b;margin-left:6px">via ${c.canal ?? "—"}</span>
      </a>`).join("")}
  </div>`;
}

function newsletterSection(items: NewsletterRow[]) {
  if (items.length === 0) return "";
  return `
  <div style="margin-bottom:24px">
    <h2 style="font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#1d4ed8;margin:0 0 8px;font-weight:700">
      Newsletter devida (${items.length})
    </h2>
    ${items.map(n => `
      <div style="padding:8px 12px;border:1px solid #e2e8f0;border-radius:8px;margin-bottom:6px;font-size:13px">
        ${escapeHtml(n.leads?.empresa || n.leads?.nome || "(?)")}
        <span style="color:#64748b;font-size:11px;margin-left:6px">desde ${n.proxima_edicao_sugerida ?? "—"}</span>
      </div>`).join("")}
  </div>`;
}

function gestorSection(leadsTime: LeadEnriched[]) {
  if (leadsTime.length === 0) return "";
  // Conta ações vencidas por responsável
  const porResp = new Map<string, number>();
  leadsTime.filter(l => l.urgencia === "vencida").forEach(l => {
    const k = l.responsavel_nome ?? "(sem dono)";
    porResp.set(k, (porResp.get(k) ?? 0) + 1);
  });
  if (porResp.size === 0) return "";
  const linhas = Array.from(porResp.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([nome, n]) => `
      <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #f1f5f9;font-size:13px">
        <span>${escapeHtml(nome)}</span>
        <span style="color:#dc2626;font-weight:600">${n} vencida(s)</span>
      </div>`).join("");
  return `
  <div style="margin-bottom:24px;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:12px">
    <h2 style="font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#dc2626;margin:0 0 8px;font-weight:700">
      Time — vencidas por vendedor
    </h2>
    ${linhas}
  </div>`;
}

function hojeFormatado() {
  const d = new Date();
  return d.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" });
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;"
  }[c]!));
}
