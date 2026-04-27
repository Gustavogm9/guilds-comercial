"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId, getCurrentRole } from "@/lib/supabase/org";
import { getAppUrl } from "@/lib/email";
import { PLANS, type PlanCode } from "@/lib/billing";
import { createCheckoutSession, createCustomerPortalSession, createStripeCustomer } from "@/lib/stripe";

async function requireGestorOrg() {
  const [orgId, role] = await Promise.all([getCurrentOrgId(), getCurrentRole()]);
  if (!orgId) throw new Error("Sem organizacao ativa.");
  if (role !== "gestor") throw new Error("Acesso restrito a gestores.");
  return orgId;
}

function assertPlan(plan: PlanCode) {
  if (!PLANS.some((p) => p.code === plan)) {
    throw new Error("Plano invalido.");
  }
}

export async function iniciarCheckout(plan: PlanCode) {
  assertPlan(plan);

  const supabase = createClient();
  const supabaseAny = supabase as any;
  const orgId = await requireGestorOrg();

  const [{ data: org }, { data: { user } }] = await Promise.all([
    supabase.from("organizacoes").select("*").eq("id", orgId).single(),
    supabase.auth.getUser(),
  ]);

  if (!org) throw new Error("Organizacao nao encontrada.");

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
  const session = await createCheckoutSession({
    customerId,
    organizacaoId: orgId,
    plan,
    successUrl: `${appUrl}/configuracoes/billing?checkout=sucesso`,
    cancelUrl: `${appUrl}/configuracoes/billing?checkout=cancelado`,
  });

  redirect(session.url);
}

export async function abrirPortalCliente() {
  const supabase = createClient();
  const orgId = await requireGestorOrg();
  const { data: org } = await supabase.from("organizacoes").select("*").eq("id", orgId).single();
  const customerId = (org as any)?.stripe_customer_id as string | null;

  if (!customerId) {
    throw new Error("Cliente Stripe ainda nao criado.");
  }

  const session = await createCustomerPortalSession({
    customerId,
    returnUrl: `${getAppUrl()}/configuracoes/billing`,
  });

  redirect(session.url);
}
