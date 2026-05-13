import { createClient, getCurrentProfile } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/supabase/org";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import {
  ChevronLeft, Package, Users, TrendingUp, BarChart3,
  Target, AlertCircle, Star,
} from "lucide-react";
import { IcpProdutoWidget, LookalikeWidget } from "../../icp-lookalike";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ produtoId: string }> };

const STATUS_STAGE: Record<string, { label: string; cor: string; bg: string }> = {
  interesse:  { label: "Interesse",  cor: "text-blue-700",   bg: "bg-blue-500/10 border-blue-500/30" },
  negociando: { label: "Negociando", cor: "text-amber-700",  bg: "bg-amber-500/10 border-amber-500/30" },
  fechado:    { label: "Fechado",    cor: "text-green-700",  bg: "bg-green-500/10 border-green-500/30" },
  perdido:    { label: "Perdido",    cor: "text-red-700",    bg: "bg-red-500/10 border-red-500/30" },
};

export default async function FunilProdutoPage({ params }: Params) {
  const { produtoId } = await params;
  if (!/^\d+$/.test(produtoId)) notFound();
  const pid = parseInt(produtoId, 10);

  const me = await getCurrentProfile();
  if (!me) redirect("/login");

  const orgId = await getCurrentOrgId();
  if (!orgId) redirect("/hoje");

  const supabase = createClient();

  const [
    { data: produto },
    { data: leadProdutos },
    { data: variacoes },
    { data: responsaveis },
    { data: cases },
    { data: leadsLookalikeData },
  ] = await Promise.all([
    supabase.from("produtos")
      .select("id, nome, descricao, categoria, recorrente, valor_base, valor_max, segmentos_alvo, cargos_alvo, icp_extraido")
      .eq("id", pid).eq("organizacao_id", orgId).maybeSingle(),
    supabase.from("lead_produtos")
      .select("lead_id, status, added_at, leads(id, empresa, nome, crm_stage, temperatura, segmento, responsavel_id, valor_potencial)")
      .eq("produto_id", pid)
      .order("added_at", { ascending: false }),
    supabase.from("produto_variacoes")
      .select("id, nome, valor, recorrente, ativo")
      .eq("produto_id", pid).eq("ativo", true).order("ordem"),
    supabase.from("produto_responsaveis")
      .select("papel, profiles(display_name, email)")
      .eq("produto_id", pid),
    supabase.from("portfolio_cases")
      .select("id, titulo, cliente_nome, resultado, destaque")
      .eq("produto_id", pid).eq("organizacao_id", orgId).limit(5),
    supabase.from("leads")
      .select("id, empresa, nome, crm_stage, temperatura, segmento, valor_potencial, produto_scores")
      .eq("organizacao_id", orgId)
      .neq("crm_stage", "Fechado")
      .neq("crm_stage", "Perdido")
      // Usa .filter no jsonb para pegar score >= 60. Usamos texto '60' porque ->> retorna texto.
      .filter(`produto_scores->>${pid}`, "gte", "60")
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  if (!produto) notFound();

  // Agrupa leads por status
  const porStatus: Record<string, any[]> = { interesse: [], negociando: [], fechado: [], perdido: [] };
  const linkedLeadIds = new Set();
  (leadProdutos ?? []).forEach((lp: any) => {
    if (porStatus[lp.status]) porStatus[lp.status].push(lp);
    linkedLeadIds.add(lp.lead_id);
  });

  // Filtra os lookalikes para não mostrar leads que já estão vinculados a este produto
  const lookalikeLeads = (leadsLookalikeData ?? []).filter((l: any) => !linkedLeadIds.has(l.id));

  const total = (leadProdutos ?? []).length;
  const conv = porStatus.fechado.length > 0
    ? Math.round((porStatus.fechado.length / Math.max(porStatus.fechado.length + porStatus.perdido.length, 1)) * 100)
    : 0;

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto">
      <Link href="/portfolio" className="btn-ghost text-xs mb-4 inline-flex">
        <ChevronLeft className="w-3.5 h-3.5" /> Voltar ao Portfolio
      </Link>

      {/* Header */}
      <div className="card p-5 md:p-6 mb-6">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <Package className="w-6 h-6 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-semibold">{produto.nome}</h1>
              {produto.categoria && (
                <span className="text-[10px] bg-secondary px-1.5 py-0.5 rounded text-muted-foreground">{produto.categoria}</span>
              )}
              {produto.recorrente && (
                <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded font-medium">MRR</span>
              )}
            </div>
            {produto.descricao && <p className="text-sm text-muted-foreground mt-1">{produto.descricao}</p>}
            {(produto.segmentos_alvo?.length > 0 || produto.cargos_alvo?.length > 0) && (
              <div className="flex flex-wrap gap-1 mt-2">
                {(produto.segmentos_alvo ?? []).map((s: string) => (
                  <span key={s} className="text-[10px] bg-blue-500/10 text-blue-700 px-1.5 py-0.5 rounded">{s}</span>
                ))}
                {(produto.cargos_alvo ?? []).map((c: string) => (
                  <span key={c} className="text-[10px] bg-purple-500/10 text-purple-700 px-1.5 py-0.5 rounded">{c}</span>
                ))}
              </div>
            )}
          </div>
          <div className="text-right shrink-0">
            {produto.valor_base && (
              <div className="text-lg font-bold">
                R$ {Number(produto.valor_base).toLocaleString("pt-BR")}
                {produto.valor_max ? ` – ${Number(produto.valor_max).toLocaleString("pt-BR")}` : ""}
              </div>
            )}
            {produto.recorrente && <div className="text-[10px] text-muted-foreground">/mês</div>}
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {[
          { label: "Total de leads", valor: total, icon: <Users className="w-4 h-4 text-blue-600" />, bg: "bg-blue-500/10" },
          { label: "Em negociação", valor: porStatus.negociando.length, icon: <Target className="w-4 h-4 text-amber-600" />, bg: "bg-amber-500/10" },
          { label: "Fechamentos", valor: porStatus.fechado.length, icon: <TrendingUp className="w-4 h-4 text-green-600" />, bg: "bg-green-500/10" },
          { label: "Taxa conversão", valor: `${conv}%`, icon: <BarChart3 className="w-4 h-4 text-primary" />, bg: "bg-primary/10" },
        ].map(k => (
          <div key={k.label} className="card p-4 flex items-center gap-3">
            <div className={`w-9 h-9 rounded-lg ${k.bg} flex items-center justify-center shrink-0`}>{k.icon}</div>
            <div>
              <div className="text-lg font-bold">{k.valor}</div>
              <div className="text-[11px] text-muted-foreground">{k.label}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Funil de leads por status */}
        <div className="lg:col-span-2 space-y-4">
          {(["interesse", "negociando", "fechado", "perdido"] as const).map(status => {
            const st = STATUS_STAGE[status];
            const leads = porStatus[status];
            if (leads.length === 0) return null;
            return (
              <div key={status} className="card overflow-hidden">
                <div className={`px-4 py-2.5 border-b flex items-center justify-between ${st.bg}`}>
                  <span className={`text-xs font-semibold ${st.cor}`}>{st.label}</span>
                  <span className={`text-xs font-bold ${st.cor}`}>{leads.length}</span>
                </div>
                <div className="divide-y divide-border/50">
                  {leads.map((lp: any) => {
                    const l = lp.leads;
                    if (!l) return null;
                    return (
                      <Link
                        key={lp.lead_id}
                        href={`/vendas/pipeline/${l.id}`}
                        className="flex items-center gap-3 px-4 py-3 hover:bg-secondary/30 transition-colors"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">{l.empresa ?? l.nome ?? "—"}</div>
                          <div className="text-[10px] text-muted-foreground">
                            {l.segmento ?? "—"}{l.crm_stage ? ` · ${l.crm_stage}` : ""}
                          </div>
                        </div>
                        {l.temperatura && (
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                            l.temperatura === "Quente" ? "bg-red-500/10 text-red-700"
                            : l.temperatura === "Morno" ? "bg-amber-500/10 text-amber-700"
                            : "bg-blue-500/10 text-blue-700"
                          }`}>
                            {l.temperatura}
                          </span>
                        )}
                        {l.valor_potencial && (
                          <span className="text-[10px] font-mono text-muted-foreground">
                            R$ {Number(l.valor_potencial).toLocaleString("pt-BR")}
                          </span>
                        )}
                        <ChevronLeft className="w-3.5 h-3.5 text-muted-foreground/30 rotate-180 shrink-0" />
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
          {total === 0 && (
            <div className="card p-10 text-center border-dashed">
              <AlertCircle className="w-8 h-8 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">Nenhum lead vinculado a este produto ainda.</p>
              <p className="text-xs text-muted-foreground mt-1">
                Abra um lead no pipeline e vincule-o a este produto.
              </p>
            </div>
          )}
        </div>

        {/* Sidebar: planos, equipe, cases, ICP */}
        <div className="space-y-4">
          <IcpProdutoWidget produtoId={pid} icpAtual={produto.icp_extraido} />
          
          {lookalikeLeads.length > 0 && (
            <div className="card p-4 border-blue-500/30 bg-blue-500/5">
              <div className="text-xs font-semibold mb-3 text-blue-700 uppercase tracking-wider flex items-center gap-1.5">
                <Target className="w-3.5 h-3.5" /> Leads com Alto Fit
              </div>
              <div className="space-y-2">
                {lookalikeLeads.map((l: any) => (
                  <Link href={`/vendas/pipeline/${l.id}`} key={l.id} className="block p-2 rounded bg-background border border-border hover:border-blue-500/50 transition-colors text-xs">
                    <div className="font-medium flex justify-between">
                      <span className="truncate pr-2">{l.empresa || l.nome}</span>
                      <span className="text-blue-600 shrink-0 font-bold">{l.produto_scores[pid]}%</span>
                    </div>
                    <div className="text-[10px] text-muted-foreground truncate">{l.segmento || "Sem segmento"}</div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          <LookalikeWidget produtoId={pid} temIcp={!!produto.icp_extraido} />

          {/* Planos/Variações */}
          {(variacoes ?? []).length > 0 && (
            <div className="card p-4">
              <div className="text-xs font-semibold mb-3 text-muted-foreground uppercase tracking-wider">Planos</div>
              <div className="space-y-2">
                {(variacoes ?? []).map((v: any) => (
                  <div key={v.id} className="flex items-center justify-between p-2 rounded border border-border">
                    <span className="text-xs font-medium">{v.nome}</span>
                    {v.valor && (
                      <span className="text-[10px] font-mono text-muted-foreground">
                        R$ {Number(v.valor).toLocaleString("pt-BR")}{v.recorrente ? "/mês" : ""}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Equipe */}
          {(responsaveis ?? []).length > 0 && (
            <div className="card p-4">
              <div className="text-xs font-semibold mb-3 text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5" /> Equipe
              </div>
              <div className="space-y-2">
                {(responsaveis ?? []).map((r: any, i: number) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <div className="w-6 h-6 rounded-full bg-secondary flex items-center justify-center text-[10px] font-bold text-muted-foreground">
                      {(r.profiles?.display_name ?? "?")[0]}
                    </div>
                    <span className="font-medium">{r.profiles?.display_name ?? r.profiles?.email}</span>
                    <span className="text-muted-foreground text-[10px] capitalize">{r.papel}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Cases de sucesso */}
          {(cases ?? []).length > 0 && (
            <div className="card p-4">
              <div className="text-xs font-semibold mb-3 text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <Star className="w-3.5 h-3.5 text-amber-500" /> Cases de sucesso
              </div>
              <div className="space-y-2">
                {(cases ?? []).map((c: any) => (
                  <div key={c.id} className="p-2 rounded border border-border text-xs">
                    <div className="font-medium">{c.titulo}</div>
                    {c.cliente_nome && <div className="text-muted-foreground">{c.cliente_nome}</div>}
                    {c.resultado && <div className="text-green-700 text-[10px] mt-0.5">{c.resultado}</div>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
