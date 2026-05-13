import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { cache } from "react";
import { parseImpersonationCookieValue } from "@/lib/impersonation";

/**
 * Supabase SSR client com cookies do Next.
 *
 * Next 15+ tornou `cookies()` async — usamos a API `getAll`/`setAll` recomendada
 * pelo @supabase/ssr ≥ 0.5, que aceita callbacks async. Assim createClient
 * continua síncrono e não precisamos mudar todos os call-sites.
 */
export const createClient = () => {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        async getAll() {
          const store = await cookies();
          return store.getAll();
        },
        async setAll(cookiesToSet) {
          try {
            const store = await cookies();
            cookiesToSet.forEach(({ name, value, options }) => {
              store.set(name, value, options);
            });
          } catch {
            // Server Components não podem mutar cookies (read-only).
            // Middleware e Server Actions podem — silenciamos a falha em RSC.
          }
        },
      },
    }
  );

  // Patch auth.getUser() to support impersonation transparently across the app
  const originalGetUser = supabase.auth.getUser.bind(supabase.auth);
  supabase.auth.getUser = async (jwt?: string) => {
    const res = await originalGetUser(jwt);
    if (!res.data.user) return res;

    try {
      const store = await cookies();
      const impersonation = parseImpersonationCookieValue(store.get("x-impersonate-user")?.value);

      if (impersonation && impersonation.adminId === res.data.user.id && impersonation.targetUserId !== res.data.user.id) {
        // Return a mocked User object that looks like the target user
        return {
          ...res,
          data: {
            ...res.data,
            user: {
              ...res.data.user,
              id: impersonation.targetUserId,
              // Mark it for UI or internal logic if needed
              _is_impersonated: true,
              _real_admin_id: impersonation.adminId,
            } as any
          }
        };
      }
    } catch {
      // Ignore cookie read errors (e.g. during build or static generation)
    }

    return res;
  };

  return supabase;
};

// Memoiza por request — o middleware + RSCs costumam chamar getUser várias vezes
// no mesmo render e cada chamada é round-trip ao Supabase Auth.
export const getCurrentUser = cache(async () => {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
});

export const getCurrentProfile = cache(async () => {
  const user = await getCurrentUser();
  if (!user) return null;
  const supabase = createClient();
  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();
  return data;
});
