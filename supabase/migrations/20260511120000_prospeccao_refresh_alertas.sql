-- =============================================================================
-- Refresh automático CNPJ + alertas de mudança de situação
--
-- Roda 1x/dia ao 04:00 UTC. Pega 200 empresas com `updated_at` mais antigo
-- e `situacao = 'ATIVA'` (foca em empresas relevantes ainda). Endpoint chama
-- BrasilAPI individualmente respeitando rate-limit. Quando detecta mudança
-- (fingerprint mudou), insere alerta em prospeccao_alerta_mudanca.
--
-- Alertas: gestor vê em /vendas/prospeccao/base-de-empresas (botão "Alertas").
-- Push: se a empresa foi convertida em lead na org, dispara push pro responsável.
-- =============================================================================

create table if not exists public.prospeccao_alerta_mudanca (
  id              bigserial primary key,
  empresa_id      bigint not null references public.prospeccao_empresa(id) on delete cascade,
  tipo            text not null check (tipo in (
    'situacao_mudou',     -- ATIVA → BAIXADA / SUSPENSA / INAPTA / NULA
    'capital_mudou',      -- capital social aumentou/diminuiu significativo
    'novo_socio',         -- entrou sócio novo no QSA
    'socio_saiu',         -- sócio removido do QSA
    'cnae_mudou'          -- atividade principal trocou
  )),
  fingerprint_anterior text,
  fingerprint_atual text,
  payload         jsonb,                  -- { situacao_anterior, situacao_atual, etc. }
  visto           boolean not null default false,
  created_at      timestamptz not null default now()
);

create index if not exists idx_prospeccao_alerta_empresa on public.prospeccao_alerta_mudanca(empresa_id, created_at desc);
create index if not exists idx_prospeccao_alerta_naovisto on public.prospeccao_alerta_mudanca(created_at desc)
  where visto = false;

alter table public.prospeccao_alerta_mudanca enable row level security;
drop policy if exists prospeccao_alerta_select on public.prospeccao_alerta_mudanca;
create policy prospeccao_alerta_select on public.prospeccao_alerta_mudanca
  for select to authenticated using (true);  -- dados públicos (CNPJ)

comment on table public.prospeccao_alerta_mudanca is
  'Alertas detectados em refreshs periódicos do CNPJ. Dispara push pra responsáveis cujos leads estão ligados a essas empresas.';

-- pg_cron: 1x/dia 04 UTC
do $$
begin
  perform cron.unschedule('prospeccao-refresh-cnpj');
exception when others then null;
end $$;

select cron.schedule(
  'prospeccao-refresh-cnpj',
  '0 4 * * *',
  $job$
  select net.http_post(
    url := coalesce(
      (select value from public.app_config where key = 'cron_refresh_cnpj_url'),
      'https://crm.guilds.com.br/api/cron/prospeccao-refresh-cnpj'
    ),
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-cron-secret', coalesce((select value from public.app_config where key = 'cron_secret'), '')
    ),
    body := '{}'::jsonb
  );
  $job$
);

-- =============================================================================
-- View pra gestor ver alertas das empresas ligadas a leads da org
-- =============================================================================
create or replace view public.v_prospeccao_alertas_org as
select distinct on (a.id)
  a.id,
  a.empresa_id,
  a.tipo,
  a.payload,
  a.visto,
  a.created_at,
  e.cnpj,
  e.razao_social,
  e.nome_fantasia,
  l.id as lead_id,
  l.organizacao_id,
  l.empresa as lead_empresa,
  l.responsavel_id
from public.prospeccao_alerta_mudanca a
join public.prospeccao_empresa e on e.id = a.empresa_id
join public.leads l on (l.origem_prospeccao->>'cnpj' = e.cnpj or l.observacoes ilike '%' || e.cnpj || '%')
order by a.id, a.created_at desc;

grant select on public.v_prospeccao_alertas_org to authenticated;
