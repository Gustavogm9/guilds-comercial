"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { getClientLocale, getT, type Locale } from "@/lib/i18n";
import Link from "next/link";
import type { AiFeature, AiPrompt, AiProvider, AiUso30d, AiFeatureCodigo, AiProviderCodigo } from "@/lib/types";
import type { ContratoSkillConfig, LogRow, PropostaSkillConfig } from "./page";
import {
  toggleFeature, atualizarFeatureConfig, criarVersaoPrompt,
  reverterParaVersao, atualizarProvider, checarApiKeyEnv, salvarPropostaSkillConfig, salvarContratoSkillConfig,
} from "./actions";
import {
  Bot, FileCode, Plug, Activity, ChevronRight, Save, RotateCcw,
  CheckCircle2, XCircle, AlertCircle, Zap, DollarSign, Clock, Sparkles, FlaskConical, FileText,
} from "lucide-react";
import FewshotTab, { type FewshotExemplo } from "@/components/ai/fewshot-tab";
import ExperimentosTab from "@/components/ai/experimentos-tab";

type Tab = "features" | "prompts" | "providers" | "logs" | "fewshot" | "experimentos" | "propostas" | "contratos";

export default function AdminAiClient({
  tab, featureAberta, features, providers, prompts, uso, logs,
  fewshot, experimentos, resultadosExperimento, propostaSkillConfigs, contratoSkillConfigs,
}: {
  tab: Tab;
  featureAberta: string | null;
  features: AiFeature[];
  providers: AiProvider[];
  prompts: AiPrompt[];
  uso: AiUso30d[];
  logs: LogRow[];
  fewshot: FewshotExemplo[];
  experimentos: any[];
  resultadosExperimento: any[];
  propostaSkillConfigs: PropostaSkillConfig[];
  contratoSkillConfigs: ContratoSkillConfig[];
}) {
  const featuresLite = features.map((f) => ({ codigo: f.codigo, nome: f.nome }));
  const experimentosRodando = experimentos.filter((e) => e.status === "rodando").length;
  const [locale, setLocale] = useState<Locale>("pt-BR");
  useEffect(() => setLocale(getClientLocale()), []);
  const t = getT(locale);

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      <header className="mb-6">
        <div className="flex items-center gap-2 flex-wrap">
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Bot className="w-6 h-6 text-primary" />
            {t("paginas.admin_ai_titulo")}
          </h1>
          <span className="pill-warn">
            {t("papeis.gestor").toLowerCase()}
          </span>
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          {t("paginas.admin_ai_sub")}
        </p>
      </header>

      <nav className="flex gap-1 border-b border-border mb-5 overflow-x-auto">
        <TabBtn t="features"     cur={tab} icon={<Zap className="w-3.5 h-3.5" />} label="Features" count={features.length} />
        <TabBtn t="prompts"      cur={tab} icon={<FileCode className="w-3.5 h-3.5" />} label="Prompts" count={prompts.filter(p => p.ativo).length} />
        <TabBtn t="providers"    cur={tab} icon={<Plug className="w-3.5 h-3.5" />} label="Provedores" count={providers.filter(p => p.ativo).length} />
        <TabBtn t="fewshot"      cur={tab} icon={<Sparkles className="w-3.5 h-3.5" />} label="Few-shot" count={fewshot.length} />
        <TabBtn t="experimentos" cur={tab} icon={<FlaskConical className="w-3.5 h-3.5" />} label="A/B Testing" count={experimentosRodando} />
        <TabBtn t="propostas"    cur={tab} icon={<FileText className="w-3.5 h-3.5" />} label="Propostas" count={propostaSkillConfigs.length} />
        <TabBtn t="contratos"    cur={tab} icon={<FileText className="w-3.5 h-3.5" />} label="Contratos" count={contratoSkillConfigs.length} />
        <TabBtn t="logs"         cur={tab} icon={<Activity className="w-3.5 h-3.5" />} label="Logs" count={logs.length} />
      </nav>

      {tab === "features"     && <FeaturesTab     features={features} providers={providers} uso={uso} />}
      {tab === "prompts"      && <PromptsTab      features={features} prompts={prompts} featureAberta={featureAberta} />}
      {tab === "providers"    && <ProvidersTab    providers={providers} />}
      {tab === "fewshot"      && <FewshotTab      exemplos={fewshot} features={featuresLite} />}
      {tab === "experimentos" && <ExperimentosTab experimentos={experimentos} prompts={prompts} features={featuresLite} resultados={resultadosExperimento} />}
      {tab === "propostas"    && <PropostaSkillsTab configs={propostaSkillConfigs} />}
      {tab === "contratos"    && <ContratoSkillsTab configs={contratoSkillConfigs} />}
      {tab === "logs"         && <LogsTab         logs={logs} />}
    </div>
  );
}

