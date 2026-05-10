"use client";

/**
 * TimelineRealtime — wrapper que adiciona atualização em tempo real
 * ao LeadTimeline360 via Supabase Realtime.
 *
 * Escuta INSERT na tabela lead_timeline para o lead atual e injeta
 * o novo evento no topo da lista sem recarregar a página.
 */

import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";

type TimelineEvento = {
  id: number;
  tipo: string;
  titulo: string | null;
  conteudo: string | null;
  resumo_ia: string | null;
  metadata: Record<string, any>;
  ref_id: number | null;
  ref_tabela: string | null;
  criado_por: string | null;
  created_at: string;
};

type Props = {
  leadId: number;
  orgId: string;
  onNovoEvento: (ev: TimelineEvento) => void;
};

/**
 * Componente headless: não renderiza nada, apenas assina o canal
 * Realtime e chama onNovoEvento quando um INSERT chega.
 *
 * Uso no LeadTimeline360:
 *   <TimelineRealtime leadId={leadId} orgId={orgId} onNovoEvento={prependEvento} />
 */
export default function TimelineRealtime({ leadId, orgId, onNovoEvento }: Props) {
  const cbRef = useRef(onNovoEvento);
  cbRef.current = onNovoEvento;

  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel(`lead_timeline_${leadId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "lead_timeline",
          filter: `lead_id=eq.${leadId}`,
        },
        (payload) => {
          const ev = payload.new as TimelineEvento;
          // Filtra pelo orgId por segurança adicional no cliente
          if ((ev as any).organizacao_id && (ev as any).organizacao_id !== orgId) return;
          cbRef.current(ev);
        }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          console.debug(`[timeline-realtime] lead ${leadId} subscribed`);
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [leadId, orgId]);

  // Componente headless
  return null;
}
