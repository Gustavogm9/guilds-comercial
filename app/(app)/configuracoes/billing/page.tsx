import Link from "next/link";
import { redirect } from "next/navigation";
import { Check, CreditCard, ShieldCheck, Sparkles } from "lucide-react";
import { PLANS, getTrialState, priceLabelOf, type CurrencyCode } from "@/lib/billing";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId, getCurrentRole } from "@/lib/supabase/org";
import { abrirPortalCliente, iniciarCheckout } from "./actions";
import { isStripeConfiguredForPlan, SUPPORTED_CURRENCIES, type Currency } from "@/lib/stripe";
import AiOverageCard from "@/components/billing/ai-overage-card";

export const dynamic = "force-dynamic";

export default async function BillingPage() {
  const orgId = await getCurrentOrgId();
  if (!orgId) redirect("/hoje");

  const role = await getCurrentRole();
  if (role !== "gestor") redirect("/hoje");

  const supabase = createClient();
  const { data: org } = await supabase.from("organizacoes").select("*").eq("id", orgId).maybeSingle();
  const currentOrg = org as typeof org & {
    plano?: string;
    billing_status?: string;
    trial_ends_at?: string;
    stripe_customer_id?: string | null;
    stripe_subscription_id?: string | null;
    moeda_padrao?: string | null;
  };
  const trial = getTrialState(currentOrg?.trial_ends_at, currentOrg?.billing_status);
  const canOpenPortal = Boolean(currentOrg?.stripe_customer_id && process.env.STRIPE_SECRET_KEY);
  const moedaOrg = currentOrg?.moeda_padrao ?? "BRL";
  const currency: Currency = SUPPORTED_CURRENCIES.includes(moedaOrg as Currency)
    ? (moedaOrg as Currency) : "BRL";

  return (
    <div>
      <header className="mb-6 flex justify-end">
        <div className="rounded-lg border border-border bg-card px-4 py-3 min-w-[240px]">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Status atual</div>
          <div className="mt-1 flex items-center gap-2 font-semibold">
            <CreditCard className="w-4 h-4 text-primary" />
            {currentOrg?.billing_status === "trialing" ? "Trial" : currentOrg?.billing_status ?? "Nao configurado"}
          </div>
          {trial.isTrial && (
            <div className={trial.expired ? "text-sm text-urgent-500 mt-1" : "text-sm text-muted-foreground mt-1"}>
              {trial.expired ? "Trial encerrado" : `${trial.daysLeft} dias restantes`}
            </div>
          )}
          {canOpenPortal && (
            <form action={abrirPortalCliente} className="mt-3">
              <button className="btn-secondary w-full text-sm">Portal do cliente</button>
            </form>
          )}
        </div>
      </header>

      {/* Consumo de IA do mês corrente */}
      <section className="mb-6">
        <AiOverageCard organizacaoId={orgId} />
      </section>

      <section className="grid md:grid-cols-3 gap-4">
        {PLANS.map((plan) => {
          const current = currentOrg?.plano === plan.code;
          const checkoutReady = isStripeConfiguredForPlan(plan.code, currency);
          return (
            <article key={plan.code} className={`card p-5 flex flex-col ${plan.code === "growth" ? "ring-1 ring-primary/40 shadow-sm" : ""}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">{plan.name}</h2>
                  <p className="text-sm text-muted-foreground mt-1">{plan.description}</p>
                </div>
                {plan.code === "growth" && (
                  <span className="rounded-full bg-primary/10 text-primary text-xs font-medium px-2 py-1">Mais indicado</span>
                )}
              </div>

              <div className="mt-5 text-2xl font-semibold">{priceLabelOf(plan, currency as CurrencyCode)}</div>

              <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
                <Limit label="Usuarios" value={plan.limits.seats} />
                <Limit label="Leads/mes" value={plan.limits.leadsMonth} />
                <Limit label="IA/mes" value={plan.limits.aiActionsMonth} />
              </div>

              <ul className="mt-5 space-y-2 text-sm text-muted-foreground flex-1">
                {plan.highlights.map((highlight) => (
                  <li key={highlight} className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-success-500" />
                    {highlight}
                  </li>
                ))}
              </ul>

              <form action={iniciarCheckout.bind(null, plan.code)} className="mt-6">
                <button
                  disabled={current || !checkoutReady}
                  className={current ? "btn-secondary w-full" : checkoutReady ? "btn-primary w-full" : "btn-primary w-full opacity-70 cursor-not-allowed"}
                >
                  {current ? "Plano atual" : checkoutReady ? "Assinar plano" : "Checkout em configuracao"}
                </button>
              </form>
            </article>
          );
        })}
      </section>

      <section className="mt-6 grid md:grid-cols-2 gap-4">
        <div className="card p-5">
          <div className="flex items-center gap-2 font-semibold mb-2">
            <Sparkles className="w-4 h-4 text-primary" /> Proximo passo de monetizacao
          </div>
          <p className="text-sm text-muted-foreground">
            Conectar Stripe Checkout, Customer Portal e webhooks de assinatura usando os campos ja preparados na organizacao.
          </p>
        </div>
        <div className="card p-5">
          <div className="flex items-center gap-2 font-semibold mb-2">
            <ShieldCheck className="w-4 h-4 text-success-500" /> Operacao
          </div>
          <p className="text-sm text-muted-foreground">
            Enquanto o checkout nao estiver ativo, gestores conseguem acompanhar trial, limites e preparar API/Webhooks.
          </p>
          <Link href="/configuracoes/desenvolvedores" className="btn-secondary mt-4 text-sm">
            Abrir API & Webhooks
          </Link>
        </div>
      </section>
    </div>
  );
}

function Limit({ label, value }: { label: string; value: number | "unlimited" }) {
  return (
    <div className="rounded-lg bg-muted/50 px-2 py-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="font-semibold">{value === "unlimited" ? "Ilimitado" : value.toLocaleString("pt-BR")}</div>
    </div>
  );
}
