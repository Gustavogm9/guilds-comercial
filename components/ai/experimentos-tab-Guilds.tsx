"use client";

import { useState, useTransition, useMemo } from "react";
import { FlaskConical, Plus, Pause, Play, X, Trophy, ArrowRight } from "lucide-react";
import {
  criarExperimento, encerrarExperimento, pausarExperimento, promoverVencedor,
} from "@/app/(app)/admin/ai/experimentos-actions";
import type { AiPrompt, AiFeatureCodigo } from "@/lib/types";

interface Experimento {
  id: number;
  feature_codigo: string;
  variant_a_prompt_id: number;
  variant_b_prompt_id: number;
  traffic_split: number;
  status: "rodando" | "pausado" | "encerrado";
  metrica_vitoria: string;
  amostra_minima: number;
  winner_variant: string | null;
  observacoes: string | null;
  started_at: string;
  ended_at: string | null;
}

interface ResultadoVariant {
  experiment_id: number;
  variant: string;
  total: number;
  sucessos: number;
  taxa_sucesso_pct: number;
}

export default function ExperimentosTab({ experimentos, prompts, features, resultados }: {
  experimentos: Experimento[];
  prompts: AiPrompt[];
  features: { codigo: AiFeatureCodigo; nome: string }[];
  resultados: ResultadoVariant[];
}) {
  const [criandoExp, setCriandoExp] = useState(false);

  const ativos = experimentos.filter((e) => e.status !== "encerrado");
  const encerrados = experimentos.filter((e) => e.status === "encerrado");

  const resultadosMap = useMemo(() => {
    const m = new Map<string, ResultadoVariant>();
    for (const r of resultados) m.set(`${r.experiment_id}-${r.variant}`, r);
    return m;
  }, [resultados]);

  return (
    <div className="space-y-6">
      {!criandoExp ? (
        <button
          onClick={() => setCriandoExp(true)}
          className="btn-primary text-sm"
        >
          <Plus className="w-4 h-4" /> Criar experimento A/B
        </button>
      ) : (
        <CriarExperimentoForm
          features={features}
          prompts={prompts}
          onCancel={() => setCriandoExp(false)}
          onCreated={() => setCriandoExp(false)}
        />
      )}

      {/* Ativos */}
      {ativos.length > 0 && (
        <div>
          <h3 className="text-xs uppercase tracking-wider font-semibold text-muted-foreground mb-2">
            Em andamento · {ativos.length}
          </h3>
          <ul className="space-y-3">
            {ativos.map((exp) => (
              <ExperimentoCard
                key={exp.id}
                exp={exp}
                features={features}
                prompts={prompts}
                resultadoA={resultadosMap.get(`${exp.id}-a`)}
                resultadoB={resultadosMap.get(`${exp.id}-b`)}
              />
            ))}
          </ul>
        </div>
      )}

      {/* Encerrados */}
      {encerrados.length > 0 && (
        <div>
          <h3 className="text-xs uppercase tracking-wider font-semibold text-muted-foreground mb-2">
            Encerrados · {encerrados.length}
          </h3>
          <ul className="space-y-2">
            {encerrados.map((exp) => {
              const featureNome = features.find((f) => f.codigo === exp.feature_codigo)?.nome ?? exp.feature_codigo;
              return (
                <li key={exp.id} className="card p-3 flex items-center gap-3 flex-wrap">
                  <FlaskConical className="w-4 h-4 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-foreground">{featureNome}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {new Date(exp.started_at).toLocaleDateString("pt-BR")} →{" "}
                      {exp.ended_at ? new Date(exp.ended_at).toLocaleDateString("pt-BR") : "—"}
                    </div>
                  </div>
                  {exp.winner_variant && (
                    <span className="text-xs px-2 py-0.5 rounded bg-success-500/10 text-success-500 border border-success-500/30 flex items-center gap-1">
                      <Trophy className="w-3 h-3" /> Vencedor: variant {exp.winner_variant.toUpperCase()}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {experimentos.length === 0 && !criandoExp && (
        <div className="card p-12 text-center">
          <FlaskConical className="w-10 h-10 mx-auto text-muted-foreground/40 mb-3" />
          <h3 className="text-sm font-semibold text-foreground mb-1">Nenhum experimento ainda</h3>
          <p className="text-xs text-muted-foreground max-w-md mx-auto">
            A/B teste 2 versões de prompt ao vivo: o sistema sorteia qual usar a cada chamada,
            mede taxa de aceite, e você promove o vencedor. Diferencial defensável vs concorrência.
          </p>
        </div>
      )}
    </div>
  );
}

function ExperimentoCard({ exp, features, prompts, resultadoA, resultadoB }: {
  exp: Experimento;
  features: { codigo: AiFeatureCodigo; nome: string }[];
  prompts: AiPrompt[];
  resultadoA?: ResultadoVariant;
  resultadoB?: ResultadoVariant;
}) {
  const [pending, start] = useTransition();
  const featureNome = features.find((f) => f.codigo === exp.feature_codigo)?.nome ?? exp.feature_codigo;
  const promptA = prompts.find((p) => p.id === exp.variant_a_prompt_id);
  const promptB = prompts.find((p) => p.id === exp.variant_b_prompt_id);

  const totalA = resultadoA?.total ?? 0;
  const totalB = resultadoB?.total ?? 0;
  const taxaA = resultadoA?.taxa_sucesso_pct ?? 0;
  const taxaB = resultadoB?.taxa_sucesso_pct ?? 0;
  const total = totalA + totalB;
  const amostraSuficiente = total >= exp.amostra_minima;

  // Líder atual (sem signif. estatística rigorosa, é heurístico)
  const lider: "a" | "b" | "empate" | null =
    !amostraSuficiente ? null :
    Math.abs(taxaA - taxaB) < 5 ? "empate" :
    taxaA > taxaB ? "a" : "b";

  return (
    <li className="card p-4">
      <div className="flex items-start gap-3 flex-wrap mb-3">
        <FlaskConical className="w-4 h-4 text-primary mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-foreground">{featureNome}</div>
          <div className="text-[11px] text-muted-foreground">
            {exp.traffic_split}/{100 - exp.traffic_split} · métrica: {exp.metrica_vitoria} · amostra mínima: {exp.amostra_minima}
          </div>
        </div>
        <span className={`text-[10px] px-1.5 py-0.5 rounded border ${
          exp.status === "rodando"
            ? "bg-success-500/10 text-success-500 border-success-500/30"
            : "bg-warning-500/10 text-warning-500 border-warning-500/30"
        }`}>
          {exp.status}
        </span>
      </div>

      {/* Variants comparison */}
      <div className="grid md:grid-cols-2 gap-3 mb-3">
        <VariantCard
          letra="A"
          versao={promptA?.versao ?? null}
          total={totalA}
          taxa={taxaA}
          isLider={lider === "a"}
        />
        <VariantCard
          letra="B"
          versao={promptB?.versao ?? null}
          total={totalB}
          taxa={taxaB}
          isLider={lider === "b"}
        />
      </div>

      <div className="text-[11px] text-muted-foreground mb-3">
        {amostraSuficiente
          ? lider === "empate"
            ? "Empate técnico (diferença < 5pp). Continue rodando ou encerre como empate."
            : `Variant ${lider?.toUpperCase()} liderando com diferença de ${Math.abs(taxaA - taxaB).toFixed(1)}pp`
          : `Coletando amostra: ${total}/${exp.amostra_minima}. Aguarde ${exp.amostra_minima - total} eventos a mais antes de decidir.`}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {exp.status === "rodando" && (
          <>
            <button
              disabled={pending}
              onClick={() => start(async () => { await pausarExperimento(exp.id, true); })}
              className="btn-secondary text-xs"
            >
              <Pause className="w-3 h-3" /> Pausar
            </button>
            {amostraSuficiente && lider && lider !== "empate" && (
              <button
                disabled={pending}
                onClick={() => start(async () => {
                  if (!confirm(`Promover variant ${lider.toUpperCase()} como prompt ativo? Variant perdedora será desativada.`)) return;
                  const promptVencedor = lider === "a" ? exp.variant_a_prompt_id : exp.variant_b_prompt_id;
                  await promoverVencedor({
                    experimentId: exp.id,
                    feature_codigo: exp.feature_codigo,
                    prompt_id: promptVencedor,
                  });
                })}
                className="btn-primary text-xs"
              >
                <Trophy className="w-3 h-3" /> Promover variant {lider.toUpperCase()}
              </button>
            )}
          </>
        )}
        {exp.status === "pausado" && (
          <button
            disabled={pending}
            onClick={() => start(async () => { await pausarExperimento(exp.id, false); })}
            className="btn-secondary text-xs"
          >
            <Play className="w-3 h-3" /> Retomar
          </button>
        )}
        <button
          disabled={pending}
          onClick={() => start(async () => {
            if (!confirm("Encerrar experimento? Os prompts atuais permanecem como estão.")) return;
            await encerrarExperimento(exp.id, lider === "empate" ? "empate" : (lider as "a" | "b" | undefined));
          })}
          className="btn-ghost text-xs text-muted-foreground hover:text-urgent-500"
        >
          <X className="w-3 h-3" /> Encerrar
        </button>
      </div>
    </li>
  );
}

function VariantCard({ letra, versao, total, taxa, isLider }: {
  letra: "A" | "B"; versao: number | null; total: number; taxa: number; isLider: boolean;
}) {
  return (
    <div className={`p-3 rounded-lg border ${isLider ? "border-success-500/40 bg-success-500/5" : "border-border bg-muted/20"}`}>
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-xs font-bold text-foreground">
          Variant {letra} {versao && <span className="font-normal text-muted-foreground">v{versao}</span>}
        </span>
        {isLider && <Trophy className="w-3 h-3 text-success-500" />}
      </div>
      <div className="text-2xl font-semibold text-foreground">
        {taxa.toFixed(1)}<span className="text-sm font-normal text-muted-foreground">%</span>
      </div>
      <div className="text-[11px] text-muted-foreground">{total} chamadas</div>
    </div>
  );
}

function CriarExperimentoForm({ features, prompts, onCancel, onCreated }: {
  features: { codigo: AiFeatureCodigo; nome: string }[];
  prompts: AiPrompt[];
  onCancel: () => void;
  onCreated: () => void;
}) {
  const [feature, setFeature] = useState<string>("");
  const [variantA, setVariantA] = useState<number | null>(null);
  const [variantB, setVariantB] = useState<number | null>(null);
  const [trafficSplit, setTrafficSplit] = useState(50);
  const [metrica, setMetrica] = useState<"taxa_aceite" | "taxa_resposta_lead" | "taxa_conversao">("taxa_aceite");
  const [amostra, setAmostra] = useState(30);
  const [pending, start] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  const promptsDisponiveis = prompts.filter((p) => p.feature_codigo === feature);

  function submit() {
    setErro(null);
    if (!feature || !variantA || !variantB) {
      setErro("Selecione feature e dois prompts.");
      return;
    }
    if (variantA === variantB) {
      setErro("Variants A e B devem ser prompts diferentes.");
      return;
    }
    start(async () => {
      const res = await criarExperimento({
        feature_codigo: feature,
        variant_a_prompt_id: variantA!,
        variant_b_prompt_id: variantB!,
        traffic_split: trafficSplit,
        metrica_vitoria: metrica,
        amostra_minima: amostra,
      });
      if (res.error) setErro(res.error);
      else onCreated();
    });
  }

  return (
    <div className="card p-5 space-y-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <FlaskConical className="w-4 h-4 text-primary" />
        Novo experimento A/B
      </div>

      <div>
        <label className="block text-xs uppercase tracking-wider font-semibold text-muted-foreground mb-1">Feature</label>
        <select value={feature} onChange={(e) => { setFeature(e.target.value); setVariantA(null); setVariantB(null); }} className="input-base text-sm w-full">
          <option value="">— escolher feature —</option>
          {features.map((f) => <option key={f.codigo} value={f.codigo}>{f.nome}</option>)}
        </select>
      </div>

      {feature && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs uppercase tracking-wider font-semibold text-muted-foreground mb-1">Variant A (controle)</label>
              <select value={variantA ?? ""} onChange={(e) => setVariantA(Number(e.target.value) || null)} className="input-base text-sm w-full">
                <option value="">— escolher prompt —</option>
                {promptsDisponiveis.map((p) => (
                  <option key={p.id} value={p.id}>v{p.versao} · {p.ativo ? "ativo" : "inativo"} · {new Date(p.created_at).toLocaleDateString("pt-BR")}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs uppercase tracking-wider font-semibold text-muted-foreground mb-1">Variant B (desafiante)</label>
              <select value={variantB ?? ""} onChange={(e) => setVariantB(Number(e.target.value) || null)} className="input-base text-sm w-full">
                <option value="">— escolher prompt —</option>
                {promptsDisponiveis.map((p) => (
                  <option key={p.id} value={p.id}>v{p.versao} · {p.ativo ? "ativo" : "inativo"} · {new Date(p.created_at).toLocaleDateString("pt-BR")}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs uppercase tracking-wider font-semibold text-muted-foreground mb-1">
                Tráfego A: {trafficSplit}% · B: {100 - trafficSplit}%
              </label>
              <input
                type="range"
                min={10}
                max={90}
                step={5}
                value={trafficSplit}
                onChange={(e) => setTrafficSplit(Number(e.target.value))}
                className="w-full"
              />
            </div>
            <div>
              <label className="block text-xs uppercase tracking-wider font-semibold text-muted-foreground mb-1">Métrica de vitória</label>
              <select value={metrica} onChange={(e) => setMetrica(e.target.value as any)} className="input-base text-sm w-full">
                <option value="taxa_aceite">Taxa de aceite (vendedor copiou/usou)</option>
                <option value="taxa_resposta_lead">Taxa de resposta do lead (futuro)</option>
                <option value="taxa_conversao">Taxa de conversão (avançou etapa)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs uppercase tracking-wider font-semibold text-muted-foreground mb-1">Amostra mínima</label>
              <input
                type="number"
                min={10}
                max={500}
                value={amostra}
                onChange={(e) => setAmostra(Number(e.target.value) || 30)}
                className="input-base text-sm w-full"
              />
            </div>
          </div>
        </>
      )}

      {erro && (
        <div className="text-xs text-urgent-500 bg-urgent-500/10 border border-urgent-500/30 rounded p-2">
          {erro}
        </div>
      )}

      <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/50">
        <button onClick={onCancel} className="btn-ghost text-sm">Cancelar</button>
        <button onClick={submit} disabled={pending || !feature || !variantA || !variantB} className="btn-primary text-sm">
          {pending ? "Criando..." : "Iniciar experimento"}
        </button>
      </div>
    </div>
  );
}
