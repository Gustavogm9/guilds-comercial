import { NextResponse, type NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { getBillingAccessState } from "@/lib/billing";

/**
 * Proxy do Next 16 — substitui o file convention `middleware.ts` (deprecado).
 * Next 16+ chama esta função de `proxy.ts` na raiz do projeto pra rotear
 * requests antes do RSC render. Comportamento e API são iguais ao middleware
 * de versões anteriores.
 */
export async function proxy(req: NextRequest) {
  let res = NextResponse.next({ request: { headers: req.headers } });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(n: string) { return req.cookies.get(n)?.value; },
        set(n: string, v: string, o: CookieOptions) {
          req.cookies.set({ name: n, value: v, ...o });
          res = NextResponse.next({ request: { headers: req.headers } });
          res.cookies.set({ name: n, value: v, ...o });
        },
        remove(n: string, o: CookieOptions) {
          req.cookies.set({ name: n, value: "", ...o });
          res = NextResponse.next({ request: { headers: req.headers } });
          res.cookies.set({ name: n, value: "", ...o });
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  const pathname = req.nextUrl.pathname;

  // Rotas livres: marketing, autenticação, convite, API pública e cron têm
  // seus próprios controles (API key, token de cron ou callback do Supabase).
  const publicPrefixes = [
    "/api/auth",
    "/api/billing",
    "/api/convite",
    "/api/cron",
    "/api/push",
    "/api/v1",
    "/api/webhooks",
    "/auth/callback",
    "/indicar",
    "/lp",
    "/nps",
    "/aceitar-convite", // página pública de signup via convite
  ];
  const publicPaths = new Set([
    "/",
    "/login",
    "/cadastro",
    "/ajuda",
    "/api-docs",
    "/termos",
    "/privacidade",
    "/dpa",
  ]);
  const isPublic = publicPaths.has(pathname)
    || publicPrefixes.some((prefix) => pathname.startsWith(prefix));

  if (!user && !isPublic) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  if (user && (pathname === "/login" || pathname === "/cadastro")) {
    const url = req.nextUrl.clone();
    url.pathname = "/hoje";
    return NextResponse.redirect(url);
  }

  // ---------- Troca obrigatória de senha ----------
  // O flag user_metadata.force_password_change é definido manualmente no Supabase
  // (Auth → Users → user_metadata) quando uma conta é provisionada com senha
  // temporária — por exemplo, quando o gestor cria um SDR e quer forçar troca
  // no primeiro login. O flag é limpo automaticamente em /trocar-senha.
  // Onboarding self-service NÃO seta esse flag (usuário escolheu a própria senha).
  if (user && pathname !== "/trocar-senha") {
    const forceChange = user.user_metadata?.force_password_change === true;
    if (forceChange) {
      const url = req.nextUrl.clone();
      url.pathname = "/trocar-senha";
      return NextResponse.redirect(url);
    }
  }

  if (user && !isPublic && !isBillingAllowedPath(pathname)) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("home_organizacao_id")
      .eq("id", user.id)
      .maybeSingle();

    const activeOrgCookie = req.cookies.get("x-organizacao-ativa")?.value;
    const requestedOrg = activeOrgCookie || profile?.home_organizacao_id;
    let org: any = null;

    if (requestedOrg) {
      const { data: membership } = await supabase
        .from("membros_organizacao")
        .select("organizacao_id, ativo, organizacao:organizacoes(id, ativa, billing_status, trial_ends_at)")
        .eq("profile_id", user.id)
        .eq("organizacao_id", requestedOrg)
        .eq("ativo", true)
        .maybeSingle();

      org = (membership as any)?.organizacao ?? null;
    }

    if (!org) {
      const { data: fallbackMembership } = await supabase
        .from("membros_organizacao")
        .select("organizacao_id, ativo, organizacao:organizacoes(id, ativa, billing_status, trial_ends_at)")
        .eq("profile_id", user.id)
        .eq("ativo", true)
        .limit(1)
        .maybeSingle();

      org = (fallbackMembership as any)?.organizacao ?? null;
    }

    if (org) {
      const access = getBillingAccessState(org);
      if (!access.allowed) {
        const url = req.nextUrl.clone();
        url.pathname = "/configuracoes/billing";
        url.searchParams.set("blocked", access.reason);
        return NextResponse.redirect(url);
      }
    }
  }

  return res;
}

function isBillingAllowedPath(pathname: string) {
  return pathname === "/configuracoes/billing"
    || pathname === "/configuracoes/perfil"
    || pathname === "/trocar-senha"
    || pathname === "/api/logout"
    || pathname.startsWith("/api/billing")
    || pathname.startsWith("/auth/callback");
}

export const config = {
  // Exclui:
  //  - /monitoring (Sentry tunnel route)
  //  - /_next/* (assets do Next)
  //  - favicon, manifest, robots, sitemap (file conventions Next que rodam middleware-free)
  //  - rotas /icon e /apple-icon (Next gera estes via app/icon.tsx + app/apple-icon.tsx)
  //  - extensões de imagem comuns (svg, png, jpg, jpeg, gif, webp, ico)
  // Sem isso, o middleware redireciona /manifest.webmanifest pra /login (não-logado),
  // o que faz o Chrome receber HTML "/login" e falhar ao parsear como JSON.
  matcher: [
    "/((?!monitoring|_next/static|_next/image|favicon.ico|manifest.webmanifest|robots.txt|sitemap.xml|icon|apple-icon|sw.js|workbox-.*|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
