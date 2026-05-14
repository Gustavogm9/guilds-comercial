-- Expansao com oferta recomendada / Next Best Offer
--
-- Liga cada oportunidade de expansao a um produto/servico concreto do portfolio.
-- Isso permite sair de "fazer upsell" para "vender esta oferta, por este motivo".

alter table public.expansoes
  add column if not exists produto_id bigint references public.produtos(id) on delete set null;

create index if not exists idx_expansoes_produto
  on public.expansoes(organizacao_id, produto_id)
  where produto_id is not null;

comment on column public.expansoes.produto_id is
  'Produto/servico/add-on recomendado nesta expansao. Alimenta proposta de expansao e Next Best Offer.';

-- View: expansoes abertas com dados do cliente e da oferta recomendada
drop view if exists public.v_expansoes_ativas;
create view public.v_expansoes_ativas
with (security_invoker = true) as
select
  e.id,
  e.organizacao_id,
  e.cliente_lead_id,
  e.responsavel_id,
  e.produto_id,
  e.tipo,
  e.titulo,
  e.descricao,
  e.valor_potencial,
  e.valor_recorrente_mensal,
  e.estagio,
  e.origem,
  e.data_identificada,
  e.data_proxima_acao,
  e.proxima_acao,
  e.observacoes,
  e.created_at,
  e.updated_at,
  l.empresa             as cliente_empresa,
  l.nome                as cliente_nome,
  l.crm_stage           as cliente_crm_stage,
  pr.display_name       as responsavel_nome,
  p.nome                as produto_nome,
  p.categoria           as produto_categoria,
  p.recorrente          as produto_recorrente,
  (current_date - e.data_identificada::date) as dias_aberta,
  case when e.data_proxima_acao is null then null
       else (e.data_proxima_acao - current_date)::int
  end as dias_ate_acao
from public.expansoes e
join public.leads l on l.id = e.cliente_lead_id
left join public.profiles pr on pr.id = e.responsavel_id
left join public.produtos p on p.id = e.produto_id and p.organizacao_id = e.organizacao_id
where e.estagio not in ('fechada', 'perdida');

comment on view public.v_expansoes_ativas is
  'Expansoes abertas com dados do cliente, responsavel e produto/oferta recomendada.';

-- View: historico agregado por cliente, agora com produtos distintos envolvidos
drop view if exists public.v_expansoes_por_cliente;
create view public.v_expansoes_por_cliente
with (security_invoker = true) as
select
  e.organizacao_id,
  e.cliente_lead_id,
  count(*) as total,
  count(*) filter (where estagio not in ('fechada', 'perdida')) as ativas,
  count(*) filter (where estagio = 'fechada') as fechadas,
  coalesce(sum(valor_potencial) filter (where estagio = 'fechada'), 0) as receita_total_expansao,
  coalesce(sum(valor_recorrente_mensal) filter (where estagio = 'fechada'), 0) as mrr_expandido,
  count(distinct produto_id) filter (where produto_id is not null) as produtos_expandidos,
  max(updated_at) as ultima_atualizacao
from public.expansoes e
group by e.organizacao_id, e.cliente_lead_id;

comment on view public.v_expansoes_por_cliente is
  'Totais de expansao agregados por cliente, incluindo quantos produtos/ofertas diferentes foram trabalhados.';

-- Escolhe um produto candidato para o cron mensal de expansao.
-- Regra conservadora: produto ativo que o cliente ainda nao fechou, priorizando
-- fit manual por segmento/cargo e recorrencia.
create or replace function public.sugerir_expansoes_automaticas()
returns table (
  organizacao_id uuid,
  expansoes_criadas int
)
language plpgsql
security definer
set search_path = public
as $$
declare
  rec record;
  v_count int := 0;
  org_count_map jsonb := '{}'::jsonb;
