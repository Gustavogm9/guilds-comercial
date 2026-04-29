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
  const porEmail = new Map<string, { email: string; role: Role }>();

  convites.forEach((convite) => {
    const email = convite.email.trim().toLowerCase();
    if (!email || !email.includes("@")) return;
    porEmail.set(email, {
      email,
      role: roles.includes(convite.role) ? convite.role : "comercial",
    });
  });

  return Array.from(porEmail.values()).slice(0, 5);
}

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
  const cookieStore = cookies();
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

  const { data: profile } = await supabaseAdmin.from("profiles").select("*").eq("id", user.id).maybeSingle();
  if (!profile) {
    const { error: profErr } = await supabaseAdmin.from("profiles").insert({
      id: user.id,
      email: user.email,
      display_name: nome,
      role: "gestor",
    });
    if (profErr) throw new Error("Erro ao criar perfil: " + profErr.message);
  }

  let slug = slugify(empresaNome);
  const { data: existingSlug } = await supabaseAdmin.from("organizacoes")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (existingSlug) slug = `${slug}-${Date.now().toString(36)}`;

  // CNPJ e razao_social vêm opcionais do wizard. CNPJ só persiste se BR e
  // se passar no constraint `^\d{14}$`. Tax ID é genérico (qualquer país).
  const pais = (dados.pais ?? "BR").toUpperCase();
  const isBR = pais === "BR";
  const cnpjLimpo = dados.cnpj?.replace(/\D/g, "") || null;
  const cnpjFinal = isBR && cnpjLimpo && cnpjLimpo.length === 14 ? cnpjLimpo : null;
  const taxIdFinal = dados.tax_id?.trim() || null;

  const { data: org, error: orgErr } = await supabaseAdmin.from("organizacoes").insert({
    nome: empresaNome,
    slug,
    owner_id: user.id,
    razao_social: dados.razao_social?.trim() || null,
    cnpj: cnpjFinal,
    tax_id: taxIdFinal,
    pais,
    idioma_padrao: dados.idioma_padrao || "pt-BR",
    moeda_padrao: dados.moeda_padrao || "BRL",
  }).select().single();
  if (orgErr) throw new Error("Erro ao criar organizacao: " + orgErr.message);

  const { error: membroErr } = await supabaseAdmin.from("membros_organizacao").insert({
    organizacao_id: org.id,
    profile_id: user.id,
    role: "gestor",
    ativo: true,
  });
  if (membroErr) throw new Error("Erro ao adicionar membro: " + membroErr.message);

  await supabaseAdmin.from("profiles").update({ home_organizacao_id: org.id }).eq("id", user.id);

  const { error: confErr } = await supabaseAdmin.from("organizacao_config").insert({
    organizacao_id: org.id,
    distribuicao_automatica: false,
    distribuicao_estrategia: "manual",
  });
  if (confErr) throw new Error("Erro ao criar configuracoes: " + confErr.message);

  const orgLocale: Locale = (dados.idioma_padrao === "en-US" ? "en-US" : "pt-BR");
  const templatesParaIdioma = getTemplatesByLocale(orgLocale);
  const templatesToInsert = templatesParaIdioma.map((template) => ({
    organizacao_id: org.id,
    passo: template.passo,
    canal: template.canal,
    objetivo: template.objetivo,
    assunto: template.assunto,
    corpo: template.corpo,
  }));
  const { error: tplErr } = await supabaseAdmin.from("cadencia_templates").insert(templatesToInsert);
  if (tplErr) throw new Error("Erro ao criar templates de cadencia: " + tplErr.message);

  const { data: featuresGlobais } = await supabaseAdmin
    .from("ai_features")
    .select("codigo,nome,descricao,etapa_fluxo,provider_codigo,modelo,temperature,max_tokens,limite_dia_org,limite_dia_usuario,papel_minimo")
    .is("organizacao_id", null);

  if (featuresGlobais?.length) {
    await supabaseAdmin.from("ai_features").insert(featuresGlobais.map((feature) => ({
      ...feature,
      organizacao_id: org.id,
      ativo: dados.habilitarIA ?? true,
    })));
  }

  sendWelcomeEmail({
    email: user.email!,
    name: nome,
    orgName: empresaNome,
    locale: dados.idioma_padrao || "pt-BR",
  }).catch(console.error);

  if (dados.gerarDemo) {
    await supabaseAdmin.from("leads").insert({
      organizacao_id: org.id,
      nome: "Carlos Silva",
      empresa: "Empresa Exemplo LTDA",
      cargo: dados.cargo_foco || "Socio Diretor",
      funnel_stage: "pipeline",
      crm_stage: "Prospecção",
      temperatura: "Morno",
      dor_principal: dados.dor_principal || null,
      segmento: dados.segmento || null,
      valor_potencial: 5000,
      responsavel_id: user.id,
      data_primeiro_contato: new Date().toISOString().slice(0, 10),
      proxima_acao: "Enviar D0",
      data_proxima_acao: new Date().toISOString().slice(0, 10),
    });
  }

  const convites = normalizarConvites(dados.convites ?? []);
  if (convites.length) {
    const { data: convitesCriados, error: convitesErr } = await supabaseAdmin
      .from("convites")
      .insert(convites.map((convite) => ({
        organizacao_id: org.id,
        email: convite.email,
        role: convite.role,
        convidado_por: user.id,
      })))
      .select("email, role, token");

    if (convitesErr) throw new Error("Erro ao criar convites: " + convitesErr.message);

    await Promise.allSettled((convitesCriados ?? []).map((convite) => sendInviteEmail({
      email: convite.email,
      orgName: empresaNome,
      inviterName: nome,
      inviteUrl: `${getAppUrl()}/api/convite/${convite.token}`,
      role: convite.role,
      locale: dados.idioma_padrao || "pt-BR",
    })));
  }

  await supabaseAdmin.from("organizacao_evento").insert({
    organizacao_id: org.id,
    ator_id: user.id,
    tipo: "onboarding_concluido",
    payload: {
      segmento: dados.segmento,
      cargo_foco: dados.cargo_foco,
      gerar_demo: dados.gerarDemo,
      convites: convites.length,
      ia_habilitada: dados.habilitarIA ?? true,
    },
  });

  return { sucesso: true, organizacao_id: org.id };
}
