-- Adicionar novos campos financeiros no CRM
alter table public.leads
  add column valor_setup numeric(12,2) default 0,
  add column valor_mensal numeric(12,2) default 0,
  add column link_proposta text;

-- Atualizar a view enriquecida para incluir os novos campos
create or replace view public.v_leads_enriched as
select
  l.*,
  (current_date - l.data_ultimo_toque) as dias_sem_tocar,
  null::text as semana_proxima_acao,
  'sem_acao'::text as urgencia,
  p.display_name as responsavel_nome,
  p.email as responsavel_email,
  r.status_oferta as raiox_status,
  r.nivel as raiox_nivel,
  r.score as raiox_score,
  r.data_pagamento as raiox_data_pagamento,
  (select count(*) from public.ligacoes where lead_id = l.id) as total_ligacoes
from public.leads l
left join public.profiles p on p.id = l.responsavel_id
left join public.raio_x r on r.lead_id = l.id;
