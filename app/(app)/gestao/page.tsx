import { redirect } from "next/navigation";
import { getCurrentRole } from "@/lib/supabase/org";

export const dynamic = "force-dynamic";

export default async function GestaoRootPage() {
  const role = await getCurrentRole();
  if (role === "gestor") {
    redirect("/gestao/equipe");
  } else {
    redirect("/gestao/time");
  }
}
