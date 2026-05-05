"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { onlyDigits } from "@/lib/utils/br-fiscal";

/**
 * Valida timezone IANA usando Intl.DateTimeFormat.
 * Throws no construtor se o tz é inválido — capturamos pra retornar erro amigável.
 */
function isTimezoneValido(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export async function updateProfile(formData: FormData) {
  const displayName = formData.get("display_name")?.toString().trim();
  const telefoneRaw = formData.get("telefone")?.toString() ?? "";
  const timezone = formData.get("timezone")?.toString() || null;

  // Bug: validação de tamanho
  if (!displayName || displayName.length < 2) {
    return { error: "Nome muito curto." };
  }
  if (displayName.length > 80) {
    return { error: "Nome muito longo (máx. 80 chars)." };
  }
  // Bug: previne caracteres de controle/quebras de linha em display_name
  if (/[\x00-\x1F\x7F]/.test(displayName)) {
    return { error: "Nome contém caracteres inválidos." };
  }

  const telefone = telefoneRaw ? onlyDigits(telefoneRaw) : null;
  if (telefone && (telefone.length < 10 || telefone.length > 11)) {
    return { error: "Telefone deve ter 10 ou 11 dígitos." };
  }

  // Bug: valida timezone IANA (evita strings arbitrárias quebrando Intl no client)
  if (timezone && !isTimezoneValido(timezone)) {
    return { error: "Timezone inválido." };
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
