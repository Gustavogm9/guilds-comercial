import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { ORG_ACTIVE_COOKIE } from "@/lib/supabase/org";

/**
 * Fluxo de aceitação de convite:
 *
 *   GET /api/convite/{token}
 *
 * 1. Valida token (existe, não expirou, não foi aceito)
 * 2. Se o usuário NÃO está logado → redireciona para /login?next=/api/convite/{token}
 * 3. Se está logado:
 *    - confere que o email do usuário bate com o email do convite
 *    - cria membros_organizacao (ou reativa se já existe)
 *    - marca convite.aceito_em = now()
 *    - define home_organizacao_id se o profile ainda não tem
 *    - seta cookie da org ativa
 *    - redireciona para /hoje
 */
export async function GET(req: NextRequest, props: { params: Promise<{ token: string }> }) {
  const params = await props.params;
  const supabase = createClient();
  const token = params.token;

  const { data: convite } = await supabase.from("convites")
    .select("*")
    .eq("token", token)
    .maybeSingle();

  if (!convite) {
    return NextResponse.redirect(new URL("/login?erro=convite_invalido", req.url));
  }
  if (convite.aceito_em) {
    return NextResponse.redirect(new URL("/login?erro=convite_ja_aceito", req.url));
  }
  if (new Date(convite.expira_em) < new Date()) {
    return NextResponse.redirect(new URL("/login?erro=convite_expirado", req.url));
  }

  const { data: { user } } = await supabase.auth.getUser();

  // Bug fix: se a pessoa NÃO tem conta (cenário típico — foi convidada por email),
  // redireciona pra página de aceitar-convite que faz signup + aceita o convite
  // num só fluxo. Antes redirecionava pra /login, mas a pessoa não tinha senha
  // pra entrar — ficava travada.
  if (!user) {
    // Verifica se já existe conta nesse email (pessoa já existe em outra org)
    const supabaseAdminCheck = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
    const { data: contaExistente } = await supabaseAdminCheck
      .from("profiles")
      .select("id")
      .eq("email", convite.email.toLowerCase())
      .maybeSingle();

    if (contaExistente) {
      // Pessoa já tem conta — pede só o login
      return NextResponse.redirect(
        new URL(
          `/login?next=${encodeURIComponent(`/api/convite/${token}`)}&email=${encodeURIComponent(convite.email)}`,
          req.url,
        ),
      );
    }
    // Pessoa nova — fluxo de signup via convite
    return NextResponse.redirect(new URL(`/aceitar-convite/${token}`, req.url));
  }

  if (user.email?.toLowerCase() !== convite.email.toLowerCase()) {
    return NextResponse.redirect(new URL("/login?erro=email_nao_confere", req.url));
  }

  const supabaseAdmin = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Cria ou reativa membro na org
  await supabaseAdmin.from("membros_organizacao").upsert({
    organizacao_id: convite.organizacao_id,
    profile_id: user.id,
    role: convite.role,
    ativo: true,
  }, { onConflict: "organizacao_id,profile_id" });

  // Marca convite aceito
  await supabaseAdmin.from("convites")
    .update({ aceito_em: new Date().toISOString() })
    .eq("id", convite.id);

  // Define home_organizacao_id se ainda não tem
  const { data: profile } = await supabaseAdmin.from("profiles")
    .select("home_organizacao_id")
    .eq("id", user.id)
    .maybeSingle();
  if (profile && !profile.home_organizacao_id) {
    await supabaseAdmin.from("profiles")
      .update({ home_organizacao_id: convite.organizacao_id })
      .eq("id", user.id);
  }

  // Seta cookie da org ativa
  (await cookies()).set(ORG_ACTIVE_COOKIE, convite.organizacao_id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });

  return NextResponse.redirect(new URL("/hoje", req.url));
}
