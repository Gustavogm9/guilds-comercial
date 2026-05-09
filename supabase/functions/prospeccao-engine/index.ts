/**
 * prospeccao-engine — Edge Function periódica de prospecção automática
 *
 * Executa automaticamente campanhas agendadas de look-alike para cada organização
 * com hipóteses ICP ativas. Pode ser chamada:
 *   - Via webhook (GET com secret)
 *   - Via pg_cron: select cron.schedule('0 8 * * *', 'select net.http_post(...)')
 *   - Via Supabase Dashboard → Edge Functions → Schedules
 *
 * Autenticação: header Authorization: Bearer <PROSPECCAO_ENGINE_SECRET>
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SECRET = Deno.env.get("PROSPECCAO_ENGINE_SECRET") ?? "change-me";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const APP_URL = Deno.env.get("NEXT_PUBLIC_APP_URL") ?? "http://localhost:3000";

Deno.serve(async (req: Request) => {
  // Verificação de segredo
  const auth = req.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${SECRET}`) {
    return new Response(JSON.stringify({ erro: "Não autorizado." }), { status: 401 });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const resultados: Record<string, any>[] = [];

  try {
    // Busca todas as campanhas com status 'aguardando' criadas automaticamente
    // (configuracao.auto = true), limitado a 10 por execução para não estourar timeout
    const { data: campanhas } = await supabase
      .from("campanhas_prospeccao")
      .select("id, organizacao_id, nome, configuracao")
      .eq("status", "aguardando")
      .filter("configuracao->>auto", "eq", "true")
      .order("created_at", { ascending: true })
      .limit(10);

    if (!campanhas?.length) {
      return new Response(JSON.stringify({ ok: true, executadas: 0, msg: "Nenhuma campanha automática pendente." }), { status: 200 });
    }

    for (const campanha of campanhas) {
      try {
        const res = await fetch(`${APP_URL}/api/prospeccao/campanhas/${campanha.id}/executar`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-internal-engine": "1",
            "x-engine-secret": SECRET,
          },
        });
        const data = await res.json();
        resultados.push({ id: campanha.id, nome: campanha.nome, ...data });
      } catch (err: any) {
        resultados.push({ id: campanha.id, nome: campanha.nome, erro: err.message });
        await supabase.from("campanhas_prospeccao")
          .update({ status: "erro", erro_detalhes: err.message })
          .eq("id", campanha.id);
      }
    }

    // Também cria campanhas automáticas para hipóteses ativas sem campanha recente (últimas 72h)
    const { data: hipAtivas } = await supabase
      .from("icp_hipoteses")
      .select("id, organizacao_id, nome, segmentos, cidades, cargos")
      .eq("status", "ativa")
      .not("organizacao_id", "is", null);

    if (hipAtivas) {
      for (const hip of hipAtivas.slice(0, 5)) {
        // Verifica se já tem campanha nas últimas 48h
        const { count } = await supabase
          .from("campanhas_prospeccao")
          .select("id", { count: "exact" })
          .eq("hipotese_id", hip.id)
          .gte("created_at", new Date(Date.now() - 48 * 3600_000).toISOString());

        if (count && count > 0) continue;

        // Cria campanha automática
        await supabase.from("campanhas_prospeccao").insert({
          organizacao_id: hip.organizacao_id,
          nome: `Auto: ${hip.nome} — ${new Date().toLocaleDateString("pt-BR")}`,
          hipotese_id: hip.id,
          status: "aguardando",
          configuracao: {
            auto: true,
            max_leads: 10,
            max_queries: 2,
            regioes: hip.cidades?.flatMap((c: string) => c.match(/\b([A-Z]{2})\b/g) ?? []) ?? [],
            segmentos: hip.segmentos ?? [],
            iniciar_cadencia: false,
          },
        });
      }
    }

    return new Response(JSON.stringify({
      ok: true,
      executadas: campanhas.length,
      resultados,
      timestamp: new Date().toISOString(),
    }), { headers: { "Content-Type": "application/json" } });
  } catch (err: any) {
    return new Response(JSON.stringify({ erro: err.message }), { status: 500 });
  }
});
