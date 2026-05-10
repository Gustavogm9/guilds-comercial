"use client";
import { useEffect, useState, useTransition } from "react";
import type { MembroEnriched, Role } from "@/lib/types";
import { getClientLocale, getT, type Locale } from "@/lib/i18n";
import {
  alterarRoleMembro, desativarMembro, reativarMembro,
  criarConvite, revogarConvite,
  adicionarSegmentoVendedor, removerSegmentoVendedor,
  definirMetaIndividual, removerMetaIndividual,
  transferirCarteira, atualizarConfigOrg,
} from "./actions";
import { iniciarImpersonificacao } from "./impersonation-actions";
import {
  UserCog, Mail, Target, Map, ArrowRightLeft, Settings2,
  Plus, X, Check, AlertCircle, UserMinus, UserPlus, Copy,
  CheckCircle2, Loader2,
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

type Feedback = { tipo: "sucesso" | "erro"; mensagem: string };

/**
 * /equipe — gestão de equipe (CRUD members, convites, metas, territórios, carteiras).
 *
 * Fixes desta auditoria:
 *   - Bug 1+2 (server): impede rebaixar/desativar último gestor + auto-desativação
 *   - Bug 3+4 (server): valida email + dedup de convite + dedup de membro
 *   - Bug 5+6 (server): assertMembroDaOrg + whitelist de funnel/crm
 *   - Bug 7 (server): valida datas/valores de meta
 *   - Bug 9+10 (client): substitui alert()/confirm() por toast + alertdialog
 *   - i18n via t()
 *   - A11y: aria-labels, role=alert nos erros, aria-live=polite no toast
 */
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
  const [locale, setLocale] = useState<Locale>("pt-BR");
  useEffect(() => setLocale(getClientLocale()), []);
  const t = getT(locale);

  const [feedback, setFeedback] = useState<Feedback | null>(null);
  useEffect(() => {
    if (!feedback) return;
    const ms = feedback.tipo === "sucesso" ? 2500 : 4500;
    const id = setTimeout(() => setFeedback(null), ms);
    return () => clearTimeout(id);
  }, [feedback]);

  function showSucesso(mensagem: string) { setFeedback({ tipo: "sucesso", mensagem }); }
  function showErro(e: unknown) {
    setFeedback({ tipo: "erro", mensagem: e instanceof Error ? e.message : "Erro inesperado." });
  }

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      <header className="mb-4">
        <h1 className="text-2xl font-semibold tracking-tight">{t("paginas.equipe_titulo")}</h1>
        <p className="text-sm text-muted-foreground">{t("paginas.equipe_sub")}</p>
      </header>

      <div role="tablist" className="flex gap-1 border-b border-border mb-4 overflow-x-auto">
        <TabBtn v="membros"     cur={tab} set={setTab} icon={<UserCog     className="w-3.5 h-3.5"/>} label={t("equipe.tab_membros").replace("{{n}}", String(membros.filter(m => m.ativo).length))}/>
        <TabBtn v="convites"    cur={tab} set={setTab} icon={<Mail        className="w-3.5 h-3.5"/>} label={t("equipe.tab_convites").replace("{{n}}", String(convites.length))}/>
        <TabBtn v="metas"       cur={tab} set={setTab} icon={<Target      className="w-3.5 h-3.5"/>} label={t("equipe.tab_metas")}/>
        <TabBtn v="territorios" cur={tab} set={setTab} icon={<Map         className="w-3.5 h-3.5"/>} label={t("equipe.tab_territorios")}/>
        <TabBtn v="carteiras"   cur={tab} set={setTab} icon={<ArrowRightLeft className="w-3.5 h-3.5"/>} label={t("equipe.tab_carteiras")}/>
        <TabBtn v="config"      cur={tab} set={setTab} icon={<Settings2   className="w-3.5 h-3.5"/>} label={t("equipe.tab_config")}/>
      </div>

      {tab === "membros"     && <MembrosTab meId={meId} membros={membros} t={t} onSucesso={showSucesso} onErro={showErro}/>}
      {tab === "convites"    && <ConvitesTab convites={convites} t={t} onSucesso={showSucesso} onErro={showErro}/>}
      {tab === "metas"       && <MetasTab membros={membros} metas={metas} t={t} onSucesso={showSucesso} onErro={showErro}/>}
      {tab === "territorios" && <TerritoriosTab membros={membros} segmentos={segmentos} segmentosDisponiveis={segmentosDisponiveis} t={t} onSucesso={showSucesso} onErro={showErro}/>}
      {tab === "carteiras"   && <CarteirasTab membros={membros} t={t} onSucesso={showSucesso} onErro={showErro}/>}
      {tab === "config"      && <ConfigTab config={config} t={t} onSucesso={showSucesso} onErro={showErro}/>}

      {feedback && <FeedbackToast feedback={feedback} onClose={() => setFeedback(null)} />}
    </div>
  );
}

