"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Plus, X, ExternalLink, FileText, Eye, MailCheck, Loader2, Check, AlertCircle, Edit2, Save,
} from "lucide-react";
import { criarOuAtualizarLp, arquivarLp } from "./actions";

interface Lp {
  id: number;
  slug: string;
  titulo: string;
  subtitulo: string | null;
  campos: string[];
  cta_texto: string;
  agradecimento_titulo: string;
  agradecimento_texto: string;
  logo_url: string | null;
  cor_primaria: string | null;
  fluxo_cadencia_id: number | null;
  segmento_default: string | null;
  responsavel_id: string | null;
  ativa: boolean;
  views: number;
  submissions: number;
  created_at: string;
}

const CAMPOS_DISPONIVEIS = ["nome", "email", "whatsapp", "empresa", "cargo", "mensagem"];

export default function LpsClient({ lps, fluxos, membros }: {
  lps: Lp[];
  fluxos: { id: number; nome: string }[];
  membros: { profile_id: string; display_name: string }[];
}) {
  const router = useRouter();
  const [editando, setEditando] = useState<Lp | "nova" | null>(null);
  const [feedback, setFeedback] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);

  return (
    <>
      <div className="flex justify-end mb-4">
        <button onClick={() => setEditando("nova")} className="btn-primary text-sm">
          <Plus className="w-3.5 h-3.5" /> Nova LP
        </button>
      </div>

      {feedback && (
        <div role="alert" className={`card p-3 mb-4 text-sm flex items-center gap-2 ${
          feedback.tipo === "ok" ? "border-success-500/30 bg-success-500/5 text-success-500" :
          "border-destructive/30 bg-destructive/5 text-destructive"
        }`}>
          {feedback.tipo === "ok" ? <Check className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {feedback.texto}
        </div>
      )}

      {lps.length === 0 ? (
        <div className="card p-12 text-center">
          <FileText className="w-10 h-10 mx-auto text-muted-foreground/40 mb-3" />
          <p className="text-sm text-muted-foreground">Nenhuma LP criada ainda.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {lps.map((lp) => {
            const conversao = lp.views > 0 ? Math.round((lp.submissions / lp.views) * 100) : 0;
            const fluxoNome = lp.fluxo_cadencia_id ? fluxos.find((f) => f.id === lp.fluxo_cadencia_id)?.nome : null;
            return (
              <li key={lp.id} className={`card p-4 ${!lp.ativa ? "opacity-60" : ""}`}>
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm">{lp.titulo}</span>
                      {!lp.ativa && (
                        <span className="text-[10px] uppercase tracking-[0.12em] font-semibold bg-muted text-muted-foreground px-1.5 py-0.5 rounded border border-border">arquivada</span>
                      )}
                    </div>
                    <a
                      href={`/lp/${lp.slug}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-primary hover:underline font-mono inline-flex items-center gap-1 mt-0.5"
                    >
                      /lp/{lp.slug} <ExternalLink className="w-3 h-3" />
                    </a>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground mt-2 flex-wrap">
                      <span className="inline-flex items-center gap-1 tabular-nums"><Eye className="w-3 h-3" /> {lp.views.toLocaleString("pt-BR")} views</span>
                      <span className="inline-flex items-center gap-1 tabular-nums"><MailCheck className="w-3 h-3" /> {lp.submissions.toLocaleString("pt-BR")} submissões</span>
                      <span className="tabular-nums">{conversao}% conversão</span>
                      {fluxoNome && <span>· Cadência: {fluxoNome}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => setEditando(lp)} className="btn-ghost text-xs">
                      <Edit2 className="w-3 h-3" /> Editar
                    </button>
                    {lp.ativa && (
                      <button
                        onClick={async () => {
                          if (!confirm("Arquivar LP? URL pública fica indisponível.")) return;
                          try {
                            await arquivarLp(lp.id);
                            router.refresh();
                          } catch (e) {
                            setFeedback({ tipo: "erro", texto: e instanceof Error ? e.message : "Erro." });
                          }
                        }}
                        className="btn-ghost text-xs text-muted-foreground hover:text-destructive"
                      >
                        Arquivar
                      </button>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {editando && (
        <LpEditorModal
          lp={editando === "nova" ? null : editando}
          fluxos={fluxos}
          membros={membros}
          onClose={() => setEditando(null)}
          onSucesso={(texto: string) => {
            setFeedback({ tipo: "ok", texto });
            setEditando(null);
            router.refresh();
            setTimeout(() => setFeedback(null), 3000);
          }}
          onErro={(texto: string) => setFeedback({ tipo: "erro", texto })}
        />
      )}
    </>
  );
}

function LpEditorModal({ lp, fluxos, membros, onClose, onSucesso, onErro }: any) {
  const [slug, setSlug] = useState(lp?.slug ?? "");
  const [titulo, setTitulo] = useState(lp?.titulo ?? "");
  const [subtitulo, setSubtitulo] = useState(lp?.subtitulo ?? "");
  const [campos, setCampos] = useState<string[]>(lp?.campos ?? ["nome", "email", "whatsapp"]);
  const [cta, setCta] = useState(lp?.cta_texto ?? "Enviar");
  const [agrTitulo, setAgrTitulo] = useState(lp?.agradecimento_titulo ?? "Recebido!");
  const [agrTexto, setAgrTexto] = useState(lp?.agradecimento_texto ?? "Em breve entraremos em contato.");
  const [logoUrl, setLogoUrl] = useState(lp?.logo_url ?? "");
  const [corPrimaria, setCorPrimaria] = useState(lp?.cor_primaria ?? "");
  const [fluxoCadenciaId, setFluxoCadenciaId] = useState<string>(lp?.fluxo_cadencia_id?.toString() ?? "");
  const [segmento, setSegmento] = useState(lp?.segmento_default ?? "");
  const [responsavelId, setResponsavelId] = useState<string>(lp?.responsavel_id ?? "");
  const [pending, startTransition] = useTransition();

  function toggleCampo(c: string) {
    setCampos((prev) => prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]);
  }

  function salvar() {
    if (!slug.trim() || !titulo.trim()) { onErro("Slug e título obrigatórios."); return; }
    if (campos.length === 0) { onErro("Selecione ao menos 1 campo."); return; }
    startTransition(async () => {
      try {
        await criarOuAtualizarLp({
          id: lp?.id,
          slug, titulo, subtitulo,
          campos,
          cta_texto: cta,
          agradecimento_titulo: agrTitulo,
          agradecimento_texto: agrTexto,
          logo_url: logoUrl,
          cor_primaria: corPrimaria,
          fluxo_cadencia_id: fluxoCadenciaId ? Number(fluxoCadenciaId) : null,
          segmento_default: segmento,
          responsavel_id: responsavelId || undefined,
        });
        onSucesso(lp ? "LP atualizada." : "LP criada.");
      } catch (e) {
        onErro(e instanceof Error ? e.message : "Erro.");
      }
    });
  }

  return (
    <div className="fixed inset-0 z-[9999] bg-black/40 flex items-center justify-center p-4" onClick={onClose} role="dialog" aria-modal="true">
      <div className="bg-card text-foreground border border-border rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-3 border-b border-border flex items-center justify-between">
          <div className="font-semibold text-sm">{lp ? "Editar LP" : "Nova landing page"}</div>
          <button onClick={onClose} className="btn-ghost"><X className="w-4 h-4" /></button>
        </div>
        <div className="overflow-y-auto p-5 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium mb-1">Slug (URL)</label>
              <input
                value={slug}
                onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                placeholder="webinar-marco"
                className="input-base text-sm font-mono"
                maxLength={80}
              />
              <p className="text-[11px] text-muted-foreground mt-0.5">/lp/{slug || "..."}</p>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Título principal</label>
              <input
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                placeholder="Webinar: Como dobrar receita em 90 dias"
                className="input-base text-sm"
                maxLength={120}
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Subtítulo (opcional)</label>
            <textarea
              value={subtitulo}
              onChange={(e) => setSubtitulo(e.target.value)}
              placeholder="Convidamos especialistas pra compartilhar metodologia..."
              className="input-base text-sm min-h-[60px]"
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Campos do formulário</label>
            <div className="flex flex-wrap gap-1.5">
              {CAMPOS_DISPONIVEIS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => toggleCampo(c)}
                  className={`px-2.5 py-1 rounded border text-xs ${
                    campos.includes(c) ? "border-primary bg-primary/10 text-primary font-medium" : "border-border hover:bg-secondary/40"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">Email ou WhatsApp são obrigatórios pra criar lead.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium mb-1">Texto do botão CTA</label>
              <input value={cta} onChange={(e) => setCta(e.target.value)} placeholder="Receber convite" className="input-base text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Cor primária (hex)</label>
              <div className="flex gap-1">
                <input
                  type="color"
                  value={corPrimaria || "#6366f1"}
                  onChange={(e) => setCorPrimaria(e.target.value)}
                  className="h-9 w-12 rounded border border-border bg-card cursor-pointer"
                />
                <input
                  type="text"
                  value={corPrimaria}
                  onChange={(e) => setCorPrimaria(e.target.value)}
                  placeholder="#6366f1"
                  className="input-base text-sm font-mono flex-1"
                  maxLength={7}
                />
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium mb-1">Tela de agradecimento — título</label>
              <input value={agrTitulo} onChange={(e) => setAgrTitulo(e.target.value)} className="input-base text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Agradecimento — texto</label>
              <input value={agrTexto} onChange={(e) => setAgrTexto(e.target.value)} className="input-base text-sm" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Logo URL (opcional)</label>
            <input value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} placeholder="https://..." className="input-base text-sm" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <div>
              <label className="block text-xs font-medium mb-1">Cadência inicial</label>
              <select value={fluxoCadenciaId} onChange={(e) => setFluxoCadenciaId(e.target.value)} className="input-base text-sm">
                <option value="">Nenhuma</option>
                {fluxos.map((f: any) => <option key={f.id} value={f.id}>{f.nome}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Segmento default</label>
              <input value={segmento} onChange={(e) => setSegmento(e.target.value)} placeholder="Saúde, Tech..." className="input-base text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Responsável</label>
              <select value={responsavelId} onChange={(e) => setResponsavelId(e.target.value)} className="input-base text-sm">
                <option value="">Sem responsável</option>
                {membros.map((m: any) => <option key={m.profile_id} value={m.profile_id}>{m.display_name}</option>)}
              </select>
            </div>
          </div>
        </div>
        <div className="px-5 py-3 border-t border-border flex justify-end gap-2">
          <button onClick={onClose} disabled={pending} className="btn-ghost text-sm">Cancelar</button>
          <button onClick={salvar} disabled={pending} className="btn-primary text-sm">
            {pending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            <Save className="w-3.5 h-3.5" />
            {lp ? "Salvar mudanças" : "Criar LP"}
          </button>
        </div>
      </div>
    </div>
  );
}
