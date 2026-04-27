"use client";
import { useState, useTransition } from "react";
import type { MembroEnriched, Role } from "@/lib/types";
import {
  alterarRoleMembro, desativarMembro, reativarMembro,
  criarConvite, revogarConvite,
  adicionarSegmentoVendedor, removerSegmentoVendedor,
  definirMetaIndividual, removerMetaIndividual,
  transferirCarteira, atualizarConfigOrg,
} from "./actions";
import {
  UserCog, Mail, Target, Map, ArrowRightLeft, Settings2,
  Plus, X, Check, AlertCircle, UserMinus, UserPlus, Copy,
} from "lucide-react";

type Tab = "membros" | "convites" | "metas" | "territorios" | "carteiras" | "config";

type ConviteRow = {
  id: number;
  email: string;
  role: Role;
  token: string;
  expira_em: string;
  created_at: string;
};

type SegmentoRow = { id: number; profile_id: string; segmento: string };

type MetaRow = {
  id: number;
  profile_id: string;
  periodo_tipo: "semana" | "mes";
  periodo_inicio: string;
  periodo_fim: string;
  meta_leads: number;
  meta_raiox: number;
  meta_calls: number;
  meta_props: number;
  meta_fech: number;
};

type OrgConfig = {
  distribuicao_automatica: boolean;
  distribuicao_estrategia: "segmento" | "round_robin" | "manual";
};

export default function EquipeClient({
  meId,
  membros,
  convites,
  segmentos,
  metas,
  segmentosDisponiveis,
  config,
}: {
  meId: string;
  membros: MembroEnriched[];
  convites: ConviteRow[];
  segmentos: SegmentoRow[];
  metas: MetaRow[];
  segmentosDisponiveis: string[];
  config: OrgConfig;
}) {
  const [tab, setTab] = useState<Tab>("membros");

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      <header className="mb-4">
        <h1 className="text-2xl font-semibold tracking-tight">Equipe</h1>
        <p className="text-sm text-slate-500">Gestão de membros, metas, territórios e carteiras.</p>
      </header>

      <div className="flex gap-1 border-b border-slate-200 mb-4 overflow-x-auto">
        <TabBtn v="membros"     cur={tab} set={setTab} icon={<UserCog     className="w-3.5 h-3.5"/>} label={`Membros (${membros.filter(m => m.ativo).length})`}/>
        <TabBtn v="convites"    cur={tab} set={setTab} icon={<Mail        className="w-3.5 h-3.5"/>} label={`Convites (${convites.length})`}/>
        <TabBtn v="metas"       cur={tab} set={setTab} icon={<Target      className="w-3.5 h-3.5"/>} label="Metas individuais"/>
        <TabBtn v="territorios" cur={tab} set={setTab} icon={<Map         className="w-3.5 h-3.5"/>} label="Territórios"/>
        <TabBtn v="carteiras"   cur={tab} set={setTab} icon={<ArrowRightLeft className="w-3.5 h-3.5"/>} label="Carteiras"/>
        <TabBtn v="config"      cur={tab} set={setTab} icon={<Settings2   className="w-3.5 h-3.5"/>} label="Distribuição"/>
      </div>

      {tab === "membros"     && <MembrosTab meId={meId} membros={membros}/>}
      {tab === "convites"    && <ConvitesTab convites={convites}/>}
      {tab === "metas"       && <MetasTab membros={membros} metas={metas}/>}
      {tab === "territorios" && <TerritoriosTab membros={membros} segmentos={segmentos} segmentosDisponiveis={segmentosDisponiveis}/>}
      {tab === "carteiras"   && <CarteirasTab membros={membros}/>}
      {tab === "config"      && <ConfigTab config={config}/>}
    </div>
  );
}

function TabBtn({ v, cur, set, icon, label }: { v: Tab; cur: Tab; set: (t: Tab) => void; icon: React.ReactNode; label: string }) {
  const active = v === cur;
  return (
    <button
      onClick={() => set(v)}
      className={`px-3 py-2 text-xs font-medium border-b-2 transition flex items-center gap-1.5 whitespace-nowrap ${
        active ? "border-guild-600 text-guild-700" : "border-transparent text-slate-500 hover:text-slate-800"
      }`}
    >
      {icon} {label}
    </button>
  );
}

