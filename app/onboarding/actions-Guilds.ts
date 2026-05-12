"use server";

import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { getTemplatesByLocale } from "@/lib/cadencia-templates";
import { getServerLocale, getT, type Locale } from "@/lib/i18n";
import { getAppUrl, sendInviteEmail, sendWelcomeEmail } from "@/lib/email";
import { slugify } from "@/lib/utils/slugify";
import type { Role } from "@/lib/types";

function normalizarConvites(convites: Array<{ email: string; role: Role }>) {
  const roles: Role[] = ["gestor", "comercial", "sdr"];
  const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const porEmail = new Map<string, { email: string; role: Role }>();

  convites.forEach((convite) => {
    const email = convite.email.trim().toLowerCase();
    if (!email || !EMAIL_REGEX.test(email)) return;
    porEmail.set(email, {
      email,
      role: roles.includes(convite.role) ? convite.role : "comercial",
    });
  });

  return Array.from(porEmail.values()).slice(0, 5);
}

const IDIOMAS_VALIDOS = new Set(["pt-BR", "en-US"]);
const MOEDAS_VALIDAS = new Set(["BRL", "USD", "EUR", "GBP"]);
const PAIS_REGEX = /^[A-Z]{2}$/;

export async function finalizarOnboarding(dados: {
  segmento: string;
  dor_principal: string;
  cargo_foco: string;
  gerarDemo: boolean;
  habilitarIA?: boolean;
  razao_social?: string;
  cnpj?: string;
  /** ISO 3166-1 alpha-2. Default 'BR' se não fornecido. */
  pais?: string;
  /** Tax ID genérico (CNPJ/EIN/VAT/etc.) — substitui CNPJ pra estrangeiros. */
  tax_id?: string;
  /** Locale da org. Default 'pt-BR'. */
  idioma_padrao?: string;
  /** Moeda da org. Default 'BRL'. */
  moeda_padrao?: string;
  convites?: Array<{ email: string; role: Role }>;
}) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) { return cookieStore.get(name)?.value; },
        set(name: string, value: string, options: CookieOptions) { cookieStore.set({ name, value, ...options }); },
        remove(name: string, options: CookieOptions) { cookieStore.delete({ name, ...options }); },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    const t = getT(await getServerLocale());
    throw new Error(t("erros.usuario_nao_autenticado"));
  }

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const nome = user.user_metadata.full_name || "Usuario";
  const empresaNome = user.user_metadata.empresa_nome || "Minha Empresa";

  // Slug com unicidade (gerado JS pra controlar colisão antes da RPC)
  let slug = slugify(empresaNome);
  const { data: existingSlug } = await supabaseAdmin.from("organizacoes")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (existingSlug) slug = `${slug}-${Date.now().toString(36)}`;

  // CNPJ só persiste se BR e formato válido. Tax ID é genérico.
  const pais = (dados.pais ?? "BR").toUpperCase();
  if (!PAIS_REGEX.test(pais)) throw new Error("País inválido (esperado ISO-3166-1 alpha-2).");
  const isBR = pais === "BR";
  const cnpjLimpo = dados.cnpj?.replace(/\D/g, "") || null;
  const cnpjFinal = isBR && cnpjLimpo && cnpjLimpo.length === 14 ? cnpjLimpo : null;
  const taxIdFinal = dados.tax_id?.trim() || null;

  // Whitelist idioma + moeda
  const idiomaFinal = dados.idioma_padrao && IDIOMAS_VALIDOS.has(dados.idioma_padrao)
    ? dados.idioma_padrao : "pt-BR";
  const moedaFinal = dados.moeda_padrao && MOEDAS_VALIDAS.has(dados.moeda_padrao)
    ? dados.moeda_padrao : "BRL";

  // Cap free-text
  const segmentoFinal = (dados.segmento || "").slice(0, 80).trim() || null;
  const dorFinal = (dados.dor_principal || "").slice(0, 500).trim() || null;
  const cargoFocoFinal = (dados.cargo_foco || "").slice(0, 80).trim() || null;

  // Templates de cadência (locale-aware) — passa como JSONB pra RPC
  const orgLocale: Locale = (idiomaFinal === "en-US" ? "en-US" : "pt-BR");
  const templates = getTemplatesByLocale(orgLocale).map((t) => ({
    passo: t.passo,
    canal: t.canal,
    objetivo: t.objetivo,
    assunto: t.assunto,
    corpo: t.corpo,
  }));

  const convites = normalizarConvites(dados.convites ?? []);

  // === Tudo transacional via RPC PL/pgSQL (migration 20260511090000) ===
  // Se qualquer parte falhar, rollback automático — sem estado parcial.
  const { data: result, error: rpcErr } = await supabaseAdmin.rpc("onboarding_finalize", {
    _user_id: user.id,
    _email: user.email!,
    _nome: nome,
    _empresa_nome: empresaNome,
    _slug: slug,
    _pais: pais,
    _idioma: idiomaFinal,
    _moeda: moedaFinal,
    _segmento: segmentoFinal,
    _dor: dorFinal,
    _cargo_foco: cargoFocoFinal,
    _razao_social: dados.razao_social?.trim() || null,
    _cnpj: cnpjFinal,
    _tax_id: taxIdFinal,
    _gerar_demo: dados.gerarDemo,
    _habilitar_ia: dados.habilitarIA ?? true,
    _cadencia_templates: templates,
    _convites: convites,
  });
  if (rpcErr) throw new Error("Erro no onboarding: " + rpcErr.message);

  const orgId = (result as any)?.organizacao_id as string | undefined;
  if (!orgId) throw new Error("RPC não retornou organizacao_id.");

  // === Side effects externos (após sucesso DB — fora da transação) ===
  // Welcome email pro próprio user
  sendWelcomeEmail({
    email: user.email!,
    name: nome,
    orgName: empresaNome,
    locale: idiomaFinal,
  }).catch(console.error);

  // Convites — busca tokens criados pela RPC e dispara emails
  if (convites.length) {
    const { data: convitesCriados } = await supabaseAdmin
      .from("convites")
      .select("email, role, token")
      .eq("organizacao_id", orgId)
      .in("email", convites.map((c) => c.email));

    await Promise.allSettled((convitesCriados ?? []).map((convite) => sendInviteEmail({
      email: convite.email,
      orgName: empresaNome,
      inviterName: nome,
      inviteUrl: `${getAppUrl()}/api/convite/${convite.token}`,
      role: convite.role,
      locale: idiomaFinal,
    })));
  }

  return { sucesso: true, organizacao_id: orgId };
}
