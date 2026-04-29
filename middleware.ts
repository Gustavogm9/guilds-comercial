import { NextResponse, type NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

export async function middleware(req: NextRequest) {
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
  matcher: ["/((?!monitoring|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
