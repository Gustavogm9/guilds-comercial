"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * Barra de progresso fina no topo durante navegação Next.js.
 *
 * Estratégia:
 *   - Quando pathname OU searchParams mudam, dispara um "fade" da barra.
 *   - A barra aparece imediatamente em qualquer click de Link / router.push.
 *   - Some quando a nova rota terminou de hidratar.
 *
 * Visual: fina (2px), accent primary, no top do viewport (z-[100]).
 *
 * Use no `app/(app)/layout.tsx` (e marketing layout) — globalmente.
 */
export default function NavigationProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [visible, setVisible] = useState(false);
  const [progress, setProgress] = useState(0);

  // Detecta navegação: quando pathname/searchParams mudam, anima
  useEffect(() => {
    setVisible(true);
    setProgress(15);

    const t1 = setTimeout(() => setProgress(45), 100);
    const t2 = setTimeout(() => setProgress(75), 300);
    const t3 = setTimeout(() => setProgress(95), 600);
    const t4 = setTimeout(() => {
      setProgress(100);
      setTimeout(() => {
        setVisible(false);
        setProgress(0);
      }, 200);
    }, 800);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
    };
  }, [pathname, searchParams]);

  return (
    <div
      aria-hidden
      className="fixed top-0 left-0 right-0 z-[100] pointer-events-none"
      style={{
        height: visible ? "2px" : "0",
        transition: "height 200ms",
      }}
    >
      <div
        className="h-full bg-primary"
        style={{
          width: `${progress}%`,
          transition: visible
            ? "width 200ms cubic-bezier(0.4, 0, 0.2, 1)"
            : "width 200ms ease-out",
          boxShadow: "0 0 8px hsl(var(--primary) / 0.6)",
          opacity: visible ? 1 : 0,
        }}
      />
    </div>
  );
}
