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
  const nomeT = nome.trim();
  if (!nomeT) throw new Error("Informe o nome da empresa");
  if (nomeT.length < 2 || nomeT.length > 120) {
    throw new Error("Nome da empresa deve ter entre 2 e 120 caracteres.");
  }
  if (/[\x00-\x1F\x7F]/.test(nomeT)) {
    throw new Error("Nome contém caracteres inválidos.");
  }

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado");

  // Tenta slug baseado no nome; fallback com timestamp se já existir
  let slug = slugify(nomeT);
  const { data: existing } = await supabase.from("organizacoes")
    .select("id").eq("slug", slug).maybeSingle();
  if (existing) slug = `${slug}-${Date.now().toString(36)}`;

  let org: { id: string } | null = null;
  // Race-safe: se outro request inseriu o mesmo slug entre check e insert,
  // pega unique violation (23505) e tenta com sufixo timestamp.
  const insertPayload = { nome: nomeT, slug, owner_id: user.id, ativa: true };
  const { data, error } = await supabase.from("organizacoes").insert(insertPayload).select("id").single();
  if (error) {
    if (error.code === "23505") {
      const slugRetry = `${slug}-${Date.now().toString(36)}`;
      const { data: d2, error: e2 } = await supabase.from("organizacoes")
        .insert({ ...insertPayload, slug: slugRetry }).select("id").single();
      if (e2) throw e2;
      org = d2;
    } else {
      throw error;
    }
  } else {
    org = data;
  }

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
  (await cookies()).set(ORG_ACTIVE_COOKIE, org!.id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });

  revalidatePath("/", "layout");
  redirect("/equipe");
}
