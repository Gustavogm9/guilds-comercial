import Link from "next/link";
import { AlertCircle, CreditCard } from "lucide-react";
import { getTrialState } from "@/lib/billing";
import { getServerLocale, getT } from "@/lib/i18n";

export default async function TrialBanner({
  trialEndsAt,
  billingStatus,
}: {
  trialEndsAt?: string | null;
  billingStatus?: string | null;
}) {
  const trial = getTrialState(trialEndsAt, billingStatus);
  if (!trial.isTrial) return null;

  const locale = await getServerLocale();
  const t = getT(locale);
  const dias = trial.daysLeft ?? 0;
  const msgKey = trial.expired
    ? "trial.encerrado"
    : dias === 1
    ? "trial.em_andamento_singular"
    : "trial.em_andamento_plural";
  const msg = t(msgKey).replace("{{n}}", String(dias));

  // Stripe-style alert: blue-tinted shadow on light, soft border-only on dark
  // Cores conforme estado: ruby (expired), warning amber (active)
  const tone = trial.expired
    ? "bg-destructive/10 border-destructive/25 text-destructive"
    : "bg-warning-500/10 border-warning-500/30 text-foreground";

  return (
    <div className={`${tone} border-b px-4 py-2`}>
      <div className="max-w-7xl mx-auto flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between text-sm">
        <div className="flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" aria-hidden />
          <span style={{ letterSpacing: "-0.13px" }}>{msg}</span>
        </div>
        <Link
          href="/configuracoes/billing"
          className="inline-flex items-center gap-1.5 font-medium hover:underline underline-offset-2"
          style={{ letterSpacing: "-0.13px" }}
        >
          <CreditCard className="w-4 h-4" /> {t("trial.ver_planos")}
        </Link>
      </div>
    </div>
  );
}
