import { redirect } from "next/navigation";
import { withSearchParams } from "../legacy-redirect";

export const dynamic = "force-dynamic";

export default async function LegacyCadenciaPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  redirect(await withSearchParams("/comunicacao/cadencia", props.searchParams));
}
