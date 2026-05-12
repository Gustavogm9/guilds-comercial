"use client";

import { useEffect, useState } from "react";
import { Upload, FileAudio, Loader2, Check, AlertCircle, ChevronDown, ChevronUp, Sparkles, ListChecks, AlertTriangle, ArrowRight } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

interface Transcricao {
  id: number;
  ligacao_id: number;
  status: "pendente" | "transcrevendo" | "analisando" | "concluido" | "erro";
  duracao_seg: number | null;
  transcricao: string | null;
  resumo: string | null;
  pontos_chave: string[] | null;
  objecoes: string[] | null;
  proximas_acoes: string[] | null;
  sentimento: "positivo" | "neutro" | "negativo" | null;
  nivel_interesse: "quente" | "morno" | "frio" | null;
  custo_usd: number | null;
  erro_mensagem: string | null;
  created_at: string;
}

/**
 * Painel de análise de chamadas no detalhe do lead.
 * Lista ligações recentes com botão de upload + transcrição já processadas.
 */
export default function LigacaoTranscricaoPanel({ leadId }: { leadId: number }) {
  const [ligacoes, setLigacoes] = useState<Array<{
    id: number;
    data_hora: string;
    resultado: string;
    observacoes: string | null;
    transcricao: Transcricao | null;
  }>>([]);
  const [carregando, setCarregando] = useState(true);
  const [uploading, setUploading] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const [expandido, setExpandido] = useState<number | null>(null);

  async function carregar() {
    setCarregando(true);
    try {
      const sb = createClient();
      const { data: ligs } = await sb
        .from("ligacoes")
        .select("id, data_hora, resultado, observacoes")
        .eq("lead_id", leadId)
        .order("data_hora", { ascending: false })
        .limit(10);

      const ligacaoIds = (ligs ?? []).map((l: any) => l.id);
      const { data: trans } = ligacaoIds.length > 0
        ? await sb
            .from("ligacao_transcricao")
            .select("*")
            .in("ligacao_id", ligacaoIds)
        : { data: [] };

      const transByLig = new Map<number, Transcricao>();
      for (const t of (trans ?? []) as any[]) {
        transByLig.set(t.ligacao_id, t);
      }

      setLigacoes(
        (ligs ?? []).map((l: any) => ({
          id: l.id,
          data_hora: l.data_hora,
          resultado: l.resultado,
          observacoes: l.observacoes,
          transcricao: transByLig.get(l.id) ?? null,
        }))
      );
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => { carregar(); }, [leadId]);

  async function uploadAudio(ligacaoId: number, file: File) {
    setUploading(ligacaoId);
    setFeedback(null);
    try {
      const form = new FormData();
      form.append("audio", file);
      form.append("ligacao_id", String(ligacaoId));
      const res = await fetch("/api/ligacoes/transcrever", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.erro ?? "Falha");
      setFeedback({ tipo: "ok", texto: "Áudio enviado. IA processa em até 2 min." });
      setTimeout(() => carregar(), 3000);
    } catch (e) {
      setFeedback({ tipo: "erro", texto: e instanceof Error ? e.message : "Erro." });
    } finally {
      setUploading(null);
      setTimeout(() => setFeedback(null), 4000);
    }
  }

  if (carregando) {
    return (
      <div className="card p-6 text-center text-muted-foreground">
        <Loader2 className="w-5 h-5 mx-auto animate-spin" />
      </div>
    );
  }

  if (ligacoes.length === 0) {
    return (
      <div className="card p-6 text-center">
        <FileAudio className="w-8 h-8 mx-auto text-muted-foreground/40 mb-2" />
        <p className="text-xs text-muted-foreground">Nenhuma ligação registrada ainda.</p>
        <p className="text-[11px] text-muted-foreground/70 mt-0.5">
          Quando registrar ligações, você pode subir o áudio aqui pra IA transcrever + analisar.
        </p>
      </div>
    );
  }

  return (
    <div className="card p-4">
      <h3 className="text-xs uppercase tracking-[0.12em] font-semibold text-muted-foreground mb-3 flex items-center gap-1.5">
        <FileAudio className="w-3 h-3" /> Análise de chamadas
      </h3>

      {feedback && (
        <div role="alert" className={`p-2 rounded mb-3 text-xs flex items-center gap-1.5 ${
          feedback.tipo === "ok" ? "bg-success-500/10 border border-success-500/30 text-success-500" :
          "bg-destructive/10 border border-destructive/30 text-destructive"
        }`}>
          {feedback.tipo === "ok" ? <Check className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
          {feedback.texto}
        </div>
      )}

      <ul className="space-y-2">
        {ligacoes.map((l) => {
          const t = l.transcricao;
          const isExpanded = expandido === l.id;
          return (
            <li key={l.id} className="border border-border rounded-lg p-3 bg-background">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">{l.resultado}</div>
                  <div className="text-[11px] text-muted-foreground tabular-nums mt-0.5">
                    {new Date(l.data_hora).toLocaleString("pt-BR")}
                    {t?.duracao_seg && ` · ${Math.round(t.duracao_seg / 60)}min`}
                  </div>
                  {l.observacoes && !t && (
                    <p className="text-xs text-muted-foreground mt-1 italic">{l.observacoes}</p>
                  )}
                </div>

                {!t && (
                  <label className="btn-ghost text-xs text-primary cursor-pointer">
                    {uploading === l.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
                    Subir áudio
                    <input
                      type="file"
                      accept="audio/*"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) uploadAudio(l.id, f);
                      }}
                      disabled={uploading !== null}
                    />
                  </label>
                )}
                {t && t.status !== "concluido" && t.status !== "erro" && (
                  <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
                    <Loader2 className="w-3 h-3 animate-spin" /> {t.status}
                  </span>
                )}
                {t?.status === "erro" && (
                  <span className="text-[11px] text-destructive">Erro: {t.erro_mensagem?.slice(0, 50)}</span>
                )}
              </div>

              {t?.status === "concluido" && (
                <>
                  <div className="mt-2 flex items-center gap-2 flex-wrap text-[11px]">
                    {t.sentimento && (
                      <span className={`uppercase tracking-[0.1em] font-semibold px-1.5 py-0.5 rounded border ${
                        t.sentimento === "positivo" ? "text-success-500 bg-success-500/10 border-success-500/30" :
                        t.sentimento === "negativo" ? "text-destructive bg-destructive/10 border-destructive/30" :
                        "text-muted-foreground bg-muted border-border"
                      }`}>
                        {t.sentimento}
                      </span>
                    )}
                    {t.nivel_interesse && (
                      <span className={`uppercase tracking-[0.1em] font-semibold px-1.5 py-0.5 rounded border ${
                        t.nivel_interesse === "quente" ? "text-success-500 bg-success-500/10 border-success-500/30" :
                        t.nivel_interesse === "morno" ? "text-warning-500 bg-warning-500/10 border-warning-500/30" :
                        "text-muted-foreground bg-muted border-border"
                      }`}>
                        {t.nivel_interesse}
                      </span>
                    )}
                  </div>

                  {t.resumo && (
                    <div className="mt-2 p-2 rounded bg-secondary/40 text-xs flex items-start gap-1.5">
                      <Sparkles className="w-3 h-3 text-primary mt-0.5 shrink-0" />
                      <span>{t.resumo}</span>
                    </div>
                  )}

                  <button
                    onClick={() => setExpandido(isExpanded ? null : l.id)}
                    className="mt-2 text-xs text-primary hover:underline inline-flex items-center gap-1"
                  >
                    {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    {isExpanded ? "Esconder detalhes" : "Ver detalhes"}
                  </button>

                  {isExpanded && (
                    <div className="mt-2 space-y-2 text-xs">
                      {t.pontos_chave && t.pontos_chave.length > 0 && (
                        <div>
                          <div className="text-[10px] uppercase tracking-[0.1em] font-semibold text-muted-foreground mb-1 flex items-center gap-1">
                            <ListChecks className="w-3 h-3" /> Pontos-chave
                          </div>
                          <ul className="space-y-0.5">
                            {t.pontos_chave.map((p, i) => (
                              <li key={i} className="text-foreground/90 pl-3 relative before:content-['•'] before:absolute before:left-0">{p}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {t.objecoes && t.objecoes.length > 0 && (
                        <div>
                          <div className="text-[10px] uppercase tracking-[0.1em] font-semibold text-warning-500 mb-1 flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" /> Objeções
                          </div>
                          <ul className="space-y-0.5">
                            {t.objecoes.map((o, i) => (
                              <li key={i} className="text-foreground/90 pl-3 relative before:content-['⚠'] before:absolute before:left-0 before:text-warning-500">{o}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {t.proximas_acoes && t.proximas_acoes.length > 0 && (
                        <div>
                          <div className="text-[10px] uppercase tracking-[0.1em] font-semibold text-primary mb-1 flex items-center gap-1">
                            <ArrowRight className="w-3 h-3" /> Próximas ações
                          </div>
                          <ul className="space-y-0.5">
                            {t.proximas_acoes.map((a, i) => (
                              <li key={i} className="text-foreground/90 pl-3 relative before:content-['→'] before:absolute before:left-0 before:text-primary">{a}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {t.transcricao && (
                        <details>
                          <summary className="cursor-pointer text-[11px] text-muted-foreground hover:text-foreground">Transcrição completa</summary>
                          <p className="mt-1 p-2 rounded bg-secondary/30 text-xs whitespace-pre-wrap">{t.transcricao}</p>
                        </details>
                      )}
                    </div>
                  )}
                </>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
