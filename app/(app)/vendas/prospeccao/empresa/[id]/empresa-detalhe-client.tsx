"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  RefreshCw, Star, Edit2, X, Save, Loader2, Check, AlertCircle, Eye,
} from "lucide-react";
import {
  refreshEmpresaCnpj, toggleBookmark, salvarMetaEmpresaOrg, marcarAlertasVistos,
} from "./actions";

interface Meta {
  tags: string[] | null;
  notas_internas: string | null;
  evitar: boolean;
  evitar_motivo: string | null;
  prioridade_icp: "alta" | "media" | "baixa" | null;
}

export default function EmpresaDetalheClient({
  empresaId,
  empresaLabel,
  favoritadoInicial,
  metaInicial,
  alertasPendentes,
}: {
  empresaId: number;
  empresaLabel: string;
  favoritadoInicial: boolean;
  metaInicial: Meta | null;
  alertasPendentes: number;
}) {
  const router = useRouter();
  const [favoritado, setFavoritado] = useState(favoritadoInicial);
  const [editandoMeta, setEditandoMeta] = useState(false);
  const [tagsTexto, setTagsTexto] = useState((metaInicial?.tags ?? []).join(", "));
  const [notas, setNotas] = useState(metaInicial?.notas_internas ?? "");
  const [evitar, setEvitar] = useState(metaInicial?.evitar ?? false);
  const [evitarMotivo, setEvitarMotivo] = useState(metaInicial?.evitar_motivo ?? "");
  const [prioridadeIcp, setPrioridadeIcp] = useState<"alta"|"media"|"baixa"|"">(metaInicial?.prioridade_icp ?? "");
  const [feedback, setFeedback] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function handleRefresh() {
    setFeedback(null);
    startTransition(async () => {
      try {
        const r = await refreshEmpresaCnpj(empresaId);
        setFeedback({
          tipo: "ok",
          texto: r.mudou ? "Dados atualizados — houve mudanças!" : "Dados atualizados (sem mudanças desde a última consulta).",
        });
        router.refresh();
      } catch (e) {
        setFeedback({ tipo: "erro", texto: e instanceof Error ? e.message : "Erro." });
      } finally {
        setTimeout(() => setFeedback(null), 4000);
      }
    });
  }

  function handleToggleBookmark() {
    startTransition(async () => {
      try {
        const r = await toggleBookmark(empresaId);
        setFavoritado(r.favoritado);
      } catch (e) {
        setFeedback({ tipo: "erro", texto: e instanceof Error ? e.message : "Erro." });
      }
    });
  }

  function handleSalvarMeta() {
    const tags = tagsTexto.split(",").map((t) => t.trim()).filter(Boolean).slice(0, 20);
    startTransition(async () => {
      try {
        await salvarMetaEmpresaOrg({
          empresa_id: empresaId,
          tags,
          notas_internas: notas || null,
          evitar,
          evitar_motivo: evitar ? evitarMotivo || null : null,
          prioridade_icp: prioridadeIcp || null,
        });
        setEditandoMeta(false);
        setFeedback({ tipo: "ok", texto: "Notas salvas." });
        router.refresh();
        setTimeout(() => setFeedback(null), 2500);
      } catch (e) {
        setFeedback({ tipo: "erro", texto: e instanceof Error ? e.message : "Erro." });
      }
    });
  }

  function handleMarcarVistos() {
    startTransition(async () => {
      try {
        await marcarAlertasVistos(empresaId);
        router.refresh();
      } catch {/* ignore */}
    });
  }

  return (
    <div className="flex flex-col items-end gap-2 shrink-0">
      <div className="flex items-center gap-2">
        {alertasPendentes > 0 && (
          <button
            onClick={handleMarcarVistos}
            disabled={pending}
            className="btn-ghost text-xs text-warning-500"
            title="Marcar alertas como vistos"
          >
            <Eye className="w-3 h-3" />
            {alertasPendentes} novo(s)
          </button>
        )}
        <button
          onClick={handleToggleBookmark}
          disabled={pending}
          className={`btn-ghost text-xs ${favoritado ? "text-warning-500" : "text-muted-foreground"}`}
          title={favoritado ? "Remover dos favoritos" : "Adicionar aos favoritos"}
          aria-pressed={favoritado}
        >
          <Star className={`w-3.5 h-3.5 ${favoritado ? "fill-current" : ""}`} />
          {favoritado ? "Favorito" : "Favoritar"}
        </button>
        <button
          onClick={handleRefresh}
          disabled={pending}
          className="btn-secondary text-xs"
          title="Reconsulta BrasilAPI agora"
        >
          {pending ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
          Atualizar agora
        </button>
        <button
          onClick={() => setEditandoMeta(true)}
          className="btn-primary text-xs"
        >
          <Edit2 className="w-3 h-3" />
          Editar notas
        </button>
      </div>

      {feedback && (
        <span
          role="alert"
          className={`text-xs inline-flex items-center gap-1 ${
            feedback.tipo === "ok" ? "text-success-500" : "text-destructive"
          }`}
        >
          {feedback.tipo === "ok" ? <Check className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
          {feedback.texto}
        </span>
      )}

      {/* Modal editar notas/tags */}
      {editandoMeta && (
        <div
          className="fixed inset-0 z-[9999] bg-black/40 flex items-center justify-center p-4"
          onClick={() => !pending && setEditandoMeta(false)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="bg-card text-foreground border border-border rounded-2xl max-w-lg w-full max-h-[90vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-3 border-b border-border flex items-center justify-between">
              <div className="font-semibold text-sm">Notas da org · {empresaLabel}</div>
              <button onClick={() => setEditandoMeta(false)} className="btn-ghost"><X className="w-4 h-4" /></button>
            </div>
            <div className="overflow-y-auto p-5 space-y-3">
              <div>
                <label className="block text-xs font-medium mb-1">Tags (separadas por vírgula)</label>
                <input
                  value={tagsTexto}
                  onChange={(e) => setTagsTexto(e.target.value)}
                  placeholder="cliente-potencial, concorrente, parceiro, vip..."
                  className="input-base text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Notas internas (visíveis pra toda a org)</label>
                <textarea
                  value={notas}
                  onChange={(e) => setNotas(e.target.value)}
                  placeholder="Contexto, decisor, abordagem, motivo de prospectar/evitar..."
                  className="input-base text-sm min-h-[100px]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Prioridade ICP</label>
                <select
                  value={prioridadeIcp}
                  onChange={(e) => setPrioridadeIcp(e.target.value as any)}
                  className="input-base text-sm"
                >
                  <option value="">— Não definida —</option>
                  <option value="alta">Alta (perfeito match)</option>
                  <option value="media">Média (vale prospectar)</option>
                  <option value="baixa">Baixa (fora do ICP)</option>
                </select>
              </div>
              <label className="flex items-start gap-2 p-2 rounded border border-border cursor-pointer hover:bg-secondary/40">
                <input type="checkbox" checked={evitar} onChange={(e) => setEvitar(e.target.checked)} className="mt-0.5" />
                <div className="flex-1">
                  <div className="text-sm font-medium">Evitar prospectar esta empresa</div>
                  <div className="text-xs text-muted-foreground">Aparece com warning em buscas. Empresas evitadas saem do "look-alike".</div>
                </div>
              </label>
              {evitar && (
                <input
                  value={evitarMotivo}
                  onChange={(e) => setEvitarMotivo(e.target.value)}
                  placeholder="Motivo: já é cliente, concorrente, blacklist..."
                  className="input-base text-sm"
                />
              )}
            </div>
            <div className="px-5 py-3 border-t border-border flex items-center justify-end gap-2">
              <button onClick={() => setEditandoMeta(false)} disabled={pending} className="btn-ghost text-sm">Cancelar</button>
              <button onClick={handleSalvarMeta} disabled={pending} className="btn-primary text-sm">
                {pending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <Save className="w-3.5 h-3.5" />
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
