import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/supabase/server";
import { getCurrentRole } from "@/lib/supabase/org";

export const dynamic = "force-dynamic";

export default async function GestaoRootPage() {
  const me = await getCurrentProfile();
  if (!me) redirect("/login");

  const role = await getCurrentRole();
  if (role === "gestor") {
    redirect("/gestao/equipe");
  } else {
    redirect(`/gestao/vendedor/${me.id}`);
  }
}
