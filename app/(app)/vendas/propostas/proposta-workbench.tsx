"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import clsx from "clsx";
import {
  ArrowUpRight,
  Check,
  Copy,
  FileText,
  ListChecks,
  Loader2,
  Mail,
  MessageSquareText,
  Search,
  Sparkles,
} from "lucide-react";
import { gerarPropostaAction } from "@/app/(app)/proposta/[leadId]/actions";
import AiOutputActions from "@/components/ai/ai-output-actions";

export type LeadOpcao = {
  id: number;
  empresa: string | null;
  nome: string | null;
  segmento: string | null;
  dor_principal: string | null;
  valor_potencial: number | null;
  crm_stage: string | null;
  data_proposta: string | null;
};

export type ProdutoOpcao = {
  id: number;
  nome: string;
  categoria: string | null;
  recorrente: boolean | null;
  valor_base: number | null;
  valor_max: number | null;
  descricao: string | null;
};

export type PropostaRecente = {
  id: number;
  lead_id: number | null;
  produto_id: number | null;
  lead_nome: string;
  produto_nome: string | null;
  variacao: string | null;
  status: string;
  valor_total: number | null;
  created_at: string | null;
  data_envio: string | null;
  texto_proposta: string | null;
  link_proposta: string | null;
};

export type PropostaSkillConfigOpcao = {
  id: number;
  nome: string;
  formato: string;
  skill_chain: string;
  modelo_referencia: string | null;
  padrao: boolean;
};

type Formato = "proposta_comercial" | "escopo_tecnico" | "email_executivo" | "whatsapp_resumo";
type Variacao = "conservadora" | "recomendada" | "premium";

type WorkbenchProps = {
  leads: LeadOpcao[];
  produtos: ProdutoOpcao[];
  propostas: PropostaRecente[];
  skillConfigs: PropostaSkillConfigOpcao[];
  initialLeadId?: number | null;
};

const FORMATOS: Array<{ key: Formato; label: string; icon: typeof FileText; desc: string }> = [
  { key: "proposta_comercial", label: "Proposta comercial", icon: FileText, desc: "Documento consultivo" },
  { key: "escopo_tecnico", label: "Escopo / SOW", icon: Check, desc: "Entregas e criterios" },
  { key: "email_executivo", label: "Email executivo", icon: Mail, desc: "Envio para decisor" },
  { key: "whatsapp_resumo", label: "WhatsApp", icon: MessageSquareText, desc: "Resumo objetivo" },
];

const VARIACOES: Array<{ key: Variacao; label: string; desc: string }> = [
  { key: "conservadora", label: "Conservadora", desc: "Menor escopo e menor friccao" },
  { key: "recomendada", label: "Recomendada", desc: "Equilibrio entre valor e risco" },
  { key: "premium", label: "Premium", desc: "Escopo completo e maior ticket" },
];

const SKILL_CHAIN_PADRAO = [
  "1. Diagnosticar contexto, etapa, dor principal e urgencia do lead.",
  "2. Mapear impacto financeiro, valor percebido e risco de nao agir.",
  "3. Escolher oferta principal, add-ons, upsell/cross-sell e cases aderentes.",
  "4. Montar escopo, entregas, premissas, cronograma, investimento e proximos passos.",
  "5. Revisar clareza, objeccoes, riscos comerciais e coerencia com o formato escolhido.",
].join("\n");

const moeda = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
});

function nomeLead(lead: LeadOpcao) {
  return lead.empresa || lead.nome || `Lead #${lead.id}`;
}

function dataCurta(value: string | null) {
  if (!value) return "sem data";
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" }).format(new Date(value));
}

