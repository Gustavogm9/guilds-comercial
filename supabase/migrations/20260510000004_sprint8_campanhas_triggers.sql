-- ============================================================
-- Sprint 8: Campanhas de prospecção + triggers ICP automáticos
-- ============================================================

-- 1. Campanhas de prospecção em lote
create table if not exists public.campanhas_prospeccao (
  id                  bigserial primary key,
  organizacao_id      uuid not null references public.organizacoes(id) on delete cascade,
  nome                text not null,
  hipotese_id         bigint references public.icp_hipoteses(id) on delete set null,
  produto_id          bigint references public.produtos(id) on delete set null,
  criado_por          uuid references public.profiles(id) on delete set null,
  status              text not null default 'aguardando'
                      check (status in ('aguardando','rodando','concluida','erro')),
  -- configuracao: {max_leads, regioes, segmentos, max_queries, iniciar_cadencia}
  configuracao        jsonb not null default '{}',
  leads_encontrados   int not null default 0,
  leads_criados       int not null default 0,
  leads_duplicados    int not null default 0,
  custo_estimado_usd  numeric(8,4),
  erro_detalhes       text,
  iniciada_em         timestamptz,
  concluida_em        timestamptz,
  created_at          timestamptz not null default now()
);
create index if not exists idx_campanhas_org on public.campanhas_prospeccao (organizacao_id, created_at desc);
alter table public.campanhas_prospeccao enable row level security;
create policy if not exists campanhas_org on public.campanhas_prospeccao
  for all to authenticated
  using (organizacao_id in (select public.orgs_do_usuario()))
  with check (organizacao_id in (select public.orgs_do_usuario()));

-- 2. Trigger: lead.crm_stage muda → atualiza métricas da hipótese ICP
create or replace function public.on_lead_stage_hipotese()
returns trigger language plpgsql security definer as $$
begin
  if new.hipotese_id is null then return new; end if;
  if old.crm_stage is not distinct from new.crm_stage then return new; end if;

  if new.crm_stage = 'Proposta' and coalesce(old.crm_stage, '') <> 'Proposta' then
    perform public.incrementar_hipotese(new.hipotese_id, 'leads_em_proposta', 1);
  end if;

  if new.crm_stage = 'Fechado' and coalesce(old.crm_stage, '') <> 'Fechado' then
    perform public.incrementar_hipotese(new.hipotese_id, 'leads_fechados', 1);
    if coalesce(new.valor_potencial, 0) > 0 then
      perform public.incrementar_hipotese(new.hipotese_id, 'receita_gerada', new.valor_potencial);
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists lead_hipotese_metrics on public.leads;
create trigger lead_hipotese_metrics
  after update of crm_stage on public.leads
  for each row execute function public.on_lead_stage_hipotese();

-- 3. Trigger: proposta aceita → incrementa métricas da hipótese do lead
create or replace function public.on_proposta_status_hipotese()
returns trigger language plpgsql security definer as $$
declare v_hipotese_id bigint; v_valor numeric;
begin
  if old.status is not distinct from new.status then return new; end if;
  select l.hipotese_id, l.valor_potencial into v_hipotese_id, v_valor
    from public.leads l where l.id = new.lead_id;
  if v_hipotese_id is null then return new; end if;

  if new.status = 'aceita' and coalesce(old.status,'') <> 'aceita' then
    perform public.incrementar_hipotese(v_hipotese_id, 'leads_fechados', 1);
    if coalesce(new.valor_total, v_valor, 0) > 0 then
      perform public.incrementar_hipotese(v_hipotese_id, 'receita_gerada', coalesce(new.valor_total, v_valor, 0));
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists proposta_hipotese_metrics on public.propostas;
create trigger proposta_hipotese_metrics
  after update of status on public.propostas
  for each row execute function public.on_proposta_status_hipotese();
