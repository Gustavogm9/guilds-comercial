"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import clsx from "clsx";
import {
  ArrowUpRight,
  Check,
  Copy,
  FileSignature,
  FileText,
  Loader2,
  Scale,
  Search,
  Sparkles,
} from "lucide-react";
import AiOutputActions from "@/components/ai/ai-output-actions";
import { gerarContratoAction } from "./actions";

export type LeadFechadoOpcao = {
  id: number;
  empresa: string | null;
  nome: string | null;
  segmento: string | null;
  dor_principal: string | null;
  valor_potencial: number | null;
  crm_stage: string | null;
  data_fechamento: string | null;
  observacoes: string | null;
};

export type PropostaContratoOpcao = {
  id: number;
  lead_id: number | null;
  lead_nome: string;
  produto_id: number | null;
  variacao: string | null;
  status: string;
  valor_total: number | null;
  valor_setup: number | null;
  valor_mensal: number | null;
  created_at: string | null;
  data_envio: string | null;
  texto_proposta: string | null;
  html_proposta: string | null;
};

export type ContratoExistente = {
  id: number;
  lead_id: number | null;
  proposta_id: number | null;
  lead_nome: string;
  modo: string;
  status: string;
  versao_atual: number;
  created_at: string | null;
  template_docx_nome: string | null;
  texto_contrato: string | null;
  html_contrato: string | null;
  briefing_juridico: string | null;
};

export type ContratoSkillConfigOpcao = {
  id: number;
  nome: string;
  modo: string;
  template_docx_nome: string | null;
  template_docx_ref: string | null;
  skill_chain: string;
  modelo_referencia: string | null;
  padrao: boolean;
};

type ModoContrato = "contrato_template" | "briefing_juridico" | "revisao_juridica";

type Props = {
  leads: LeadFechadoOpcao[];
  propostas: PropostaContratoOpcao[];
  contratos: ContratoExistente[];
  skillConfigs: ContratoSkillConfigOpcao[];
  initialLeadId?: number | null;
};

const MODOS: Array<{ key: ModoContrato; label: string; icon: typeof FileSignature; desc: string }> = [
  { key: "contrato_template", label: "Template DOCX", icon: FileSignature, desc: "Contrato padrao" },
  { key: "briefing_juridico", label: "Briefing juridico", icon: FileText, desc: "Para advogado criar" },
  { key: "revisao_juridica", label: "Revisao juridica", icon: Scale, desc: "Caso fora do padrao" },
];

const SKILL_CHAIN_PADRAO = [
  "1. Conferir proposta aprovada, lead fechado, escopo, valores, prazos e condicoes.",
  "2. Identificar se o caso cabe no template juridico padrao ou exige revisao.",
  "3. Mapear dados faltantes: razao social, CNPJ, endereco, representante, vigencia, pagamento e anexos.",
  "4. Separar escopo comercial de clausulas juridicas e marcar riscos/premissas.",
  "5. Produzir saida revisavel por vendedor, gestor e juridico, sem substituir advogado.",
].join("\n");

const moeda = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
});

function nomeLead(lead: LeadFechadoOpcao) {
  return lead.empresa || lead.nome || `Lead #${lead.id}`;
}

function dataCurta(value: string | null) {
  if (!value) return "sem data";
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" }).format(new Date(value));
}

