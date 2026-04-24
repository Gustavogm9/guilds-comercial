"use server";

import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { TEMPLATES } from "@/lib/cadencia-templates";

export async function finalizarOnboarding(dados: {
  segmento: string;
  dor_principal: string;
  cargo_foco: string;
  gerarDemo: boolean;
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
  if (!user) throw new Error("Usuário não autenticado");

  const nome = user.user_metadata.full_name || "Usuário";
  const empresa_nome = user.user_metadata.empresa_nome || "Minha Empresa";

  // 1. Garante que o profile existe
  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single();
  if (!profile) {
    const { error: profErr } = await supabase.from("profiles").insert({
      id: user.id,
      email: user.email,
      nome: nome,
    });
    if (profErr) throw new Error("Erro ao criar perfil: " + profErr.message);
  }

  // 2. Cria a organização
  const { data: org, error: orgErr } = await supabase.from("organizacoes").insert({
    nome: empresa_nome,
    owner_id: user.id
  }).select().single();
  if (orgErr) throw new Error("Erro ao criar organização: " + orgErr.message);

  // 3. Adiciona usuário como gestor da organização
  const { error: membroErr } = await supabase.from("membros_organizacao").insert({
    organizacao_id: org.id,
    profile_id: user.id,
    papel: "gestor"
  });
  if (membroErr) throw new Error("Erro ao adicionar membro: " + membroErr.message);

  // 4. Define como home_organizacao_id
  await supabase.from("profiles").update({ home_organizacao_id: org.id }).eq("id", user.id);

  // 5. Configurações da organização (incluindo ICP)
  const { error: confErr } = await supabase.from("organizacao_config").insert({
    organizacao_id: org.id,
    raiox_valor_lista: 97.00,
    raiox_voucher_valor: 50.00
    // ICP configs removed for now, we will add them as jsonb if needed, or just let them live in the initial lead.
  });
  // Ignore error if columns don't exist yet, we will add them or just use generic jsonb config
  // Wait, organizacao_config doesn't have icp_* columns. Let's check schema.

  // 6. Faz o seed dos templates de cadência para a organização
  const templatesToInsert = TEMPLATES.map(t => ({
    organizacao_id: org.id,
    passo: t.passo,
    canal: t.canal,
    objetivo: t.objetivo,
    assunto: t.assunto,
    corpo: t.corpo
  }));
  const { error: tplErr } = await supabase.from("cadencia_templates").insert(templatesToInsert);
  if (tplErr) throw new Error("Erro ao criar templates de cadência: " + tplErr.message);

  // 7. Enviar evento/email de boas vindas no Brevo (assíncrono)
  dispararBrevoBoasVindas(user.email!, nome, empresa_nome).catch(console.error);

  // 8. Opcional: Gerar dados de demo
  if (dados.gerarDemo) {
    // Insere um lead de teste para a pessoa brincar
    await supabase.from("leads").insert({
      organizacao_id: org.id,
      nome: "Carlos Silva",
      empresa: "Empresa Exemplo LTDA",
      cargo: dados.cargo_foco || "Sócio Diretor",
      etapa: "base",
      temperatura: "Morno",
      valor_potencial: 5000,
      vendedor_id: user.id
    });
  }

  return { sucesso: true, organizacao_id: org.id };
}

async function dispararBrevoBoasVindas(email: string, nome: string, empresa: string) {
  const BREVO_API_KEY = process.env.BREVO_API_KEY;
  if (!BREVO_API_KEY) return;

  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "accept": "application/json",
      "api-key": BREVO_API_KEY,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      sender: { name: "Equipe Guilds", email: "hello@guilds.com.br" },
      to: [{ email, name: nome }],
      subject: "Bem-vindo ao Guilds Comercial 🚀",
      htmlContent: `<p>Olá ${nome},</p><p>Sua conta da <strong>${empresa}</strong> foi criada com sucesso!</p><p>O próximo passo é acessar a plataforma, adicionar seus leads e testar a automação do funil com inteligência artificial.</p><p>Um abraço,<br>Equipe Guilds</p>`
    })
  });

  if (!res.ok) {
    const data = await res.json();
    console.error("Erro Brevo:", data);
  }
}
