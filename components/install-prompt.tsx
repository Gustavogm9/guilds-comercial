"use client";

import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";

/**
 * Banner discreto de instalação PWA.
 *
 * Captura o evento `beforeinstallprompt` (Chrome/Edge/Android), guarda
 * referência e mostra um botão. Quando o user clica, dispara o prompt nativo.
 * Esconde por 30 dias se dispensado (localStorage).
 *
 * iOS não dispara `beforeinstallprompt` — mostra hint manual ("Adicionar
 * à tela inicial via menu Compartilhar") só no primeiro carregamento Safari
 * em mobile, dispensável.
 */

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISS_KEY = "guilds-pwa-install-dismissed";
const DISMISS_DAYS = 30;

function dismissed(): boolean {
  if (typeof window === "undefined") return true;
  const v = localStorage.getItem(DISMISS_KEY);
  if (!v) return false;
  const ts = parseInt(v, 10);
  if (Number.isNaN(ts)) return false;
  return Date.now() - ts < DISMISS_DAYS * 86400_000;
}

export default function InstallPrompt() {
  const [evt, setEvt] = useState<BeforeInstallPromptEvent | null>(null);
  const [iosHint, setIosHint] = useState(false);
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    if (dismissed()) return;

    const handler = (e: Event) => {
      e.preventDefault();
      setEvt(e as BeforeInstallPromptEvent);
      setHidden(false);
    };
    window.addEventListener("beforeinstallprompt", handler);

    // iOS Safari: não dispara o evento, mas é o caso mais comum em mobile BR
    const ua = navigator.userAgent;
    const isIOS = /iPhone|iPad|iPod/.test(ua) && !/CriOS|FxiOS/.test(ua);
    const isStandalone = (navigator as any).standalone === true ||
      window.matchMedia("(display-mode: standalone)").matches;
    if (isIOS && !isStandalone) {
      setIosHint(true);
      setHidden(false);
    }

    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setHidden(true);
  }

  async function install() {
    if (!evt) return;
    await evt.prompt();
    const choice = await evt.userChoice;
    if (choice.outcome === "accepted") {
      setHidden(true);
    } else {
      dismiss();
    }
  }

  if (hidden) return null;

  return (
    <div
      role="dialog"
      aria-label="Instalar como app"
      className="fixed bottom-20 md:bottom-4 left-4 right-4 md:left-auto md:right-4 md:max-w-sm card p-3 z-40 shadow-lg flex items-start gap-3 animate-in fade-in slide-in-from-bottom-2"
    >
      <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary to-primary/80 grid place-items-center text-primary-foreground font-bold text-lg flex-shrink-0">
        G
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium">Instalar Guilds Comercial</div>
        {iosHint ? (
          <p className="text-xs text-muted-foreground mt-0.5">
            Toque em <strong>Compartilhar</strong> e depois <strong>Adicionar à tela inicial</strong>.
          </p>
        ) : (
          <p className="text-xs text-muted-foreground mt-0.5">
            Acesso rápido pelo celular ou desktop, com push de cadência.
          </p>
        )}
        {!iosHint && (
          <button onClick={install} className="btn-primary text-xs mt-2 py-1 px-3">
            <Download className="w-3 h-3" /> Instalar
          </button>
        )}
      </div>
      <button
        onClick={dismiss}
        className="text-muted-foreground hover:text-foreground p-1 -m-1 flex-shrink-0"
        aria-label="Dispensar"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
