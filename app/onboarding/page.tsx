import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import OnboardingWizard from "@/components/onboarding-wizard";

export default async function OnboardingPage() {
  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) { return cookieStore.get(name)?.value; },
        set(name: string, value: string, options: CookieOptions) { cookieStore.set({ name, value, ...options }); },
        remove(name: string, options: CookieOptions) { cookieStore.delete({ name, ...options }); },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Verifica se já tem home_organizacao_id. Se sim, não precisa de onboarding
  const { data: profile } = await supabase.from("profiles").select("home_organizacao_id").eq("id", user.id).single();
  if (profile?.home_organizacao_id) {
    redirect("/hoje");
  }

  const nome = user.user_metadata.full_name || "Usuário";
  const empresa = user.user_metadata.empresa_nome || "Minha Empresa";

  return (
    <div className="min-h-screen bg-gradient-to-br from-guild-50 via-white to-guild-100 flex items-center justify-center p-4">
      <OnboardingWizard nome={nome} empresa={empresa} />
    </div>
  );
}
