"use client";
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Subscriber Supabase Realtime no /hoje.
 *
 * Inscreve nas tabelas que alimentam os alertas e dispara router.refresh()
 * (debounced 800ms) quando algo muda dentro da org do user.
 *
 * Tabelas observadas:
 *   - leads             → urgência, dias sem tocar, próxima ação
 *   - pedidos_indicacao → pedidos pendentes pós-fechamento
 *   - nps_responses     → NPS recém-respondido (detrator vira alerta)
 *   - expansoes         → expansões com data_prevista atrasada
 *   - onboardings       → onboarding atrasados
 *
 * Heurística: refresh em qualquer event na org. RLS já garante que só
 * recebemos eventos da org corrente. Debounce evita refresh-storm quando
 * múltiplas mudanças chegam em sequência (ex.: batch de update).
 */
export default function HojeRealtimeRefresher({ orgId }: { orgId: string }) {
  const router = useRouter();
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!orgId) return;
    const sb = createClient();

    function scheduleRefresh() {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      refreshTimer.current = setTimeout(() => {
        router.refresh();
      }, 800);
    }

    const channel = sb
      .channel(`hoje-realtime-${orgId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "leads", filter: `organizacao_id=eq.${orgId}` },
        scheduleRefresh,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "pedidos_indicacao", filter: `organizacao_id=eq.${orgId}` },
        scheduleRefresh,
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "nps_responses", filter: `organizacao_id=eq.${orgId}` },
        scheduleRefresh,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "expansoes", filter: `organizacao_id=eq.${orgId}` },
        scheduleRefresh,
      )
      .subscribe();

    return () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      sb.removeChannel(channel);
    };
  }, [orgId, router]);

  return null;
}
