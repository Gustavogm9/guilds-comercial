import { redirect } from "next/navigation";
import { withSearchParams } from "../legacy-redirect";

export const dynamic = "force-dynamic";

export default async function LegacyPipelinePage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  redirect(await withSearchParams("/vendas/pipeline", props.searchParams));
}
