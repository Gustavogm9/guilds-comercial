"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId, getCurrentRole } from "@/lib/supabase/org";
import { revalidatePath } from "next/cache";

const SLUG_REGEX = /^[a-z0-9][a-z0-9-]{2,80}$/;

export async function criarOuAtualizarLp(input: {
  id?: number;
  slug: string;
  titulo: string;
  subtitulo?: string;
  campos: string[];
  cta_texto: string;
  agradecimento_titulo?: string;
  agradecimento_texto?: string;
  logo_url?: string;
  cor_primaria?: string;
  fluxo_cadencia_id?: number | null;
  segmento_default?: string;
  responsavel_id?: string;
  ativa?: boolean;
}): Promise<{ ok: true; id: number }> {
  const role = await getCurrentRole();
  if (role !== "gestor") throw new Error("Apenas gestores.");
  const orgId = await getCurrentOrgId();
  if (!orgId) throw new Error("Sem org.");

  const slug = input.slug.trim().toLowerCase();
  if (!SLUG_REGEX.test(slug)) {
    throw new Error("Slug inválido. Use minúsculas, números e hífens (3-80 chars).");
  }
  if (input.cor_primaria && !/^#[0-9a-f]{6}$/i.test(input.cor_primaria)) {
    throw new Error("Cor primária deve ser hex #rrggbb.");
  }

  const supabase = createClient();
  const dados = {
    organizacao_id: orgId,
    slug,
    titulo: input.titulo.trim().slice(0, 120),
    subtitulo: input.subtitulo?.trim() || null,
    campos: input.campos.length > 0 ? input.campos : ["nome", "email", "whatsapp"],
    cta_texto: input.cta_texto?.trim() || "Enviar",
    agradecimento_titulo: input.agradecimento_titulo?.trim() || "Recebido!",
    agradecimento_texto: input.agradecimento_texto?.trim() || "Em breve entraremos em contato.",
    logo_url: input.logo_url?.trim() || null,
    cor_primaria: input.cor_primaria?.toLowerCase() || null,
    fluxo_cadencia_id: input.fluxo_cadencia_id ?? null,
    segmento_default: input.segmento_default?.trim() || null,
    responsavel_id: input.responsavel_id || null,
    ativa: input.ativa ?? true,
  };

  let id = input.id;
  if (id) {
    const { error } = await supabase.from("landing_page").update(dados).eq("id", id).eq("organizacao_id", orgId);
    if (error) throw new Error(error.message);
  } else {
    const { data, error } = await supabase.from("landing_page").insert(dados).select("id").single();
    if (error || !data) throw new Error(error?.message ?? "Falha.");
    id = data.id;
  }

  revalidatePath("/configuracoes/landing-pages");
  return { ok: true, id: id! };
}

export async function arquivarLp(lp_id: number) {
  const role = await getCurrentRole();
  if (role !== "gestor") throw new Error("Apenas gestores.");
  const orgId = await getCurrentOrgId();
  if (!orgId) throw new Error("Sem org.");
  const supabase = createClient();
  await supabase.from("landing_page").update({ ativa: false }).eq("id", lp_id).eq("organizacao_id", orgId);
  revalidatePath("/configuracoes/landing-pages");
  return { ok: true };
}
