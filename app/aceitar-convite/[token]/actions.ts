"use server";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { ORG_ACTIVE_COOKIE } from "@/lib/supabase/org";

/**
 * Server action que finaliza o signup via convite.
 *
 * Fluxo:
 *   1. Re-valida token (existe, não expirou, não foi aceito)
 *   2. Cria conta no Supabase Auth com email do convite + senha escolhida
 *      (auto-confirm via service role — evita exigir confirmação por email,
 *       já que o convite POR email já é a prova de posse)
 *   3. Cria profile + adiciona em membros_organizacao + marca convite aceito
 *   4. Loga na sessão (cria cookie via @supabase/ssr)
 *   5. Seta cookie da org ativa
 *   6. Retorna { ok: true, redirect: "/hoje" }
 */
export async function aceitarConviteSignup(input: {
  token: string;
  nome: string;
  password: string;
}): Promise<{ ok: true; redirect: string } | { ok: false; erro: string }> {
  if (!input.token || !input.nome.trim() || !input.password) {
    return { ok: false, erro: "Dados incompletos." };
  }
  if (input.password.length < 6) {
    return { ok: false, erro: "Senha precisa ter no mínimo 6 caracteres." };
  }
  if (input.nome.trim().length < 2) {
    return { ok: false, erro: "Nome precisa ter pelo menos 2 caracteres." };
  }

  const supabaseAdmin = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // 1. Re-valida convite
  const { data: convite } = await supabaseAdmin
    .from("convites")
    .select("*")
    .eq("token", input.token)
    .maybeSingle();
  if (!convite) return { ok: false, erro: "Convite inválido." };
  if (convite.aceito_em) return { ok: false, erro: "Este convite já foi aceito." };
  if (new Date(convite.expira_em) < new Date()) {
    return { ok: false, erro: "Convite expirado. Peça um novo ao gestor." };
  }

  // 2. Verifica se já existe conta com este email
  const { data: profileExistente } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("email", convite.email.toLowerCase())
    .maybeSingle();

  if (profileExistente) {
    return {
      ok: false,
      erro: "Já existe uma conta com este email. Use 'Já tenho conta — entrar' abaixo.",
    };
  }

  // 3. Cria conta no Supabase Auth (auto-confirmed via service role)
  const { data: createData, error: createErr } = await supabaseAdmin.auth.admin.createUser({
    email: convite.email.toLowerCase(),
    password: input.password,
    email_confirm: true, // pula confirmação por email — o convite já é a prova
    user_metadata: {
      full_name: input.nome.trim(),
    },
  });

  if (createErr || !createData.user) {
    return { ok: false, erro: createErr?.message ?? "Falha ao criar conta." };
  }

  const userId = createData.user.id;

  // 4. Cria profile + membros_organizacao + marca convite aceito (em paralelo)
  await supabaseAdmin.from("profiles").insert({
    id: userId,
    email: convite.email.toLowerCase(),
    display_name: input.nome.trim(),
    role: convite.role,
    home_organizacao_id: convite.organizacao_id,
  });

  await supabaseAdmin.from("membros_organizacao").upsert(
    {
      organizacao_id: convite.organizacao_id,
      profile_id: userId,
      role: convite.role,
      ativo: true,
    },
    { onConflict: "organizacao_id,profile_id" },
  );

  await supabaseAdmin
    .from("convites")
    .update({ aceito_em: new Date().toISOString() })
    .eq("id", convite.id);

  // 5. Faz signin pra criar a sessão (cookies)
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) { return cookieStore.get(name)?.value; },
        set(name: string, value: string, options: CookieOptions) {
          cookieStore.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          cookieStore.delete({ name, ...options });
        },
      },
    },
  );

  const { error: signinErr } = await supabase.auth.signInWithPassword({
    email: convite.email.toLowerCase(),
    password: input.password,
  });
  if (signinErr) {
    return { ok: false, erro: "Conta criada, mas falha ao logar. Tente entrar manualmente." };
  }

  // 6. Cookie de org ativa
  cookieStore.set(ORG_ACTIVE_COOKIE, convite.organizacao_id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });

  return { ok: true, redirect: "/hoje" };
}

/**
 * Busca dados públicos do convite (email, role, nome da org) pra renderizar
 * a página /aceitar-convite/[token]. Não retorna nada sensível.
 */
export async function buscarConvitePublico(token: string): Promise<
  | { ok: true; email: string; role: string; orgNome: string; expiraEm: string }
  | { ok: false; erro: string }
> {
  const supabaseAdmin = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: convite } = await supabaseAdmin
    .from("convites")
    .select("email, role, expira_em, aceito_em, organizacao:organizacoes(nome)")
    .eq("token", token)
    .maybeSingle();

  if (!convite) return { ok: false, erro: "Convite inválido." };
  if (convite.aceito_em) return { ok: false, erro: "Este convite já foi aceito." };
  if (new Date(convite.expira_em) < new Date()) {
    return { ok: false, erro: "Convite expirado. Peça um novo ao gestor." };
  }

  const orgNome = (convite.organizacao as any)?.nome ?? "(sem nome)";
  return {
    ok: true,
    email: convite.email,
    role: convite.role,
    orgNome,
    expiraEm: convite.expira_em,
  };
}
