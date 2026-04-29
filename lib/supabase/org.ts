import { cookies } from "next/headers";
import { cache } from "react";
import { createClient, getCurrentProfile, getCurrentUser } from "./server";
import type { Organizacao, MembroEnriched } from "@/lib/types";

const ORG_COOKIE = "x-organizacao-ativa";

/**
 * Retorna todas as organizações em que o usuário logado é membro ativo,
 * já com role do usuário naquela org. Usado para popular o switcher do sidebar
 * e para validar a escolha da org ativa.
 *
 * Memoizado por request — getCurrentOrgId/getCurrentRole/sidebar costumam invocar
 * isso múltiplas vezes no mesmo render e cada chamada é round-trip ao Supabase.
 */
export const listarOrgsDoUsuario = cache(async (): Promise<
  Array<Organizacao & { role: "gestor" | "comercial" | "sdr" }>
> => {
  const user = await getCurrentUser();
  if (!user) return [];

  const supabase = createClient();
  const { data, error } = await supabase
    .from("membros_organizacao")
    .select("role, organizacao:organizacoes(*)")
    .eq("profile_id", user.id)
    .eq("ativo", true);

  if (error || !data) return [];

  // supabase retorna organizacao como objeto aninhado
  // Cast via `as any` necessário: o tipo inferido do Supabase é any[] mas o runtime retorna objeto
  return (data as any[])
    .map((row) => {
      const org = row.organizacao as Organizacao | null;
      return org
        ? { ...org, role: row.role as "gestor" | "comercial" | "sdr" }
        : null;
    })
    .filter(
      (x): x is Organizacao & { role: "gestor" | "comercial" | "sdr" } =>
        x !== null
    );
});

/**
 * Resolve a org "ativa" do usuário:
 *   1. Cookie x-organizacao-ativa (se válido e o usuário for membro)
 *   2. profiles.home_organizacao_id
 *   3. Primeira org em que é membro
 * Retorna null se não há nenhuma.
 */
export const getCurrentOrgId = cache(async (): Promise<string | null> => {
  const orgs = await listarOrgsDoUsuario();
  if (orgs.length === 0) return null;

  const cookieStore = cookies();
  const fromCookie = cookieStore.get(ORG_COOKIE)?.value;
  if (fromCookie && orgs.some((o) => o.id === fromCookie)) {
    return fromCookie;
  }

  const profile = await getCurrentProfile();
  const home = profile?.home_organizacao_id;
  if (home && orgs.some((o) => o.id === home)) return home;

  return orgs[0].id;
});

/**
 * Retorna a role efetiva do usuário na org ativa (gestor | comercial | sdr | null).
 */
export const getCurrentRole = cache(async (): Promise<
  "gestor" | "comercial" | "sdr" | null
> => {
  const orgId = await getCurrentOrgId();
  if (!orgId) return null;
  const orgs = await listarOrgsDoUsuario();
  return orgs.find((o) => o.id === orgId)?.role ?? null;
});

/**
 * Lista os membros (enriched com display_name + email) da org ativa.
 * Gestor vê todos; comercial/sdr também (são pares).
 */
export async function listarMembrosDaOrg(
  orgId: string
): Promise<MembroEnriched[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("membros_organizacao")
    .select(
      "id, organizacao_id, profile_id, role, ativo, created_at, profile:profiles(display_name, email)"
    )
    .eq("organizacao_id", orgId)
    .order("created_at", { ascending: true });

  if (error || !data) return [];

  return (data as any[]).map((row) => ({
    id: row.id,
    organizacao_id: row.organizacao_id,
    profile_id: row.profile_id,
    role: row.role as "gestor" | "comercial" | "sdr",
    ativo: row.ativo,
    created_at: row.created_at,
    display_name: row.profile?.display_name ?? "(sem nome)",
    email: row.profile?.email ?? "",
  }));
}

export const ORG_ACTIVE_COOKIE = ORG_COOKIE;
