import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/supabase/server";
import NovaEmpresaForm from "./form";

export const dynamic = "force-dynamic";

export default async function NovaEmpresaPage() {
  const me = await getCurrentProfile();
  if (!me) redirect("/login");

  return (
    <div className="p-4 md:p-8 max-w-xl mx-auto">
      <header className="mb-4">
        <h1 className="text-2xl font-semibold tracking-tight">Nova empresa</h1>
        <p className="text-sm text-slate-500">
          Crie uma nova organização independente. Você será o gestor e poderá convidar um novo time.
        </p>
      </header>

      <div className="card p-4">
        <NovaEmpresaForm/>
      </div>
    </div>
  );
}
