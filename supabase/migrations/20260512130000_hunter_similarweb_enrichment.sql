-- =============================================================================
-- Hunter.io email finder + Similarweb web traffic intelligence
--
-- Adiciona colunas em prospeccao_empresa pra cachear dados desses providers.
-- =============================================================================

alter table public.prospeccao_empresa
  add column if not exists emails_hunter jsonb default '[]'::jsonb,
  add column if not exists hunter_atualizado_em timestamptz,
  -- Similarweb (visitas, fontes, países, dispositivos)
  add column if not exists web_visits_mes numeric(14,0),
  add column if not exists web_visits_trend_pct numeric(6,2),   -- % crescimento 6 meses
  add column if not exists web_canais_pct jsonb,                -- {search: 0.4, direct: 0.3, ...}
  add column if not exists web_paises_top text[],
  add column if not exists web_dispositivos_pct jsonb,          -- {mobile: 0.6, desktop: 0.4}
  add column if not exists similarweb_atualizado_em timestamptz;

-- Index pra ordenar empresas por traffic (sinal de tamanho real)
create index if not exists idx_prospeccao_empresa_visits on public.prospeccao_empresa(web_visits_mes desc nulls last);

-- =============================================================================
-- prospeccao_socio ganha emails enriquecidos por Hunter
-- =============================================================================
alter table public.prospeccao_socio
  add column if not exists emails_provaveis jsonb default '[]'::jsonb,
  add column if not exists hunter_confidence int;   -- 0-100
