"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { onlyDigits } from "@/lib/utils/br-fiscal";

export async function updateProfile(formData: FormData) {
  const displayName = formData.get("display_name")?.toString().trim();
  const telefoneRaw = formData.get("telefone")?.toString() ?? "";
  const timezone = formData.get("timezone")?.toString() || null;

  if (!displayName || displayName.length < 2) {
    return { error: "Nome muito curto." };
  }

  const telefone = telefoneRaw ? onlyDigits(telefoneRaw) : null;
  if (telefone && (telefone.length < 10 || telefone.length > 11)) {
    return { error: "Telefone deve ter 10 ou 11 dígitos." };
  }

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado." };

  const { error } = await supabase
    .from("profiles")
    .update({
      display_name: displayName,
      telefone,
      timezone,
    })
    .eq("id", user.id);

  if (error) {
    console.error("Erro ao atualizar perfil:", error);
    return { error: "Falha ao salvar as configurações." };
  }

  revalidatePath("/configuracoes/perfil");
  revalidatePath("/", "layout");
  return { success: true };
}
