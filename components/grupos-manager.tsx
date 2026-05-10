"use client";
import { useState, useTransition } from "react";
import { Users, Plus, X, Loader2, Check, Volume2, VolumeX, LogOut, Archive, ExternalLink } from "lucide-react";

type Grupo = {
  id: number; nome: string; link_convite: string | null;
  status: "ativo" | "silenciado" | "saiu" | "arquivado";
  membro_desde: string | null; membros_count: number | null;
  descricao: string | null; observacoes: string | null;
};

const STATUS_CFG = {
  ativo:      { label: "Ativo",      cor: "text-green-700 bg-green-500/10",  icon: Check },
  silenciado: { label: "Silenciado", cor: "text-amber-700 bg-amber-500/10",  icon: VolumeX },
  saiu:       { label: "Saiu",       cor: "text-red-700 bg-red-500/10",      icon: LogOut },
  arquivado:  { label: "Arquivado",  cor: "text-muted-foreground bg-secondary", icon: Archive },
};

export default function GruposManager({ leadId }: { leadId: number }) {
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [carregado, setCarregado] = useState(false);
  const [form, setForm] = useState<{ nome: string; link: string; obs: string } | null>(null);
  const [salvando, startSalvar] = useTransition();
  const [atualizando, setAtualizando] = useState<Set<number>>(new Set());

  if (!carregado) {
    setCarregado(true);
    fetch(`/api/leads/${leadId}/grupos`)
      .then(r => r.json()).then(d => d.grupos && setGrupos(d.grupos)).catch(() => null);
  }

  function salvar() {
    if (!form?.nome.trim()) return;
    startSalvar(async () => {
      const r = await fetch(`/api/leads/${leadId}/grupos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome: form.nome, link_convite: form.link || null, observacoes: form.obs || null }),
      });
      const d = await r.json();
      if (d.ok) {
        const novoGrupo: Grupo = { id: d.id, nome: form.nome, link_convite: form.link || null, status: "ativo", membro_desde: null, membros_count: null, descricao: null, observacoes: form.obs || null };
        setGrupos(prev => [novoGrupo, ...prev]);
        setForm(null);
      }
    });
  }

  async function atualizarStatus(id: number, status: Grupo["status"]) {
    setAtualizando(prev => new Set([...prev, id]));
    try {
      const r = await fetch(`/api/leads/${leadId}/grupos/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const d = await r.json();
      if (d.ok) setGrupos(prev => prev.map(g => g.id === id ? { ...g, status } : g));
    } finally {
      setAtualizando(prev => { const s = new Set(prev); s.delete(id); return s; });
    }
  }

  const gruposVisiveis = grupos.filter(g => g.status !== "arquivado");
  const arquivados = grupos.filter(g => g.status === "arquivado");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground">
          Grupos do WhatsApp onde o lead ou a empresa está presente.
        </div>
        <button onClick={() => setForm({ nome: "", link: "", obs: "" })} className="btn-primary !py-1.5 !px-3 text-xs gap-1">
          <Plus className="w-3.5 h-3.5" /> Adicionar grupo
        </button>
      </div>

      {form && (
        <div className="card p-4 space-y-3 border-primary/25 animate-in fade-in">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold">Novo grupo</span>
            <button onClick={() => setForm(null)}><X className="w-4 h-4 text-muted-foreground" /></button>
          </div>
          <div>
            <label className="label">Nome do grupo *</label>
            <input className="input-base" value={form.nome} onChange={e => setForm(f => f ? { ...f, nome: e.target.value } : f)} placeholder='Ex: "Corretores SP Sul"' />
          </div>
          <div>
            <label className="label">Link de convite</label>
            <input className="input-base" value={form.link} onChange={e => setForm(f => f ? { ...f, link: e.target.value } : f)} placeholder="https://chat.whatsapp.com/..." />
          </div>
          <div>
            <label className="label">Observações</label>
            <input className="input-base" value={form.obs} onChange={e => setForm(f => f ? { ...f, obs: e.target.value } : f)} placeholder="Contexto do grupo..." />
          </div>
          <div className="flex gap-2">
            <button onClick={salvar} disabled={salvando || !form.nome.trim()} className="btn-primary gap-1.5">
              {salvando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Salvar
            </button>
            <button onClick={() => setForm(null)} className="btn-ghost">Cancelar</button>
          </div>
        </div>
      )}

      {gruposVisiveis.length === 0 && !form && (
        <div className="card p-8 text-center border-dashed">
          <Users className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">Nenhum grupo registrado.</p>
          <p className="text-xs text-muted-foreground mt-1">Adicione grupos onde você e o lead estão para facilitar o acompanhamento.</p>
        </div>
      )}

      <div className="space-y-2">
        {gruposVisiveis.map(g => {
          const cfg = STATUS_CFG[g.status];
          const StatusIcon = cfg.icon;
          const upd = atualizando.has(g.id);
          return (
            <div key={g.id} className="card p-3">
              <div className="flex items-start gap-3">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${g.status === "silenciado" ? "bg-amber-500/10" : "bg-teal-500/10"}`}>
                  {g.status === "silenciado" ? <VolumeX className="w-4 h-4 text-amber-600" /> : <Users className="w-4 h-4 text-teal-600" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{g.nome}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${cfg.cor}`}>{cfg.label}</span>
                  </div>
                  {g.observacoes && <div className="text-xs text-muted-foreground mt-0.5">{g.observacoes}</div>}
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    {g.link_convite && (
                      <a href={g.link_convite} target="_blank" rel="noreferrer" className="text-[10px] text-emerald-700 underline flex items-center gap-0.5">
                        <ExternalLink className="w-3 h-3" /> Entrar no grupo
                      </a>
                    )}
                    {/* Ações rápidas */}
                    {g.status !== "silenciado" && g.status !== "saiu" && (
                      <button onClick={() => atualizarStatus(g.id, "silenciado")} disabled={upd}
                        className="text-[10px] text-amber-700 hover:underline flex items-center gap-0.5">
                        {upd ? <Loader2 className="w-3 h-3 animate-spin" /> : <VolumeX className="w-3 h-3" />} Silenciar
                      </button>
                    )}
                    {g.status === "silenciado" && (
                      <button onClick={() => atualizarStatus(g.id, "ativo")} disabled={upd}
                        className="text-[10px] text-green-700 hover:underline flex items-center gap-0.5">
                        {upd ? <Loader2 className="w-3 h-3 animate-spin" /> : <Volume2 className="w-3 h-3" />} Reativar
                      </button>
                    )}
                    {g.status !== "saiu" && (
                      <button onClick={() => atualizarStatus(g.id, "saiu")} disabled={upd}
                        className="text-[10px] text-red-700 hover:underline flex items-center gap-0.5">
                        <LogOut className="w-3 h-3" /> Saiu
                      </button>
                    )}
                    <button onClick={() => atualizarStatus(g.id, "arquivado")} disabled={upd}
                      className="text-[10px] text-muted-foreground hover:underline flex items-center gap-0.5">
                      <Archive className="w-3 h-3" /> Arquivar
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
        {arquivados.length > 0 && (
          <div className="text-[10px] text-muted-foreground/60 text-center">{arquivados.length} grupo(s) arquivado(s) oculto(s)</div>
        )}
      </div>
    </div>
  );
}
