import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function LegacyBaseImportarPage() {
  redirect("/vendas/base/importar");
}
