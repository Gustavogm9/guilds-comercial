import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import {
  AlertTriangle,
  CalendarClock,
  Check,
  CheckCircle2,
  CreditCard,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { PLANS, getBillingAccessState, getTrialState, priceLabelOf, type CurrencyCode } from "@/lib/billing";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId, getCurrentRole } from "@/lib/supabase/org";
import { abrirPortalCliente, iniciarCheckout } from "./actions";
import { isStripeConfiguredForPlan, SUPPORTED_CURRENCIES, type Currency } from "@/lib/stripe";
import AiOverageCard from "@/components/billing/ai-overage-card";

export const dynamic = "force-dynamic";

type BillingPageProps = {
  searchParams?: Promise<{ checkout?: string; blocked?: string }>;
};

type BillingOrg = {
  plano?: string | null;
  billing_status?: string | null;
  trial_ends_at?: string | null;
  stripe_customer_id?: string | null;
  stripe_subscription_id?: string | null;
  moeda_padrao?: string | null;
};

export default async function BillingPage(props: BillingPageProps) {
  const searchParams = props.searchParams ? await props.searchParams : {};
  const orgId = await getCurrentOrgId();
  if (!orgId) redirect("/hoje");

  const role = await getCurrentRole();
  const isGestor = role === "gestor";

  const supabase = createClient();
  const mesInicio = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
  const [{ data: org }, membrosAtivos, leadsMes] = await Promise.all([
    supabase.from("organizacoes").select("*").eq("id", orgId).maybeSingle(),
    supabase
      .from("membros_organizacao")
      .select("profile_id", { count: "exact", head: true })
      .eq("organizacao_id", orgId)
      .eq("ativo", true),
    supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("organizacao_id", orgId)
      .gte("created_at", mesInicio),
  ]);

  const currentOrg = org as BillingOrg | null;
  const trial = getTrialState(currentOrg?.trial_ends_at, currentOrg?.billing_status);
  const access = getBillingAccessState(currentOrg);
  const canOpenPortal = isGestor && Boolean(currentOrg?.stripe_customer_id && process.env.STRIPE_SECRET_KEY);
  const moedaOrg = currentOrg?.moeda_padrao ?? "BRL";
  const currency: Currency = SUPPORTED_CURRENCIES.includes(moedaOrg as Currency)
    ? (moedaOrg as Currency)
    : "BRL";
  const currentPlan = PLANS.find((plan) => plan.code === currentOrg?.plano) ?? null;
  const usagePlan = currentPlan ?? PLANS[0];
  const checkoutReadyPlans = PLANS.filter((plan) => isStripeConfiguredForPlan(plan.code, currency));
  const stripeSecretConfigured = Boolean(process.env.STRIPE_SECRET_KEY);
  const webhookConfigured = Boolean(process.env.STRIPE_WEBHOOK_SECRET);
  const billingStatus = getBillingStatusLabel(currentOrg?.billing_status, trial);
  const statusTone = getBillingTone(currentOrg?.billing_status, trial);
  const checkoutFeedback = searchParams.checkout;

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground font-semibold">
            Configuracoes
          </div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Billing e trial</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Acompanhe status comercial, limites de uso e prontidao do checkout antes de virar a chave em producao.
          </p>
        </div>

        <div className="card p-4 w-full lg:w-[360px]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground">Status atual</div>
              <div className="mt-1 flex items-center gap-2 font-semibold">
                <CreditCard className="w-4 h-4 text-primary" />
                {billingStatus}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {currentPlan ? `${currentPlan.name} · ${priceLabelOf(currentPlan, currency as CurrencyCode)}` : "Sem plano pago ativo"}
              </div>
            </div>
            <StatusBadge tone={statusTone}>
              {statusTone === "success" ? "Ok" : statusTone === "warning" ? "Atencao" : "Acao"}
            </StatusBadge>
          </div>

          {trial.isTrial && (
            <div className="mt-4 rounded-lg border border-border bg-muted/40 p-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <CalendarClock className="w-4 h-4 text-primary" />
                {trial.expired ? "Trial encerrado" : `${trial.daysLeft} dias de trial restantes`}
              </div>
              {currentOrg?.trial_ends_at && (
                <div className="text-xs text-muted-foreground mt-1">
                  Termina em {new Date(currentOrg.trial_ends_at).toLocaleDateString("pt-BR")}
                </div>
              )}
            </div>
          )}

          {canOpenPortal ? (
            <form action={abrirPortalCliente} className="mt-3">
              <button className="btn-secondary w-full text-sm">Portal do cliente</button>
            </form>
          ) : (
            <div className="mt-3 text-xs text-muted-foreground">
              Portal disponivel depois que a organizacao tiver customer no Stripe.
            </div>
          )}
        </div>
      </header>

      {checkoutFeedback === "sucesso" && (
        <div className="rounded-lg border border-success-500/30 bg-success-500/5 px-4 py-3 flex items-start gap-2">
          <CheckCircle2 className="w-4 h-4 text-success-500 mt-0.5" />
          <div>
            <div className="text-sm font-medium">Checkout concluido</div>
            <div className="text-xs text-muted-foreground">
              A assinatura sera refletida quando o webhook do Stripe processar o evento.
            </div>
          </div>
        </div>
      )}

      {checkoutFeedback === "cancelado" && (
        <div className="rounded-lg border border-warning-500/30 bg-warning-500/5 px-4 py-3 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-warning-500 mt-0.5" />
          <div>
            <div className="text-sm font-medium">Checkout cancelado</div>
            <div className="text-xs text-muted-foreground">
              Nenhuma cobranca foi criada. Escolha um plano quando quiser retomar.
            </div>
          </div>
        </div>
      )}

      {!access.allowed && (
        <section className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3">
          <div className="flex items-start gap-3">
            <CreditCard className="mt-0.5 h-5 w-5 text-destructive" />
            <div>
              <h2 className="text-sm font-semibold text-destructive">Acesso limitado por billing</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {billingBlockedMessage(access.reason)}
              </p>
              {!isGestor && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Apenas gestores podem regularizar assinatura ou abrir o portal do cliente.
                </p>
              )}
            </div>
          </div>
        </section>
      )}

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <AiOverageCard organizacaoId={orgId} />
        <div className="card p-5">
          <div className="flex items-center gap-2 font-semibold mb-4">
            <ShieldCheck className="w-4 h-4 text-success-500" /> Prontidao de billing
          </div>
          <div className="space-y-3">
            <ReadinessItem
              done={stripeSecretConfigured}
              label="Stripe secret configurado"
              detail={stripeSecretConfigured ? "Checkout pode criar sessoes." : "Configure STRIPE_SECRET_KEY."}
            />
            <ReadinessItem
              done={checkoutReadyPlans.length > 0}
              label="Prices dos planos"
              detail={
                checkoutReadyPlans.length > 0
                  ? `${checkoutReadyPlans.length} de ${PLANS.length} planos com price em ${currency}.`
                  : `Configure STRIPE_PRICE_* para ${currency}.`
              }
            />
            <ReadinessItem
              done={webhookConfigured}
              label="Webhook do Stripe"
              detail={webhookConfigured ? "Eventos podem sincronizar assinaturas." : "Configure STRIPE_WEBHOOK_SECRET."}
            />
            <ReadinessItem
              done={canOpenPortal}
              label="Portal do cliente"
              detail={canOpenPortal ? "Customer conectado." : "Disponivel apos primeiro checkout."}
            />
          </div>
          <Link href="/configuracoes/desenvolvedores" className="btn-secondary mt-4 text-sm">
            Abrir API & Webhooks
          </Link>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-3">
        <MetricTile label="Usuarios ativos" value={membrosAtivos.count ?? 0} limit={usagePlan.limits.seats} />
        <MetricTile label="Leads criados no mes" value={leadsMes.count ?? 0} limit={usagePlan.limits.leadsMonth} />
        <MetricTile label="Moeda da conta" value={currency} limit="Configuracao comercial" />
      </section>

      <section className="grid md:grid-cols-3 gap-4">
        {PLANS.map((plan) => {
          const current = currentOrg?.plano === plan.code;
          const checkoutReady = isGestor && isStripeConfiguredForPlan(plan.code, currency);
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
                  {current ? "Plano atual" : checkoutReady ? "Assinar plano" : isGestor ? "Checkout em configuracao" : "Apenas gestor"}
                </button>
              </form>
              {!checkoutReady && (
                <div className="mt-2 text-[11px] text-muted-foreground text-center">
                  Falta price Stripe para {plan.name} em {currency}.
                </div>
              )}
            </article>
          );
        })}
      </section>

      <section className="grid md:grid-cols-2 gap-4">
        <div className="card p-5">
          <div className="flex items-center gap-2 font-semibold mb-2">
            <Sparkles className="w-4 h-4 text-primary" /> Proximo passo de monetizacao
          </div>
          <p className="text-sm text-muted-foreground">
            Use o trial e o consumo real para recomendar o plano certo, em vez de tratar billing como uma tela isolada de checkout.
          </p>
        </div>
        <NextBillingAction
          trialExpired={trial.expired}
          hasActivePlan={currentOrg?.billing_status === "active"}
          checkoutReady={checkoutReadyPlans.length > 0}
        />
      </section>
    </div>
  );
}

