"use server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ORG_ACTIVE_COOKIE } from "@/lib/supabase/org";

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || `org-${Date.now()}`;
}

export async function criarNovaEmpresa(nome: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado");
  if (!nome.trim()) throw new Error("Informe o nome da empresa");

  // Tenta slug baseado no nome; fallback com timestamp se já existir
  let slug = slugify(nome);
  const { data: existing } = await supabase.from("organizacoes")
    .select("id").eq("slug", slug).maybeSingle();
  if (existing) slug = `${slug}-${Date.now().toString(36)}`;

  const { data: org, error } = await supabase.from("organizacoes").insert({
    nome: nome.trim(),
    slug,
    owner_id: user.id,
    ativa: true,
  }).select("id").single();
  if (error) throw error;

  // Adiciona o criador como gestor na nova org
  await supabase.from("membros_organizacao").insert({
    organizacao_id: org!.id,
    profile_id: user.id,
    role: "gestor",
    ativo: true,
  });

  // Config default
  await supabase.from("organizacao_config").insert({
    organizacao_id: org!.id,
    distribuicao_automatica: false,
    distribuicao_estrategia: "manual",
  });

  // Troca para a nova org
  cookies().set(ORG_ACTIVE_COOKIE, org!.id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });

  revalidatePath("/", "layout");
  redirect("/equipe");
}
