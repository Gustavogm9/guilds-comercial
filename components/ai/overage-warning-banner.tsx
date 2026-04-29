import { AlertTriangle, AlertCircle } from "lucide-react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

/**
 * Banner exibido no topo de /admin/ai quando o consumo do mês corrente
 * passa de 80% (warning) ou 100% (urgent / overage ativo).
 *
 * Server component — lê v_ai_usage_atual da org ativa.
 */
export default async function OverageWarningBanner({ organizacaoId }: { organizacaoId: string }) {
  const supabase = createClient();
  const { data } = await supabase
    .from("v_ai_usage_atual")
    .select("total_invocacoes, total_overage, valor_overage_centavos, limite_mes, plano")
    .eq("organizacao_id", organizacaoId)
    .maybeSingle();

  if (!data) return null;
  const limite = data.limite_mes ?? 300;
  const total = data.total_invocacoes ?? 0;
  const overage = data.total_overage ?? 0;
  const valorReais = (data.valor_overage_centavos ?? 0) / 100;
  const ilimitado = limite >= 2_000_000_000;

  if (ilimitado) return null;

  const pct = (total / limite) * 100;
  if (pct < 80) return null;

  const atingiuOverage = overage > 0 || pct >= 100;

  return (
    <div
      className={`mb-4 p-3 rounded-lg border flex items-start gap-3 ${
        atingiuOverage
          ? "bg-urgent-500/10 border-urgent-500/30"
          : "bg-warning-500/10 border-warning-500/30"
      }`}
    >
      {atingiuOverage ? (
        <AlertCircle className="w-5 h-5 text-urgent-500 mt-0.5 flex-shrink-0" />
      ) : (
        <AlertTriangle className="w-5 h-5 text-warning-500 mt-0.5 flex-shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-foreground">
          {atingiuOverage
            ? `Limite incluído ultrapassado · estimativa de R$ ${valorReais.toFixed(2)} de overage`
            : `Você está em ${pct.toFixed(0)}% do limite mensal incluído`}
        </div>
        <div className="text-xs text-muted-foreground mt-0.5">
          {atingiuOverage
            ? `${overage.toLocaleString("pt-BR")} invocações extras este mês. Será cobrado na próxima fatura.`
            : `${total.toLocaleString("pt-BR")} de ${limite.toLocaleString("pt-BR")} invocações no plano ${data.plano ?? "atual"}. Acima disso, cobramos R$0,15–R$1,00 por chamada (depende da feature).`}
        </div>
      </div>
      <Link href="/configuracoes/billing" className="btn-secondary text-xs flex-shrink-0">
        Ver detalhes
      </Link>
    </div>
  );
}
