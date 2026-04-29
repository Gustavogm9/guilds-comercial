"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId, getCurrentRole } from "@/lib/supabase/org";
import { getAppUrl } from "@/lib/email";
import { PLANS, type PlanCode } from "@/lib/billing";
import { createCheckoutSession, createCustomerPortalSession, createStripeCustomer, type Currency, SUPPORTED_CURRENCIES } from "@/lib/stripe";
import { getServerLocale, getT } from "@/lib/i18n";

async function tServer() {
  return getT(await getServerLocale());
}

async function requireGestorOrg() {
  const [orgId, role, t] = await Promise.all([getCurrentOrgId(), getCurrentRole(), tServer()]);
  if (!orgId) throw new Error(t("erros.sem_org"));
  if (role !== "gestor") throw new Error(t("erros.acesso_restrito_gestor"));
  return orgId;
}

async function assertPlan(plan: PlanCode) {
  if (!PLANS.some((p) => p.code === plan)) {
    const t = await tServer();
    throw new Error(t("erros.plano_invalido"));
  }
}

export async function iniciarCheckout(plan: PlanCode) {
  await assertPlan(plan);

  const supabase = createClient();
  const supabaseAny = supabase as any;
  const orgId = await requireGestorOrg();
  const t = await tServer();

  const [{ data: org }, { data: { user } }] = await Promise.all([
    supabase.from("organizacoes").select("*").eq("id", orgId).single(),
    supabase.auth.getUser(),
  ]);

  if (!org) throw new Error(t("erros.org_nao_encontrada"));

  let customerId = (org as any).stripe_customer_id as string | null;

  if (!customerId) {
    const customer = await createStripeCustomer({
      email: user?.email,
      name: user?.user_metadata?.full_name ?? user?.email,
      organizacaoId: orgId,
      orgName: org.nome,
    });
    customerId = customer.id;
    await supabaseAny.from("organizacoes").update({ stripe_customer_id: customerId }).eq("id", orgId);
  }

  const appUrl = getAppUrl();
  // Usa moeda da org (default BRL)
  const moedaOrg = (org as any).moeda_padrao as string | null;
  const currency: Currency = (moedaOrg && SUPPORTED_CURRENCIES.includes(moedaOrg as Currency))
    ? (moedaOrg as Currency) : "BRL";

  const session = await createCheckoutSession({
    customerId,
    organizacaoId: orgId,
    plan,
    currency,
    successUrl: `${appUrl}/configuracoes/billing?checkout=sucesso`,
    cancelUrl: `${appUrl}/configuracoes/billing?checkout=cancelado`,
  });

  redirect(session.url);
}

export async function abrirPortalCliente() {
  const supabase = createClient();
  const orgId = await requireGestorOrg();
  const t = await tServer();
  const { data: org } = await supabase.from("organizacoes").select("*").eq("id", orgId).single();
  const customerId = (org as any)?.stripe_customer_id as string | null;

  if (!customerId) {
    throw new Error(t("erros.stripe_customer_inexistente"));
  }

  const session = await createCustomerPortalSession({
    customerId,
    returnUrl: `${getAppUrl()}/configuracoes/billing`,
  });

  redirect(session.url);
}
