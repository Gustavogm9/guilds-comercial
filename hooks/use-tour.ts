"use client";

/**
 * useTour — controla a visibilidade de tours contextuais por módulo.
 *
 * Persiste via localStorage: "guilds-tour-{modulo}-{userId}".
 * Dismiss permanente: não aparece mais ao revisitar o módulo.
 *
 * Uso:
 *   const { visible, dismiss } = useTour("pipeline", userId);
 *   if (visible) return <TourTooltip ... onDismiss={dismiss} />;
 */

import { useState, useEffect } from "react";

export function useTour(modulo: string, userId: string) {
  const key = `guilds-tour-${modulo}-${userId}`;
  // Começa oculto até hidratar (evita flash)
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      const dismissed = localStorage.getItem(key) === "1";
      if (!dismissed) setVisible(true);
    } catch {
      // se localStorage não disponível, não exibe tour
    }
  }, [key]);

  function dismiss() {
    try {
      localStorage.setItem(key, "1");
    } catch { /* ignora */ }
    setVisible(false);
  }

  return { visible, dismiss };
}
