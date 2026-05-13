export const dynamic = "force-dynamic";
import { redirect } from "next/navigation";

export default function VendasRootPage() {
  redirect("/vendas/pipeline");
}
