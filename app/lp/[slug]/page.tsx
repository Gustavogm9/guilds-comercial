import { notFound } from "next/navigation";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import LpClient from "./lp-client";

export const dynamic = "force-dynamic";

export default async function LpPage(props: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await props.params;
  if (!slug || slug.length < 3) notFound();

  const sb = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data } = await sb.rpc("buscar_lp_publica", { _slug: slug });
  if (!data) notFound();

  return <LpClient slug={slug} lp={data} />;
}
