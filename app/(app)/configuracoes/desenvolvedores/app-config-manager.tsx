"use client";

import { useState, useTransition } from "react";
import { Settings, Edit2, Check, X, Loader2, AlertCircle, Eye } from "lucide-react";
import { listarAppConfig, salvarAppConfig, type AppConfigEntry } from "./app-config-actions";

const KEY_LABELS: Record<string, { label: string; descricao: string }> = {
  cron_secret: {
    label: "CRON_SECRET",
    descricao: "Token compartilhado entre pg_cron (Supabase) e endpoints /api/cron/*. Mude se vazar.",
  },
  cron_email_url: {
    label: "URL: email-outbox",
    descricao: "Endpoint que processa fila de emails (Brevo) a cada 5 min.",
  },
  cron_push_url: {
    label: "URL: push-outbox",
    descricao: "Endpoint que processa fila de push notifications a cada 10 min.",
  },
  cron_push_flywheel_url: {
    label: "URL: push-flywheel-diario",
    descricao: "Endpoint que enfileira pushes do flywheel (health risco, renovação, expansão atrasada) às 09 UTC.",
  },
};

/**
 * Editor de cron secrets/URLs (tabela public.app_config).
 *
 * Lê via server action (service role). Apenas gestor da org acessa.
 * Mascara secrets — mostra apenas últimos 4 chars.
 */
export default function AppConfigManager() {
  const [entries, setEntries] = useState<AppConfigEntry[] | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [valorEdicao, setValorEdicao] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [carregando, setCarregando] = useState(false);

  async function carregar() {
    setCarregando(true);
    setErro(null);
    try {
      const r = await listarAppConfig();
      setEntries(r);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao carregar.");
    } finally {
      setCarregando(false);
    }
  }

  function iniciarEdicao(key: string) {
    setEditing(key);
    setValorEdicao("");
    setErro(null);
    setSucesso(null);
  }

  function cancelarEdicao() {
    setEditing(null);
    setValorEdicao("");
  }

  function salvar(key: string) {
    setErro(null);
    setSucesso(null);
    startTransition(async () => {
      const r = await salvarAppConfig({ key, value: valorEdicao });
      if (r.error) {
        setErro(r.error);
      } else {
        setSucesso(`${key} atualizado.`);
        setEditing(null);
        setValorEdicao("");
        carregar();
        setTimeout(() => setSucesso(null), 2500);
      }
    });
  }

  return (
    <div className="card p-6">
      <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary grid place-items-center shrink-0">
            <Settings className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">Configurações dos crons</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              URLs dos endpoints e secret compartilhado. Usado por pg_cron (Supabase) pra autenticar
              chamadas aos endpoints <code className="text-xs">/api/cron/*</code>.
            </p>
          </div>
        </div>
        {entries === null && (
          <button onClick={carregar} disabled={carregando} className="btn-secondary text-xs">
            {carregando && <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" />}
            {carregando ? "Carregando..." : "Mostrar configurações"}
          </button>
        )}
      </div>

      {erro && (
        <div role="alert" className="rounded-lg bg-destructive/10 border border-destructive/30 p-2.5 text-xs text-destructive flex items-center gap-1.5 mb-3">
          <AlertCircle className="w-3.5 h-3.5" aria-hidden="true" />
          {erro}
        </div>
      )}
      {sucesso && (
        <div className="rounded-lg bg-success-500/10 border border-success-500/30 p-2.5 text-xs text-success-500 flex items-center gap-1.5 mb-3">
          <Check className="w-3.5 h-3.5" aria-hidden="true" />
          {sucesso}
        </div>
      )}

      {entries && entries.length === 0 && (
        <p className="text-sm text-muted-foreground py-4 text-center italic">
          Nenhuma configuração registrada ainda.
        </p>
      )}

      {entries && entries.length > 0 && (
        <ul className="space-y-2">
          {entries.map((entry) => {
            const label = KEY_LABELS[entry.key]?.label ?? entry.key;
            const desc = KEY_LABELS[entry.key]?.descricao;
            const isEditing = editing === entry.key;
            return (
              <li
                key={entry.key}
                className="border border-border rounded-lg p-3 bg-background"
              >
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs font-semibold">{label}</span>
                      {entry.is_secret && (
                        <span className="text-[10px] uppercase tracking-[0.12em] font-semibold text-warning-500 bg-warning-500/10 border border-warning-500/30 px-1.5 py-0.5 rounded">
                          secret
                        </span>
                      )}
                      {!entry.preenchido && (
                        <span className="text-[10px] uppercase tracking-[0.12em] font-semibold text-destructive bg-destructive/10 border border-destructive/30 px-1.5 py-0.5 rounded">
                          vazio
                        </span>
                      )}
                    </div>
                    {desc && <p className="text-xs text-muted-foreground mt-1">{desc}</p>}
                    {!isEditing && entry.preenchido && (
                      <code className="block mt-2 text-xs text-foreground/80 font-mono break-all">
                        {entry.value_display}
                      </code>
                    )}
                  </div>
                  {!isEditing && (
                    <button
                      onClick={() => iniciarEdicao(entry.key)}
                      className="btn-ghost text-xs"
                      aria-label={`Editar ${label}`}
                    >
                      <Edit2 className="w-3 h-3" aria-hidden="true" />
                      {entry.preenchido ? "Editar" : "Configurar"}
                    </button>
                  )}
                </div>

                {isEditing && (
                  <div className="mt-3 space-y-2">
                    <input
                      type={entry.is_secret ? "password" : "text"}
                      value={valorEdicao}
                      onChange={(e) => setValorEdicao(e.target.value)}
                      placeholder={entry.is_secret ? "Cole o novo valor (escondido)" : "https://crm.guilds.com.br/api/cron/..."}
                      className="input-base text-sm font-mono"
                      autoFocus
                    />
                    <div className="flex items-center gap-2 justify-end">
                      <button onClick={cancelarEdicao} disabled={pending} className="btn-ghost text-xs">
                        <X className="w-3 h-3" aria-hidden="true" /> Cancelar
                      </button>
                      <button
                        onClick={() => salvar(entry.key)}
                        disabled={pending || !valorEdicao.trim()}
                        className="btn-primary text-xs"
                      >
                        {pending && <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" />}
                        Salvar
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {entries === null && !carregando && (
        <p className="text-xs text-muted-foreground/80 italic">
          Clique acima pra mostrar (carrega só sob demanda — secrets só ficam em memória do servidor).
        </p>
      )}
    </div>
  );
}
