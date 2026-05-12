"use client";

import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";

/**
 * Banner discreto de instalação PWA.
 *
 * Regras de exibição (v2):
 *   - Mostra UMA vez por sessão (sessionStorage) — não aparece a cada navegação.
 *   - Se user clicar X, esconde por 30 dias (localStorage).
 *   - Se user só ignorar, esconde por 3 dias (cooldown leve).
 *   - Auto-esconde após 15s sem interação.
 *
 * Captura `beforeinstallprompt` (Chrome/Edge/Android). iOS Safari mostra hint
 * manual já que não dispara o evento.
 */

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISS_KEY      = "guilds-pwa-install-dismissed";  // X clicado
const COOLDOWN_KEY     = "guilds-pwa-install-cooldown";   // só ignorou
const SESSION_KEY      = "guilds-pwa-install-shown";      // já mostrou nessa sessão
const DISMISS_DAYS     = 30;
const COOLDOWN_DAYS    = 3;
const AUTO_HIDE_MS     = 15_000;

function inCooldown(): boolean {
  if (typeof window === "undefined") return true;

  // 1) Já mostrou nesta sessão? Não mostra de novo
  if (sessionStorage.getItem(SESSION_KEY)) return true;

  // 2) Dispensa explícita? 30 dias
  const d = localStorage.getItem(DISMISS_KEY);
  if (d) {
    const ts = parseInt(d, 10);
    if (!Number.isNaN(ts) && Date.now() - ts < DISMISS_DAYS * 86400_000) return true;
  }

  // 3) Cooldown leve? 3 dias
  const c = localStorage.getItem(COOLDOWN_KEY);
  if (c) {
    const ts = parseInt(c, 10);
    if (!Number.isNaN(ts) && Date.now() - ts < COOLDOWN_DAYS * 86400_000) return true;
  }

  return false;
}

function markShownSession() {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(SESSION_KEY, "1");
  // Cooldown leve também — pra ser conservador caso o user feche aba e abra de novo
  localStorage.setItem(COOLDOWN_KEY, String(Date.now()));
}

export default function InstallPrompt() {
  const [evt, setEvt] = useState<BeforeInstallPromptEvent | null>(null);
  const [iosHint, setIosHint] = useState(false);
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    // Handler verifica cooldown internamente pois o browser pode re-disparar
    // `beforeinstallprompt` após ações do usuário (ex: submit de formulário).
    const handler = (e: Event) => {
      e.preventDefault();
      // Guard duplo: re-checa cooldown no momento do disparo para evitar
      // que o banner reapareça após já ter sido exibido nesta sessão.
      if (inCooldown()) return;
      setEvt(e as BeforeInstallPromptEvent);
      setHidden(false);
      markShownSession();
    };
    window.addEventListener("beforeinstallprompt", handler);

    // iOS Safari: não dispara o evento, hint manual
    const ua = navigator.userAgent;
    const isIOS = /iPhone|iPad|iPod/.test(ua) && !/CriOS|FxiOS/.test(ua);
    const isStandalone = (navigator as any).standalone === true ||
      window.matchMedia("(display-mode: standalone)").matches;
    if (isIOS && !isStandalone && !inCooldown()) {
      setIosHint(true);
      setHidden(false);
      markShownSession();
    }

    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  // Auto-hide após 15s
  useEffect(() => {
    if (hidden) return;
    const timer = setTimeout(() => setHidden(true), AUTO_HIDE_MS);
    return () => clearTimeout(timer);
  }, [hidden]);

  function dismissPersistent() {
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
      dismissPersistent();
    }
  }

  if (hidden) return null;

  return (
    <div
      role="dialog"
      aria-label="Instalar como app"
      className="fixed bottom-20 md:bottom-4 left-4 right-4 md:left-auto md:right-4 md:max-w-sm card p-3 z-40 shadow-stripe-md flex items-start gap-3 animate-in fade-in slide-in-from-bottom-2"
    >
      <div
        className="w-10 h-10 rounded-lg bg-primary grid place-items-center text-primary-foreground font-semibold text-lg flex-shrink-0"
        style={{ boxShadow: "inset 0 1px 0 hsl(0 0% 100% / 0.18)" }}
      >
        G
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium" style={{ letterSpacing: "-0.13px" }}>Instalar Guilds Comercial</div>
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
        onClick={dismissPersistent}
        className="text-muted-foreground hover:text-foreground p-1 -m-1 flex-shrink-0"
        aria-label="Dispensar"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
