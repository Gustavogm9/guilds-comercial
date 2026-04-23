import ImportarCsvClient from "./importar-client";
import { redirect } from "next/navigation";
import { getCurrentOrgId } from "@/lib/supabase/org";

export const dynamic = "force-dynamic";

export default async function ImportarPage() {
  const orgId = await getCurrentOrgId();
  if (!orgId) redirect("/hoje");

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto">
      <div className="mb-4">
        <h1 className="text-2xl font-semibold tracking-tight">Importar leads em massa</h1>
        <p className="text-sm text-slate-500">
          Suba um arquivo <code>.csv</code> com as colunas abaixo. Primeira linha é o cabeçalho.
          Todos os leads entram na <b>Base bruta</b>.
        </p>
      </div>
      <ImportarCsvClient />
    </div>
  );
}
