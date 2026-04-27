"use server";

import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { TEMPLATES } from "@/lib/cadencia-templates";
import { getAppUrl, sendInviteEmail, sendWelcomeEmail } from "@/lib/email";
import type { Role } from "@/lib/types";

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || `org-${Date.now()}`;
}

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
  if (!user) throw new Error("Usuario nao autenticado");

  const nome = user.user_metadata.full_name || "Usuario";
  const empresaNome = user.user_metadata.empresa_nome || "Minha Empresa";

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
  if (!profile) {
    const { error: profErr } = await supabase.from("profiles").insert({
      id: user.id,
      email: user.email,
      display_name: nome,
      role: "gestor",
    });
    if (profErr) throw new Error("Erro ao criar perfil: " + profErr.message);
  }

  let slug = slugify(empresaNome);
  const { data: existingSlug } = await supabase.from("organizacoes")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (existingSlug) slug = `${slug}-${Date.now().toString(36)}`;

  const { data: org, error: orgErr } = await supabase.from("organizacoes").insert({
    nome: empresaNome,
    slug,
    owner_id: user.id,
  }).select().single();
  if (orgErr) throw new Error("Erro ao criar organizacao: " + orgErr.message);

  const { error: membroErr } = await supabase.from("membros_organizacao").insert({
    organizacao_id: org.id,
    profile_id: user.id,
    role: "gestor",
    ativo: true,
  });
  if (membroErr) throw new Error("Erro ao adicionar membro: " + membroErr.message);

  await supabase.from("profiles").update({ home_organizacao_id: org.id }).eq("id", user.id);

  const { error: confErr } = await supabase.from("organizacao_config").insert({
    organizacao_id: org.id,
    distribuicao_automatica: false,
    distribuicao_estrategia: "manual",
  });
  if (confErr) throw new Error("Erro ao criar configuracoes: " + confErr.message);

  const templatesToInsert = TEMPLATES.map((template) => ({
    organizacao_id: org.id,
    passo: template.passo,
    canal: template.canal,
    objetivo: template.objetivo,
    assunto: template.assunto,
    corpo: template.corpo,
  }));
  const { error: tplErr } = await supabase.from("cadencia_templates").insert(templatesToInsert);
  if (tplErr) throw new Error("Erro ao criar templates de cadencia: " + tplErr.message);

  const { data: featuresGlobais } = await supabase
    .from("ai_features")
    .select("codigo,nome,descricao,etapa_fluxo,provider_codigo,modelo,temperature,max_tokens,limite_dia_org,limite_dia_usuario,papel_minimo")
    .is("organizacao_id", null);

  if (featuresGlobais?.length) {
    await supabase.from("ai_features").insert(featuresGlobais.map((feature) => ({
      ...feature,
      organizacao_id: org.id,
      ativo: dados.habilitarIA ?? true,
    })));
  }

  sendWelcomeEmail({ email: user.email!, name: nome, orgName: empresaNome }).catch(console.error);

  if (dados.gerarDemo) {
    await supabase.from("leads").insert({
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
    const { data: convitesCriados, error: convitesErr } = await supabase
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
    })));
  }

  await (supabase as any).from("organizacao_evento").insert({
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