begin
  for rec in
    select
      hsc.organizacao_id,
      hsc.lead_id,
      hsc.lead_empresa,
      l.nome as lead_nome,
      l.segmento,
      l.cargo,
      l.responsavel_id,
      l.valor_potencial,
      l.data_fechamento,
      prod.id as produto_id,
      prod.nome as produto_nome,
      prod.valor_base,
      prod.valor_max,
      prod.recorrente
    from public.health_score_cache hsc
    join public.leads l on l.id = hsc.lead_id
    left join lateral (
      select p.*
      from public.produtos p
      where p.organizacao_id = hsc.organizacao_id
        and p.ativo = true
        and not exists (
          select 1 from public.lead_produtos lp
          where lp.lead_id = hsc.lead_id
            and lp.produto_id = p.id
            and lp.status = 'fechado'
        )
      order by
        case when l.segmento is not null and p.segmentos_alvo @> array[l.segmento] then 1 else 0 end desc,
        case when l.cargo is not null and p.cargos_alvo @> array[l.cargo] then 1 else 0 end desc,
        case when p.recorrente then 1 else 0 end desc,
        p.ordem asc nulls last,
        p.id asc
      limit 1
    ) prod on true
    where hsc.categoria = 'saudavel'
      and l.data_fechamento <= (current_date - interval '90 days')
      and not exists (
        select 1 from public.expansoes e
        where e.cliente_lead_id = hsc.lead_id
          and (
            e.estagio not in ('fechada', 'perdida')
            or e.created_at >= (current_date - interval '60 days')
          )
      )
  loop
    insert into public.expansoes (
      organizacao_id, cliente_lead_id, responsavel_id, produto_id,
      tipo, titulo, descricao, valor_potencial, valor_recorrente_mensal,
      origem, data_proxima_acao, proxima_acao
    ) values (
      rec.organizacao_id,
      rec.lead_id,
      rec.responsavel_id,
      rec.produto_id,
      case when rec.produto_id is not null then 'cross_sell' else 'upsell' end,
      case
        when rec.produto_id is not null then 'Sugestao: vender ' || rec.produto_nome
        else 'Sugestao: explorar upsell - ' || coalesce(rec.lead_empresa, rec.lead_nome, 'Lead #' || rec.lead_id)
      end,
      'Cliente saudavel, fechado ha ' ||
        (current_date - rec.data_fechamento::date)::text ||
        ' dias. Bom momento para mapear expansao de conta.' ||
        case when rec.produto_id is not null then ' Oferta recomendada: ' || rec.produto_nome || '.' else '' end,
      coalesce(rec.valor_max, rec.valor_base, rec.valor_potencial * 0.3, 0),
      case when rec.recorrente then coalesce(rec.valor_base, 0) else 0 end,
      'sistema_milestone',
      (current_date + interval '7 days')::date,
      case
        when rec.produto_id is not null then 'Validar fit e apresentar ' || rec.produto_nome
        else 'Conversar com cliente para mapear oportunidades de expansao'
      end
    );
    v_count := v_count + 1;

    org_count_map := jsonb_set(
      org_count_map,
      array[rec.organizacao_id::text],
      to_jsonb(coalesce((org_count_map -> rec.organizacao_id::text)::int, 0) + 1)
    );

    insert into public.lead_evento (organizacao_id, lead_id, ator_id, tipo, payload)
    values (rec.organizacao_id, rec.lead_id, null, 'expansao_sugerida_sistema',
      jsonb_build_object(
        'motivo', 'cliente saudavel + 90d+ fechado',
        'produto_id', rec.produto_id,
        'produto_nome', rec.produto_nome
      ));
  end loop;

  return query
  select (k.key)::uuid, (k.value)::int
  from jsonb_each_text(org_count_map) as k;
end;
$$;

comment on function public.sugerir_expansoes_automaticas() is
  'Cron mensal: cria expansao para clientes saudaveis fechados ha >= 90 dias, tentando recomendar um produto/oferta ainda nao comprado.';