function getBillingStatusLabel(
  status: string | undefined | null,
  trial: ReturnType<typeof getTrialState>
) {
  if (status === "active") return "Assinatura ativa";
  if (status === "past_due") return "Pagamento pendente";
  if (status === "canceled") return "Assinatura cancelada";
  if (trial.isTrial && trial.expired) return "Trial encerrado";
  if (trial.isTrial) return "Trial";
  return status ?? "Nao configurado";
}

function getBillingTone(
  status: string | undefined | null,
  trial: ReturnType<typeof getTrialState>
): "success" | "warning" | "danger" {
  if (status === "active") return "success";
  if (status === "past_due" || status === "canceled" || trial.expired) return "danger";
  if (trial.isTrial && (trial.daysLeft ?? 99) <= 3) return "warning";
  return "success";
}

function Limit({ label, value }: { label: string; value: number | "unlimited" }) {
  return (
    <div className="rounded-lg bg-muted/50 px-2 py-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="font-semibold">{value === "unlimited" ? "Ilimitado" : value.toLocaleString("pt-BR")}</div>
    </div>
  );
}

function StatusBadge({ tone, children }: { tone: "success" | "warning" | "danger"; children: ReactNode }) {
  const classes = {
    success: "border-success-500/30 bg-success-500/10 text-success-500",
    warning: "border-warning-500/30 bg-warning-500/10 text-warning-500",
    danger: "border-urgent-500/30 bg-urgent-500/10 text-urgent-500",
  };
  return (
    <span className={`rounded border px-2 py-1 text-[10px] uppercase tracking-[0.12em] font-semibold ${classes[tone]}`}>
      {children}
    </span>
  );
}

