import { NextResponse, type NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

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
    "/api/v1",
    "/auth/callback",
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

  return res;
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
