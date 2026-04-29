import { TrendingUp, AlertCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/server";

/**
 * Card de "Consumo de IA este mês" — server component.
 * Lê v_ai_usage_atual + ai_usage_mensal pra mostrar:
 *   - Total invocações vs limite incluído
 *   - Overage (qtd + R$)
 *   - Top 3 features por gasto
 *   - Aviso visual em 80% e 100%
 */
export default async function AiOverageCard({ organizacaoId }: { organizacaoId: string }) {
  const supabase = createClient();

  const [{ data: resumo }, { data: porFeature }] = await Promise.all([
    supabase
      .from("v_ai_usage_atual")
      .select("*")
      .eq("organizacao_id", organizacaoId)
      .maybeSingle(),
    supabase
      .from("ai_usage_mensal")
      .select("feature_codigo, invocacoes, invocacoes_overage, valor_overage_centavos")
      .eq("organizacao_id", organizacaoId)
      .gte("periodo_inicio", new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10))
      .order("valor_overage_centavos", { ascending: false }),
  ]);

  const total = resumo?.total_invocacoes ?? 0;
  const limite = resumo?.limite_mes ?? 300;
  const overage = resumo?.total_overage ?? 0;
  const valorCents = resumo?.valor_overage_centavos ?? 0;
  const valorReais = valorCents / 100;
  const ilimitado = limite >= 2_000_000_000;
  const pct = ilimitado ? 0 : Math.min(100, (total / limite) * 100);
  const atingiu80 = pct >= 80 && pct < 100;
  const atingiu100 = pct >= 100 || overage > 0;

  return (
    <div className="card p-5">
      <div className="flex items-center gap-2 font-semibold mb-3">
        <TrendingUp className="w-4 h-4 text-primary" />
        Consumo de IA · este mês
      </div>

      {/* Linha de progresso */}
      <div className="mb-4">
        <div className="flex items-baseline justify-between mb-1.5">
          <div className="text-2xl font-semibold">
            {total.toLocaleString("pt-BR")}
            <span className="text-sm font-normal text-muted-foreground ml-1">
              / {ilimitado ? "ilimitado" : limite.toLocaleString("pt-BR")}
            </span>
          </div>
          <div className="text-xs text-muted-foreground">invocações</div>
        </div>
        {!ilimitado && (
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                atingiu100 ? "bg-urgent-500" : atingiu80 ? "bg-warning-500" : "bg-primary"
              }`}
              style={{ width: `${Math.min(100, pct)}%` }}
            />
          </div>
        )}
      </div>

      {/* Aviso 80% / 100% */}
      {atingiu100 && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-urgent-500/10 border border-urgent-500/30 mb-3">
          <AlertCircle className="w-4 h-4 text-urgent-500 mt-0.5 flex-shrink-0" />
          <div className="text-sm">
            <div className="font-medium text-foreground">
              Limite incluído atingido — overage cobrado
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {overage.toLocaleString("pt-BR")} invocações extras · estimativa de{" "}
              <strong className="text-foreground">R$ {valorReais.toFixed(2)}</strong>
              {" "}na próxima fatura.
            </div>
          </div>
        </div>
      )}
      {atingiu80 && !atingiu100 && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-warning-500/10 border border-warning-500/30 mb-3">
          <AlertCircle className="w-4 h-4 text-warning-500 mt-0.5 flex-shrink-0" />
          <div className="text-sm">
            <div className="font-medium text-foreground">Atenção: 80% do limite atingido</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              Invocações além de {limite.toLocaleString("pt-BR")} serão cobradas a R$0,15–R$1,00 cada (depende da feature).
            </div>
          </div>
        </div>
      )}

      {/* Top features */}
      {porFeature && porFeature.length > 0 && (
        <details className="mt-2">
          <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground select-none">
            Detalhamento por feature ({porFeature.length})
          </summary>
          <table className="w-full text-sm mt-3">
            <thead className="text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border/50">
              <tr>
                <th className="text-left py-1.5 font-medium">Feature</th>
                <th className="text-right py-1.5 font-medium">Total</th>
                <th className="text-right py-1.5 font-medium">Extras</th>
                <th className="text-right py-1.5 font-medium">R$</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30">
              {porFeature.map((f) => (
                <tr key={f.feature_codigo}>
                  <td className="py-1.5 text-foreground truncate max-w-[200px]">{f.feature_codigo}</td>
                  <td className="text-right text-muted-foreground">{f.invocacoes}</td>
                  <td className="text-right text-muted-foreground">{f.invocacoes_overage > 0 ? f.invocacoes_overage : "—"}</td>
                  <td className="text-right font-mono text-foreground">
                    {f.valor_overage_centavos > 0
                      ? `R$ ${(f.valor_overage_centavos / 100).toFixed(2)}`
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
    </div>
  );
}
