import { redirect } from "next/navigation";
import { getCurrentRole } from "@/lib/supabase/org";

export default async function GestaoRootPage() {
  const role = await getCurrentRole();
  if (role === "gestor") {
    redirect("/gestao/equipe");
  } else {
    redirect("/gestao/time");
  }
}