function TabBtn({ t, cur, icon, label, count }: { t: Tab; cur: Tab; icon: React.ReactNode; label: string; count: number }) {
  return (
    <Link href={`/admin/ai?tab=${t}`}
      className={`px-3 py-2 text-xs font-medium border-b-2 transition flex items-center gap-1.5 tabular-nums ${
        cur === t ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
      }`}>
      {icon} {label}
      <span className={`text-[10px] px-1.5 py-0.5 rounded tabular-nums ${cur === t ? "bg-primary/10 text-primary" : "bg-secondary text-muted-foreground dark:bg-white/[0.05]"}`}>
        {count}
      </span>
    </Link>
  );
}

// =============================================================
// Aba: Features
// =============================================================
function FeaturesTab({ features, providers, uso }: { features: AiFeature[]; providers: AiProvider[]; uso: AiUso30d[] }) {
  const usoMap = new Map(uso.map(u => [u.feature_codigo, u]));

  const porEtapa = features.reduce<Record<string, AiFeature[]>>((acc, f) => {
    const k = f.etapa_fluxo ?? "outros";
    (acc[k] = acc[k] ?? []).push(f);
    return acc;
  }, {});

  const etapaLabels: Record<string, string> = {
    base: "Base e Qualificação", qualificacao: "Base e Qualificação",
    raiox: "Raio-X", cadencia: "Cadência", ligacao: "Ligações",
    score: "Score e Pipeline", proposta: "Proposta", perda: "Perda",
    insights: "Insights e Forecast", outros: "Outros",
  };

  const ordem = ["base", "qualificacao", "raiox", "cadencia", "ligacao", "score", "proposta", "perda", "insights", "outros"];

  return (
    <div className="space-y-6">
      {ordem.filter(e => porEtapa[e]).map(etapa => (
        <div key={etapa}>
          <h2 className="text-[10px] uppercase tracking-[0.12em] font-semibold text-muted-foreground mb-2">{etapaLabels[etapa]}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {porEtapa[etapa].map(f => (
              <FeatureCard key={f.codigo} feature={f} providers={providers} uso={usoMap.get(f.codigo)} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function FeatureCard({ feature, providers, uso }: { feature: AiFeature; providers: AiProvider[]; uso?: AiUso30d }) {
  const [pending, start] = useTransition();
  const [ativo, setAtivo] = useState(feature.ativo);
  const [expanded, setExpanded] = useState(false);
  const [config, setConfig] = useState({
    provider_codigo: feature.provider_codigo,
    modelo: feature.modelo,
    temperature: feature.temperature,
    max_tokens: feature.max_tokens,
    limite_dia_org: feature.limite_dia_org,
    limite_dia_usuario: feature.limite_dia_usuario,
  });

  function handleToggle(v: boolean) {
    setAtivo(v);
    start(async () => { await toggleFeature(feature.codigo, v); });
  }

  function handleSave() {
    start(async () => {
      await atualizarFeatureConfig({
        codigo: feature.codigo,
        provider_codigo: config.provider_codigo as AiProviderCodigo,
        modelo: config.modelo,
        temperature: Number(config.temperature),
        max_tokens: Number(config.max_tokens),
        limite_dia_org: Number(config.limite_dia_org),
        limite_dia_usuario: Number(config.limite_dia_usuario),
      });
      setExpanded(false);
    });
  }

  return (
    <div className={`card p-4 ${ativo ? "" : "bg-secondary/40 dark:bg-white/[0.02]"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-sm truncate">{feature.nome}</h3>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground font-mono dark:bg-white/[0.05]">{feature.codigo}</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{feature.descricao}</p>
          <div className="flex items-center gap-3 mt-2 text-[11px] text-muted-foreground tabular-nums">
            <span className="inline-flex items-center gap-1"><Bot className="w-3 h-3" /> {feature.modelo}</span>
            <span>T {feature.temperature}</span>
            <span>{feature.max_tokens}t</span>
            <span className="text-warning-500">{feature.papel_minimo}+</span>
          </div>
          {uso && (
            <div className="flex items-center gap-3 mt-2 text-[11px] tabular-nums">
              <span className="inline-flex items-center gap-1 text-success-500"><CheckCircle2 className="w-3 h-3" /> {uso.invocacoes_ok}</span>
              {uso.invocacoes_erro > 0 && <span className="inline-flex items-center gap-1 text-destructive"><XCircle className="w-3 h-3" /> {uso.invocacoes_erro}</span>}
              <span className="inline-flex items-center gap-1 text-muted-foreground"><DollarSign className="w-3 h-3" />{Number(uso.custo_usd).toFixed(3)}</span>
              <span className="inline-flex items-center gap-1 text-muted-foreground"><Clock className="w-3 h-3" />{uso.latencia_media_ms}ms</span>
            </div>
          )}
        </div>

        <label className="relative inline-flex items-center cursor-pointer shrink-0">
          <input type="checkbox" checked={ativo} disabled={pending}
            onChange={(e) => handleToggle(e.target.checked)} className="sr-only peer"/>
          <div className="w-10 h-5 bg-secondary dark:bg-white/[0.08] rounded-full peer peer-checked:bg-primary after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-5"/>
        </label>
      </div>

      <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border">
        <button onClick={() => setExpanded(!expanded)}
          className="btn-ghost text-xs">
          {expanded ? "Fechar" : "Configurar"}
        </button>
        <Link href={`/admin/ai?tab=prompts&feature=${feature.codigo}`}
          className="btn-ghost text-xs text-primary">
          Editar prompt <ChevronRight className="w-3 h-3" />
        </Link>
      </div>

      {expanded && (
        <div className="mt-3 pt-3 border-t border-border space-y-2.5">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label">Provider</label>
              <select value={config.provider_codigo}
                onChange={(e) => setConfig({ ...config, provider_codigo: e.target.value as AiProviderCodigo })}
                className="input-base text-xs">
                {providers.map(p => <option key={p.codigo} value={p.codigo}>{p.nome}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Modelo</label>
              <input value={config.modelo} onChange={(e) => setConfig({ ...config, modelo: e.target.value })}
                className="input-base text-xs font-mono"/>
            </div>
            <div>
              <label className="label">Temperature</label>
              <input type="number" min={0} max={2} step={0.1}
                value={config.temperature}
                onChange={(e) => setConfig({ ...config, temperature: parseFloat(e.target.value) })}
                className="input-base text-xs"/>
            </div>
            <div>
              <label className="label">Max tokens</label>
              <input type="number" min={100} max={8000} step={100}
                value={config.max_tokens}
                onChange={(e) => setConfig({ ...config, max_tokens: parseInt(e.target.value) })}
                className="input-base text-xs"/>
            </div>
            <div>
              <label className="label">Limite/dia org</label>
              <input type="number" min={1}
                value={config.limite_dia_org}
                onChange={(e) => setConfig({ ...config, limite_dia_org: parseInt(e.target.value) })}
                className="input-base text-xs"/>
            </div>
            <div>
              <label className="label">Limite/dia usuário</label>
              <input type="number" min={1}
                value={config.limite_dia_usuario}
                onChange={(e) => setConfig({ ...config, limite_dia_usuario: parseInt(e.target.value) })}
                className="input-base text-xs"/>
            </div>
          </div>
          <button onClick={handleSave} disabled={pending}
            className="btn-primary text-xs w-full">
            <Save className="w-3.5 h-3.5" /> {pending ? "Salvando…" : "Salvar configuração"}
          </button>
        </div>
      )}
    </div>
  );
}

// =============================================================
// Aba: Prompts
// =============================================================
function PromptsTab({ features, prompts, featureAberta }: { features: AiFeature[]; prompts: AiPrompt[]; featureAberta: string | null }) {
  const [featureCodigo, setFeatureCodigo] = useState<string>(
    featureAberta ?? features[0]?.codigo ?? ""
  );

  const historico = prompts
    .filter(p => p.feature_codigo === featureCodigo)
    .sort((a, b) => b.versao - a.versao);
  const ativo = historico.find(p => p.ativo);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[250px_1fr] gap-4">
      <aside className="card p-2">
        <div className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground font-semibold px-2 py-1.5">Features</div>
        <div className="max-h-[70vh] overflow-y-auto">
          {features.map(f => (
            <button key={f.codigo} onClick={() => setFeatureCodigo(f.codigo)}
              className={`w-full text-left px-2.5 py-1.5 rounded text-xs transition ${
                featureCodigo === f.codigo ? "bg-primary/10 text-primary font-semibold" : "text-muted-foreground hover:bg-secondary/60 dark:hover:bg-white/[0.04]"
              }`}>
              <div className="truncate">{f.nome}</div>
              <div className="text-[10px] text-muted-foreground/70 font-mono truncate">{f.codigo}</div>
            </button>
          ))}
        </div>
      </aside>

      <section>
        {ativo ? (
          <PromptEditor key={ativo.id} prompt={ativo} historico={historico} />
        ) : (
          <div className="card p-6 text-center text-muted-foreground text-sm">
            Escolha uma feature à esquerda.
          </div>
        )}
      </section>
    </div>
  );
}

function PromptEditor({ prompt, historico }: { prompt: AiPrompt; historico: AiPrompt[] }) {
  const [pending, start] = useTransition();
  const [sys, setSys] = useState(prompt.system_prompt ?? "");
  const [tpl, setTpl] = useState(prompt.user_template);
  const [vars, setVars] = useState((prompt.variaveis_esperadas ?? []).join(", "));
  const [notas, setNotas] = useState("");
  const router = useRouter();

  function handleSave() {
    start(async () => {
      await criarVersaoPrompt({
        feature_codigo: prompt.feature_codigo,
        system_prompt: sys,
        user_template: tpl,
        variaveis_esperadas: vars.split(",").map(s => s.trim()).filter(Boolean),
        notas_editor: notas || undefined,
      });
      setNotas("");
      router.refresh();
    });
  }

  function handleReverter(v: number) {
    start(async () => {
      await reverterParaVersao(prompt.feature_codigo, v);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="card p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold">
            <span className="text-primary">{prompt.feature_codigo}</span>
            <span className="ml-2 text-xs text-muted-foreground tabular-nums">v{prompt.versao} ativa</span>
          </h3>
        </div>

        <label className="label">System prompt</label>
        <textarea value={sys} onChange={(e) => setSys(e.target.value)}
          className="input-base text-xs font-mono min-h-[100px]" rows={5}/>

        <label className="label mt-3">User template <span className="text-muted-foreground/70 font-normal normal-case">(use <code>{"{{variavel}}"}</code>)</span></label>
        <textarea value={tpl} onChange={(e) => setTpl(e.target.value)}
          className="input-base text-xs font-mono min-h-[180px]" rows={10}/>

        <label className="label mt-3">Variáveis esperadas (separadas por vírgula)</label>
        <input value={vars} onChange={(e) => setVars(e.target.value)}
          className="input-base text-xs font-mono"/>

        <label className="label mt-3">Notas desta versão (opcional)</label>
        <input value={notas} onChange={(e) => setNotas(e.target.value)}
          placeholder="Ex: encurtei o prompt após reclamações de verbosidade"
          className="input-base text-xs"/>

        <button onClick={handleSave} disabled={pending}
          className="btn-primary text-sm mt-4">
          <Save className="w-3.5 h-3.5" /> {pending ? "Salvando…" : "Salvar como nova versão"}
        </button>
      </div>

      {historico.length > 1 && (
        <div className="card p-4">
          <h4 className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground font-semibold mb-2">Histórico</h4>
          <div className="space-y-1.5">
            {historico.map(h => (
              <div key={h.id} className="flex items-center justify-between text-xs p-2 rounded hover:bg-secondary/60 dark:hover:bg-white/[0.04]">
                <div>
                  <b className="tabular-nums">v{h.versao}</b>
                  {h.ativo && <span className="ml-1 text-[10px] bg-success/15 text-success-500 px-1.5 py-0.5 rounded">ATIVA</span>}
                  <span className="ml-2 text-muted-foreground tabular-nums">{fmtDate(h.created_at)}</span>
                  {h.notas_editor && <span className="ml-2 text-muted-foreground/70 italic">— {h.notas_editor}</span>}
                </div>
                {!h.ativo && (
                  <button onClick={() => handleReverter(h.versao)} disabled={pending}
                    className="btn-ghost text-xs">
                    <RotateCcw className="w-3 h-3" /> Reverter
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// =============================================================
// Aba: Propostas
// =============================================================
function PropostaSkillsTab({ configs }: { configs: PropostaSkillConfig[] }) {
  const [pending, start] = useTransition();
  const [id, setId] = useState<number | undefined>(configs[0]?.id);
  const selecionada = configs.find((config) => config.id === id);
  const [nome, setNome] = useState(selecionada?.nome ?? "Proposta consultiva");
  const [formato, setFormato] = useState<PropostaSkillConfig["formato"]>(selecionada?.formato ?? "proposta_comercial");
  const [skillChain, setSkillChain] = useState(selecionada?.skill_chain ?? "");
  const [modeloReferencia, setModeloReferencia] = useState(selecionada?.modelo_referencia ?? "");
  const [padrao, setPadrao] = useState(selecionada?.padrao ?? true);
  const [ativo, setAtivo] = useState(selecionada?.ativo ?? true);
  const router = useRouter();

  function carregar(config?: PropostaSkillConfig) {
    setId(config?.id);
    setNome(config?.nome ?? "Proposta consultiva");
    setFormato(config?.formato ?? "proposta_comercial");
    setSkillChain(config?.skill_chain ?? "");
    setModeloReferencia(config?.modelo_referencia ?? "");
    setPadrao(config?.padrao ?? true);
    setAtivo(config?.ativo ?? true);
  }

  function salvar() {
    start(async () => {
      await salvarPropostaSkillConfig({
        id,
        nome,
        formato,
        skill_chain: skillChain,
        modelo_referencia: modeloReferencia,
        padrao,
        ativo,
      });
      router.refresh();
    });
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4">
      <aside className="card p-3">
        <button onClick={() => carregar(undefined)} className="btn-primary text-xs w-full mb-3">
          Nova configuracao
        </button>
        <div className="space-y-2">
          {configs.length === 0 ? (
            <p className="text-sm text-muted-foreground p-2">Nenhuma skill configurada.</p>
          ) : configs.map((config) => (
            <button
              key={config.id}
              onClick={() => carregar(config)}
              className={`w-full text-left rounded-lg border p-3 text-xs transition ${
                id === config.id ? "border-primary/50 bg-primary/5" : "border-border hover:border-primary/30"
              }`}
            >
              <div className="font-semibold text-foreground">{config.nome}</div>
              <div className="text-muted-foreground mt-1">{config.formato}</div>
              <div className="flex gap-1 mt-2">
                {config.padrao && <span className="pill-ok">padrao</span>}
                {!config.ativo && <span className="pill-warn">inativa</span>}
              </div>
            </button>
          ))}
        </div>
      </aside>

      <section className="card p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="block">
            <span className="label">Nome</span>
            <input value={nome} onChange={(e) => setNome(e.target.value)} className="input-base text-sm" />
          </label>
          <label className="block">
            <span className="label">Formato</span>
            <select value={formato} onChange={(e) => setFormato(e.target.value as PropostaSkillConfig["formato"])} className="input-base text-sm">
              <option value="proposta_comercial">Proposta comercial</option>
              <option value="escopo_tecnico">Escopo tecnico / SOW</option>
              <option value="email_executivo">Email executivo</option>
              <option value="whatsapp_resumo">WhatsApp resumo</option>
            </select>
          </label>
        </div>

        <label className="block mt-3">
          <span className="label">Sequencia de skills</span>
          <textarea
            value={skillChain}
            onChange={(e) => setSkillChain(e.target.value)}
            rows={10}
            className="input-base text-xs font-mono"
            placeholder="Cole aqui as skills validadas no Claude, em ordem."
          />
        </label>

        <label className="block mt-3">
          <span className="label">Modelo/referencia</span>
          <textarea
            value={modeloReferencia}
            onChange={(e) => setModeloReferencia(e.target.value)}
            rows={7}
            className="input-base text-xs font-mono"
            placeholder="Cole regras, estrutura aprovada, exemplos ou restricoes comerciais."
          />
        </label>

        <div className="flex flex-wrap items-center gap-4 mt-4">
          <label className="inline-flex items-center gap-2 text-sm">
            <input type="checkbox" checked={padrao} onChange={(e) => setPadrao(e.target.checked)} />
            Padrao deste formato
          </label>
          <label className="inline-flex items-center gap-2 text-sm">
            <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} />
            Ativa
          </label>
          <button onClick={salvar} disabled={pending} className="btn-primary text-sm ml-auto">
            <Save className="w-3.5 h-3.5" /> {pending ? "Salvando..." : "Salvar skills"}
          </button>
        </div>
      </section>
    </div>
  );
}

function ContratoSkillsTab({ configs }: { configs: ContratoSkillConfig[] }) {
  const [pending, start] = useTransition();
  const [id, setId] = useState<number | undefined>(configs[0]?.id);
  const selecionada = configs.find((config) => config.id === id);
  const [nome, setNome] = useState(selecionada?.nome ?? "Contrato padrao");
  const [modo, setModo] = useState<ContratoSkillConfig["modo"]>(selecionada?.modo ?? "contrato_template");
  const [templateDocxNome, setTemplateDocxNome] = useState(selecionada?.template_docx_nome ?? "");
  const [templateDocxRef, setTemplateDocxRef] = useState(selecionada?.template_docx_ref ?? "");
  const [skillChain, setSkillChain] = useState(selecionada?.skill_chain ?? "");
  const [modeloReferencia, setModeloReferencia] = useState(selecionada?.modelo_referencia ?? "");
  const [padrao, setPadrao] = useState(selecionada?.padrao ?? true);
  const [ativo, setAtivo] = useState(selecionada?.ativo ?? true);
  const router = useRouter();

  function carregar(config?: ContratoSkillConfig) {
    setId(config?.id);
    setNome(config?.nome ?? "Contrato padrao");
    setModo(config?.modo ?? "contrato_template");
    setTemplateDocxNome(config?.template_docx_nome ?? "");
    setTemplateDocxRef(config?.template_docx_ref ?? "");
    setSkillChain(config?.skill_chain ?? "");
    setModeloReferencia(config?.modelo_referencia ?? "");
    setPadrao(config?.padrao ?? true);
    setAtivo(config?.ativo ?? true);
  }

  function salvar() {
    start(async () => {
      await salvarContratoSkillConfig({
        id,
        nome,
        modo,
        template_docx_nome: templateDocxNome,
        template_docx_ref: templateDocxRef,
        skill_chain: skillChain,
        modelo_referencia: modeloReferencia,
        padrao,
        ativo,
      });
      router.refresh();
    });
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4">
      <aside className="card p-3">
        <button onClick={() => carregar(undefined)} className="btn-primary text-xs w-full mb-3">
          Nova configuracao
        </button>
        <div className="space-y-2">
          {configs.length === 0 ? (
            <p className="text-sm text-muted-foreground p-2">Nenhuma skill juridica configurada.</p>
          ) : configs.map((config) => (
            <button
              key={config.id}
              onClick={() => carregar(config)}
              className={`w-full text-left rounded-lg border p-3 text-xs transition ${
                id === config.id ? "border-primary/50 bg-primary/5" : "border-border hover:border-primary/30"
              }`}
            >
              <div className="font-semibold text-foreground">{config.nome}</div>
              <div className="text-muted-foreground mt-1">{config.modo}</div>
              <div className="flex gap-1 mt-2">
                {config.padrao && <span className="pill-ok">padrao</span>}
                {!config.ativo && <span className="pill-warn">inativa</span>}
              </div>
            </button>
          ))}
        </div>
      </aside>

      <section className="card p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="block">
            <span className="label">Nome</span>
            <input value={nome} onChange={(e) => setNome(e.target.value)} className="input-base text-sm" />
          </label>
          <label className="block">
            <span className="label">Modo</span>
            <select value={modo} onChange={(e) => setModo(e.target.value as ContratoSkillConfig["modo"])} className="input-base text-sm">
              <option value="contrato_template">Contrato por template</option>
              <option value="briefing_juridico">Briefing juridico</option>
              <option value="revisao_juridica">Revisao juridica</option>
            </select>
          </label>
          <label className="block">
            <span className="label">Template DOCX</span>
            <input value={templateDocxNome} onChange={(e) => setTemplateDocxNome(e.target.value)} className="input-base text-sm" placeholder="Contrato Padrao v4.docx" />
          </label>
          <label className="block">
            <span className="label">Referencia</span>
            <input value={templateDocxRef} onChange={(e) => setTemplateDocxRef(e.target.value)} className="input-base text-sm" placeholder="Drive, SharePoint ou caminho interno" />
          </label>
        </div>

        <label className="block mt-3">
          <span className="label">Sequencia de skills juridicas</span>
          <textarea value={skillChain} onChange={(e) => setSkillChain(e.target.value)} rows={10} className="input-base text-xs font-mono" />
        </label>

        <label className="block mt-3">
          <span className="label">Modelo/referencia juridica</span>
          <textarea value={modeloReferencia} onChange={(e) => setModeloReferencia(e.target.value)} rows={7} className="input-base text-xs font-mono" />
        </label>

        <div className="flex flex-wrap items-center gap-4 mt-4">
          <label className="inline-flex items-center gap-2 text-sm">
            <input type="checkbox" checked={padrao} onChange={(e) => setPadrao(e.target.checked)} />
            Padrao deste modo
          </label>
          <label className="inline-flex items-center gap-2 text-sm">
            <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} />
            Ativa
          </label>
          <button onClick={salvar} disabled={pending} className="btn-primary text-sm ml-auto">
            <Save className="w-3.5 h-3.5" /> {pending ? "Salvando..." : "Salvar skills"}
          </button>
        </div>
      </section>
    </div>
  );
}

// =============================================================
// Aba: Providers
// =============================================================
function ProvidersTab({ providers }: { providers: AiProvider[] }) {
  return (
    <div className="space-y-3">
      <div className="card p-4 space-y-2">
        <div className="flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-primary" />
          <div className="text-xs text-foreground/80 space-y-1.5 flex-1">
            <p>
              <b>Onde colocar a chave:</b> as API keys ficam em <b>variáveis de ambiente do servidor</b> (não
              no banco de dados) — boas práticas de segurança não permitem armazenar chaves em texto puro
              em DB ainda que cifradas pelo app.
            </p>
            <p className="text-muted-foreground">
              <b>Como configurar:</b> Vercel → Project Settings → Environment Variables (ou Supabase →
              Settings → Edge Functions, se rodando edge). O campo <code className="bg-secondary dark:bg-white/[0.05] px-1 rounded">Env var</code> abaixo é só o <i>nome</i> da variável (ex: <code className="bg-secondary dark:bg-white/[0.05] px-1 rounded">ANTHROPIC_API_KEY</code>) — o valor real fica no host de deploy.
            </p>
            <p className="text-muted-foreground">
              Após colar a chave no host, faça redeploy. O badge ao lado de cada provider mostra se a chave
              está acessível agora no servidor.
            </p>
          </div>
        </div>
      </div>

      {providers.map(p => <ProviderRow key={p.id} provider={p} />)}
    </div>
  );
}

// Badge de status da API key (configurada no servidor ou não)
function ApiKeyStatusBadge({ envVarName }: { envVarName: string }) {
  const [status, setStatus] = useState<{ configured: boolean; lastChars: string | null } | null>(null);
  const [loading, setLoading] = useState(false);

  async function check() {
    setLoading(true);
    try {
      const r = await checarApiKeyEnv(envVarName);
      setStatus({ configured: r.configured, lastChars: r.lastChars });
    } catch {
      setStatus({ configured: false, lastChars: null });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (envVarName) check();
    else setStatus(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [envVarName]);

  if (!envVarName) {
    return <span className="text-[10px] text-muted-foreground/60 italic">sem env var definida</span>;
  }
  if (loading || !status) {
    return <span className="text-[10px] text-muted-foreground/60">verificando…</span>;
  }
  if (status.configured) {
    return (
      <span className="text-[10px] inline-flex items-center gap-1 text-success-500 bg-success-500/10 border border-success-500/25 px-1.5 py-0.5 rounded font-semibold uppercase tracking-[0.1em]">
        <CheckCircle2 className="w-2.5 h-2.5" /> ok · ••••{status.lastChars}
      </span>
    );
  }
  return (
    <span className="text-[10px] inline-flex items-center gap-1 text-destructive bg-destructive/10 border border-destructive/25 px-1.5 py-0.5 rounded font-semibold uppercase tracking-[0.1em]">
      <XCircle className="w-2.5 h-2.5" /> não configurada
    </span>
  );
}

function ProviderRow({ provider }: { provider: AiProvider }) {
  const [pending, start] = useTransition();
  const [state, setState] = useState({
    ativo: provider.ativo,
    modelo_default: provider.modelo_default ?? "",
    api_key_ref: provider.api_key_ref ?? "",
    base_url: provider.base_url ?? "",
    custo_input_1k: provider.custo_input_1k,
    custo_output_1k: provider.custo_output_1k,
  });

  function save() {
    start(async () => {
      await atualizarProvider({
        codigo: provider.codigo,
        ativo: state.ativo,
        modelo_default: state.modelo_default,
        api_key_ref: state.api_key_ref,
        base_url: state.base_url || undefined,
        custo_input_1k: Number(state.custo_input_1k),
        custo_output_1k: Number(state.custo_output_1k),
      });
    });
  }

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold">
          {provider.nome} <span className="text-xs text-muted-foreground/70 font-mono ml-2">{provider.codigo}</span>
        </h3>
        <label className="relative inline-flex items-center cursor-pointer">
          <input type="checkbox" checked={state.ativo}
            onChange={(e) => setState({ ...state, ativo: e.target.checked })}
            className="sr-only peer"/>
          <div className="w-10 h-5 bg-secondary dark:bg-white/[0.08] rounded-full peer peer-checked:bg-primary after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-5"/>
        </label>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="col-span-2">
          <label className="label">Modelo default</label>
          <input value={state.modelo_default}
            onChange={(e) => setState({ ...state, modelo_default: e.target.value })}
            className="input-base text-xs font-mono"/>
        </div>
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="label !mb-0">Env var com API key</label>
            <ApiKeyStatusBadge envVarName={state.api_key_ref} />
          </div>
          <input value={state.api_key_ref}
            onChange={(e) => setState({ ...state, api_key_ref: e.target.value })}
            placeholder="ANTHROPIC_API_KEY"
            className="input-base text-xs font-mono"/>
          <p className="text-[10px] text-muted-foreground/70 mt-1">
            Nome da variável de ambiente. O valor da chave fica no host (Vercel/Supabase).
          </p>
        </div>
        <div>
          <label className="label">Base URL (opcional)</label>
          <input value={state.base_url}
            onChange={(e) => setState({ ...state, base_url: e.target.value })}
            placeholder="https://api..."
            className="input-base text-xs font-mono"/>
        </div>
        <div>
          <label className="label">Custo input / 1k tokens ($)</label>
          <input type="number" step={0.0001}
            value={state.custo_input_1k}
            onChange={(e) => setState({ ...state, custo_input_1k: parseFloat(e.target.value) })}
            className="input-base text-xs"/>
        </div>
        <div>
          <label className="label">Custo output / 1k tokens ($)</label>
          <input type="number" step={0.0001}
            value={state.custo_output_1k}
            onChange={(e) => setState({ ...state, custo_output_1k: parseFloat(e.target.value) })}
            className="input-base text-xs"/>
        </div>
      </div>

      <button onClick={save} disabled={pending}
        className="btn-primary text-xs mt-3">
        <Save className="w-3.5 h-3.5" /> {pending ? "Salvando…" : "Salvar"}
      </button>
    </div>
  );
}

// =============================================================
// Aba: Logs
// =============================================================
function LogsTab({ logs }: { logs: LogRow[] }) {
  const [selected, setSelected] = useState<LogRow | null>(null);

  if (logs.length === 0) {
    return (
      <div className="card p-8 text-center text-muted-foreground/70 text-sm">
        Sem invocações registradas ainda.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-4">
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-secondary/60 dark:bg-white/[0.03] text-muted-foreground text-[10px] uppercase tracking-[0.12em]">
              <tr>
                <th className="text-left px-3 py-2 font-semibold">Quando</th>
                <th className="text-left px-3 py-2 font-semibold">Feature</th>
                <th className="text-left px-3 py-2 font-semibold">Provider</th>
                <th className="text-center px-3 py-2 font-semibold">Status</th>
                <th className="text-right px-3 py-2 font-semibold">Tokens</th>
                <th className="text-right px-3 py-2 font-semibold">Custo</th>
                <th className="text-right px-3 py-2 font-semibold">Latência</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {logs.map(l => (
                <tr key={l.id} onClick={() => setSelected(l)}
                  className={`hover:bg-secondary/60 dark:hover:bg-white/[0.04] cursor-pointer ${selected?.id === l.id ? "bg-secondary/60 dark:bg-white/[0.04]" : ""}`}>
                  <td className="px-3 py-2 text-muted-foreground tabular-nums">{fmtDateTime(l.created_at)}</td>
                  <td className="px-3 py-2 font-mono text-[11px]">{l.feature_codigo}</td>
                  <td className="px-3 py-2 text-muted-foreground">{l.provider_codigo}</td>
                  <td className="px-3 py-2 text-center">
                    <StatusPill status={l.status} />
                  </td>
                  <td className="px-3 py-2 text-right text-muted-foreground tabular-nums">
                    {(l.tokens_input ?? 0)}↓ {(l.tokens_output ?? 0)}↑
                  </td>
                  <td className="px-3 py-2 text-right text-foreground/80 tabular-nums">
                    ${Number(l.custo_estimado ?? 0).toFixed(4)}
                  </td>
                  <td className="px-3 py-2 text-right text-muted-foreground tabular-nums">{l.latencia_ms ?? 0}ms</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <aside>
        {selected ? (
          <div className="card p-4 space-y-3 sticky top-4">
            <h3 className="font-semibold text-sm tabular-nums">Invocação #{selected.id}</h3>
            <div className="text-xs space-y-1">
              <div><b>Feature:</b> <span className="font-mono">{selected.feature_codigo}</span></div>
              <div><b>Modelo:</b> {selected.modelo}</div>
              <div><b>Status:</b> <StatusPill status={selected.status} /></div>
              {selected.erro_msg && (
                <div className="p-2 rounded bg-destructive/10 text-destructive text-xs border border-destructive/25">
                  <b>Erro:</b> {selected.erro_msg}
                </div>
              )}
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground font-semibold">Input vars</div>
              <pre className="mt-1 text-[10px] bg-secondary/60 dark:bg-white/[0.03] p-2 rounded overflow-x-auto max-h-40 font-mono">
                {JSON.stringify(selected.input_vars, null, 2)}
              </pre>
            </div>
            {selected.output_texto && (
              <div>
                <div className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground font-semibold">Output</div>
                <pre className="mt-1 text-[10px] bg-secondary/60 dark:bg-white/[0.03] p-2 rounded overflow-x-auto max-h-60 whitespace-pre-wrap">
                  {selected.output_texto.slice(0, 2000)}
                  {selected.output_texto.length > 2000 && "\n…"}
                </pre>
              </div>
            )}
          </div>
        ) : (
          <div className="card p-6 text-center text-muted-foreground/70 text-sm">
            Clique numa linha pra ver detalhes.
          </div>
        )}
      </aside>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const m: Record<string, { cor: string; label: string }> = {
    sucesso: { cor: "bg-success/15 text-success-500 border-success/30", label: "✓ OK" },
    erro: { cor: "bg-destructive/10 text-destructive border-destructive/25", label: "✗ erro" },
    bloqueado_budget: { cor: "bg-warning-500/10 text-warning-500 border-warning-500/25", label: "budget" },
    timeout: { cor: "bg-secondary text-muted-foreground border-border dark:bg-white/[0.05]", label: "timeout" },
  };
  const c = m[status] ?? m.erro;
  return <span className={`inline-block text-[10px] px-1.5 py-0.5 rounded border ${c.cor}`}>{c.label}</span>;
}

function fmtDate(s: string): string {
  return new Date(s).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "2-digit" });
}

function fmtDateTime(s: string): string {
  return new Date(s).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}
