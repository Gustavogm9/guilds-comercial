"use server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/supabase/org";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

export async function iniciarImpersonificacao(targetUserId: string) {
  const supabase = createClient();
  const orgId = await getCurrentOrgId();
  if (!orgId) throw new Error("Sem organização ativa");

  // Precisamos recuperar o user original. 
  // O getCurrentUser() pode estar interceptado! 
  // Entao pegamos a sessao crua ignorando a interceptação (pois criamos o patch acima).
  // Na verdade, the patch in server.ts returns res.data.user with _real_admin_id se estiver impersonando.
  // Mas se não estiver, user.id é o real.
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado");

  const adminId = (user as any)._real_admin_id || user.id;

  // Verifica se o adminId é gestor na orgId
  const { data: membroAdmin } = await supabase
    .from("membros_organizacao")
    .select("role")
    .eq("organizacao_id", orgId)
    .eq("profile_id", adminId)
    .maybeSingle();

  if (membroAdmin?.role !== "gestor") {
    throw new Error("Apenas gestores podem usar impersonificação.");
  }

  // Verifica se o alvo pertence à organização (por seguranca)
  const { data: membroAlvo } = await supabase
    .from("membros_organizacao")
    .select("id")
    .eq("organizacao_id", orgId)
    .eq("profile_id", targetUserId)
    .maybeSingle();

  if (!membroAlvo) {
    throw new Error("Usuário alvo não pertence à esta organização.");
  }

  // Salva no banco o inicio da sessao de impersonificação
  await supabase.from("impersonation_logs").insert({
    organizacao_id: orgId,
    admin_id: adminId,
    target_user_id: targetUserId,
    action_type: "start"
  });

  // Define o cookie (1 hora de duração, igual no psych-harmony)
  const cookieStore = await cookies();
  cookieStore.set("x-impersonate-user", targetUserId, {
    maxAge: 60 * 60,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    sameSite: "lax",
  });

  revalidatePath("/", "layout");
}

export async function encerrarImpersonificacao() {
  const supabase = createClient();
  const orgId = await getCurrentOrgId();
  if (!orgId) throw new Error("Sem organização ativa");

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado");

  const adminId = (user as any)._real_admin_id || user.id;
  const targetUserId = (user as any)._is_impersonated ? user.id : null;

  if (targetUserId) {
    await supabase.from("impersonation_logs").insert({
      organizacao_id: orgId,
      admin_id: adminId,
      target_user_id: targetUserId,
      action_type: "end"
    });
  }

  const cookieStore = await cookies();
  cookieStore.delete("x-impersonate-user");
  
  revalidatePath("/", "layout");
}
