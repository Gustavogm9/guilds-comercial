import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { User, Mail, Lock, Bell, Globe } from "lucide-react";
import ProfileForm from "./profile-form";
import PushNotificationsToggle from "@/components/push-notifications-toggle";
import LocaleToggle from "@/components/i18n/locale-toggle";
import Link from "next/link";
import { getServerLocale, getT } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export default async function PerfilPage() {
  const supabase = createClient();
  const locale = await getServerLocale();
  const t = getT(locale);
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const [{ data: profile }, { data: pushPrefs }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).single(),
    supabase.from("notification_preferences").select("*").eq("profile_id", user.id).maybeSingle(),
  ]);

  if (!profile) redirect("/login");

  return (
    <div className="max-w-2xl">
      <div className="card p-6 mb-6">
        <h2 className="text-lg font-semibold flex items-center gap-2 mb-4">
          <User className="w-5 h-5 text-primary" />
          {t("configuracoes.informacoes_pessoais")}
        </h2>

        <ProfileForm
          initialName={profile.display_name}
          initialTelefone={profile.telefone}
          initialTimezone={profile.timezone}
        />
      </div>

      <div className="card p-6">
        <h2 className="text-lg font-semibold flex items-center gap-2 mb-4">
          <Lock className="w-5 h-5 text-muted-foreground" />
          {t("configuracoes.seguranca")}
        </h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">{t("configuracoes.email_acesso")}</label>
            <div className="flex items-center gap-2 px-3 py-2 bg-muted/50 border border-border rounded-lg text-muted-foreground text-sm">
              <Mail className="w-4 h-4" />
              {profile.email}
              <span className="ml-auto text-[10px] uppercase tracking-wider font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded">{t("configuracoes.email_apenas_leitura")}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">{t("configuracoes.email_nao_alteravel")}</p>
          </div>

          <div className="pt-4 border-t border-border/50">
            <Link href="/trocar-senha" className="btn-secondary text-sm">
              {t("configuracoes.redefinir_senha")}
            </Link>
          </div>
        </div>
      </div>

      <div className="card p-6 mt-6">
        <h2 className="text-lg font-semibold flex items-center gap-2 mb-4">
          <Bell className="w-5 h-5 text-primary" />
          {t("configuracoes.notificacoes_push")}
        </h2>
        <PushNotificationsToggle initialPrefs={pushPrefs as any} />
      </div>

      <div className="card p-6 mt-6">
        <h2 className="text-lg font-semibold flex items-center gap-2 mb-4">
          <Globe className="w-5 h-5 text-primary" />
          {t("configuracoes.idioma")} / Language
        </h2>
        <LocaleToggle />
      </div>
    </div>
  );
}
