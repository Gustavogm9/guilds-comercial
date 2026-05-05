import ImportarCsvClient from "./importar-client";
import { redirect } from "next/navigation";
import { getCurrentOrgId } from "@/lib/supabase/org";
import { getServerLocale, getT } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export default async function ImportarPage() {
  const orgId = await getCurrentOrgId();
  if (!orgId) redirect("/hoje");
  const t = getT(await getServerLocale());

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto">
      <div className="mb-4">
        <h1 className="text-2xl font-semibold tracking-tight">{t("paginas.base_importar_titulo")}</h1>
        <p className="text-sm text-muted-foreground">
          {t("paginas.base_importar_sub")}
        </p>
      </div>
      <ImportarCsvClient />
    </div>
  );
}
