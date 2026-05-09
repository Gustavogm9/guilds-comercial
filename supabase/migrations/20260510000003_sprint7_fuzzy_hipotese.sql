-- ============================================================
-- Sprint 7: pg_trgm + dedup fuzzy + métricas de hipótese ICP
-- ============================================================

create extension if not exists pg_trgm;

-- Busca duplicatas fuzzy por empresa, WhatsApp, email e site
create or replace function public.buscar_lead_duplicado(
  p_org_id     uuid,
  p_empresa    text,
  p_whatsapp   text default null,
  p_email      text default null,
  p_site       text default null
)
returns table(id bigint, empresa text, whatsapp text, email text, site text, similaridade numeric)
language sql stable security definer
as $$
  select
    l.id, l.empresa, l.whatsapp, l.email, l.site,
    greatest(
      case when p_empresa is not null and l.empresa is not null
           then similarity(lower(l.empresa), lower(p_empresa)) else 0 end,
      case when p_whatsapp is not null and l.whatsapp is not null
           then case when regexp_replace(l.whatsapp, '\D', '', 'g') = regexp_replace(p_whatsapp, '\D', '', 'g') then 1.0 else 0 end else 0 end,
      case when p_email is not null and l.email is not null
           then case when lower(l.email) = lower(p_email) then 1.0 else 0 end else 0 end,
      case when p_site is not null and l.site is not null
           then case when lower(regexp_replace(l.site, '^https?://(www\.)?', '', 'g'))
                         = lower(regexp_replace(p_site, '^https?://(www\.)?', '', 'g')) then 1.0 else 0 end else 0 end
    )::numeric as similaridade
  from public.leads l
  where l.organizacao_id = p_org_id
    and l.is_demo = false
    and (
      (p_empresa  is not null and l.empresa  is not null and similarity(lower(l.empresa), lower(p_empresa)) > 0.45)
      or (p_whatsapp is not null and l.whatsapp is not null and regexp_replace(l.whatsapp, '\D', '', 'g') = regexp_replace(p_whatsapp, '\D', '', 'g'))
      or (p_email   is not null and l.email   is not null and lower(l.email) = lower(p_email))
      or (p_site    is not null and l.site    is not null and lower(regexp_replace(l.site, '^https?://(www\.)?', '', 'g')) = lower(regexp_replace(p_site, '^https?://(www\.)?', '', 'g')))
    )
  order by similaridade desc
  limit 3;
$$;

-- Incrementa métricas de uma hipótese ICP de forma atômica
create or replace function public.incrementar_hipotese(
  p_hipotese_id bigint,
  p_campo text,
  p_valor numeric default 1
)
returns void language plpgsql security definer as $$
begin
  if p_campo = 'leads_prospectados' then
    update public.icp_hipoteses
    set leads_prospectados = leads_prospectados + p_valor::int,
        taxa_conversao = case when leads_prospectados + p_valor::int > 0
          then round((leads_fechados::numeric / (leads_prospectados + p_valor::int)) * 100, 2) else 0 end
    where id = p_hipotese_id;
  elsif p_campo = 'leads_em_proposta' then
    update public.icp_hipoteses set leads_em_proposta = leads_em_proposta + p_valor::int where id = p_hipotese_id;
  elsif p_campo = 'leads_fechados' then
    update public.icp_hipoteses set
      leads_fechados = leads_fechados + p_valor::int,
      taxa_conversao = case when leads_prospectados > 0
        then round(((leads_fechados + p_valor::int)::numeric / leads_prospectados) * 100, 2) else 0 end,
      ticket_medio = case when leads_fechados + p_valor::int > 0
        then round(receita_gerada / (leads_fechados + p_valor::int), 2) else 0 end
    where id = p_hipotese_id;
  elsif p_campo = 'receita_gerada' then
    update public.icp_hipoteses set
      receita_gerada = receita_gerada + p_valor,
      ticket_medio = case when leads_fechados > 0 then round((receita_gerada + p_valor) / leads_fechados, 2) else 0 end
    where id = p_hipotese_id;
  end if;
end;
$$;