export default function ContratoWorkbench({ leads, propostas, contratos, skillConfigs, initialLeadId }: Props) {
  const leadInicial = initialLeadId && leads.some((lead) => lead.id === initialLeadId)
    ? initialLeadId
    : leads[0]?.id ?? null;

  const [leadId, setLeadId] = useState<number | null>(leadInicial);
  const [busca, setBusca] = useState("");
  const [modo, setModo] = useState<ModoContrato>("contrato_template");
  const [propostaId, setPropostaId] = useState<number | null>(null);
  const [contratoId, setContratoId] = useState<number | null>(null);
  const [templateDocxNome, setTemplateDocxNome] = useState("");
  const [templateDocxRef, setTemplateDocxRef] = useState("");
  const [skillConfigId, setSkillConfigId] = useState<number | null>(null);
  const [skillChain, setSkillChain] = useState(SKILL_CHAIN_PADRAO);
  const [modeloReferencia, setModeloReferencia] = useState("");
  const [dadosCliente, setDadosCliente] = useState("");
  const [escopoAprovado, setEscopoAprovado] = useState("");
  const [condicoesComerciais, setCondicoesComerciais] = useState("");
  const [vigencia, setVigencia] = useState("");
  const [responsabilidades, setResponsabilidades] = useState("");
  const [pontosForaPadrao, setPontosForaPadrao] = useState("");
  const [pedidoMelhoria, setPedidoMelhoria] = useState("");
  const [texto, setTexto] = useState("");
  const [htmlPreview, setHtmlPreview] = useState<string | null>(null);
  const [invocationId, setInvocationId] = useState<number | null>(null);
  const [versaoAtual, setVersaoAtual] = useState<number | null>(null);
  const [erro, setErro] = useState("");
  const [copiado, setCopiado] = useState(false);
  const [pending, startTransition] = useTransition();

  const leadSelecionado = useMemo(
    () => leads.find((lead) => lead.id === leadId) ?? null,
    [leadId, leads]
  );

  const propostasDoLead = useMemo(
    () => propostas.filter((proposta) => proposta.lead_id === leadId),
    [leadId, propostas]
  );

  const contratosDoLead = useMemo(
    () => contratos.filter((contrato) => contrato.lead_id === leadId),
    [leadId, contratos]
  );

  const leadsFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return leads.slice(0, 14);
    return leads
      .filter((lead) =>
        [lead.empresa, lead.nome, lead.segmento, lead.dor_principal]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(termo))
      )
      .slice(0, 14);
  }, [busca, leads]);

  const skillConfigsDoModo = useMemo(
    () => skillConfigs.filter((config) => config.modo === modo),
    [skillConfigs, modo]
  );

  useEffect(() => {
    const propostaPreferida = propostasDoLead.find((proposta) => proposta.status === "aceita") ?? propostasDoLead[0];
    setPropostaId(propostaPreferida?.id ?? null);
    const contratoExistente = contratosDoLead[0];
    setContratoId(contratoExistente?.id ?? null);
    if (contratoExistente) {
      setTexto(contratoExistente.texto_contrato ?? contratoExistente.briefing_juridico ?? "");
      setHtmlPreview(contratoExistente.html_contrato ?? null);
      setVersaoAtual(contratoExistente.versao_atual);
    }
  }, [leadId, propostasDoLead, contratosDoLead]);

  useEffect(() => {
    const config = skillConfigsDoModo.find((item) => item.padrao) ?? skillConfigsDoModo[0];
    if (config) {
      setSkillConfigId(config.id);
      setSkillChain(config.skill_chain);
      setModeloReferencia(config.modelo_referencia ?? "");
      setTemplateDocxNome(config.template_docx_nome ?? "");
      setTemplateDocxRef(config.template_docx_ref ?? "");
    } else {
      setSkillConfigId(null);
      setSkillChain(SKILL_CHAIN_PADRAO);
      setModeloReferencia("");
      setTemplateDocxNome("");
      setTemplateDocxRef("");
    }
  }, [modo, skillConfigsDoModo]);

  function aplicarSkillConfig(configId: number | null) {
    setSkillConfigId(configId);
    const config = skillConfigs.find((item) => item.id === configId);
    if (!config) return;
    setSkillChain(config.skill_chain);
    setModeloReferencia(config.modelo_referencia ?? "");
    setTemplateDocxNome(config.template_docx_nome ?? "");
    setTemplateDocxRef(config.template_docx_ref ?? "");
  }

  function gerar() {
    if (!leadId) {
      setErro("Selecione um cliente fechado para gerar contrato.");
      return;
    }
    setErro("");
    setInvocationId(null);

    startTransition(async () => {
      const resposta = await gerarContratoAction({
        leadId,
        campos: {
          modo,
          contratoId,
          propostaId,
          templateDocxNome,
          templateDocxRef,
          skillChain,
          modeloReferencia,
          dadosCliente,
          escopoAprovado,
          condicoesComerciais,
          vigencia,
          responsabilidades,
          pontosForaPadrao,
          pedidoMelhoria,
        },
      });

      if (resposta.ok) {
        setTexto(resposta.texto);
        setHtmlPreview(resposta.html ?? null);
        setInvocationId(resposta.invocationId ?? null);
        setContratoId(resposta.contratoId ?? null);
        setVersaoAtual(resposta.versao ?? null);
        setPedidoMelhoria("");
      } else {
        setErro(resposta.erro ?? "Erro ao gerar contrato.");
        setTexto(resposta.texto ?? "");
        setHtmlPreview(resposta.html ?? null);
        setContratoId(resposta.contratoId ?? contratoId);
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
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Cliente fechado</label>
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
              <p className="text-sm text-muted-foreground py-4">Nenhum cliente fechado encontrado.</p>
            ) : leadsFiltrados.map((lead) => {
              const ativo = lead.id === leadId;
              return (
                <button
                  key={lead.id}
                  type="button"
                  onClick={() => setLeadId(lead.id)}
                  className={clsx(
                    "w-full text-left rounded-lg border p-3 transition-colors",
                    ativo ? "border-primary/50 bg-primary/5" : "border-border bg-background hover:border-primary/30"
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-sm font-medium line-clamp-1">{nomeLead(lead)}</span>
                    <span className="text-[11px] rounded-full border border-border px-2 py-0.5 text-muted-foreground shrink-0">
                      Fechado
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                    {lead.segmento ?? "sem segmento"} {lead.valor_potencial ? `| ${moeda.format(lead.valor_potencial)}` : ""}
                  </p>
                </button>
              );
            })}
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
                <dt className="text-xs text-muted-foreground">Fechamento</dt>
                <dd className="font-medium">{dataCurta(leadSelecionado.data_fechamento)}</dd>
              </div>
              <div className="col-span-2">
                <dt className="text-xs text-muted-foreground">Propostas</dt>
                <dd className="font-medium">{propostasDoLead.length}</dd>
              </div>
            </dl>
          ) : <p className="text-sm text-muted-foreground mt-3">Selecione um cliente.</p>}
        </section>
      </aside>

      <main className="space-y-5">
        <section className="card p-4 md:p-5">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <label className="block">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Proposta base</span>
              <select
                value={propostaId ?? ""}
                onChange={(event) => setPropostaId(event.target.value ? Number(event.target.value) : null)}
                className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
              >
                <option value="">Sem proposta vinculada</option>
                {propostasDoLead.map((proposta) => (
                  <option key={proposta.id} value={proposta.id}>
                    #{proposta.id} | {proposta.status} | {proposta.valor_total ? moeda.format(proposta.valor_total) : "sem valor"}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Skill configurada</span>
              <select
                value={skillConfigId ?? ""}
                onChange={(event) => aplicarSkillConfig(event.target.value ? Number(event.target.value) : null)}
                className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
              >
                <option value="">Manual / padrao do sistema</option>
                {skillConfigsDoModo.map((config) => (
                  <option key={config.id} value={config.id}>
                    {config.nome}{config.padrao ? " (padrao)" : ""}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mt-5">
            {MODOS.map((item) => {
              const Icon = item.icon;
              const ativo = modo === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setModo(item.key)}
                  className={clsx(
                    "rounded-lg border p-3 text-left transition-colors min-h-[84px]",
                    ativo ? "border-primary/60 bg-primary/10" : "border-border bg-background hover:border-primary/30"
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
            <Campo label="Template DOCX" value={templateDocxNome} onChange={setTemplateDocxNome} placeholder="Ex: Contrato Padrao SaaS v4.docx" />
            <Campo label="Referencia do template" value={templateDocxRef} onChange={setTemplateDocxRef} placeholder="Caminho, Drive, SharePoint ou identificador interno" />
            <Campo label="Dados do cliente" value={dadosCliente} onChange={setDadosCliente} placeholder="Razao social, CNPJ, endereco, representante" multiline />
            <Campo label="Escopo aprovado" value={escopoAprovado} onChange={setEscopoAprovado} placeholder="Escopo final, anexos, entregas e exclusoes" multiline />
            <Campo label="Condicoes comerciais" value={condicoesComerciais} onChange={setCondicoesComerciais} placeholder="Valor, pagamento, reajuste, multa, setup, recorrencia" multiline />
            <Campo label="Vigencia" value={vigencia} onChange={setVigencia} placeholder="Ex: 12 meses, inicio no kickoff, renovacao automatica" />
            <Campo label="Responsabilidades / SLA" value={responsabilidades} onChange={setResponsabilidades} placeholder="Responsabilidades do cliente, da Guilds, prazos e aceite" multiline />
            <Campo label="Pontos fora do padrao" value={pontosForaPadrao} onChange={setPontosForaPadrao} placeholder="Descontos, clausulas negociadas, riscos, excecoes" multiline />
          </div>

          <div className="mt-5 grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Campo label="Sequencia de skills" value={skillChain} onChange={setSkillChain} placeholder="Cole skills juridicas/comerciais validadas" multiline rows={7} />
            <Campo label="Modelo validado" value={modeloReferencia} onChange={setModeloReferencia} placeholder="Cole estrutura do contrato ou briefing aprovado pelo juridico" multiline rows={7} />
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm text-muted-foreground">
              {contratosDoLead.length > 0 ? `${contratosDoLead.length} contrato(s) neste cliente` : "Sem contrato neste cliente"}
            </div>
            <button type="button" onClick={gerar} disabled={pending || !leadId} className="btn-primary text-sm">
              {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              Gerar contrato
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
              <Campo label="Pedido de melhoria" value={pedidoMelhoria} onChange={setPedidoMelhoria} placeholder="Ex: gerar so briefing juridico, detalhar SLA, marcar clausulas fora do padrao" multiline rows={3} />
              <button type="button" onClick={gerar} disabled={pending || !pedidoMelhoria.trim()} className="btn-secondary text-sm h-10">
                {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                Gerar nova versao
              </button>
            </div>
            {htmlPreview ? (
              <iframe title="Preview HTML do contrato" sandbox="" srcDoc={htmlPreview} className="w-full h-[520px] rounded-lg border border-border bg-white mb-4" />
            ) : null}
            <div className="rounded-lg border border-border bg-secondary/30 p-4 text-sm leading-relaxed whitespace-pre-wrap max-h-[620px] overflow-y-auto">
              {texto}
            </div>
          </section>
        ) : null}

        <section className="card p-4 md:p-5">
          <h2 className="text-sm font-semibold mb-3">Contratos recentes</h2>
          <div className="divide-y divide-border">
            {contratos.length === 0 ? (
              <p className="text-sm text-muted-foreground py-3">Nenhum contrato gerado ainda.</p>
            ) : contratos.slice(0, 8).map((contrato) => (
              <div key={contrato.id} className="py-3 flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{contrato.lead_nome}</span>
                    <span className="text-[11px] rounded-full border border-border px-2 py-0.5 text-muted-foreground">{contrato.status}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {contrato.modo} | v{contrato.versao_atual} | {dataCurta(contrato.created_at)}
                  </p>
                </div>
                {contrato.lead_id ? (
                  <Link href={`/vendas/contratos?lead=${contrato.lead_id}`} className="btn-secondary text-xs shrink-0">
                    Abrir <ArrowUpRight className="w-3.5 h-3.5" />
                  </Link>
                ) : null}
              </div>
            ))}
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
        <textarea value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} rows={rows} className={className} />
      ) : (
        <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className={className} />
      )}
    </label>
  );
}
