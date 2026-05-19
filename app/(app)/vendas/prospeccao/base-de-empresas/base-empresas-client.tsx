"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Search, X, Building2, MapPin, DollarSign, Users, ExternalLink,
  ChevronLeft, ChevronRight, Loader2, Check, AlertCircle, Linkedin,
  Download,
} from "lucide-react";
import { ativarEmpresaComoLead, exportarEmpresasCsv } from "./actions";
import { trackFlywheelEvent } from "@/lib/analytics/flywheel";

interface EmpresaRow {
  id: number;
  cnpj: string;
  cnpj_formatado: string;
  razao_social: string | null;
  nome_fantasia: string | null;
  cnae_codigo: string | null;
  cnae_descricao: string | null;
  cnae_normalizado: string | null;
  porte: string | null;
  capital_social: number | null;
  situacao: string | null;
  cidade: string | null;
  uf: string | null;
  site: string | null;
  linkedin_url: string | null;
  email_enriquecido: string | null;
  whatsapp_enriquecido: string | null;
  email_rfb: string | null;
  telefone_rfb: string | null;
  descricao_negocio: string | null;
  total_socios: number;
  socios: Array<{
    id: number;
    nome: string;
    qualificacao: string | null;
    linkedin_url: string | null;
    cargo_atual: string | null;
    email: string | null;
  }>;
  ultima_consulta_em: string;
}

const PORTES = ["Micro", "Pequena", "Médio/Grande"];
const SITUACOES = ["ATIVA", "BAIXADA", "SUSPENSA", "INAPTA"];

