-- =============================================================================
-- Onboarding pós-venda + NPS
--
-- Fase P2 do plano de flywheel completo. Cobre:
--   - Checklist de onboarding por cliente fechado (template configurável + items)
--   - Coleta de NPS (D7 após fechamento, automático via cron)
--   - Trigger automático: NPS >= 9 + sem pedido de indicação aberto → cria pedido
--     de indicação no momento `pos_resultado` (timing perfeito, cliente promotor)
--   - Trigger automático: NPS < 7 → grava lead_evento `nps_detrator_alerta` (
--     CSM/gestor vê na auditoria e em /hoje)
--
-- Tabelas:
--   - onboarding_template        → templates de checklist por org
--   - onboarding_template_item   → items do template
--   - onboarding_checklist       → instância do checklist por lead fechado
--   - onboarding_item            → items da instância (cópia do template)
--   - nps_responses              → respostas de NPS (uma por lead, +histórico)
--
-- Triggers:
--   - lead vira "Fechado" → cria onboarding_checklist com items copiados do
--     template default da org (se houver template) e agenda envio NPS pra D+7.
--   - resposta NPS inserida → se >= 9 + sem pedido pendente, cria pedido
--     pos_resultado; se < 7, grava lead_evento detrator_alerta.
--
-- Views:
--   - v_onboarding_pendente   → checklists abertos com % completude
--   - v_nps_resumo            → NPS por org (promotores, neutros, detratores, score)
--   - v_nps_pendente_responder → NPS solicitado mas não respondido (alimenta /hoje)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Templates de onboarding (configuráveis por gestor em /equipe)
-- -----------------------------------------------------------------------------
create table if not exists public.onboarding_template (
  id              bigserial primary key,
  organizacao_id  uuid not null references public.organizacoes(id) on delete cascade,
  nome            text not null check (length(trim(nome)) > 0 and length(nome) <= 80),
  descricao       text,
  ativo           boolean not null default true,
  default_template boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index idx_onboarding_template_org on public.onboarding_template(organizacao_id) where ativo = true;

-- 1 template default por org
create unique index uniq_onboarding_template_default
  on public.onboarding_template(organizacao_id)
  where default_template = true;

create table if not exists public.onboarding_template_item (
  id              bigserial primary key,
  template_id     bigint not null references public.onboarding_template(id) on delete cascade,
  ordem           int not null default 0,
  titulo          text not null check (length(trim(titulo)) > 0 and length(titulo) <= 200),
  descricao       text,
  due_offset_dias int not null default 0 check (due_offset_dias >= 0 and due_offset_dias <= 365),
  obrigatorio     boolean not null default true,
  responsavel_papel text check (responsavel_papel in ('comercial', 'sdr', 'gestor', 'cliente'))
);

create index idx_onboarding_template_item_template on public.onboarding_template_item(template_id, ordem);

-- -----------------------------------------------------------------------------
-- 2. Instância de checklist por lead fechado
-- -----------------------------------------------------------------------------
create table if not exists public.onboarding_checklist (
  id              bigserial primary key,
  organizacao_id  uuid not null references public.organizacoes(id) on delete cascade,
  lead_id         bigint not null references public.leads(id) on delete cascade,
  template_id     bigint references public.onboarding_template(id) on delete set null,
  status          text not null default 'em_andamento' check (status in ('em_andamento', 'concluido', 'abandonado')),
  iniciado_em     timestamptz not null default now(),
  concluido_em    timestamptz,
  observacoes     text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create unique index uniq_onboarding_checklist_lead on public.onboarding_checklist(lead_id);
create index idx_onboarding_checklist_org_status on public.onboarding_checklist(organizacao_id, status);

create table if not exists public.onboarding_item (
  id              bigserial primary key,
  checklist_id    bigint not null references public.onboarding_checklist(id) on delete cascade,
  template_item_id bigint references public.onboarding_template_item(id) on delete set null,
  ordem           int not null default 0,
  titulo          text not null,
  descricao       text,
  status          text not null default 'pendente' check (status in ('pendente', 'concluido', 'pulado')),
  due_at          date,
  responsavel_papel text,
  responsavel_id  uuid references public.profiles(id) on delete set null,
  concluido_em    timestamptz,
  concluido_por   uuid references public.profiles(id) on delete set null,
  observacoes     text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index idx_onboarding_item_checklist_ordem on public.onboarding_item(checklist_id, ordem);
create index idx_onboarding_item_due on public.onboarding_item(due_at) where status = 'pendente';

-- -----------------------------------------------------------------------------
-- 3. NPS responses
-- -----------------------------------------------------------------------------
create table if not exists public.nps_responses (
  id              bigserial primary key,
  organizacao_id  uuid not null references public.organizacoes(id) on delete cascade,
  lead_id         bigint not null references public.leads(id) on delete cascade,

  -- Solicitação (criada pelo trigger D+7 ou manualmente)
  solicitado_em   timestamptz not null default now(),
  solicitado_por  uuid references public.profiles(id) on delete set null,
  canal           text check (canal in ('email', 'whatsapp', 'call', 'in_app', 'manual')),
  -- Resposta (preenchido quando cliente responde)
  score           int check (score is null or (score >= 0 and score <= 10)),
  comentario      text,
  respondido_em   timestamptz,

  -- Categoria derivada
  categoria       text generated always as (
    case
      when score is null then null
      when score >= 9 then 'promotor'
      when score >= 7 then 'neutro'
      else 'detrator'
    end
  ) stored,

  created_at      timestamptz not null default now()
);

create index idx_nps_org on public.nps_responses(organizacao_id);
create index idx_nps_lead on public.nps_responses(lead_id);
create index idx_nps_pendente on public.nps_responses(organizacao_id) where score is null;

-- -----------------------------------------------------------------------------
-- 4. Trigger: lead vira "Fechado" → cria onboarding_checklist (se template default)
--    + agenda solicitação de NPS pra D+7 (insere row em nps_responses sem score)
-- -----------------------------------------------------------------------------
create or replace function public.trg_iniciar_pos_venda()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_template_id bigint;
  v_checklist_id bigint;
begin
  if NEW.crm_stage = 'Fechado' and (OLD.crm_stage is distinct from 'Fechado') then

    -- 1. Cria checklist se org tem template default
    select id into v_template_id
    from public.onboarding_template
    where organizacao_id = NEW.organizacao_id
      and default_template = true
      and ativo = true
    limit 1;

    if v_template_id is not null then
      insert into public.onboarding_checklist (organizacao_id, lead_id, template_id)
      values (NEW.organizacao_id, NEW.id, v_template_id)
      on conflict (lead_id) do nothing
      returning id into v_checklist_id;

      if v_checklist_id is not null then
        -- Copia items do template pra instância (com due_at = hoje + offset)
        insert into public.onboarding_item (
          checklist_id, template_item_id, ordem, titulo, descricao,
          due_at, responsavel_papel, responsavel_id
        )
        select
          v_checklist_id, ti.id, ti.ordem, ti.titulo, ti.descricao,
          (current_date + ti.due_offset_dias)::date,
          ti.responsavel_papel,
          case when ti.responsavel_papel in ('comercial', 'sdr', 'gestor')
               then NEW.responsavel_id
               else null
          end
        from public.onboarding_template_item ti
        where ti.template_id = v_template_id
        order by ti.ordem;
      end if;
    end if;

    -- 2. Agenda solicitação de NPS pra D+7 (idempotente)
    insert into public.nps_responses (organizacao_id, lead_id, solicitado_em, canal)
    values (NEW.organizacao_id, NEW.id, (now() + interval '7 days'), 'email')
    on conflict do nothing;
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_lead_fechado_inicia_pos_venda on public.leads;
create trigger trg_lead_fechado_inicia_pos_venda
  after update of crm_stage on public.leads
  for each row execute function public.trg_iniciar_pos_venda();

-- -----------------------------------------------------------------------------
-- 5. Trigger: NPS respondido → ação automática conforme score
--    - >= 9 (promotor): se não há pedido_indicacao aberto, cria um (pos_resultado)
--    - <= 6 (detrator): grava lead_evento `nps_detrator_alerta` (CSM/gestor vê)
-- -----------------------------------------------------------------------------
create or replace function public.trg_nps_acao_automatica()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead_responsavel uuid;
begin
  -- Só age quando o score acabou de ser preenchido (vinha NULL e agora vem inteiro)
  if NEW.score is null then return NEW; end if;
  if OLD.score is not null then return NEW; end if;

  select responsavel_id into v_lead_responsavel
  from public.leads where id = NEW.lead_id;

  -- Promotor: cria pedido de indicação se não houver outro pendente
  if NEW.score >= 9 then
    insert into public.pedidos_indicacao (
      organizacao_id, lead_id, solicitado_por, momento, observacoes
    )
    values (
      NEW.organizacao_id, NEW.lead_id, v_lead_responsavel, 'pos_resultado',
      'Auto-criado: cliente promotor (NPS ' || NEW.score || ').'
    )
    on conflict do nothing;

    insert into public.lead_evento (organizacao_id, lead_id, ator_id, tipo, payload)
    values (
      NEW.organizacao_id, NEW.lead_id, NEW.solicitado_por,
      'nps_promotor',
      jsonb_build_object('score', NEW.score, 'nps_response_id', NEW.id)
    );

  -- Detrator: alerta CSM
  elsif NEW.score <= 6 then
    insert into public.lead_evento (organizacao_id, lead_id, ator_id, tipo, payload)
    values (
      NEW.organizacao_id, NEW.lead_id, NEW.solicitado_por,
      'nps_detrator_alerta',
      jsonb_build_object('score', NEW.score, 'comentario', NEW.comentario, 'nps_response_id', NEW.id)
    );

  -- Neutro: só registra
  else
    insert into public.lead_evento (organizacao_id, lead_id, ator_id, tipo, payload)
    values (
      NEW.organizacao_id, NEW.lead_id, NEW.solicitado_por,
      'nps_neutro',
      jsonb_build_object('score', NEW.score, 'nps_response_id', NEW.id)
    );
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_nps_resposta_acao on public.nps_responses;
create trigger trg_nps_resposta_acao
  after update of score on public.nps_responses
  for each row execute function public.trg_nps_acao_automatica();

-- -----------------------------------------------------------------------------
-- 6. updated_at automático
-- -----------------------------------------------------------------------------
drop trigger if exists trg_onboarding_template_updated on public.onboarding_template;
create trigger trg_onboarding_template_updated
  before update on public.onboarding_template
  for each row execute function public.set_updated_at();

drop trigger if exists trg_onboarding_checklist_updated on public.onboarding_checklist;
create trigger trg_onboarding_checklist_updated
  before update on public.onboarding_checklist
  for each row execute function public.set_updated_at();

drop trigger if exists trg_onboarding_item_updated on public.onboarding_item;
create trigger trg_onboarding_item_updated
  before update on public.onboarding_item
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 7. RLS — padrão multi-tenant
-- -----------------------------------------------------------------------------
alter table public.onboarding_template      enable row level security;
alter table public.onboarding_template_item enable row level security;
alter table public.onboarding_checklist     enable row level security;
alter table public.onboarding_item          enable row level security;
alter table public.nps_responses            enable row level security;

-- onboarding_template (CRUD: só gestor)
create policy onb_template_select on public.onboarding_template
  for select to authenticated
  using (organizacao_id in (select public.orgs_do_usuario()));
create policy onb_template_write_gestor on public.onboarding_template
  for all to authenticated
  using (public.is_gestor_in_org(organizacao_id))
  with check (public.is_gestor_in_org(organizacao_id));

-- onboarding_template_item (segue policy do template parent)
create policy onb_template_item_select on public.onboarding_template_item
  for select to authenticated
  using (exists (
    select 1 from public.onboarding_template t
    where t.id = template_id
      and t.organizacao_id in (select public.orgs_do_usuario())
  ));
create policy onb_template_item_write_gestor on public.onboarding_template_item
  for all to authenticated
  using (exists (
    select 1 from public.onboarding_template t
    where t.id = template_id and public.is_gestor_in_org(t.organizacao_id)
  ))
  with check (exists (
    select 1 from public.onboarding_template t
    where t.id = template_id and public.is_gestor_in_org(t.organizacao_id)
  ));

-- onboarding_checklist (qualquer membro da org lê e escreve — vendedor mexe no próprio)
create policy onb_checklist_select on public.onboarding_checklist
  for select to authenticated
  using (organizacao_id in (select public.orgs_do_usuario()));
create policy onb_checklist_insert on public.onboarding_checklist
  for insert to authenticated
  with check (organizacao_id in (select public.orgs_do_usuario()));
create policy onb_checklist_update on public.onboarding_checklist
  for update to authenticated
  using (organizacao_id in (select public.orgs_do_usuario()))
  with check (organizacao_id in (select public.orgs_do_usuario()));
create policy onb_checklist_delete_gestor on public.onboarding_checklist
  for delete to authenticated
  using (public.is_gestor_in_org(organizacao_id));

-- onboarding_item (segue parent)
create policy onb_item_select on public.onboarding_item
  for select to authenticated
  using (exists (
    select 1 from public.onboarding_checklist c
    where c.id = checklist_id
      and c.organizacao_id in (select public.orgs_do_usuario())
  ));
create policy onb_item_write on public.onboarding_item
  for all to authenticated
  using (exists (
    select 1 from public.onboarding_checklist c
    where c.id = checklist_id
      and c.organizacao_id in (select public.orgs_do_usuario())
  ))
  with check (exists (
    select 1 from public.onboarding_checklist c
    where c.id = checklist_id
      and c.organizacao_id in (select public.orgs_do_usuario())
  ));

-- nps_responses (qualquer membro da org)
create policy nps_select on public.nps_responses
  for select to authenticated
  using (organizacao_id in (select public.orgs_do_usuario()));
create policy nps_insert on public.nps_responses
  for insert to authenticated
  with check (organizacao_id in (select public.orgs_do_usuario()));
create policy nps_update on public.nps_responses
  for update to authenticated
  using (organizacao_id in (select public.orgs_do_usuario()))
  with check (organizacao_id in (select public.orgs_do_usuario()));
create policy nps_delete_gestor on public.nps_responses
  for delete to authenticated
  using (public.is_gestor_in_org(organizacao_id));

-- -----------------------------------------------------------------------------
-- 8. Views
-- -----------------------------------------------------------------------------

-- View: checklists abertos com % completude
drop view if exists public.v_onboarding_pendente;
create view public.v_onboarding_pendente
with (security_invoker = true) as
select
  c.id                  as checklist_id,
  c.organizacao_id,
  c.lead_id,
  c.iniciado_em,
  c.template_id,
  l.empresa             as lead_empresa,
  l.nome                as lead_nome,
  l.responsavel_id      as lead_responsavel_id,
  count(i.id)                                              as total_items,
  count(i.id) filter (where i.status = 'concluido')       as concluidos,
  count(i.id) filter (where i.status = 'pulado')          as pulados,
  count(i.id) filter (where i.status = 'pendente' and i.due_at < current_date) as atrasados,
  case
    when count(i.id) = 0 then 0
    else round(100.0 * count(i.id) filter (where i.status = 'concluido') / count(i.id), 1)
  end                                                      as pct_concluido
from public.onboarding_checklist c
join public.leads l on l.id = c.lead_id
left join public.onboarding_item i on i.checklist_id = c.id
where c.status = 'em_andamento'
group by c.id, c.organizacao_id, c.lead_id, c.iniciado_em, c.template_id,
         l.empresa, l.nome, l.responsavel_id;

comment on view public.v_onboarding_pendente is
  'Checklists de onboarding abertos com totais e % de conclusão. Usada em /equipe e dashboard.';

-- View: NPS resumo por org
drop view if exists public.v_nps_resumo;
create view public.v_nps_resumo
with (security_invoker = true) as
with respondidos as (
  select organizacao_id, score, categoria
  from public.nps_responses
  where score is not null
)
select
  o.id as organizacao_id,
  count(*)                                              as total_respostas,
  count(*) filter (where categoria = 'promotor')        as promotores,
  count(*) filter (where categoria = 'neutro')          as neutros,
  count(*) filter (where categoria = 'detrator')        as detratores,
  case when count(*) = 0 then null
       else round(
         100.0 * (count(*) filter (where categoria = 'promotor') -
                  count(*) filter (where categoria = 'detrator')) / count(*),
         1
       )
  end                                                   as nps_score,
  round(avg(score)::numeric, 1)                         as score_medio
from public.organizacoes o
left join respondidos r on r.organizacao_id = o.id
group by o.id;

comment on view public.v_nps_resumo is
  'NPS por organização: promotores, neutros, detratores, score (faixa -100 a +100), score médio.';

-- View: NPS solicitados mas não respondidos (alimenta /hoje pra cobrar follow-up)
drop view if exists public.v_nps_pendente_responder;
create view public.v_nps_pendente_responder
with (security_invoker = true) as
select
  n.id                  as nps_id,
  n.organizacao_id,
  n.lead_id,
  n.solicitado_em,
  n.canal,
  l.empresa             as lead_empresa,
  l.nome                as lead_nome,
  l.responsavel_id      as lead_responsavel_id,
  (current_date - n.solicitado_em::date) as dias_pendente
from public.nps_responses n
join public.leads l on l.id = n.lead_id
where n.score is null
  and n.solicitado_em <= now();

comment on view public.v_nps_pendente_responder is
  'NPS solicitados mas ainda não respondidos. Inclui só os que já passaram da data agendada (D+7).';
