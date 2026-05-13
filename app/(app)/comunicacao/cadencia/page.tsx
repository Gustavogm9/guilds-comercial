import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient, getCurrentProfile } from "@/lib/supabase/server";
import { getCurrentOrgId, getCurrentRole, listarMembrosDaOrg } from "@/lib/supabase/org";
import { Mail, MessageSquare, Phone, AlertCircle, CheckCircle2, Clock } from "lucide-react";
import { getServerLocale, getT } from "@/lib/i18n";
import CadenciaPassoActions from "@/components/cadencia-passo-actions";
import IniciarCadenciaModal from "@/components/iniciar-cadencia-modal";
import ComunicacaoTabs from "../comunicacao-tabs";

export const dynamic = "force-dynamic";

const PASSOS = ["D0", "D3", "D7", "D11", "D16", "D30"] as const;
type Passo = (typeof PASSOS)[number];

const PASSO_OBJETIVO: Record<Passo, string> = {
  "D0":  "Contexto / dor",
  "D3":  "Impacto / custo invisível",
  "D7":  "Autoridade / case",
  "D11": "Convite (Raio-X / call)",
  "D16": "Porta aberta",
  "D30": "Retomada",
};

type CadenciaRow = {
  id: number;
  lead_id: number;
  passo: Passo;
  canal: string | null;
  objetivo: string | null;
  data_prevista: string | null;
  data_executada: string | null;
  status: "pendente" | "enviado" | "respondido" | "pular" | "removido";
  mensagem_enviada: string | null;
  responsavel_id: string | null;
  leads: {
    empresa: string | null;
    nome: string | null;
    cargo: string | null;
    segmento: string | null;
    crm_stage: string | null;
    whatsapp: string | null;
    email: string | null;
  } | null;
};

