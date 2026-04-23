"use server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ORG_ACTIVE_COOKIE } from "@/lib/supabase/org";

/** Troca a org ativa via cookie. Revalida tudo. */
export async function trocarOrg(organizacao_id: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  // Confere que o usuário é membro ativo dessa org antes de setar
  const { data: membro } = await supabase
    .from("membros_organizacao")
    .select("id")
    .eq("profile_id", user.id)
    .eq("organizacao_id", organizacao_id)
    .eq("ativo", true)
    .maybeSingle();

  if (!membro) return;

  cookies().set(ORG_ACTIVE_COOKIE, organizacao_id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });

  revalidatePath("/", "layout");
  redirect("/hoje");
}
