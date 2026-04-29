"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

const EVENTOS_VALIDOS = ["cadencia_vencendo", "resumo_diario", "lead_fechado_proposta", "lead_reabriu"] as const;

interface PushPrefsInput {
  ativo: boolean;
  eventos: string[];
  janela_inicio: string; // HH:MM
  janela_fim: string;
  fuso_horario: string;
}

function isHHMM(s: string): boolean {
  return /^\d{2}:\d{2}$/.test(s);
}

export async function savePushPreferences(input: PushPrefsInput) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado." };

  if (!isHHMM(input.janela_inicio) || !isHHMM(input.janela_fim)) {
    return { error: "Horário em formato inválido (use HH:MM)." };
  }
  if (input.janela_inicio === input.janela_fim) {
    return { error: "Janela de início e fim não podem ser iguais." };
  }

  const eventosFiltrados = (input.eventos ?? [])
    .filter((e) => (EVENTOS_VALIDOS as readonly string[]).includes(e));

  const { error } = await supabase
    .from("notification_preferences")
    .upsert(
      {
        profile_id: user.id,
        ativo: input.ativo,
        eventos: eventosFiltrados,
        janela_inicio: input.janela_inicio + ":00",
        janela_fim: input.janela_fim + ":00",
        fuso_horario: input.fuso_horario,
      },
      { onConflict: "profile_id" }
    );

  if (error) {
    console.error("[push prefs upsert]", error);
    return { error: "Falha ao salvar preferências." };
  }

  revalidatePath("/configuracoes/perfil");
  return { success: true };
}