function ReadinessItem({ done, label, detail }: { done: boolean; label: string; detail: string }) {
  return (
    <div className="flex items-start gap-2">
      {done ? (
        <CheckCircle2 className="w-4 h-4 text-success-500 mt-0.5 shrink-0" />
      ) : (
        <AlertTriangle className="w-4 h-4 text-warning-500 mt-0.5 shrink-0" />
      )}
      <div>
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-muted-foreground">{detail}</div>
      </div>
    </div>
  );
}

function MetricTile({
  label,
  value,
  limit,
}: {
  label: string;
  value: number | string;
  limit: number | "unlimited" | string;
}) {
  const numericLimit = typeof limit === "number" ? limit : null;
  const numericValue = typeof value === "number" ? value : null;
  const ratio = numericLimit && numericValue !== null ? numericValue / numericLimit : 0;
  const tone = ratio >= 1 ? "text-urgent-500" : ratio >= 0.8 ? "text-warning-500" : "text-foreground";

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground font-semibold">{label}</div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${tone}`}>
        {typeof value === "number" ? value.toLocaleString("pt-BR") : value}
      </div>
      <div className="mt-1 text-xs text-muted-foreground">
        {typeof limit === "number"
          ? `Limite ${limit.toLocaleString("pt-BR")}`
          : limit === "unlimited"
            ? "Limite ilimitado"
            : limit}
      </div>
    </div>
  );
}

function NextBillingAction({
  trialExpired,
  hasActivePlan,
  checkoutReady,
}: {
  trialExpired: boolean;
  hasActivePlan: boolean;
  checkoutReady: boolean;
}) {
  const title = hasActivePlan
    ? "Operacao comercial ativa"
    : trialExpired
      ? "Converter conta antes de bloquear uso"
      : "Proximo passo operacional";
  const message = hasActivePlan
    ? "Acompanhe overage de IA e mantenha o portal do cliente acessivel para segunda via e mudancas de plano."
    : checkoutReady
      ? "Checkout ja esta pronto. Use esta tela para conduzir o gestor do trial para o plano adequado."
      : "Finalize prices, webhook e portal no Stripe para permitir conversao do trial sem intervencao manual.";

  return (
    <div className="card p-5">
      <div className="flex items-center gap-2 font-semibold mb-2">
        <ShieldCheck className={hasActivePlan ? "w-4 h-4 text-success-500" : "w-4 h-4 text-warning-500"} />
        {title}
      </div>
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

function billingBlockedMessage(reason: string) {
  if (reason === "trial_expired") return "O trial terminou. Escolha um plano para liberar novamente o uso do sistema.";
  if (reason === "past_due") return "A assinatura está em atraso. Atualize o pagamento no Stripe para reativar o acesso.";
  if (reason === "canceled") return "A assinatura foi cancelada. Assine um plano para retomar a operação.";
  if (reason === "inactive") return "Esta organização está desativada. Entre em contato com o suporte ou com o gestor da conta.";
  return "Regularize o billing para continuar usando o sistema.";
}
