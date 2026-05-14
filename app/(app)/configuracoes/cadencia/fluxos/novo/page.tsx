import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getCurrentRole } from "@/lib/supabase/org";
import NovoFluxoForm from "./novo-fluxo-form";

export const dynamic = "force-dynamic";

export default async function NovoFluxoPage() {
  const role = await getCurrentRole();
  if (role !== "gestor") redirect("/hoje");

  return (
    <div className="max-w-3xl">
      <Link href="/configuracoes/cadencia/fluxos" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mb-3">
        <ArrowLeft className="w-3 h-3" /> Voltar pros fluxos
      </Link>
      <h1 className="text-2xl font-semibold tracking-tight mb-1">Novo fluxo de cadência</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Crie o fluxo vazio. Você adiciona os passos na próxima tela.
      </p>
      <NovoFluxoForm />
    </div>
  );
}
