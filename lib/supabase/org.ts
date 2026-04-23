import { cookies } from "next/headers";
import { createClient } from "./server";
import type { Organizacao, MembroEnriched, Profile } from "@/lib/types";

const ORG_COOKIE = "x-organizacao-ativa";

/**
 * Retorna todas as organizações em que o usuário logado é membro ativo,
 * já com role do usuário naquela org. Usado para popular o switcher do sidebar
 * e para validar a escolha da org ativa.
 */
export async function listarOrgsDoUsuario(): Promise<
  Array<Organizacao & { role: "gestor" | "comercial" | "sdr" }>
> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("membros_organizacao")
    .select("role, organizacao:organizacoes(*)")
    .eq("profile_id", user.id)
    .eq("ativo", true);

  if (error || !data) return [];

  // supabase retorna organizacao como objeto aninhado
  return data
    .map((row: { role: string; organizacao: Organizacao | null }) =>
      row.organizacao
        ? { ...row.organizacao, role: row.role as "gestor" | "comercial" | "sdr" }
        : null
    )
    .filter(
      (
        x
      ): x is Organizacao & { role: "gestor" | "comercial" | "sdr" } => x !== null
    );
}

/**
 * Resolve a org "ativa" do usuário:
 *   1. Cookie x-organizacao-ativa (se válido e o usuário for membro)
 *   2. profiles.home_organizacao_id
 *   3. Primeira org em que é membro
 * Retorna null se não há nenhuma.
 */
export async function getCurrentOrgId(): Promise<string | null> {
  const orgs = await listarOrgsDoUsuario();
  if (orgs.length === 0) return null;

  const cookieStore = cookies();
  const fromCookie = cookieStore.get(ORG_COOKIE)?.value;
  if (fromCookie && orgs.some((o) => o.id === fromCookie)) {
    return fromCookie;
  }

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("home_organizacao_id")
      .eq("id", user.id)
      .single();
    const home = (profile as Pick<Profile, "home_organizacao_id"> | null)
      ?.home_organizacao_id;
    if (home && orgs.some((o) => o.id === home)) return home;
  }

  return orgs[0].id;
}

/**
 * Retorna a role efetiva do usuário na org ativa (gestor | comercial | sdr | null).
 */
export async function getCurrentRole(): Promise<
  "gestor" | "comercial" | "sdr" | null
> {
  const orgId = await getCurrentOrgId();
  if (!orgId) return null;
  const orgs = await listarOrgsDoUsuario();
  return orgs.find((o) => o.id === orgId)?.role ?? null;
}

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

  return data.map(
    (row: {
      id: number;
      organizacao_id: string;
      profile_id: string;
      role: string;
      ativo: boolean;
      created_at: string;
      profile: { display_name: string; email: string } | null;
    }) => ({
      id: row.id,
      organizacao_id: row.organizacao_id,
      profile_id: row.profile_id,
      role: row.role as "gestor" | "comercial" | "sdr",
      ativo: row.ativo,
      created_at: row.created_at,
      display_name: row.profile?.display_name ?? "(sem nome)",
      email: row.profile?.email ?? "",
    })
  );
}

export const ORG_ACTIVE_COOKIE = ORG_COOKIE;
