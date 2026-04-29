import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { cache } from "react";

export const createClient = () => {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          try { cookieStore.set({ name, value, ...options }); } catch {}
        },
        remove(name: string, options: CookieOptions) {
          try { cookieStore.set({ name, value: "", ...options }); } catch {}
        },
      },
    }
  );
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
