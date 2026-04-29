"use client";

import { useEffect, useState, useTransition } from "react";
import { Bell, BellOff, AlertCircle, Check } from "lucide-react";
import { savePushPreferences } from "@/app/(app)/configuracoes/perfil/push-actions";
import { FUSOS_BRASIL } from "@/lib/utils/br-fiscal";

export type PushEvento = "cadencia_vencendo" | "resumo_diario" | "lead_fechado_proposta" | "lead_reabriu";

const EVENTO_LABEL: Record<PushEvento, { label: string; descricao: string }> = {
  cadencia_vencendo: {
    label: "Cadência vencendo",
    descricao: "Avisa 1h antes de uma cadência D7/D11 vencer.",
  },
  lead_reabriu: {
    label: "Lead reabriu conversa",
    descricao: "Lead clicou link, respondeu mensagem ou voltou a interagir.",
  },
  resumo_diario: {
    label: "Resumo diário (19h)",
    descricao: "Sumário do dia + foco para amanhã.",
  },
  lead_fechado_proposta: {
    label: "Proposta aceita / lead fechado",
    descricao: "Quando uma proposta vira ganho ou perda.",
  },
};

const TODOS_EVENTOS: PushEvento[] = [
  "cadencia_vencendo",
  "lead_reabriu",
  "resumo_diario",
  "lead_fechado_proposta",
];

interface Props {
  initialPrefs: {
    ativo: boolean;
    eventos: PushEvento[];
    janela_inicio: string;
    janela_fim: string;
    fuso_horario: string;
  } | null;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

export default function PushNotificationsToggle({ initialPrefs }: Props) {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [hasSubscription, setHasSubscription] = useState<boolean>(false);

  const [ativo, setAtivo] = useState(initialPrefs?.ativo ?? true);
  const [eventos, setEventos] = useState<PushEvento[]>(initialPrefs?.eventos ?? TODOS_EVENTOS);
  const [janelaInicio, setJanelaInicio] = useState(initialPrefs?.janela_inicio.slice(0, 5) ?? "08:00");
  const [janelaFim, setJanelaFim] = useState(initialPrefs?.janela_fim.slice(0, 5) ?? "20:00");
  const [fuso, setFuso] = useState(initialPrefs?.fuso_horario ?? "America/Sao_Paulo");

  const [isPending, startTransition] = useTransition();
  const [salvouRecente, setSalvouRecente] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  // Detectar suporte e estado atual
  useEffect(() => {
    const ok = typeof window !== "undefined" && "Notification" in window && "serviceWorker" in navigator && "PushManager" in window;
    setSupported(ok);
    if (!ok) return;

    setPermission(Notification.permission);

    navigator.serviceWorker.ready.then(async (reg) => {
      const sub = await reg.pushManager.getSubscription();
      setHasSubscription(!!sub);
    });
  }, []);

  async function ativarPush() {
    setStatusMsg(null);
    if (!("Notification" in window)) return;

    let perm = Notification.permission;
    if (perm === "default") {
      perm = await Notification.requestPermission();
      setPermission(perm);
    }
    if (perm !== "granted") {
      setStatusMsg("Permissão negada pelo navegador. Habilite nas configurações do browser.");
      return;
    }

    try {
      const reg = await navigator.serviceWorker.ready;
      // Pega VAPID pública
      const r = await fetch("/api/push/vapid-public-key");
      const { key } = await r.json();
      if (!key) throw new Error("VAPID não configurado");

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key) as BufferSource,
      });

