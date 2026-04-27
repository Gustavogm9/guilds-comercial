import Link from "next/link";
import { AlertCircle, CreditCard } from "lucide-react";
import { getTrialState } from "@/lib/billing";

export default function TrialBanner({
  trialEndsAt,
  billingStatus,
}: {
  trialEndsAt?: string | null;
  billingStatus?: string | null;
}) {
  const trial = getTrialState(trialEndsAt, billingStatus);
  if (!trial.isTrial) return null;

  return (
    <div className={`${trial.expired ? "bg-red-50 border-red-200 text-red-800" : "bg-amber-50 border-amber-200 text-amber-900"} border-b px-4 py-2`}>
      <div className="max-w-7xl mx-auto flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between text-sm">
        <div className="flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>
            {trial.expired ? "Trial encerrado." : `Trial em andamento: ${trial.daysLeft} dia${trial.daysLeft === 1 ? "" : "s"} restante${trial.daysLeft === 1 ? "" : "s"}.`}
          </span>
        </div>
        <Link href="/configuracoes/billing" className="inline-flex items-center gap-1 font-medium hover:underline">
          <CreditCard className="w-4 h-4" /> Ver planos
        </Link>
      </div>
    </div>
  );
}