type T = (key: string) => string;

function TabBtn({ v, cur, set, icon, label }: { v: Tab; cur: Tab; set: (t: Tab) => void; icon: React.ReactNode; label: string }) {
  const active = v === cur;
  return (
    <button
      role="tab"
      aria-selected={active}
      onClick={() => set(v)}
      className={`px-3 py-2 text-xs font-medium border-b-2 transition flex items-center gap-1.5 whitespace-nowrap ${
        active ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
      }`}
    >
      {icon} {label}
    </button>
  );
}

function FeedbackToast({ feedback, onClose }: { feedback: Feedback; onClose: () => void }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed bottom-24 right-6 md:right-8 md:bottom-28 z-[100] max-w-sm card p-3 flex items-start gap-2.5 shadow-stripe-md animate-in fade-in slide-in-from-bottom-2 ${
        feedback.tipo === "sucesso"
          ? "border-success-500/30 bg-success-500/5"
          : "border-destructive/30 bg-destructive/5"
      }`}
    >
      {feedback.tipo === "sucesso" ? (
        <CheckCircle2 className="w-4 h-4 text-success-500 mt-0.5 shrink-0" aria-hidden="true" />
      ) : (
        <AlertCircle className="w-4 h-4 text-destructive mt-0.5 shrink-0" aria-hidden="true" />
      )}
      <span className="text-sm text-foreground flex-1">{feedback.mensagem}</span>
      <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground" aria-label="Fechar">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

function ConfirmDialog({
  titulo, descricao, confirmLabel, danger, onConfirm, onCancel, t,
}: {
  titulo: string;
  descricao?: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  t: T;
}) {
  return (
    <div
      className="fixed inset-0 z-[9999] bg-black/40 flex items-center justify-center p-4"
      onClick={onCancel}
      role="alertdialog"
      aria-modal="true"
    >
      <div
        className="bg-card text-foreground border border-border rounded-2xl max-w-md w-full p-5 space-y-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="font-semibold text-sm">{titulo}</div>
        {descricao && <p className="text-xs text-muted-foreground">{descricao}</p>}
        <div className="flex items-center justify-end gap-2 pt-2">
          <button onClick={onCancel} className="btn-ghost text-sm">{t("comum.cancelar")}</button>
          <button
            onClick={onConfirm}
            className={danger ? "btn-primary text-sm bg-destructive hover:bg-destructive/90" : "btn-primary text-sm"}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ======================================================================== */
/*                            MEMBROS TAB                                    */
/* ======================================================================== */

function MembrosTab({ meId, membros, t, onSucesso, onErro }: {
  meId: string; membros: MembroEnriched[]; t: T;
  onSucesso: (m: string) => void; onErro: (e: unknown) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [confirmDesativar, setConfirmDesativar] = useState<MembroEnriched | null>(null);

  function handleAlterarRole(profile_id: string, novoRole: Role) {
    startTransition(async () => {
      try {
        await alterarRoleMembro(profile_id, novoRole);
        onSucesso("Papel atualizado.");
      } catch (e) { onErro(e); }
    });
  }

  function handleDesativar(profile_id: string) {
    startTransition(async () => {
      try {
        await desativarMembro(profile_id);
        onSucesso("Membro desativado.");
      } catch (e) { onErro(e); }
      setConfirmDesativar(null);
    });
  }

  function handleReativar(profile_id: string) {
    startTransition(async () => {
      try {
        await reativarMembro(profile_id);
        onSucesso("Membro reativado.");
      } catch (e) { onErro(e); }
    });
  }

  function handleImpersonate(profile_id: string) {
    startTransition(async () => {
      try {
        await iniciarImpersonificacao(profile_id);
        onSucesso("Modo de impersonificação iniciado.");
      } catch (e) { onErro(e); }
    });
  }

  return (
    <>
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-secondary/60 dark:bg-white/[0.03] text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
            <tr>
              <th className="text-left px-3 py-2 font-semibold">{t("equipe.membros_nome")}</th>
              <th className="text-left px-3 py-2 font-semibold">{t("equipe.membros_email")}</th>
              <th className="text-left px-3 py-2 font-semibold">{t("equipe.membros_papel")}</th>
              <th className="text-center px-3 py-2 font-semibold">{t("equipe.membros_status")}</th>
              <th className="text-right px-3 py-2 font-semibold">{t("equipe.membros_acoes")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {membros.map(m => (
              <tr key={m.id} className="hover:bg-secondary/60 dark:hover:bg-white/[0.04]">
                <td className="px-3 py-2 font-medium">
                  {m.display_name}
                  {m.profile_id === meId && <span className="ml-2 text-[10px] text-primary">{t("equipe.membros_voce")}</span>}
                </td>
                <td className="px-3 py-2 text-xs text-muted-foreground">{m.email}</td>
                <td className="px-3 py-2">
                  <select
                    defaultValue={m.role}
                    disabled={pending || m.profile_id === meId}
                    onChange={(e) => handleAlterarRole(m.profile_id, e.target.value as Role)}
                    aria-label={`${t("equipe.membros_papel")} ${m.display_name}`}
                    className="input-base !py-1 !text-xs !w-32"
                  >
                    <option value="gestor">{t("equipe.papel_gestor")}</option>
                    <option value="comercial">{t("equipe.papel_comercial")}</option>
                    <option value="sdr">{t("equipe.papel_sdr")}</option>
                  </select>
                </td>
                <td className="px-3 py-2 text-center">
                  {m.ativo
                    ? <span className="text-[10px] bg-success/15 text-success-500 border border-success/30 px-1.5 py-0.5 rounded uppercase tracking-[0.12em]">{t("equipe.membros_status_ativo")}</span>
                    : <span className="text-[10px] bg-secondary text-muted-foreground border border-border px-1.5 py-0.5 rounded uppercase tracking-[0.12em] dark:bg-white/[0.05]">{t("equipe.membros_status_inativo")}</span>}
                </td>
                <td className="px-3 py-2 text-right">
                  {m.profile_id !== meId && (
                    m.ativo ? (
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleImpersonate(m.profile_id)}
                          disabled={pending}
                          className="btn-ghost text-xs text-primary"
                          title="Acessar como usuário"
                        >
                          <UserCog className="w-3.5 h-3.5" aria-hidden="true"/> Acessar
                        </button>
                        <button
                          onClick={() => setConfirmDesativar(m)}
                          disabled={pending}
                          className="btn-ghost text-xs text-destructive"
                        >
                          <UserMinus className="w-3.5 h-3.5" aria-hidden="true"/> {t("equipe.membros_desativar")}
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => handleReativar(m.profile_id)}
                        disabled={pending}
                        className="btn-ghost text-xs text-success-500"
                      >
                        <UserPlus className="w-3.5 h-3.5" aria-hidden="true"/> {t("equipe.membros_reativar")}
                      </button>
                    )
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {confirmDesativar && (
        <ConfirmDialog
          t={t}
          titulo={`${t("equipe.membros_desativar")} ${confirmDesativar.display_name}?`}
          descricao={confirmDesativar.email}
          confirmLabel={t("equipe.membros_desativar")}
          danger
          onConfirm={() => handleDesativar(confirmDesativar.profile_id)}
          onCancel={() => setConfirmDesativar(null)}
        />
      )}
    </>
  );
}

/* ======================================================================== */
/*                            CONVITES TAB                                   */
/* ======================================================================== */

function ConvitesTab({ convites, t, onSucesso, onErro }: {
  convites: ConviteRow[]; t: T;
  onSucesso: (m: string) => void; onErro: (e: unknown) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("comercial");
  const [ultimoLink, setUltimoLink] = useState<string | null>(null);
  const [ultimoEmailEnviado, setUltimoEmailEnviado] = useState<boolean | null>(null);
  const [copiado, setCopiado] = useState(false);

  function handleCriar() {
    if (!email) return;
    startTransition(async () => {
      try {
        const result = await criarConvite({ email, role });
        const link = `${window.location.origin}/api/convite/${result.token}`;
        setUltimoLink(link);
        setUltimoEmailEnviado(Boolean(result.email_sent));
        setEmail("");
        onSucesso(result.email_sent ? t("equipe.convites_criado_e_enviado") : t("equipe.convites_criado_sem_email"));
      } catch (e) { onErro(e); }
    });
  }

  function handleRevogar(id: number) {
    startTransition(async () => {
      try {
        await revogarConvite(id);
        onSucesso("Convite revogado.");
      } catch (e) { onErro(e); }
    });
  }

  async function copiar(link: string) {
    try {
      await navigator.clipboard.writeText(link);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1500);
    } catch (e) { onErro(e); }
  }

  return (
    <div className="space-y-4">
      <div className="card p-4">
        <h3 className="font-semibold text-sm mb-3">{t("equipe.convites_novo_titulo")}</h3>
        <div className="flex items-end gap-2 flex-wrap">
          <div className="flex-1 min-w-[220px]">
            <label className="label mb-1 block" htmlFor="convite-email">{t("equipe.convites_email_label")}</label>
            <input
              id="convite-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t("equipe.convites_email_placeholder")}
              className="input-base text-sm w-full"
            />
          </div>
          <div>
            <label className="label mb-1 block" htmlFor="convite-papel">{t("equipe.convites_papel_label")}</label>
            <select
              id="convite-papel"
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
              className="input-base !text-sm w-36"
            >
              <option value="comercial">{t("equipe.papel_comercial")}</option>
              <option value="sdr">{t("equipe.papel_sdr")}</option>
              <option value="gestor">{t("equipe.papel_gestor")}</option>
            </select>
          </div>
          <button
            onClick={handleCriar}
            disabled={pending || !email}
            className="btn-primary text-sm"
          >
            {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true"/> : <Plus className="w-3.5 h-3.5" aria-hidden="true"/>}
            {t("equipe.convites_btn_convidar")}
          </button>
        </div>
        {ultimoLink && (
          <div className="mt-3 bg-success/10 border border-success/25 rounded-lg p-3 flex items-start gap-2">
            <Check className="w-4 h-4 text-success-500 mt-0.5" aria-hidden="true"/>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium text-foreground mb-1">
                {ultimoEmailEnviado ? t("equipe.convites_criado_e_enviado") : t("equipe.convites_criado_sem_email")}
              </div>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-xs bg-card border border-success/25 rounded px-2 py-1 truncate">{ultimoLink}</code>
                <button
                  onClick={() => copiar(ultimoLink)}
                  className="btn-ghost text-xs"
                  aria-label={t("equipe.convites_copiar_link")}
                >
                  <Copy className="w-3.5 h-3.5" aria-hidden="true"/> {copiado ? t("equipe.convites_copiado") : t("equipe.convites_copiar")}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-secondary/60 dark:bg-white/[0.03] text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
            <tr>
              <th className="text-left px-3 py-2 font-semibold">{t("equipe.convites_th_email")}</th>
              <th className="text-left px-3 py-2 font-semibold">{t("equipe.convites_th_papel")}</th>
              <th className="text-left px-3 py-2 font-semibold">{t("equipe.convites_th_expira")}</th>
              <th className="text-left px-3 py-2 font-semibold">{t("equipe.convites_th_link")}</th>
              <th className="text-right px-3 py-2 font-semibold">{t("equipe.convites_th_acoes")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {convites.length === 0 && (
              <tr><td colSpan={5} className="text-center py-8 text-muted-foreground/70 text-xs">{t("equipe.convites_vazio")}</td></tr>
            )}
            {convites.map(c => {
              const expirado = new Date(c.expira_em) < new Date();
              return (
                <tr key={c.id} className="hover:bg-secondary/60 dark:hover:bg-white/[0.04]">
                  <td className="px-3 py-2">{c.email}</td>
                  <td className="px-3 py-2 text-xs uppercase tracking-[0.12em]">{t(`equipe.papel_${c.role}`)}</td>
                  <td className="px-3 py-2 text-xs">
                    {expirado
                      ? <span className="text-destructive inline-flex items-center gap-1"><AlertCircle className="w-3 h-3" aria-hidden="true"/> {t("equipe.convites_expirado")}</span>
                      : <span className="text-muted-foreground tabular-nums">{new Date(c.expira_em).toLocaleDateString()}</span>}
                  </td>
                  <td className="px-3 py-2">
                    <button
                      onClick={() => copiar(`${window.location.origin}/api/convite/${c.token}`)}
                      className="btn-ghost text-xs"
                      aria-label={t("equipe.convites_copiar_link")}
                    >
                      <Copy className="w-3.5 h-3.5" aria-hidden="true"/> {t("equipe.convites_copiar_link")}
                    </button>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      onClick={() => handleRevogar(c.id)}
                      disabled={pending}
                      className="btn-ghost text-xs text-destructive"
                    >
                      <X className="w-3.5 h-3.5" aria-hidden="true"/> {t("equipe.convites_revogar")}
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

function MetasTab({ membros, metas, t, onSucesso, onErro }: {
  membros: MembroEnriched[]; metas: MetaRow[]; t: T;
  onSucesso: (m: string) => void; onErro: (e: unknown) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState<string | null>(null);

  const ativos = membros.filter(m => m.ativo && m.role !== "gestor");

  function handleRemover(meta_id: number) {
    startTransition(async () => {
      try {
        await removerMetaIndividual(meta_id);
        onSucesso("Meta removida.");
      } catch (e) { onErro(e); }
    });
  }

  return (
    <div className="space-y-3">
      {ativos.length === 0 && (
        <div className="card p-8 text-center text-sm text-muted-foreground/70">
          {t("equipe.metas_vazio")}
        </div>
      )}
      {ativos.map(m => {
        const minhasMetas = metas.filter(me => me.profile_id === m.profile_id);
        return (
          <div key={m.id} className="card p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium text-sm">{m.display_name}</div>
                <div className="text-[10px] uppercase text-muted-foreground tracking-[0.12em] font-semibold">{t(`equipe.papel_${m.role}`)}</div>
              </div>
              <button
                onClick={() => setOpen(open === m.profile_id ? null : m.profile_id)}
                className="btn-secondary text-xs"
                aria-expanded={open === m.profile_id}
              >
                <Plus className="w-3.5 h-3.5" aria-hidden="true"/> {t("equipe.metas_nova")}
              </button>
            </div>

            {open === m.profile_id && (
              <MetaForm
                profile_id={m.profile_id}
                onClose={() => setOpen(null)}
                onSucesso={onSucesso}
                onErro={onErro}
                t={t}
              />
            )}

            {minhasMetas.length > 0 ? (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground font-semibold">
                    <tr className="border-b border-border">
                      <th className="text-left py-2">{t("equipe.metas_th_periodo")}</th>
                      <th className="text-right py-2">{t("equipe.metas_th_leads")}</th>
                      <th className="text-right py-2">{t("equipe.metas_th_raiox")}</th>
                      <th className="text-right py-2">{t("equipe.metas_th_calls")}</th>
                      <th className="text-right py-2">{t("equipe.metas_th_props")}</th>
                      <th className="text-right py-2">{t("equipe.metas_th_fech")}</th>
                      <th className="text-right py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {minhasMetas.map(me => (
                      <tr key={me.id} className="border-b border-border/60 last:border-0">
                        <td className="py-2 tabular-nums">
                          <span className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground/70 mr-1">{me.periodo_tipo}</span>
                          {new Date(me.periodo_inicio).toLocaleDateString()} – {new Date(me.periodo_fim).toLocaleDateString()}
                        </td>
                        <td className="py-2 text-right tabular-nums">{me.meta_leads}</td>
                        <td className="py-2 text-right tabular-nums">{me.meta_raiox}</td>
                        <td className="py-2 text-right tabular-nums">{me.meta_calls}</td>
                        <td className="py-2 text-right tabular-nums">{me.meta_props}</td>
                        <td className="py-2 text-right tabular-nums">{me.meta_fech}</td>
                        <td className="py-2 text-right">
                          <button
                            onClick={() => handleRemover(me.id)}
                            disabled={pending}
                            className="btn-ghost text-[10px] text-destructive"
                            aria-label="Remover meta"
                          >
                            <X className="w-3 h-3" aria-hidden="true"/>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="mt-3 text-xs text-muted-foreground/70">{t("equipe.metas_sem_metas")}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function MetaForm({ profile_id, onClose, onSucesso, onErro, t }: {
  profile_id: string;
  onClose: () => void;
  onSucesso: (m: string) => void;
  onErro: (e: unknown) => void;
  t: T;
}) {
  const [pending, startTransition] = useTransition();
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
      try {
        await definirMetaIndividual({ profile_id, ...form });
        onSucesso("Meta salva.");
        onClose();
      } catch (e) { onErro(e); }
    });
  }

  return (
    <div className="mt-3 p-3 bg-secondary/60 dark:bg-white/[0.03] rounded-lg border border-border grid md:grid-cols-3 gap-3 text-xs">
      <div>
        <label className="label mb-1 block">{t("equipe.metas_form_tipo")}</label>
        <select
          value={form.periodo_tipo}
          onChange={(e) => setForm(f => ({ ...f, periodo_tipo: e.target.value as "semana" | "mes" }))}
          className="input-base !text-xs w-full"
        >
          <option value="semana">{t("equipe.metas_form_semanal")}</option>
          <option value="mes">{t("equipe.metas_form_mensal")}</option>
        </select>
      </div>
      <div>
        <label className="label mb-1 block">{t("equipe.metas_form_inicio")}</label>
        <input type="date" value={form.periodo_inicio}
          onChange={(e) => setForm(f => ({ ...f, periodo_inicio: e.target.value }))}
          className="input-base !text-xs w-full"/>
      </div>
      <div>
        <label className="label mb-1 block">{t("equipe.metas_form_fim")}</label>
        <input type="date" value={form.periodo_fim}
          onChange={(e) => setForm(f => ({ ...f, periodo_fim: e.target.value }))}
          className="input-base !text-xs w-full"/>
      </div>
      <NumInput label={t("equipe.metas_th_leads")}  v={form.meta_leads}  s={(v) => setForm(f => ({ ...f, meta_leads: v }))}/>
      <NumInput label={t("equipe.metas_th_raiox")}  v={form.meta_raiox}  s={(v) => setForm(f => ({ ...f, meta_raiox: v }))}/>
      <NumInput label={t("equipe.metas_th_calls")}  v={form.meta_calls}  s={(v) => setForm(f => ({ ...f, meta_calls: v }))}/>
      <NumInput label={t("equipe.metas_th_props")}  v={form.meta_props}  s={(v) => setForm(f => ({ ...f, meta_props: v }))}/>
      <NumInput label={t("equipe.metas_th_fech")}   v={form.meta_fech}   s={(v) => setForm(f => ({ ...f, meta_fech: v }))}/>
      <div className="flex items-end gap-2">
        <button onClick={handleSave} disabled={pending} className="btn-primary text-xs flex-1">
          {pending && <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true"/>}
          {t("equipe.metas_form_salvar")}
        </button>
        <button onClick={onClose} className="btn-ghost text-xs">{t("equipe.metas_form_cancelar")}</button>
      </div>
    </div>
  );
}

function NumInput({ label, v, s }: { label: string; v: number; s: (n: number) => void }) {
  return (
    <div>
      <label className="label mb-1 block">{label}</label>
      <input
        type="number" min={0} max={99999} value={v}
        onChange={(e) => s(Math.max(0, parseInt(e.target.value || "0", 10) || 0))}
        aria-label={label}
        className="input-base !text-xs w-full"
      />
    </div>
  );
}

/* ======================================================================== */
/*                            TERRITÓRIOS TAB                                */
/* ======================================================================== */

function TerritoriosTab({
  membros, segmentos, segmentosDisponiveis, t, onSucesso, onErro,
}: {
  membros: MembroEnriched[];
  segmentos: SegmentoRow[];
  segmentosDisponiveis: string[];
  t: T;
  onSucesso: (m: string) => void;
  onErro: (e: unknown) => void;
}) {
  const [pending, startTransition] = useTransition();
  const ativos = membros.filter(m => m.ativo && m.role !== "gestor");

  function handleRemover(id: number) {
    startTransition(async () => {
      try {
        await removerSegmentoVendedor(id);
        onSucesso("Segmento removido.");
      } catch (e) { onErro(e); }
    });
  }

  function handleAdd(profile_id: string, segmento: string) {
    startTransition(async () => {
      try {
        await adicionarSegmentoVendedor(profile_id, segmento);
        onSucesso("Segmento adicionado.");
      } catch (e) { onErro(e); }
    });
  }

  return (
    <div className="space-y-3">
      <div className="card p-3 bg-primary/5 border-primary/25 text-xs text-foreground/80">
        {t("equipe.territorios_intro")}
      </div>

      {ativos.length === 0 && (
        <div className="card p-8 text-center text-sm text-muted-foreground/70">{t("equipe.territorios_sem_ativos")}</div>
      )}

      {ativos.map(m => {
        const meus = segmentos.filter(s => s.profile_id === m.profile_id);
        return (
          <div key={m.id} className="card p-4">
            <div className="flex items-center justify-between mb-2">
              <div>
                <div className="font-medium text-sm">{m.display_name}</div>
                <div className="text-[10px] uppercase text-muted-foreground tracking-[0.12em] font-semibold">{t(`equipe.papel_${m.role}`)}</div>
              </div>
              <AddSegmento
                profile_id={m.profile_id}
                sugestoes={segmentosDisponiveis.filter(s => !meus.some(x => x.segmento === s))}
                pending={pending}
                onAdd={handleAdd}
                t={t}
              />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {meus.length === 0 && <span className="text-xs text-muted-foreground/70">{t("equipe.territorios_sem_segmentos")}</span>}
              {meus.map(s => (
                <span key={s.id} className="inline-flex items-center gap-1 bg-primary/10 text-primary text-xs px-2 py-0.5 rounded border border-primary/25">
                  {s.segmento}
                  <button
                    onClick={() => handleRemover(s.id)}
                    disabled={pending}
                    className="hover:text-destructive"
                    aria-label={`${t("equipe.territorios_remover")} ${s.segmento}`}
                  >
                    <X className="w-3 h-3" aria-hidden="true"/>
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

function AddSegmento({ profile_id, sugestoes, pending, onAdd, t }: {
  profile_id: string;
  sugestoes: string[];
  pending: boolean;
  onAdd: (profile_id: string, seg: string) => void;
  t: T;
}) {
  const [value, setValue] = useState("");
  return (
    <div className="flex items-center gap-1">
      <input
        list={`seg-${profile_id}`}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={t("equipe.territorios_input_placeholder")}
        aria-label={t("equipe.territorios_input_placeholder")}
        className="input-base !text-xs !py-1 w-36"
      />
      <datalist id={`seg-${profile_id}`}>
        {sugestoes.map(s => <option key={s} value={s}/>)}
      </datalist>
      <button
        onClick={() => {
          if (!value.trim()) return;
          onAdd(profile_id, value);
          setValue("");
        }}
        disabled={pending || !value.trim()}
        className="btn-ghost !py-1 text-xs"
        aria-label={t("comum.continuar")}
      >
        <Plus className="w-3 h-3" aria-hidden="true"/>
      </button>
    </div>
  );
}

/* ======================================================================== */
/*                            CARTEIRAS TAB                                  */
/* ======================================================================== */

function CarteirasTab({ membros, t, onSucesso, onErro }: {
  membros: MembroEnriched[]; t: T;
  onSucesso: (m: string) => void; onErro: (e: unknown) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [de, setDe] = useState("");
  const [para, setPara] = useState("");
  const [funnel, setFunnel] = useState<string>("");
  const [crm, setCrm] = useState<string>("");
  const [result, setResult] = useState<number | null>(null);
  const [confirming, setConfirming] = useState(false);

  const ativos = membros.filter(m => m.ativo);

  function executeTransfer() {
    setConfirming(false);
    startTransition(async () => {
      try {
        const r = await transferirCarteira(de, para, {
          funnel_stage: funnel || undefined,
          crm_stage: crm || undefined,
        });
        setResult(r.total);
        onSucesso(t("equipe.carteiras_resultado").replace("{{n}}", String(r.total)));
      } catch (e) { onErro(e); }
    });
  }

  return (
    <>
      <div className="card p-4">
        <div className="flex items-start gap-2 mb-4">
          <ArrowRightLeft className="w-4 h-4 text-muted-foreground mt-1" aria-hidden="true"/>
          <div className="text-xs text-muted-foreground">
            {t("equipe.carteiras_intro")}
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-3">
          <div>
            <label className="label mb-1 block" htmlFor="cart-de">{t("equipe.carteiras_de")}</label>
            <select id="cart-de" value={de} onChange={(e) => setDe(e.target.value)} className="input-base !text-sm w-full">
              <option value="">{t("equipe.carteiras_select_default")}</option>
              {ativos.map(m => <option key={m.id} value={m.profile_id}>{m.display_name}</option>)}
            </select>
          </div>
          <div>
            <label className="label mb-1 block" htmlFor="cart-para">{t("equipe.carteiras_para")}</label>
            <select id="cart-para" value={para} onChange={(e) => setPara(e.target.value)} className="input-base !text-sm w-full">
              <option value="">{t("equipe.carteiras_select_default")}</option>
              {ativos.filter(m => m.profile_id !== de).map(m => <option key={m.id} value={m.profile_id}>{m.display_name}</option>)}
            </select>
          </div>
          <div>
            <label className="label mb-1 block" htmlFor="cart-funnel">{t("equipe.carteiras_funnel")}</label>
            <select id="cart-funnel" value={funnel} onChange={(e) => setFunnel(e.target.value)} className="input-base !text-sm w-full">
              <option value="">{t("equipe.carteiras_qualquer")}</option>
              <option value="base_bruta">{t("base.tab_bruta")}</option>
              <option value="base_qualificada">{t("base.tab_qualificada")}</option>
              <option value="pipeline">Pipeline</option>
              <option value="arquivado">Arquivado</option>
            </select>
          </div>
          <div>
            <label className="label mb-1 block" htmlFor="cart-crm">{t("equipe.carteiras_crm")}</label>
            <select id="cart-crm" value={crm} onChange={(e) => setCrm(e.target.value)} className="input-base !text-sm w-full">
              <option value="">{t("equipe.carteiras_qualquer")}</option>
              {["Prospecção","Qualificado","Raio-X Ofertado","Raio-X Feito","Call Marcada","Diagnóstico Pago","Proposta"].map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-2">
          <button
            onClick={() => setConfirming(true)}
            disabled={pending || !de || !para || de === para}
            className="btn-primary text-sm"
          >
            {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true"/> : <ArrowRightLeft className="w-3.5 h-3.5" aria-hidden="true"/>}
            {t("equipe.carteiras_btn_transferir")}
          </button>
          {result !== null && (
            <span className="text-xs text-success-500 tabular-nums">
              <Check className="w-3.5 h-3.5 inline" aria-hidden="true"/> {t("equipe.carteiras_resultado").replace("{{n}}", String(result))}
            </span>
          )}
        </div>
      </div>

      {confirming && (
        <ConfirmDialog
          t={t}
          titulo={t("equipe.carteiras_btn_transferir")}
          descricao={t("equipe.carteiras_confirm")}
          confirmLabel={t("equipe.carteiras_btn_transferir")}
          danger
          onConfirm={executeTransfer}
          onCancel={() => setConfirming(false)}
        />
      )}
    </>
  );
}

/* ======================================================================== */
/*                            CONFIG TAB                                     */
/* ======================================================================== */

function ConfigTab({ config, t, onSucesso, onErro }: {
  config: OrgConfig; t: T;
  onSucesso: (m: string) => void;
  onErro: (e: unknown) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState(config);

  function handleSave() {
    startTransition(async () => {
      try {
        await atualizarConfigOrg(form);
        onSucesso(t("equipe.config_salvo"));
      } catch (e) { onErro(e); }
    });
  }

  return (
    <div className="card p-4 max-w-xl">
      <h3 className="font-semibold text-sm mb-3">{t("equipe.config_titulo")}</h3>

      <label className="flex items-start gap-2 mb-4 cursor-pointer">
        <input
          type="checkbox"
          checked={form.distribuicao_automatica}
          onChange={(e) => setForm(f => ({ ...f, distribuicao_automatica: e.target.checked }))}
          className="mt-0.5"
        />
        <div>
          <div className="font-medium text-sm">{t("equipe.config_ativar")}</div>
          <div className="text-xs text-muted-foreground">{t("equipe.config_ativar_desc")}</div>
        </div>
      </label>

      <div className="mb-4">
        <label className="label mb-1 block" htmlFor="cfg-strat">{t("equipe.config_estrategia")}</label>
        <select
          id="cfg-strat"
          value={form.distribuicao_estrategia}
          onChange={(e) => setForm(f => ({ ...f, distribuicao_estrategia: e.target.value as OrgConfig["distribuicao_estrategia"] }))}
          disabled={!form.distribuicao_automatica}
          className="input-base !text-sm w-full"
        >
          <option value="manual">{t("equipe.config_estrategia_manual")}</option>
          <option value="segmento">{t("equipe.config_estrategia_segmento")}</option>
          <option value="round_robin">{t("equipe.config_estrategia_round_robin")}</option>
        </select>
      </div>

      <button
        onClick={handleSave}
        disabled={pending}
        className="btn-primary text-sm"
      >
        {pending && <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true"/>}
        {t("equipe.config_salvar")}
      </button>
    </div>
  );
}