export default function PropostaWorkbench({ leads, produtos, propostas, skillConfigs, initialLeadId }: WorkbenchProps) {
  const leadInicial = initialLeadId && leads.some((lead) => lead.id === initialLeadId)
    ? initialLeadId
    : leads[0]?.id ?? null;

  const [leadId, setLeadId] = useState<number | null>(leadInicial);
  const [produtoId, setProdutoId] = useState<number | null>(produtos[0]?.id ?? null);
  const [formato, setFormato] = useState<Formato>("proposta_comercial");
  const [variacao, setVariacao] = useState<Variacao>("recomendada");
  const [busca, setBusca] = useState("");
  const [objetivo, setObjetivo] = useState("");
  const [escopo, setEscopo] = useState("");
  const [entregas, setEntregas] = useState("");
  const [cronograma, setCronograma] = useState("");
  const [investimento, setInvestimento] = useState("");
  const [condicoes, setCondicoes] = useState("");
  const [validade, setValidade] = useState("7 dias");
  const [observacoes, setObservacoes] = useState("");
  const [skillChain, setSkillChain] = useState(SKILL_CHAIN_PADRAO);
  const [modeloReferencia, setModeloReferencia] = useState("");
  const [skillConfigId, setSkillConfigId] = useState<number | null>(null);
  const [pedidoMelhoria, setPedidoMelhoria] = useState("");
  const [texto, setTexto] = useState("");
  const [htmlPreview, setHtmlPreview] = useState<string | null>(null);
  const [erro, setErro] = useState("");
  const [invocationId, setInvocationId] = useState<number | null>(null);
  const [propostaIdAtual, setPropostaIdAtual] = useState<number | null>(null);
  const [versaoAtual, setVersaoAtual] = useState<number | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [pending, startTransition] = useTransition();

  const leadSelecionado = useMemo(
    () => leads.find((lead) => lead.id === leadId) ?? null,
    [leadId, leads]
  );

  const produtoSelecionado = useMemo(
    () => produtos.find((produto) => produto.id === produtoId) ?? null,
    [produtoId, produtos]
  );

  const leadsFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return leads.slice(0, 12);
    return leads
      .filter((lead) =>
        [lead.empresa, lead.nome, lead.segmento, lead.dor_principal, lead.crm_stage]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(termo))
      )
      .slice(0, 12);
  }, [busca, leads]);

  const propostasDoLead = useMemo(
    () => propostas.filter((proposta) => proposta.lead_id === leadId).slice(0, 5),
    [leadId, propostas]
  );

  const skillConfigsDoFormato = useMemo(
    () => skillConfigs.filter((config) => config.formato === formato),
    [skillConfigs, formato]
  );

  useEffect(() => {
    const config = skillConfigsDoFormato.find((item) => item.padrao) ?? skillConfigsDoFormato[0];
    if (config) {
      setSkillConfigId(config.id);
      setSkillChain(config.skill_chain);
      setModeloReferencia(config.modelo_referencia ?? "");
    } else {
      setSkillConfigId(null);
      setSkillChain(SKILL_CHAIN_PADRAO);
      setModeloReferencia("");
    }
  }, [formato, skillConfigsDoFormato]);

  function aplicarSkillConfig(configId: number | null) {
    setSkillConfigId(configId);
    const config = skillConfigs.find((item) => item.id === configId);
    if (!config) return;
    setSkillChain(config.skill_chain);
    setModeloReferencia(config.modelo_referencia ?? "");
  }

  function gerar() {
    if (!leadId) {
      setErro("Selecione um lead para gerar a proposta.");
      return;
    }
    setErro("");
    setTexto("");
    setHtmlPreview(null);
    setInvocationId(null);

    startTransition(async () => {
      const resposta = await gerarPropostaAction({
        leadId,
        produtoId,
        propostaId: propostaIdAtual,
        variacao,
        campos: {
          formato,
          objetivo,
          escopo,
          entregas,
          cronograma,
          investimento,
          condicoes,
          validade,
          observacoes,
          skillChain,
          modeloReferencia,
          pedidoMelhoria,
        },
      });

      if (resposta.ok) {
        setTexto(resposta.texto);
        setHtmlPreview(resposta.html ?? null);
        setInvocationId(resposta.invocationId ?? null);
        setPropostaIdAtual(resposta.propostaId ?? null);
        setVersaoAtual(resposta.versao ?? null);
        setPedidoMelhoria("");
      } else {
        setErro(resposta.erro ?? "Erro ao gerar proposta.");
        setTexto(resposta.texto ?? "");
        setHtmlPreview(resposta.html ?? null);
        setPropostaIdAtual(resposta.propostaId ?? propostaIdAtual);
      }
    });
  }

  async function copiar() {
    if (!texto) return;
    await navigator.clipboard.writeText(texto);
    setCopiado(true);
    window.setTimeout(() => setCopiado(false), 1600);
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(320px,380px)_1fr] gap-5 items-start">
      <aside className="space-y-4">
        <section className="card p-4">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Lead
          </label>
          <div className="relative mt-3">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={busca}
              onChange={(event) => setBusca(event.target.value)}
              className="w-full rounded-lg border border-border bg-background pl-9 pr-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
              placeholder="Buscar empresa, contato ou segmento"
            />
          </div>

          <div className="mt-3 space-y-2 max-h-[360px] overflow-y-auto pr-1">
            {leadsFiltrados.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">Nenhum lead encontrado.</p>
            ) : (
              leadsFiltrados.map((lead) => {
                const ativo = lead.id === leadId;
                return (
                  <button
                    key={lead.id}
                    type="button"
                    onClick={() => setLeadId(lead.id)}
                    className={clsx(
                      "w-full text-left rounded-lg border p-3 transition-colors",
                      ativo
                        ? "border-primary/50 bg-primary/5"
                        : "border-border bg-background hover:border-primary/30"
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-sm font-medium text-foreground line-clamp-1">{nomeLead(lead)}</span>
                      <span className="text-[11px] rounded-full border border-border px-2 py-0.5 text-muted-foreground shrink-0">
                        {lead.crm_stage ?? "sem etapa"}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                      {lead.segmento ?? "sem segmento"} {lead.dor_principal ? `| ${lead.dor_principal}` : ""}
                    </p>
                  </button>
                );
              })
            )}
          </div>
        </section>

        <section className="card p-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold">Contexto</h2>
            {leadSelecionado ? (
              <Link href={`/vendas/pipeline/${leadSelecionado.id}`} className="btn-ghost text-xs">
                Abrir <ArrowUpRight className="w-3.5 h-3.5" />
              </Link>
            ) : null}
          </div>
          {leadSelecionado ? (
            <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">Valor</dt>
                <dd className="font-medium">{moeda.format(Number(leadSelecionado.valor_potencial ?? 0))}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Ultima proposta</dt>
                <dd className="font-medium">{dataCurta(leadSelecionado.data_proposta)}</dd>
              </div>
              <div className="col-span-2">
                <dt className="text-xs text-muted-foreground">Dor principal</dt>
                <dd className="font-medium">{leadSelecionado.dor_principal ?? "Nao informada"}</dd>
              </div>
            </dl>
          ) : (
            <p className="text-sm text-muted-foreground mt-3">Selecione um lead.</p>
          )}
        </section>
      </aside>

      <main className="space-y-5">
        <section className="card p-4 md:p-5">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Produto / oferta
              </label>
              <select
                value={produtoId ?? ""}
                onChange={(event) => setProdutoId(event.target.value ? Number(event.target.value) : null)}
                className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
              >
                <option value="">Sem produto especifico</option>
                {produtos.map((produto) => (
                  <option key={produto.id} value={produto.id}>
                    {produto.nome}
                  </option>
                ))}
              </select>
              {produtoSelecionado ? (
                <p className="text-xs text-muted-foreground mt-2 line-clamp-2">
                  {produtoSelecionado.categoria ?? "sem categoria"} |{" "}
                  {moeda.format(Number(produtoSelecionado.valor_base ?? 0))}
                  {produtoSelecionado.recorrente ? " recorrente" : ""}
                </p>
              ) : null}
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Variacao comercial
              </label>
              <div className="grid grid-cols-3 gap-2 mt-2">
                {VARIACOES.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setVariacao(item.key)}
                    title={item.desc}
                    className={clsx(
                      "rounded-lg border px-3 py-2 text-xs font-medium transition-colors",
                      variacao === item.key
                        ? "border-primary/60 bg-primary/10 text-primary"
                        : "border-border bg-background hover:border-primary/30"
                    )}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mt-5">
            {FORMATOS.map((item) => {
              const Icon = item.icon;
              const ativo = formato === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setFormato(item.key)}
                  className={clsx(
                    "rounded-lg border p-3 text-left transition-colors min-h-[84px]",
                    ativo
                      ? "border-primary/60 bg-primary/10"
                      : "border-border bg-background hover:border-primary/30"
                  )}
                >
                  <Icon className={clsx("w-4 h-4 mb-2", ativo ? "text-primary" : "text-muted-foreground")} />
                  <div className="text-sm font-medium">{item.label}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{item.desc}</div>
                </button>
              );
            })}
          </div>
        </section>

        <section className="card p-4 md:p-5">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Campo label="Objetivo" value={objetivo} onChange={setObjetivo} placeholder="Ex: aprovar piloto, expandir contrato, fechar diagnostico" />
            <Campo label="Cronograma" value={cronograma} onChange={setCronograma} placeholder="Ex: kickoff em maio, 4 semanas, entregas quinzenais" />
            <Campo label="Escopo" value={escopo} onChange={setEscopo} placeholder="O que entra nesta proposta" multiline />
            <Campo label="Entregas" value={entregas} onChange={setEntregas} placeholder="Outputs, rituais, materiais e checkpoints" multiline />
            <Campo label="Investimento" value={investimento} onChange={setInvestimento} placeholder="Ancoragem, setup, mensalidade ou faixa negociada" />
            <Campo label="Condicoes" value={condicoes} onChange={setCondicoes} placeholder="Pagamento, reajuste, premissas ou dependencias" />
            <Campo label="Validade" value={validade} onChange={setValidade} placeholder="Ex: 7 dias" />
            <Campo label="Observacoes" value={observacoes} onChange={setObservacoes} placeholder="Tom, restricoes, decisor, concorrente, combinados" multiline />
          </div>

          <div className="mt-5 grid grid-cols-1 lg:grid-cols-2 gap-4">
            <label className="block lg:col-span-2">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Skill configurada</span>
              <select
                value={skillConfigId ?? ""}
                onChange={(event) => aplicarSkillConfig(event.target.value ? Number(event.target.value) : null)}
                className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
              >
                <option value="">Manual / padrao do sistema</option>
                {skillConfigsDoFormato.map((config) => (
                  <option key={config.id} value={config.id}>
                    {config.nome}{config.padrao ? " (padrao)" : ""}
                  </option>
                ))}
              </select>
            </label>
            <Campo
              label="Sequencia de skills"
              value={skillChain}
              onChange={setSkillChain}
              placeholder="Cole aqui as skills validadas no Claude, em ordem de execucao"
              multiline
              rows={7}
            />
            <Campo
              label="Modelo validado"
              value={modeloReferencia}
              onChange={setModeloReferencia}
              placeholder="Cole trechos, regras ou estrutura do modelo aprovado"
              multiline
              rows={7}
            />
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm text-muted-foreground">
              {propostasDoLead.length > 0
                ? `${propostasDoLead.length} proposta(s) recente(s) para este lead`
                : "Sem proposta recente para este lead"}
            </div>
            <button type="button" onClick={gerar} disabled={pending || !leadId} className="btn-primary text-sm">
              {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              Gerar proposta
            </button>
          </div>

          {erro ? (
            <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {erro}
            </div>
          ) : null}
        </section>

        {texto ? (
          <section className="card p-4 md:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <h2 className="text-sm font-semibold">
                Resultado gerado {versaoAtual ? <span className="text-xs text-muted-foreground">v{versaoAtual}</span> : null}
              </h2>
              <div className="flex items-center gap-2">
                <AiOutputActions invocationId={invocationId} texto={texto} />
                <button type="button" onClick={copiar} className="btn-secondary text-xs">
                  {copiado ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiado ? "Copiado" : "Copiar"}
                </button>
              </div>
            </div>
            <div className="mb-4 grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-3 items-end">
              <Campo
                label="Pedido de melhoria"
                value={pedidoMelhoria}
                onChange={setPedidoMelhoria}
                placeholder="Ex: deixe mais executivo, inclua add-on de onboarding, reduza o escopo inicial"
                multiline
                rows={3}
              />
              <button
                type="button"
                onClick={gerar}
                disabled={pending || !pedidoMelhoria.trim()}
                className="btn-secondary text-sm h-10"
              >
                {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                Gerar nova versao
              </button>
            </div>
            {htmlPreview ? (
              <div className="mb-4">
                <div className="flex items-center gap-2 mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  <ListChecks className="w-3.5 h-3.5" />
                  Preview HTML
                </div>
                <iframe
                  title="Preview HTML da proposta"
                  sandbox=""
                  srcDoc={htmlPreview}
                  className="w-full h-[520px] rounded-lg border border-border bg-white"
                />
              </div>
            ) : null}
            <div className="rounded-lg border border-border bg-secondary/30 p-4 text-sm leading-relaxed whitespace-pre-wrap max-h-[620px] overflow-y-auto">
              {texto}
            </div>
          </section>
        ) : null}

        <section className="card p-4 md:p-5">
          <h2 className="text-sm font-semibold mb-3">Historico recente</h2>
          <div className="divide-y divide-border">
            {propostas.length === 0 ? (
              <p className="text-sm text-muted-foreground py-3">Nenhuma proposta gerada ainda.</p>
            ) : (
              propostas.slice(0, 8).map((proposta) => (
                <div key={proposta.id} className="py-3 flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">{proposta.lead_nome}</span>
                      <span className="text-[11px] rounded-full border border-border px-2 py-0.5 text-muted-foreground">
                        {proposta.status}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {proposta.produto_nome ?? "sem produto"} | {proposta.variacao ?? "sem variacao"} |{" "}
                      {dataCurta(proposta.created_at)}
                    </p>
                  </div>
                  {proposta.lead_id ? (
                    <Link href={`/proposta/${proposta.lead_id}`} className="btn-secondary text-xs shrink-0">
                      Abrir proposta <ArrowUpRight className="w-3.5 h-3.5" />
                    </Link>
                  ) : null}
                </div>
              ))
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

function Campo({
  label,
  value,
  onChange,
  placeholder,
  multiline = false,
  rows = 4,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  multiline?: boolean;
  rows?: number;
}) {
  const className = "mt-2 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30";

  return (
    <label className="block">
      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{label}</span>
      {multiline ? (
        <textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          rows={rows}
          className={className}
        />
      ) : (
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className={className}
        />
      )}
    </label>
  );
}
