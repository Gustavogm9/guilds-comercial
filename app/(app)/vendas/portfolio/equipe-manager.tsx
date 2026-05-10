"use client";

import { useState, useTransition } from "react";
import {
  Users, Plus, Trash2, Loader2, UserCircle, Shield, Code2, Headphones,
} from "lucide-react";
import { adicionarResponsavelProduto, removerResponsavelProduto } from "./actions-sprint10";

const PAPEL_LABEL: Record<string, { label: string; icon: React.ReactNode; cor: string }> = {
  comercial: { label: "Comercial",  icon: <Shield className="w-3 h-3" />,    cor: "bg-blue-500/10 text-blue-700" },
  tecnico:   { label: "TÃ©cnico",    icon: <Code2 className="w-3 h-3" />,      cor: "bg-purple-500/10 text-purple-700" },
  gestor:    { label: "Gestor",     icon: <Users className="w-3 h-3" />,      cor: "bg-amber-500/10 text-amber-700" },
  suporte:   { label: "Suporte",    icon: <Headphones className="w-3 h-3" />, cor: "bg-green-500/10 text-green-700" },
};

type Membro = { profile_id: string; papel: string; profiles?: { display_name?: string; email: string } | null };
type MembrosOrg = { profile_id: string; papel: string; profiles?: { display_name?: string; email: string } | null };

type Props = {
  produtoId: number;
  responsaveisIniciais: Membro[];
  membrosOrg: MembrosOrg[];
};

export default function EquipeManager({ produtoId, responsaveisIniciais, membrosOrg }: Props) {
  const [responsaveis, setResponsaveis] = useState(responsaveisIniciais);
  const [adicionando, setAdicionando] = useState(false);
  const [profileId, setProfileId] = useState("");
  const [papel, setPapel] = useState("comercial");
  const [pending, start] = useTransition();

  const membrosDisponiveis = membrosOrg.filter(
    m => !responsaveis.some(r => r.profile_id === m.profile_id)
  );

  function adicionar() {
    if (!profileId) return;
    start(async () => {
      const r = await adicionarResponsavelProduto({ produto_id: produtoId, profile_id: profileId, papel });
      if (r.ok) {
        const membro = membrosOrg.find(m => m.profile_id === profileId);
        setResponsaveis(prev => [...prev, { profile_id: profileId, papel, profiles: membro?.profiles }]);
        setProfileId("");
        setAdicionando(false);
      }
    });
  }

  function remover(pid: string) {
    start(async () => {
      await removerResponsavelProduto(produtoId, pid);
      setResponsaveis(prev => prev.filter(r => r.profile_id !== pid));
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground">
          {responsaveis.length} pessoa{responsaveis.length !== 1 ? "s" : ""} na equipe
        </div>
        {membrosDisponiveis.length > 0 && (
          <button onClick={() => setAdicionando(v => !v)} className="btn-primary !py-1 !px-2.5 text-xs gap-1">
            <Plus className="w-3.5 h-3.5" /> Adicionar
          </button>
        )}
      </div>

      {adicionando && (
        <div className="card p-3 space-y-2 border-primary/25 animate-in fade-in">
          <div className="flex gap-2">
            <select className="input-base flex-1 text-xs"
              value={profileId} onChange={e => setProfileId(e.target.value)}>
              <option value="">Selecionar membroâ€¦</option>
              {membrosDisponiveis.map(m => (
                <option key={m.profile_id} value={m.profile_id}>
                  {m.profiles?.display_name ?? m.profiles?.email}
                </option>
              ))}
            </select>
            <select className="input-base w-32 text-xs"
              value={papel} onChange={e => setPapel(e.target.value)}>
              {Object.keys(PAPEL_LABEL).map(k => (
                <option key={k} value={k}>{PAPEL_LABEL[k].label}</option>
              ))}
            </select>
          </div>
          <div className="flex gap-2">
            <button onClick={adicionar} disabled={!profileId || pending} className="btn-primary !py-1 text-xs gap-1">
              {pending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
              Adicionar
            </button>
            <button onClick={() => setAdicionando(false)} className="btn-ghost text-xs">Cancelar</button>
          </div>
        </div>
      )}

      {responsaveis.length === 0 && !adicionando && (
        <div className="p-5 border border-dashed rounded-lg text-center">
          <Users className="w-6 h-6 text-muted-foreground/30 mx-auto mb-1.5" />
          <p className="text-xs text-muted-foreground">Nenhuma equipe definida para este produto.</p>
        </div>
      )}

      <div className="space-y-2">
        {responsaveis.map(r => {
          const p = PAPEL_LABEL[r.papel] ?? PAPEL_LABEL.comercial;
          return (
            <div key={r.profile_id} className="flex items-center gap-2.5 p-2.5 rounded-lg border border-border">
              <div className="w-7 h-7 rounded-full bg-secondary flex items-center justify-center shrink-0">
                <UserCircle className="w-4 h-4 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">
                  {r.profiles?.display_name ?? r.profiles?.email ?? "Membro"}
                </div>
              </div>
              <span className={`text-[10px] px-1.5 py-0.5 rounded flex items-center gap-1 font-medium ${p.cor}`}>
                {p.icon}{p.label}
              </span>
              <button onClick={() => remover(r.profile_id)} className="btn-ghost !p-1 hover:text-destructive shrink-0">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