      const json = sub.toJSON();
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: json.endpoint,
          keys: json.keys,
          user_agent: navigator.userAgent,
        }),
      });
      if (!res.ok) throw new Error(`subscribe falhou (${res.status})`);

      setHasSubscription(true);
      setStatusMsg("Push ativado neste dispositivo.");
    } catch (e: any) {
      setStatusMsg(`Erro: ${e?.message ?? e}`);
    }
  }

  async function desativarPush() {
    setStatusMsg(null);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/unsubscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setHasSubscription(false);
      setStatusMsg("Push desativado neste dispositivo.");
    } catch (e: any) {
      setStatusMsg(`Erro ao desativar: ${e?.message ?? e}`);
    }
  }

  function toggleEvento(ev: PushEvento) {
    setEventos((cur) => (cur.includes(ev) ? cur.filter((e) => e !== ev) : [...cur, ev]));
  }

  function salvarPrefs() {
    startTransition(async () => {
      const res = await savePushPreferences({
        ativo,
        eventos,
        janela_inicio: janelaInicio,
        janela_fim: janelaFim,
        fuso_horario: fuso,
      });
      if (res.error) {
        setStatusMsg(res.error);
      } else {
        setSalvouRecente(true);
        setTimeout(() => setSalvouRecente(false), 2500);
      }
    });
  }

  if (supported === null) return null;

  if (!supported) {
    return (
      <div className="text-sm text-muted-foreground flex items-center gap-2 p-3 bg-muted/30 rounded-lg border border-border">
        <AlertCircle className="w-4 h-4 flex-shrink-0" />
        Seu navegador não suporta push notifications. Atualize ou troque para Chrome/Edge/Firefox.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Status atual + ativar/desativar */}
      <div className="flex items-start gap-3 pb-4 border-b border-border/50">
        <div className="flex-shrink-0 w-10 h-10 rounded-lg grid place-items-center bg-primary/10 text-primary">
          {hasSubscription ? <Bell className="w-5 h-5" /> : <BellOff className="w-5 h-5" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-foreground">
            {hasSubscription ? "Push ativado neste dispositivo" : "Push desativado neste dispositivo"}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {permission === "denied"
              ? "Permissão bloqueada pelo navegador. Ajuste nas preferências do site."
              : "Notificações chegam mesmo com a aba fechada."}
          </p>
        </div>
        {hasSubscription ? (
          <button onClick={desativarPush} className="btn-secondary text-xs">
            Desativar aqui
          </button>
        ) : (
          <button
            onClick={ativarPush}
            disabled={permission === "denied"}
            className="btn-primary text-xs"
          >
            Ativar aqui
          </button>
        )}
      </div>

      {/* Toggle global ativo/inativo */}
      <label className="flex items-start gap-3 p-3 rounded-lg border border-border cursor-pointer hover:bg-muted/30">
        <input
          type="checkbox"
          checked={ativo}
          onChange={(e) => setAtivo(e.target.checked)}
          className="mt-1 w-4 h-4 text-primary rounded"
        />
        <div className="flex-1">
          <div className="text-sm font-medium text-foreground">Receber notificações</div>
          <div className="text-xs text-muted-foreground mt-0.5">
            Desligue para pausar todos os tipos sem perder a configuração.
          </div>
        </div>
      </label>

      {/* Opt-in granular */}
      <fieldset className="space-y-2">
        <legend className="text-xs uppercase tracking-wider font-semibold text-muted-foreground mb-2">
          Tipos de notificação
        </legend>
        {TODOS_EVENTOS.map((ev) => (
          <label
            key={ev}
            className={`flex items-start gap-3 p-3 rounded-lg border border-border cursor-pointer hover:bg-muted/30 ${ativo ? "" : "opacity-50"}`}
          >
            <input
              type="checkbox"
              checked={eventos.includes(ev)}
              onChange={() => toggleEvento(ev)}
              disabled={!ativo}
              className="mt-1 w-4 h-4 text-primary rounded"
            />
            <div className="flex-1">
              <div className="text-sm font-medium text-foreground">{EVENTO_LABEL[ev].label}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{EVENTO_LABEL[ev].descricao}</div>
            </div>
          </label>
        ))}
      </fieldset>

      {/* Janela horário */}
      <fieldset className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <legend className="text-xs uppercase tracking-wider font-semibold text-muted-foreground mb-2 col-span-full">
          Janela de horário (não incomodar fora dela)
        </legend>
        <div>
          <label htmlFor="janelaInicio" className="block text-xs text-muted-foreground mb-1">A partir de</label>
          <input
            id="janelaInicio"
            type="time"
            value={janelaInicio}
            onChange={(e) => setJanelaInicio(e.target.value)}
            disabled={!ativo}
            className="input-base w-full"
          />
        </div>
        <div>
          <label htmlFor="janelaFim" className="block text-xs text-muted-foreground mb-1">Até</label>
          <input
            id="janelaFim"
            type="time"
            value={janelaFim}
            onChange={(e) => setJanelaFim(e.target.value)}
            disabled={!ativo}
            className="input-base w-full"
          />
        </div>
        <div>
          <label htmlFor="pushFuso" className="block text-xs text-muted-foreground mb-1">Fuso</label>
          <select
            id="pushFuso"
            value={fuso}
            onChange={(e) => setFuso(e.target.value)}
            disabled={!ativo}
            className="input-base w-full"
          >
            {FUSOS_BRASIL.map((tz) => (
              <option key={tz.value} value={tz.value}>{tz.label}</option>
            ))}
          </select>
        </div>
      </fieldset>

      {statusMsg && (
        <div className="text-xs text-muted-foreground bg-muted/40 border border-border rounded p-2">
          {statusMsg}
        </div>
      )}

      <div className="flex justify-end items-center gap-3 pt-2 border-t border-border/50">
        {salvouRecente && (
          <span className="text-sm text-success-500 flex items-center gap-1">
            <Check className="w-4 h-4" /> Salvo
          </span>
        )}
        <button onClick={salvarPrefs} disabled={isPending} className="btn-primary min-w-[120px]">
          {isPending ? "Salvando..." : "Salvar Preferências"}
        </button>
      </div>
    </div>
  );
}