export default async function CadenciaPage(
  props: {
    searchParams: Promise<{ resp?: string; canal?: string; q?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const supabase = createClient();
  const me = await getCurrentProfile();
  if (!me) return null;
  const t = getT(await getServerLocale());

  const orgId = await getCurrentOrgId();
  if (!orgId) redirect("/hoje");
  const role = await getCurrentRole();
  const isGestor = role === "gestor";

  const respFiltro = searchParams.resp ?? (isGestor ? "all" : me.id);
  const canalFiltro = searchParams.canal ?? "all";
  const q = searchParams.q?.trim() ?? "";

  // Busca cadência: pendentes + executadas nos últimos 14d (pra histórico recente)
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 14);

  let query = supabase
    .from("cadencia")
    .select(`
      id, lead_id, passo, canal, objetivo, data_prevista, data_executada,
      status, mensagem_enviada, responsavel_id,
      leads ( empresa, nome, cargo, segmento, crm_stage, whatsapp, email )
    `)
    .eq("organizacao_id", orgId)
    .neq("status", "removido")
    .or(`status.eq.pendente,data_executada.gte.${cutoff.toISOString().slice(0, 10)}`)
    .order("data_prevista", { ascending: true, nullsFirst: false });

  // Filtro por responsável: ou o do passo, OU o do lead (passo pode não ter responsavel_id)
  if (respFiltro !== "all") {
    query = query.or(`responsavel_id.eq.${respFiltro},responsavel_id.is.null`);
  }

  if (canalFiltro !== "all") query = query.eq("canal", canalFiltro);

  const [{ data: rows }, membros] = await Promise.all([
    query,
    listarMembrosDaOrg(orgId),
  ]);

  // Server-side filter de busca (Supabase or() não funciona bem com join, faz client-side)
  let cadencias = (rows ?? []) as unknown as CadenciaRow[];
  if (q) {
    const termo = q.toLowerCase();
    cadencias = cadencias.filter((c) => {
      const empresa = (c.leads?.empresa ?? "").toLowerCase();
      const nome = (c.leads?.nome ?? "").toLowerCase();
      const email = (c.leads?.email ?? "").toLowerCase();
      return empresa.includes(termo) || nome.includes(termo) || email.includes(termo);
    });
  }

  // Filtro responsável também aplica do lado do lead (se passo sem responsavel_id, herda do lead)
  // Isso é simplificação: queries acima já fizeram bulk filter, refinamos client-side
  const profs = membros.map((m) => ({ id: m.profile_id, display_name: m.display_name }));

  // Agrupa por passo
  const hoje = new Date().toISOString().slice(0, 10);
  const agrupado = PASSOS.reduce<Record<Passo, CadenciaRow[]>>((acc, p) => {
    acc[p] = cadencias.filter((c) => c.passo === p);
    return acc;
  }, {} as Record<Passo, CadenciaRow[]>);

  // KPIs gerais
  const pendentesTotal = cadencias.filter((c) => c.status === "pendente").length;
  const vencidasTotal = cadencias.filter(
    (c) => c.status === "pendente" && c.data_prevista && c.data_prevista < hoje,
  ).length;
  const hojeTotal = cadencias.filter(
    (c) => c.status === "pendente" && c.data_prevista === hoje,
  ).length;
  const respondidasTotal = cadencias.filter((c) => c.status === "respondido").length;

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      <ComunicacaoTabs isGestor={isGestor} />
      <header className="mb-4 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("paginas.cadencia_titulo")}</h1>
          <p className="text-sm text-muted-foreground">{t("paginas.cadencia_sub")}</p>
        </div>
        <div className="flex items-center gap-2">
          <IniciarCadenciaModal />
        </div>
      </header>

      {/* KPIs */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3 my-4">
        <KPI label="Pendentes" v={pendentesTotal} tone="neutral" icon={<Clock className="w-4 h-4" />} />
        <KPI label="Vencidas" v={vencidasTotal} tone={vencidasTotal > 0 ? "destructive" : "neutral"} icon={<AlertCircle className="w-4 h-4" />} />
        <KPI label="Hoje" v={hojeTotal} tone={hojeTotal > 0 ? "warning" : "neutral"} icon={<Clock className="w-4 h-4" />} />
        <KPI label="Respondidas (14d)" v={respondidasTotal} tone="success" icon={<CheckCircle2 className="w-4 h-4" />} />
      </section>

      {/* Filtros */}
      <form className="flex items-center gap-2 mb-4 flex-wrap">
        <input
          name="q"
          defaultValue={q}
          placeholder="Buscar empresa, nome ou email…"
          className="input-base !text-xs w-64"
        />
        {isGestor && (
          <select name="resp" defaultValue={respFiltro} className="input-base !text-xs w-40">
            <option value="all">Todo o time</option>
            {profs.map((p) => (
              <option key={p.id} value={p.id}>{p.display_name}</option>
            ))}
          </select>
        )}
        <select name="canal" defaultValue={canalFiltro} className="input-base !text-xs w-40">
          <option value="all">Todos os canais</option>
          <option value="WhatsApp">WhatsApp</option>
          <option value="Email">Email</option>
          <option value="LinkedIn">LinkedIn</option>
        </select>
        <button type="submit" className="btn-secondary text-xs">Filtrar</button>
      </form>

      {/* Colunas por passo (kanban temporal) */}
      <div className="flex gap-3 overflow-x-auto pb-4">
        {PASSOS.map((p) => {
          const list = agrupado[p];
          const pendentes = list.filter((c) => c.status === "pendente").length;
          const vencidas = list.filter(
            (c) => c.status === "pendente" && c.data_prevista && c.data_prevista < hoje,
          ).length;
          return (
            <div
              key={p}
              className="min-w-[300px] w-[300px] flex flex-col rounded-xl border border-border bg-secondary/40 dark:bg-white/[0.02]"
            >
              {/* Header da coluna */}
              <div className="px-3 py-2 border-b border-border dark:border-white/[0.06]">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs font-semibold text-foreground" style={{ letterSpacing: "-0.13px" }}>
                      {p}
                    </div>
                    <div className="text-[10px] text-muted-foreground">{PASSO_OBJETIVO[p]}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs font-medium text-foreground/80 tabular-nums">{pendentes}</div>
                    {vencidas > 0 && (
                      <div className="text-[10px] text-destructive font-medium tabular-nums">{vencidas} vencidas</div>
                    )}
                  </div>
                </div>
              </div>

              {/* Cards de leads no passo */}
              <div className="flex-1 p-2 space-y-2 max-h-[calc(100vh-340px)] overflow-y-auto">
                {list.length === 0 && (
                  <div className="text-xs text-muted-foreground/60 text-center py-6 italic">
                    nenhum lead em {p}
                  </div>
                )}
                {list.map((c) => (
                  <CadenciaCard key={c.id} c={c} hoje={hoje} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================================
// CARD DE CADÊNCIA — server component, render do passo + actions client
// ============================================================================

function CadenciaCard({ c, hoje }: { c: CadenciaRow; hoje: string }) {
  const lead = c.leads;
  const vencida = c.status === "pendente" && c.data_prevista && c.data_prevista < hoje;
  const isHoje = c.status === "pendente" && c.data_prevista === hoje;

  const statusTone =
    c.status === "respondido" ? "bg-success-500/15 text-success-500 border-success-500/25"
    : c.status === "enviado"   ? "bg-primary/10 text-primary border-primary/25"
    : c.status === "pular"     ? "bg-muted text-muted-foreground border-border"
    : vencida                  ? "bg-destructive/10 text-destructive border-destructive/25"
    : isHoje                   ? "bg-warning-500/10 text-warning-500 border-warning-500/25"
    :                            "bg-secondary text-foreground/80 border-border";

  const canalIcon =
    c.canal === "WhatsApp" ? <MessageSquare className="w-3 h-3" />
    : c.canal === "Email"  ? <Mail className="w-3 h-3" />
    : c.canal?.includes("Ligação") ? <Phone className="w-3 h-3" />
    : null;

  return (
    <div className="card p-2.5 space-y-1.5">
      {/* Lead nome + stage */}
      <div className="flex items-start justify-between gap-2">
        <Link
          href={`/vendas/pipeline/${c.lead_id}`}
          prefetch
          className="font-medium text-sm text-foreground hover:text-primary transition-colors truncate flex-1 min-w-0"
          style={{ letterSpacing: "-0.13px" }}
        >
          {lead?.empresa || lead?.nome || "(sem nome)"}
        </Link>
        <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium uppercase tracking-[0.1em] ${statusTone} shrink-0`}>
          {c.status === "pendente" && vencida ? "vencida"
            : c.status === "pendente" && isHoje ? "hoje"
            : c.status}
        </span>
      </div>

      {/* Subtitle (nome do contato + segmento) */}
      <div className="text-[11px] text-muted-foreground truncate">
        {lead?.nome ? `${lead.nome} · ` : ""}
        {lead?.cargo ? `${lead.cargo} · ` : ""}
        {lead?.segmento ?? "—"}
      </div>

      {/* Data + canal */}
      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
        <div className="flex items-center gap-1 tabular-nums">
          {canalIcon}
          {c.canal ?? "—"}
        </div>
        <div className="tabular-nums">
          {c.data_executada
            ? <>executou {fmtDate(c.data_executada)}</>
            : c.data_prevista
              ? <>prev. {fmtDate(c.data_prevista)}</>
              : "—"}
        </div>
      </div>

      {/* Actions: marcar enviado / respondido / pular / adiar */}
      {c.status === "pendente" && (
        <CadenciaPassoActions cadenciaId={c.id} whatsapp={lead?.whatsapp ?? null} />
      )}
    </div>
  );
}

// ============================================================================
// HELPERS
// ============================================================================

function KPI({ label, v, tone, icon }: {
  label: string;
  v: number;
  tone: "neutral" | "destructive" | "warning" | "success";
  icon: React.ReactNode;
}) {
  const tones = {
    neutral:     "bg-secondary dark:bg-white/[0.05] text-muted-foreground",
    destructive: "bg-destructive/10 text-destructive",
    warning:     "bg-warning-500/10 text-warning-500",
    success:     "bg-success-500/10 text-success-500",
  };
  return (
    <div className="card p-4 flex items-center gap-3">
      <div className={`w-9 h-9 rounded-lg grid place-items-center ${tones[tone]}`}>{icon}</div>
      <div>
        <div className="text-[10px] text-muted-foreground uppercase tracking-[0.12em] font-semibold">{label}</div>
        <div className="text-2xl font-semibold leading-tight tabular-nums">{v}</div>
      </div>
    </div>
  );
}

function fmtDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}