/* ======================================================================== */
/*                            MEMBROS TAB                                    */
/* ======================================================================== */

function MembrosTab({ meId, membros }: { meId: string; membros: MembroEnriched[] }) {
  const [pending, startTransition] = useTransition();

  return (
    <div className="card overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
          <tr>
            <th className="text-left px-3 py-2 font-medium">Nome</th>
            <th className="text-left px-3 py-2 font-medium">Email</th>
            <th className="text-left px-3 py-2 font-medium">Papel</th>
            <th className="text-center px-3 py-2 font-medium">Status</th>
            <th className="text-right px-3 py-2 font-medium">Ações</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {membros.map(m => (
            <tr key={m.id} className="hover:bg-slate-50">
              <td className="px-3 py-2 font-medium">
                {m.display_name}
                {m.profile_id === meId && <span className="ml-2 text-[10px] text-guild-700">(você)</span>}
              </td>
              <td className="px-3 py-2 text-xs text-slate-600">{m.email}</td>
              <td className="px-3 py-2">
                <select
                  defaultValue={m.role}
                  disabled={pending || m.profile_id === meId}
                  onChange={(e) => startTransition(() => { alterarRoleMembro(m.profile_id, e.target.value as Role); })}
                  className="input-base !py-1 !text-xs !w-32"
                >
                  <option value="gestor">Gestor</option>
                  <option value="comercial">Comercial</option>
                  <option value="sdr">SDR</option>
                </select>
              </td>
              <td className="px-3 py-2 text-center">
                {m.ativo
                  ? <span className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 rounded uppercase">Ativo</span>
                  : <span className="text-[10px] bg-slate-100 text-slate-500 border border-slate-200 px-1.5 py-0.5 rounded uppercase">Inativo</span>}
              </td>
              <td className="px-3 py-2 text-right">
                {m.profile_id !== meId && (
                  m.ativo ? (
                    <button
                      onClick={() => startTransition(() => { desativarMembro(m.profile_id); })}
                      disabled={pending}
                      className="btn-ghost text-xs text-urgent-500"
                    >
                      <UserMinus className="w-3.5 h-3.5"/> Desativar
                    </button>
                  ) : (
                    <button
                      onClick={() => startTransition(() => { reativarMembro(m.profile_id); })}
                      disabled={pending}
                      className="btn-ghost text-xs text-emerald-700"
                    >
                      <UserPlus className="w-3.5 h-3.5"/> Reativar
                    </button>
                  )
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ======================================================================== */
/*                            CONVITES TAB                                   */
/* ======================================================================== */

function ConvitesTab({ convites }: { convites: ConviteRow[] }) {
  const [pending, startTransition] = useTransition();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("comercial");
  const [ultimoLink, setUltimoLink] = useState<string | null>(null);
  const [ultimoEmailEnviado, setUltimoEmailEnviado] = useState<boolean | null>(null);

  async function handleCriar() {
    if (!email) return;
    try {
      const result = await criarConvite({ email, role });
      const link = `${window.location.origin}/api/convite/${result.token}`;
      setUltimoLink(link);
      setUltimoEmailEnviado(Boolean(result.email_sent));
      setEmail("");
    } catch (e) {
      alert("Erro ao criar convite: " + (e as Error).message);
    }
  }

  return (
    <div className="space-y-4">
      <div className="card p-4">
        <h3 className="font-semibold text-sm mb-3">Novo convite</h3>
        <div className="flex items-end gap-2 flex-wrap">
          <div className="flex-1 min-w-[220px]">
            <div className="label mb-1">Email</div>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="pessoa@empresa.com"
              className="input-base text-sm w-full"
            />
          </div>
          <div>
            <div className="label mb-1">Papel</div>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
              className="input-base !text-sm w-36"
            >
              <option value="comercial">Comercial</option>
              <option value="sdr">SDR</option>
              <option value="gestor">Gestor</option>
            </select>
          </div>
          <button
            onClick={() => startTransition(handleCriar)}
            disabled={pending || !email}
            className="btn-primary text-sm"
          >
            <Plus className="w-3.5 h-3.5"/> Convidar
          </button>
        </div>
        {ultimoLink && (
          <div className="mt-3 bg-emerald-50 border border-emerald-200 rounded-lg p-3 flex items-start gap-2">
            <Check className="w-4 h-4 text-emerald-700 mt-0.5"/>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium text-emerald-900 mb-1">
                {ultimoEmailEnviado ? "Convite criado e enviado por email." : "Convite criado. Email nao configurado ou nao enviado."}
              </div>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-xs bg-white border border-emerald-200 rounded px-2 py-1 truncate">{ultimoLink}</code>
                <button
                  onClick={() => { navigator.clipboard.writeText(ultimoLink); }}
                  className="btn-ghost text-xs"
                >
                  <Copy className="w-3.5 h-3.5"/> Copiar
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
            <tr>
              <th className="text-left px-3 py-2 font-medium">Email</th>
              <th className="text-left px-3 py-2 font-medium">Papel</th>
              <th className="text-left px-3 py-2 font-medium">Expira</th>
              <th className="text-left px-3 py-2 font-medium">Link</th>
              <th className="text-right px-3 py-2 font-medium">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {convites.length === 0 && (
              <tr><td colSpan={5} className="text-center py-8 text-slate-400 text-xs">Nenhum convite pendente.</td></tr>
            )}
            {convites.map(c => {
              const expirado = new Date(c.expira_em) < new Date();
              return (
                <tr key={c.id} className="hover:bg-slate-50">
                  <td className="px-3 py-2">{c.email}</td>
                  <td className="px-3 py-2 text-xs uppercase tracking-wider">{c.role}</td>
                  <td className="px-3 py-2 text-xs">
                    {expirado
                      ? <span className="text-urgent-500 inline-flex items-center gap-1"><AlertCircle className="w-3 h-3"/> Expirado</span>
                      : <span className="text-slate-600">{new Date(c.expira_em).toLocaleDateString("pt-BR")}</span>}
                  </td>
                  <td className="px-3 py-2">
                    <button
                      onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/api/convite/${c.token}`); }}
                      className="btn-ghost text-xs"
                    >
                      <Copy className="w-3.5 h-3.5"/> Copiar link
                    </button>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      onClick={() => startTransition(() => { revogarConvite(c.id); })}
                      disabled={pending}
                      className="btn-ghost text-xs text-urgent-500"
                    >
                      <X className="w-3.5 h-3.5"/> Revogar
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ======================================================================== */
/*                            METAS TAB                                      */
/* ======================================================================== */

function MetasTab({ membros, metas }: { membros: MembroEnriched[]; metas: MetaRow[] }) {
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState<string | null>(null); // profile_id

  const ativos = membros.filter(m => m.ativo && m.role !== "gestor");

  return (
    <div className="space-y-3">
      {ativos.length === 0 && (
        <div className="card p-8 text-center text-sm text-slate-400">
          Sem vendedores ativos. Convide pessoas na aba "Convites".
        </div>
      )}
      {ativos.map(m => {
        const minhasMetas = metas.filter(me => me.profile_id === m.profile_id);
        return (
          <div key={m.id} className="card p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium text-sm">{m.display_name}</div>
                <div className="text-[10px] uppercase text-slate-500 tracking-wider">{m.role}</div>
              </div>
              <button
                onClick={() => setOpen(open === m.profile_id ? null : m.profile_id)}
                className="btn-secondary text-xs"
              >
                <Plus className="w-3.5 h-3.5"/> Nova meta
              </button>
            </div>

            {open === m.profile_id && (
              <MetaForm
                profile_id={m.profile_id}
                onClose={() => setOpen(null)}
                pending={pending}
                startTransition={startTransition}
              />
            )}

            {minhasMetas.length > 0 ? (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="text-[10px] uppercase tracking-wider text-slate-500">
                    <tr className="border-b border-slate-100">
                      <th className="text-left py-2 font-medium">Período</th>
                      <th className="text-right py-2 font-medium">Leads</th>
                      <th className="text-right py-2 font-medium">Raio-X</th>
                      <th className="text-right py-2 font-medium">Calls</th>
                      <th className="text-right py-2 font-medium">Props</th>
                      <th className="text-right py-2 font-medium">Fech</th>
                      <th className="text-right py-2 font-medium"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {minhasMetas.map(me => (
                      <tr key={me.id} className="border-b border-slate-50 last:border-0">
                        <td className="py-2">
                          <span className="text-[10px] uppercase tracking-wider text-slate-400 mr-1">{me.periodo_tipo}</span>
                          {new Date(me.periodo_inicio).toLocaleDateString("pt-BR")} – {new Date(me.periodo_fim).toLocaleDateString("pt-BR")}
                        </td>
                        <td className="py-2 text-right">{me.meta_leads}</td>
                        <td className="py-2 text-right">{me.meta_raiox}</td>
                        <td className="py-2 text-right">{me.meta_calls}</td>
                        <td className="py-2 text-right">{me.meta_props}</td>
                        <td className="py-2 text-right">{me.meta_fech}</td>
                        <td className="py-2 text-right">
                          <button
                            onClick={() => startTransition(() => { removerMetaIndividual(me.id); })}
                            disabled={pending}
                            className="btn-ghost text-[10px] text-urgent-500"
                          >
                            <X className="w-3 h-3"/>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="mt-3 text-xs text-slate-400">Sem metas definidas.</div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function MetaForm({ profile_id, onClose, pending, startTransition }: {
  profile_id: string;
  onClose: () => void;
  pending: boolean;
  startTransition: (cb: () => void) => void;
}) {
  const hoje = new Date().toISOString().slice(0, 10);
  const proxSemana = new Date(); proxSemana.setDate(proxSemana.getDate() + 7);
  const [form, setForm] = useState({
    periodo_tipo: "semana" as "semana" | "mes",
    periodo_inicio: hoje,
    periodo_fim: proxSemana.toISOString().slice(0, 10),
    meta_leads: 10,
    meta_raiox: 2,
    meta_calls: 5,
    meta_props: 2,
    meta_fech: 1,
  });

  function handleSave() {
    startTransition(async () => {
      await definirMetaIndividual({ profile_id, ...form });
      onClose();
    });
  }

  return (
    <div className="mt-3 p-3 bg-slate-50 rounded-lg border border-slate-200 grid md:grid-cols-3 gap-3 text-xs">
      <div>
        <div className="label mb-1">Tipo</div>
        <select
          value={form.periodo_tipo}
          onChange={(e) => setForm(f => ({ ...f, periodo_tipo: e.target.value as "semana" | "mes" }))}
          className="input-base !text-xs w-full"
        >
          <option value="semana">Semanal</option>
          <option value="mes">Mensal</option>
        </select>
      </div>
      <div>
        <div className="label mb-1">Início</div>
        <input type="date" value={form.periodo_inicio}
          onChange={(e) => setForm(f => ({ ...f, periodo_inicio: e.target.value }))}
          className="input-base !text-xs w-full"/>
      </div>
      <div>
        <div className="label mb-1">Fim</div>
        <input type="date" value={form.periodo_fim}
          onChange={(e) => setForm(f => ({ ...f, periodo_fim: e.target.value }))}
          className="input-base !text-xs w-full"/>
      </div>
      <NumInput label="Leads"  v={form.meta_leads}  s={(v) => setForm(f => ({ ...f, meta_leads: v }))}/>
      <NumInput label="Raio-X" v={form.meta_raiox}  s={(v) => setForm(f => ({ ...f, meta_raiox: v }))}/>
      <NumInput label="Calls"  v={form.meta_calls}  s={(v) => setForm(f => ({ ...f, meta_calls: v }))}/>
      <NumInput label="Props"  v={form.meta_props}  s={(v) => setForm(f => ({ ...f, meta_props: v }))}/>
      <NumInput label="Fech"   v={form.meta_fech}   s={(v) => setForm(f => ({ ...f, meta_fech: v }))}/>
      <div className="flex items-end gap-2">
        <button onClick={handleSave} disabled={pending} className="btn-primary text-xs flex-1">Salvar</button>
        <button onClick={onClose} className="btn-ghost text-xs">Cancelar</button>
      </div>
    </div>
  );
}

function NumInput({ label, v, s }: { label: string; v: number; s: (n: number) => void }) {
  return (
    <div>
      <div className="label mb-1">{label}</div>
      <input type="number" min={0} value={v}
        onChange={(e) => s(parseInt(e.target.value || "0", 10))}
        className="input-base !text-xs w-full"/>
    </div>
  );
}

/* ======================================================================== */
/*                            TERRITÓRIOS TAB                                */
/* ======================================================================== */

function TerritoriosTab({
  membros, segmentos, segmentosDisponiveis,
}: {
  membros: MembroEnriched[];
  segmentos: SegmentoRow[];
  segmentosDisponiveis: string[];
}) {
  const [pending, startTransition] = useTransition();
  const ativos = membros.filter(m => m.ativo && m.role !== "gestor");

  return (
    <div className="space-y-3">
      <div className="card p-3 bg-blue-50 border-blue-200 text-xs text-slate-700">
        Atribua segmentos (verticais) a cada vendedor. Quando a distribuição automática estiver ligada, leads são roteados de acordo com o segmento.
      </div>

      {ativos.length === 0 && (
        <div className="card p-8 text-center text-sm text-slate-400">Sem vendedores ativos.</div>
      )}

      {ativos.map(m => {
        const meus = segmentos.filter(s => s.profile_id === m.profile_id);
        return (
          <div key={m.id} className="card p-4">
            <div className="flex items-center justify-between mb-2">
              <div>
                <div className="font-medium text-sm">{m.display_name}</div>
                <div className="text-[10px] uppercase text-slate-500 tracking-wider">{m.role}</div>
              </div>
              <AddSegmento
                profile_id={m.profile_id}
                sugestoes={segmentosDisponiveis.filter(s => !meus.some(x => x.segmento === s))}
                pending={pending}
                startTransition={startTransition}
              />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {meus.length === 0 && <span className="text-xs text-slate-400">Sem segmentos atribuídos.</span>}
              {meus.map(s => (
                <span key={s.id} className="inline-flex items-center gap-1 bg-guild-50 text-guild-700 text-xs px-2 py-0.5 rounded border border-guild-200">
                  {s.segmento}
                  <button
                    onClick={() => startTransition(() => { removerSegmentoVendedor(s.id); })}
                    disabled={pending}
                    className="hover:text-urgent-500"
                  >
                    <X className="w-3 h-3"/>
                  </button>
                </span>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function AddSegmento({ profile_id, sugestoes, pending, startTransition }: {
  profile_id: string;
  sugestoes: string[];
  pending: boolean;
  startTransition: (cb: () => void) => void;
}) {
  const [value, setValue] = useState("");
  return (
    <div className="flex items-center gap-1">
      <input
        list={`seg-${profile_id}`}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Segmento..."
        className="input-base !text-xs !py-1 w-36"
      />
      <datalist id={`seg-${profile_id}`}>
        {sugestoes.map(s => <option key={s} value={s}/>)}
      </datalist>
      <button
        onClick={() => {
          if (!value.trim()) return;
          startTransition(() => { adicionarSegmentoVendedor(profile_id, value); });
          setValue("");
        }}
        disabled={pending || !value.trim()}
        className="btn-ghost !py-1 text-xs"
      >
        <Plus className="w-3 h-3"/>
      </button>
    </div>
  );
}

/* ======================================================================== */
/*                            CARTEIRAS TAB                                  */
/* ======================================================================== */

function CarteirasTab({ membros }: { membros: MembroEnriched[] }) {
  const [pending, startTransition] = useTransition();
  const [de, setDe] = useState("");
  const [para, setPara] = useState("");
  const [funnel, setFunnel] = useState<string>("");
  const [crm, setCrm] = useState<string>("");
  const [result, setResult] = useState<number | null>(null);

  const ativos = membros.filter(m => m.ativo);

  async function handleTransfer() {
    if (!de || !para || de === para) return;
    if (!confirm(`Confirma transferir a carteira? Isso moverá todos os leads aplicáveis.`)) return;
    try {
      const r = await transferirCarteira(de, para, {
        funnel_stage: funnel || undefined,
        crm_stage: crm || undefined,
      });
      setResult(r.total);
    } catch (e) {
      alert("Erro: " + (e as Error).message);
    }
  }

  return (
    <div className="card p-4">
      <div className="flex items-start gap-2 mb-4">
        <ArrowRightLeft className="w-4 h-4 text-slate-500 mt-1"/>
        <div className="text-xs text-slate-600">
          Transfira leads em massa de um vendedor para outro. Útil quando alguém sai do time ou reorganizou a carteira.
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-3">
        <div>
          <div className="label mb-1">De</div>
          <select value={de} onChange={(e) => setDe(e.target.value)} className="input-base !text-sm w-full">
            <option value="">Selecione...</option>
            {ativos.map(m => <option key={m.id} value={m.profile_id}>{m.display_name}</option>)}
          </select>
        </div>
        <div>
          <div className="label mb-1">Para</div>
          <select value={para} onChange={(e) => setPara(e.target.value)} className="input-base !text-sm w-full">
            <option value="">Selecione...</option>
            {ativos.filter(m => m.profile_id !== de).map(m => <option key={m.id} value={m.profile_id}>{m.display_name}</option>)}
          </select>
        </div>
        <div>
          <div className="label mb-1">Funil (opcional)</div>
          <select value={funnel} onChange={(e) => setFunnel(e.target.value)} className="input-base !text-sm w-full">
            <option value="">Qualquer</option>
            <option value="base_bruta">Base bruta</option>
            <option value="base_qualificada">Base qualificada</option>
            <option value="pipeline">Pipeline</option>
            <option value="arquivado">Arquivado</option>
          </select>
        </div>
        <div>
          <div className="label mb-1">Etapa CRM (opcional)</div>
          <select value={crm} onChange={(e) => setCrm(e.target.value)} className="input-base !text-sm w-full">
            <option value="">Qualquer</option>
            {["Prospecção","Qualificado","Raio-X Ofertado","Raio-X Feito","Call Marcada","Diagnóstico Pago","Proposta"].map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2">
        <button
          onClick={() => startTransition(handleTransfer)}
          disabled={pending || !de || !para || de === para}
          className="btn-primary text-sm"
        >
          <ArrowRightLeft className="w-3.5 h-3.5"/> Transferir
        </button>
        {result !== null && (
          <span className="text-xs text-emerald-700">
            <Check className="w-3.5 h-3.5 inline"/> {result} lead(s) transferido(s).
          </span>
        )}
      </div>
    </div>
  );
}

/* ======================================================================== */
/*                            CONFIG TAB                                     */
/* ======================================================================== */

function ConfigTab({ config }: { config: OrgConfig }) {
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState(config);

  return (
    <div className="card p-4 max-w-xl">
      <h3 className="font-semibold text-sm mb-3">Distribuição de leads</h3>

      <label className="flex items-start gap-2 mb-4 cursor-pointer">
        <input
          type="checkbox"
          checked={form.distribuicao_automatica}
          onChange={(e) => setForm(f => ({ ...f, distribuicao_automatica: e.target.checked }))}
          className="mt-0.5"
        />
        <div>
          <div className="font-medium text-sm">Ativar distribuição automática</div>
          <div className="text-xs text-slate-500">Ao criar um novo lead, atribuir automaticamente um responsável usando a estratégia abaixo.</div>
        </div>
      </label>

      <div className="mb-4">
        <div className="label mb-1">Estratégia</div>
        <select
          value={form.distribuicao_estrategia}
          onChange={(e) => setForm(f => ({ ...f, distribuicao_estrategia: e.target.value as OrgConfig["distribuicao_estrategia"] }))}
          disabled={!form.distribuicao_automatica}
          className="input-base !text-sm w-full"
        >
          <option value="manual">Manual (sem auto-roteamento)</option>
          <option value="segmento">Por segmento (territórios)</option>
          <option value="round_robin">Round-robin (rodízio)</option>
        </select>
      </div>

      <button
        onClick={() => startTransition(async () => { await atualizarConfigOrg(form); })}
        disabled={pending}
        className="btn-primary text-sm"
      >
        Salvar
      </button>
    </div>
  );
}