export default function BaseEmpresasClient({
  empresas,
  ufs,
  currentFilters,
  total,
  page,
  totalPages,
  pageSize,
}: {
  empresas: EmpresaRow[];
  ufs: string[];
  currentFilters: {
    q: string;
    porte: string;
    uf: string;
    cnae: string;
    situacao: string;
    capital_min: number | null;
  };
  total: number;
  page: number;
  totalPages: number;
  pageSize: number;
}) {
  const router = useRouter();
  const [q, setQ] = useState(currentFilters.q);
  const [porte, setPorte] = useState(currentFilters.porte);
  const [uf, setUf] = useState(currentFilters.uf);
  const [cnae, setCnae] = useState(currentFilters.cnae);
  const [situacao, setSituacao] = useState(currentFilters.situacao);
  const [capitalMin, setCapitalMin] = useState(currentFilters.capital_min?.toString() ?? "");

  // Tracking: 1x por mount
  useEffect(() => {
    trackFlywheelEvent("prospeccao_base_aberta", { total }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [feedback, setFeedback] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const [ativando, setAtivando] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();
  const [exportando, setExportando] = useState(false);

  function aplicarFiltros() {
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (porte !== "all") params.set("porte", porte);
    if (uf !== "all") params.set("uf", uf);
    if (cnae.trim()) params.set("cnae", cnae.trim());
    if (situacao !== "ATIVA") params.set("situacao", situacao);
    if (capitalMin && Number(capitalMin) > 0) params.set("capital_min", capitalMin);
    router.push(`/vendas/prospeccao/base-de-empresas?${params.toString()}`);
  }

  function limpar() {
    setQ(""); setPorte("all"); setUf("all"); setCnae(""); setSituacao("ATIVA"); setCapitalMin("");
    router.push("/vendas/prospeccao/base-de-empresas");
  }

  function ativarLead(empresa: EmpresaRow, opt: { socio_id?: number; iniciarCadencia?: boolean }) {
    setAtivando(empresa.id);
    startTransition(async () => {
      try {
        const r = await ativarEmpresaComoLead({
          empresa_id: empresa.id,
          socio_id: opt.socio_id ?? null,
          iniciar_cadencia: opt.iniciarCadencia ?? false,
        });
        if (r.duplicado) {
          setFeedback({ tipo: "erro", texto: `Já existe lead pra ${empresa.razao_social ?? empresa.cnpj}.` });
        } else {
          setFeedback({
            tipo: "ok",
            texto: `${r.lead_empresa} ativada como lead${opt.iniciarCadencia ? " + cadência iniciada" : ""}.`,
          });
        }
      } catch (e) {
        setFeedback({ tipo: "erro", texto: e instanceof Error ? e.message : "Erro." });
      } finally {
        setAtivando(null);
        setTimeout(() => setFeedback(null), 4000);
      }
    });
  }

  async function exportar(modo: "empresas" | "qsa") {
    setExportando(true);
    try {
      const r = await exportarEmpresasCsv({
        q: currentFilters.q,
        porte: currentFilters.porte,
        uf: currentFilters.uf,
        cnae: currentFilters.cnae,
        situacao: currentFilters.situacao,
        capital_min: currentFilters.capital_min,
      }, modo);
      // Download client-side
      const blob = new Blob([r.csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const sufixo = modo === "qsa" ? "-qsa" : "";
      a.download = `empresas${sufixo}-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      setFeedback({
        tipo: "ok",
        texto: modo === "qsa"
          ? `${r.linhas} linhas (empresa × sócio) exportadas.`
          : `${r.linhas} empresas exportadas.`,
      });
    } catch (e) {
      setFeedback({ tipo: "erro", texto: e instanceof Error ? e.message : "Erro ao exportar." });
    } finally {
      setExportando(false);
      setTimeout(() => setFeedback(null), 3000);
    }
  }

  const temFiltro = q || porte !== "all" || uf !== "all" || cnae || situacao !== "ATIVA" || capitalMin;

  return (
    <div>
      {/* Filtros */}
      <section className="card p-4 mb-4">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-2 items-end">
          <div className="md:col-span-4">
            <label className="block text-[10px] uppercase tracking-[0.12em] font-semibold text-muted-foreground mb-1">
              Busca (razão social, fantasia, CNPJ, descrição)
            </label>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2" aria-hidden="true" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") aplicarFiltros(); }}
                placeholder="Ex.: marketing, 12345678..."
                className="input-base pl-8 text-sm"
              />
            </div>
          </div>
          <div className="md:col-span-2">
            <label className="block text-[10px] uppercase tracking-[0.12em] font-semibold text-muted-foreground mb-1">
              Porte
            </label>
            <select value={porte} onChange={(e) => setPorte(e.target.value)} className="input-base text-sm">
              <option value="all">Qualquer</option>
              {PORTES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div className="md:col-span-1">
            <label className="block text-[10px] uppercase tracking-[0.12em] font-semibold text-muted-foreground mb-1">
              UF
            </label>
            <select value={uf} onChange={(e) => setUf(e.target.value)} className="input-base text-sm">
              <option value="all">—</option>
              {ufs.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="block text-[10px] uppercase tracking-[0.12em] font-semibold text-muted-foreground mb-1">
              CNAE (palavra)
            </label>
            <input value={cnae} onChange={(e) => setCnae(e.target.value)} placeholder="Saúde, Tech..." className="input-base text-sm" />
          </div>
          <div className="md:col-span-1">
            <label className="block text-[10px] uppercase tracking-[0.12em] font-semibold text-muted-foreground mb-1">
              Situação
            </label>
            <select value={situacao} onChange={(e) => setSituacao(e.target.value)} className="input-base text-sm">
              <option value="all">Todas</option>
              {SITUACOES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="block text-[10px] uppercase tracking-[0.12em] font-semibold text-muted-foreground mb-1">
              Capital min (R$)
            </label>
            <input
              type="number"
              value={capitalMin}
              onChange={(e) => setCapitalMin(e.target.value)}
              placeholder="0"
              className="input-base text-sm tabular-nums"
            />
          </div>
        </div>
        <div className="flex items-center justify-between mt-3">
          <div className="text-xs text-muted-foreground">
            {total.toLocaleString("pt-BR")} {total === 1 ? "empresa" : "empresas"} encontrada(s)
            {temFiltro && (
              <button onClick={limpar} className="ml-3 text-primary hover:underline">
                Limpar filtros
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => exportar("empresas")}
              disabled={exportando || total === 0}
              className="btn-ghost text-xs"
              title="CSV com 1 linha por empresa"
            >
              {exportando ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
              CSV empresas
            </button>
            <button
              onClick={() => exportar("qsa")}
              disabled={exportando || total === 0}
              className="btn-ghost text-xs"
              title="CSV com 1 linha por (empresa × sócio) — bom pra integração externa"
            >
              <Download className="w-3 h-3" />
              CSV + QSA
            </button>
            <button onClick={aplicarFiltros} className="btn-primary text-xs">
              Aplicar
            </button>
          </div>
        </div>
      </section>

      {feedback && (
        <div
          role="status"
          aria-live="polite"
          className={`card p-3 mb-4 text-sm flex items-center gap-2 ${
            feedback.tipo === "ok" ? "border-success-500/30 bg-success-500/5 text-success-500" :
            "border-destructive/30 bg-destructive/5 text-destructive"
          }`}
        >
          {feedback.tipo === "ok" ? <Check className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {feedback.texto}
        </div>
      )}

      {/* Lista */}
      {empresas.length === 0 ? (
        <div className="card p-12 text-center">
          <Building2 className="w-10 h-10 mx-auto text-muted-foreground/40 mb-3" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">
            Nenhuma empresa encontrada com esses filtros.
          </p>
          <p className="text-xs text-muted-foreground/70 mt-1">
            Consulte CNPJs em <Link href="/vendas/prospeccao" className="text-primary hover:underline">/vendas/prospeccao</Link> ou importe um CSV.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {empresas.map((e) => <EmpresaCard key={e.id} empresa={e} onAtivar={ativarLead} ativando={ativando === e.id} pending={pending} />)}
        </ul>
      )}

      {/* Paginação */}
      {totalPages > 1 && (
        <nav className="flex items-center justify-between mt-4 text-sm" aria-label="Paginação">
          <div className="text-muted-foreground">
            Página {page} de {totalPages} ({pageSize} por página)
          </div>
          <div className="flex items-center gap-2">
            <PaginaLink page={page - 1} disabled={page <= 1} label="Anterior" icon={<ChevronLeft className="w-3 h-3" />} filtros={currentFilters} />
            <PaginaLink page={page + 1} disabled={page >= totalPages} label="Próxima" icon={<ChevronRight className="w-3 h-3" />} filtros={currentFilters} reverse />
          </div>
        </nav>
      )}
    </div>
  );
}

function PaginaLink({
  page, disabled, label, icon, filtros, reverse,
}: {
  page: number;
  disabled: boolean;
  label: string;
  icon: React.ReactNode;
  filtros: any;
  reverse?: boolean;
}) {
  const params = new URLSearchParams();
  if (filtros.q) params.set("q", filtros.q);
  if (filtros.porte !== "all") params.set("porte", filtros.porte);
  if (filtros.uf !== "all") params.set("uf", filtros.uf);
  if (filtros.cnae) params.set("cnae", filtros.cnae);
  if (filtros.situacao !== "ATIVA") params.set("situacao", filtros.situacao);
  if (filtros.capital_min) params.set("capital_min", filtros.capital_min.toString());
  params.set("page", page.toString());

  if (disabled) {
    return <span className="btn-ghost text-xs opacity-40 cursor-not-allowed">{!reverse && icon} {label} {reverse && icon}</span>;
  }
  return (
    <Link href={`/vendas/prospeccao/base-de-empresas?${params.toString()}`} className="btn-ghost text-xs">
      {!reverse && icon} {label} {reverse && icon}
    </Link>
  );
}

function EmpresaCard({
  empresa, onAtivar, ativando, pending,
}: {
  empresa: EmpresaRow;
  onAtivar: (e: EmpresaRow, opt: { socio_id?: number; iniciarCadencia?: boolean }) => void;
  ativando: boolean;
  pending: boolean;
}) {
  const [showSocios, setShowSocios] = useState(false);
  const [enriquecendoSocios, setEnriquecendoSocios] = useState(false);
  const [feedbackSocios, setFeedbackSocios] = useState<string | null>(null);

  const sociosSemLinkedIn = empresa.socios.filter((s) => !s.linkedin_url).length;

  async function enriquecerSocios() {
    setEnriquecendoSocios(true);
    setFeedbackSocios(null);
    try {
      const res = await fetch("/api/prospeccao/enriquecer-socios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ empresa_id: empresa.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.erro ?? "Erro");
      setFeedbackSocios(
        data.enriquecidos > 0
          ? `${data.enriquecidos} LinkedIn(s) encontrado(s). Recarregue pra ver.`
          : "Nenhum LinkedIn encontrado pelo Tavily."
      );
    } catch (e) {
      setFeedbackSocios(e instanceof Error ? e.message : "Erro.");
    } finally {
      setEnriquecendoSocios(false);
    }
  }
  const label = empresa.nome_fantasia || empresa.razao_social || empresa.cnpj_formatado;
  const situacaoTone = empresa.situacao === "ATIVA" ? "text-success-500 bg-success-500/10 border-success-500/30" : "text-muted-foreground bg-muted border-border";

  return (
    <li className="card p-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Link
              href={`/vendas/prospeccao/empresa/${empresa.id}`}
              className="font-semibold text-foreground truncate hover:text-primary transition-colors"
              style={{ letterSpacing: "-0.15px" }}
            >
              {label}
            </Link>
            <span className={`text-[10px] uppercase tracking-[0.12em] font-semibold px-1.5 py-0.5 rounded border ${situacaoTone}`}>
              {empresa.situacao ?? "—"}
            </span>
            {empresa.porte && (
              <span className="text-[10px] uppercase tracking-[0.12em] font-semibold px-1.5 py-0.5 rounded border border-border bg-secondary text-muted-foreground">
                {empresa.porte}
              </span>
            )}
          </div>
          <Link
            href={`/vendas/prospeccao/empresa/${empresa.id}`}
            className="text-xs text-muted-foreground tabular-nums mt-0.5 font-mono hover:text-foreground inline-block"
          >
            {empresa.cnpj_formatado}
          </Link>
          {empresa.razao_social && empresa.nome_fantasia && empresa.razao_social !== empresa.nome_fantasia && (
            <div className="text-xs text-muted-foreground mt-0.5 italic">Razão: {empresa.razao_social}</div>
          )}

          <div className="flex items-center gap-3 text-xs text-muted-foreground mt-2 flex-wrap">
            {empresa.cidade && (
              <span className="inline-flex items-center gap-1"><MapPin className="w-3 h-3" /> {empresa.cidade}/{empresa.uf}</span>
            )}
            {empresa.capital_social != null && (
              <span className="inline-flex items-center gap-1 tabular-nums">
                <DollarSign className="w-3 h-3" />
                {Number(empresa.capital_social).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })}
              </span>
            )}
            {empresa.cnae_normalizado && (
              <span className="text-[11px] text-foreground/80">{empresa.cnae_normalizado}</span>
            )}
            {empresa.site && (
              <a href={empresa.site} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                <ExternalLink className="w-3 h-3" /> site
              </a>
            )}
            {empresa.linkedin_url && (
              <a href={empresa.linkedin_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                <Linkedin className="w-3 h-3" /> LinkedIn
              </a>
            )}
          </div>

          {empresa.descricao_negocio && (
            <p className="text-xs text-muted-foreground/90 mt-2 line-clamp-2">{empresa.descricao_negocio}</p>
          )}

          {empresa.total_socios > 0 && (
            <div className="flex items-center gap-3 mt-2">
              <button
                type="button"
                onClick={() => setShowSocios(!showSocios)}
                className="text-xs text-primary hover:underline inline-flex items-center gap-1"
              >
                <Users className="w-3 h-3" />
                {empresa.total_socios} {empresa.total_socios === 1 ? "sócio" : "sócios"} ({showSocios ? "esconder" : "ver"})
              </button>
              {showSocios && sociosSemLinkedIn > 0 && (
                <button
                  type="button"
                  onClick={enriquecerSocios}
                  disabled={enriquecendoSocios}
                  className="text-[11px] text-muted-foreground hover:text-primary inline-flex items-center gap-1"
                  title="Busca LinkedIn dos sócios via Tavily"
                >
                  {enriquecendoSocios && <Loader2 className="w-3 h-3 animate-spin" />}
                  {enriquecendoSocios ? "Buscando..." : `Buscar LinkedIn de ${sociosSemLinkedIn} sócio(s)`}
                </button>
              )}
              {feedbackSocios && (
                <span className="text-[11px] text-muted-foreground italic">{feedbackSocios}</span>
              )}
            </div>
          )}

          {showSocios && empresa.socios.length > 0 && (
            <ul className="mt-2 space-y-1">
              {empresa.socios.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-2 text-xs px-2 py-1.5 rounded bg-secondary/40 border border-border">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{s.nome}</div>
                    {s.qualificacao && <div className="text-[10px] text-muted-foreground">{s.qualificacao}{s.cargo_atual ? ` · ${s.cargo_atual}` : ""}</div>}
                  </div>
                  <div className="flex items-center gap-1.5">
                    {s.linkedin_url && (
                      <a href={s.linkedin_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline" title="LinkedIn">
                        <Linkedin className="w-3 h-3" />
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() => onAtivar(empresa, { socio_id: s.id })}
                      disabled={ativando || pending}
                      className="text-[10px] text-primary hover:underline"
                      title="Ativa como lead com este sócio como responsável"
                    >
                      ativar c/ este sócio →
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <button
            onClick={() => onAtivar(empresa, {})}
            disabled={ativando || pending}
            className="btn-primary text-xs"
          >
            {ativando && <Loader2 className="w-3 h-3 animate-spin" />}
            Ativar como lead
          </button>
          <button
            onClick={() => onAtivar(empresa, { iniciarCadencia: true })}
            disabled={ativando || pending}
            className="btn-ghost text-xs text-primary"
            title="Salva + inicia a cadência configurada"
          >
            + iniciar cadência
          </button>
        </div>
      </div>
    </li>
  );
}
