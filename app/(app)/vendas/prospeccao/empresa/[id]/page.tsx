import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  ArrowLeft, Building2, DollarSign, Users, Calendar, ExternalLink, Linkedin,
  Mail, Phone, Tag, AlertCircle, Sparkles, Cake,
} from "lucide-react";
import { createClient, getCurrentProfile } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/supabase/org";
import VendasTabs from "../../../vendas-tabs";
import EmpresaDetalheClient from "./empresa-detalhe-client";

export const dynamic = "force-dynamic";

export default async function EmpresaDetalhePage(props: {
  params: Promise<{ id: string }>;
}) {
  const me = await getCurrentProfile();
  if (!me) return null;
  const orgId = await getCurrentOrgId();
  if (!orgId) redirect("/hoje");

  const { id } = await props.params;
  const empresaId = parseInt(id, 10);
  if (isNaN(empresaId)) notFound();

  const supabase = createClient();

  // Carrega tudo em paralelo
  const [
    empresaRes,
    metaRes,
    bookmarkRes,
    alertasRes,
    leadsLigados,
    similares,
    icpFitRes,
  ] = await Promise.all([
    supabase.from("v_prospeccao_empresa_completa").select("*").eq("id", empresaId).maybeSingle(),
    supabase.from("prospeccao_empresa_meta_org").select("*").eq("empresa_id", empresaId).eq("organizacao_id", orgId).maybeSingle(),
    supabase.from("prospeccao_empresa_bookmark").select("id").eq("empresa_id", empresaId).eq("profile_id", me.id).maybeSingle(),
    supabase.from("prospeccao_alerta_mudanca").select("*").eq("empresa_id", empresaId).order("created_at", { ascending: false }).limit(20),
    supabase.rpc("prospeccao_empresa_leads_da_org", { _empresa_id: empresaId, _org_id: orgId }),
    supabase.rpc("prospeccao_empresas_semelhantes", { _empresa_id: empresaId, _org_id: orgId, _limit: 8 }),
    supabase.rpc("icp_fit_score", { _empresa_id: empresaId, _org_id: orgId }),
  ]);
  const icpFitScore = (icpFitRes.data as number | null) ?? null;

  const empresa = empresaRes.data as any;
  if (!empresa) notFound();

  const meta = metaRes.data as any | null;
  const favoritado = !!bookmarkRes.data;
  const alertas = (alertasRes.data ?? []) as any[];
  const leadsRelacionados = (leadsLigados.data ?? []) as any[];
  const empresasSimilares = (similares.data ?? []) as any[];

  const labelEmpresa = empresa.nome_fantasia || empresa.razao_social || empresa.cnpj_formatado;
  const enderecoLinhas = [
    [empresa.logradouro, empresa.numero, empresa.complemento].filter(Boolean).join(", "),
    [empresa.bairro, empresa.cidade && empresa.uf ? `${empresa.cidade}/${empresa.uf}` : empresa.cidade ?? empresa.uf].filter(Boolean).join(" — "),
    empresa.cep ? `CEP ${empresa.cep.replace(/(\d{5})(\d{3})/, "$1-$2")}` : null,
  ].filter(Boolean);

  // Verifica se aniversário próximo (±15 dias do data_inicio_atividade)
  let aniversarioProximo = false;
  let aniversarioTexto: string | null = null;
  if (empresa.data_inicio_atividade) {
    const dataInicio = new Date(empresa.data_inicio_atividade);
    const hoje = new Date();
    const aniversarioEsteAno = new Date(hoje.getFullYear(), dataInicio.getMonth(), dataInicio.getDate());
    const diff = Math.round((aniversarioEsteAno.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
    if (Math.abs(diff) <= 15) {
      aniversarioProximo = true;
      aniversarioTexto = diff === 0 ? "Hoje" : diff > 0 ? `Em ${diff} dias` : `Há ${Math.abs(diff)} dias`;
    }
  }

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto">
      <VendasTabs />
      <Link href="/vendas/prospeccao/base-de-empresas" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mb-3">
        <ArrowLeft className="w-3 h-3" /> Voltar pra base de empresas
      </Link>

      {/* Header com nome + CNPJ + situacao + favorito */}
      <header className="mb-6 flex items-start justify-between gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl md:text-3xl font-semibold tracking-tight" style={{ letterSpacing: "-0.4px" }}>
              {labelEmpresa}
            </h1>
            <span className={`text-[10px] uppercase tracking-[0.12em] font-semibold px-1.5 py-0.5 rounded border ${
              empresa.situacao === "ATIVA" ? "text-success-500 bg-success-500/10 border-success-500/30" :
              empresa.situacao === "BAIXADA" ? "text-destructive bg-destructive/10 border-destructive/30" :
              "text-warning-500 bg-warning-500/10 border-warning-500/30"
            }`}>
              {empresa.situacao ?? "—"}
            </span>
            {empresa.porte && (
              <span className="text-[10px] uppercase tracking-[0.12em] font-semibold px-1.5 py-0.5 rounded border border-border bg-secondary text-muted-foreground">
                {empresa.porte}
              </span>
            )}
            {meta?.evitar && (
              <span className="text-[10px] uppercase tracking-[0.12em] font-semibold px-1.5 py-0.5 rounded border border-destructive/30 bg-destructive/10 text-destructive">
                ⚠ Evitar
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground tabular-nums font-mono mt-1">{empresa.cnpj_formatado}</p>
          {empresa.razao_social && empresa.nome_fantasia && empresa.razao_social !== empresa.nome_fantasia && (
            <p className="text-xs text-muted-foreground mt-0.5 italic">Razão social: {empresa.razao_social}</p>
          )}

          <div className="flex items-center gap-3 text-xs text-muted-foreground mt-3 flex-wrap">
            {icpFitScore != null && (
              <span className={`inline-flex items-center gap-1 tabular-nums font-semibold ${
                icpFitScore >= 80 ? "text-success-500" :
                icpFitScore >= 60 ? "text-warning-500" :
                "text-muted-foreground"
              }`} title="Similaridade com clientes fechados da sua org">
                <Sparkles className="w-3 h-3" />
                ICP fit {icpFitScore}/100
              </span>
            )}
            {empresa.anos_operacao != null && (
              <span className="inline-flex items-center gap-1 tabular-nums">
                <Calendar className="w-3 h-3" />
                {empresa.anos_operacao} {empresa.anos_operacao === 1 ? "ano" : "anos"} de atividade
              </span>
            )}
            {empresa.capital_social != null && (
              <span className="inline-flex items-center gap-1 tabular-nums">
                <DollarSign className="w-3 h-3" />
                {Number(empresa.capital_social).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })}
              </span>
            )}
            {empresa.total_socios > 0 && (
              <span className="inline-flex items-center gap-1">
                <Users className="w-3 h-3" /> {empresa.total_socios} sócio(s)
              </span>
            )}
            {empresa.cnae_normalizado && (
              <span>{empresa.cnae_normalizado}</span>
            )}
          </div>
        </div>

        <EmpresaDetalheClient
          empresaId={empresa.id}
          empresaLabel={labelEmpresa}
          favoritadoInicial={favoritado}
          metaInicial={meta}
          alertasPendentes={alertas.filter(a => !a.visto).length}
        />
      </header>

      {/* Aniversário */}
      {aniversarioProximo && (
        <div className="card p-3 mb-4 border-warning-500/30 bg-warning-500/[0.05] flex items-center gap-2">
          <Cake className="w-4 h-4 text-warning-500" />
          <span className="text-sm">
            <strong>{aniversarioTexto}</strong> é o aniversário desta empresa ({empresa.anos_operacao} anos).
            Bom timing pra mensagem de prospecção contextual.
          </span>
        </div>
      )}

      {/* Banner alertas */}
      {alertas.length > 0 && (
        <section className="card p-4 mb-4 border-warning-500/30 bg-warning-500/[0.02]">
          <h2 className="font-semibold text-sm flex items-center gap-2 mb-2">
            <AlertCircle className="w-4 h-4 text-warning-500" />
            Mudanças detectadas ({alertas.length})
          </h2>
          <ul className="space-y-1.5">
            {alertas.slice(0, 5).map((a) => (
              <li key={a.id} className={`text-xs flex items-start gap-2 ${!a.visto ? "font-medium" : "text-muted-foreground"}`}>
                <span className="text-[10px] uppercase tracking-[0.12em] font-semibold text-warning-500 px-1 py-0.5 rounded bg-warning-500/10 border border-warning-500/30 shrink-0">
                  {a.tipo.replace("_", " ")}
                </span>
                <span>
                  {a.tipo === "situacao_mudou" && `${a.payload?.situacao_anterior ?? "?"} → ${a.payload?.situacao_atual ?? "?"}`}
                  {a.tipo === "capital_mudou" && `Capital ${Number(a.payload?.anterior).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} → ${Number(a.payload?.atual).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} (${a.payload?.variacao_pct}%)`}
                  {a.tipo === "novo_socio" && `Sócios entraram: ${(a.payload?.nomes ?? []).join(", ")}`}
                  {a.tipo === "socio_saiu" && `Sócios saíram: ${(a.payload?.nomes ?? []).join(", ")}`}
                  {a.tipo === "cnae_mudou" && "CNAE principal mudou"}
                </span>
                <span className="text-muted-foreground tabular-nums text-[11px] ml-auto shrink-0">
                  {new Date(a.created_at).toLocaleDateString("pt-BR")}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid lg:grid-cols-3 gap-4">
        {/* Coluna esquerda: dados gerais */}
        <div className="lg:col-span-2 space-y-4">
          {/* Dados RFB + web */}
          <section className="card p-4">
            <h2 className="text-xs uppercase tracking-[0.12em] font-semibold text-muted-foreground mb-3">Dados cadastrais</h2>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-sm">
              {empresa.cnae_descricao && (<>
                <dt className="text-muted-foreground">CNAE</dt>
                <dd className="font-medium">{empresa.cnae_descricao} ({empresa.cnae_codigo})</dd>
              </>)}
              {empresa.natureza_juridica && (<>
                <dt className="text-muted-foreground">Natureza jurídica</dt>
                <dd>{empresa.natureza_juridica}</dd>
              </>)}
              {empresa.data_inicio_atividade && (<>
                <dt className="text-muted-foreground">Início atividade</dt>
                <dd className="tabular-nums">{new Date(empresa.data_inicio_atividade).toLocaleDateString("pt-BR")}</dd>
              </>)}
              {empresa.data_situacao_cadastral && (<>
                <dt className="text-muted-foreground">Situação desde</dt>
                <dd className="tabular-nums">{new Date(empresa.data_situacao_cadastral).toLocaleDateString("pt-BR")}</dd>
              </>)}
              {enderecoLinhas.length > 0 && (<>
                <dt className="text-muted-foreground">Endereço</dt>
                <dd className="text-xs">{enderecoLinhas.map((l, i) => <div key={i}>{l}</div>)}</dd>
              </>)}
              {(empresa.email_enriquecido || empresa.email_rfb) && (<>
                <dt className="text-muted-foreground">Email</dt>
                <dd>
                  <a href={`mailto:${empresa.email_enriquecido ?? empresa.email_rfb}`} className="text-primary hover:underline inline-flex items-center gap-1">
                    <Mail className="w-3 h-3" /> {empresa.email_enriquecido ?? empresa.email_rfb}
                  </a>
                </dd>
              </>)}
              {(empresa.whatsapp_enriquecido || empresa.telefone_rfb) && (<>
                <dt className="text-muted-foreground">Telefone</dt>
                <dd className="tabular-nums inline-flex items-center gap-1"><Phone className="w-3 h-3" /> {empresa.whatsapp_enriquecido ?? empresa.telefone_rfb}</dd>
              </>)}
              {empresa.site && (<>
                <dt className="text-muted-foreground">Site</dt>
                <dd><a href={empresa.site} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-1"><ExternalLink className="w-3 h-3" /> {empresa.site.replace(/^https?:\/\//, "")}</a></dd>
              </>)}
              {empresa.linkedin_url && (<>
                <dt className="text-muted-foreground">LinkedIn</dt>
                <dd><a href={empresa.linkedin_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-1"><Linkedin className="w-3 h-3" /> LinkedIn</a></dd>
              </>)}
            </dl>
            {empresa.descricao_negocio && (
              <div className="mt-3 pt-3 border-t border-border text-xs text-foreground/90">
                <div className="text-[10px] uppercase tracking-[0.12em] font-semibold text-muted-foreground mb-1">Sobre</div>
                {empresa.descricao_negocio}
              </div>
            )}
          </section>

          {/* QSA — Sócios */}
          {empresa.socios && empresa.socios.length > 0 && (
            <section className="card p-4">
              <h2 className="text-xs uppercase tracking-[0.12em] font-semibold text-muted-foreground mb-3 flex items-center gap-1.5">
                <Users className="w-3 h-3" />
                Quadro societário ({empresa.total_socios})
              </h2>
              <ul className="space-y-2">
                {empresa.socios.map((s: any) => (
                  <li key={s.id} className="flex items-start justify-between gap-2 p-2 rounded-lg bg-secondary/40 border border-border">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm">{s.nome}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {s.qualificacao ?? "—"}{s.cargo_atual ? ` · ${s.cargo_atual}` : ""}
                        {s.data_entrada ? ` · Entrou ${new Date(s.data_entrada).toLocaleDateString("pt-BR")}` : ""}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {s.linkedin_url && (
                        <a href={s.linkedin_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline" title="Ver no LinkedIn">
                          <Linkedin className="w-3.5 h-3.5" />
                        </a>
                      )}
                      {s.email && (
                        <a href={`mailto:${s.email}`} className="text-primary hover:underline" title="Email">
                          <Mail className="w-3.5 h-3.5" />
                        </a>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Empresas semelhantes */}
          {empresasSimilares.length > 0 && (
            <section className="card p-4">
              <h2 className="text-xs uppercase tracking-[0.12em] font-semibold text-muted-foreground mb-3 flex items-center gap-1.5">
                <Sparkles className="w-3 h-3" />
                Empresas semelhantes ({empresa.cnae_normalizado}{empresa.porte ? ` · ${empresa.porte}` : ""})
              </h2>
              <ul className="space-y-1.5">
                {empresasSimilares.map((s: any) => (
                  <li key={s.id} className="flex items-center justify-between gap-2 px-3 py-2 rounded bg-secondary/30 border border-border">
                    <div className="flex-1 min-w-0">
                      <Link href={`/vendas/prospeccao/empresa/${s.id}`} className="text-sm font-medium hover:text-primary truncate block">
                        {s.nome_fantasia || s.razao_social}
                      </Link>
                      <div className="text-[11px] text-muted-foreground">
                        {s.cidade}/{s.uf} {s.capital_social ? `· ${Number(s.capital_social).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })}` : ""}
                      </div>
                    </div>
                    {s.ja_e_lead && (
                      <span className="text-[10px] uppercase tracking-[0.1em] font-semibold text-success-500 bg-success-500/10 border border-success-500/30 px-1.5 py-0.5 rounded">
                        ✓ lead seu
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        {/* Coluna direita: leads ligados + tags */}
        <aside className="space-y-4">
          {/* Já é lead? */}
          {leadsRelacionados.length > 0 && (
            <section className="card p-4 border-success-500/30 bg-success-500/[0.02]">
              <h2 className="text-xs uppercase tracking-[0.12em] font-semibold text-success-500 mb-2 flex items-center gap-1.5">
                <Building2 className="w-3 h-3" />
                Já é lead da sua org
              </h2>
              <ul className="space-y-1.5">
                {leadsRelacionados.map((l: any) => (
                  <li key={l.lead_id} className="text-xs">
                    <Link href={`/pipeline/${l.lead_id}`} className="font-medium hover:text-primary block">
                      {l.lead_empresa}
                    </Link>
                    <div className="text-[11px] text-muted-foreground">
                      {l.crm_stage} · {l.responsavel_nome ?? "—"}
                      {l.data_fechamento && <span className="text-success-500"> · Fechado em {new Date(l.data_fechamento).toLocaleDateString("pt-BR")}</span>}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Tags + notas (meta) */}
          {meta && (meta.tags?.length > 0 || meta.notas_internas) && (
            <section className="card p-4">
              <h2 className="text-xs uppercase tracking-[0.12em] font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
                <Tag className="w-3 h-3" />
                Notas da sua org
              </h2>
              {meta.tags?.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-2">
                  {meta.tags.map((t: string) => (
                    <span key={t} className="text-[10px] px-1.5 py-0.5 rounded border border-border bg-secondary text-foreground/80">
                      {t}
                    </span>
                  ))}
                </div>
              )}
              {meta.notas_internas && (
                <p className="text-xs text-foreground/90 whitespace-pre-wrap">{meta.notas_internas}</p>
              )}
              {meta.evitar && meta.evitar_motivo && (
                <p className="text-xs text-destructive mt-2 italic">⚠ {meta.evitar_motivo}</p>
              )}
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
