import { redirect } from "next/navigation";
import { getCurrentRole } from "@/lib/supabase/org";
import ConfigTabs from "./config-tabs";
import { getServerLocale, getT } from "@/lib/i18n";

export default async function ConfiguracoesLayout({ children }: { children: React.ReactNode }) {
  const role = await getCurrentRole();
  if (!role) redirect("/login");

  const locale = await getServerLocale();
  const t = getT(locale);
  const isGestor = role === "gestor";

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      <header className="mb-2">
        <h1 className="text-2xl font-semibold tracking-tight">{t("configuracoes.titulo")}</h1>
        <p className="text-sm text-muted-foreground">{t("configuracoes.subtitulo")}</p>
      </header>

      <ConfigTabs isGestor={isGestor} />

      <main>
        {children}
      </main>
    </div>
  );
}
