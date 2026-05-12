-- =============================================================================
-- Cadência: fluxos visuais customizáveis
--
-- Antes: cadencia_templates tem passos fixos D0/D3/D7/D11 hardcoded. Gestor
-- não consegue mudar: ordem, número de passos, espaçamento, canais por passo,
-- condicional "se respondeu, pula pra X".
--
-- Agora: nova tabela cadencia_fluxo (versionada) representa um fluxo completo
-- — N passos sequenciais editáveis. cadencia_fluxo_passo guarda cada passo
-- com offset_dias, canal, assunto/corpo, e regra de avanço.
--
-- Fluxo "default" continua sendo o sistema atual (D0/D3/D7/D11). Gestor pode
-- criar novos fluxos: "Cold outbound", "Pós-evento", "Re-engajamento", etc.
-- =============================================================================

create table if not exists public.cadencia_fluxo (
  id              bigserial primary key,
  organizacao_id  uuid not null references public.organizacoes(id) on delete cascade,
  nome            text not null check (length(trim(nome)) > 0 and length(nome) <= 80),
  descricao       text,
  -- Quando aplicar este fluxo: segmento, fonte, score range, ou manual
  trigger         text not null default 'manual' check (trigger in (
    'manual',              -- vendedor inicia via botão
    'lead_criado',         -- aplicado automaticamente em todo lead novo
    'lead_segmento',       -- aplicado se lead.segmento bate
    'lead_fonte'           -- aplicado se lead.fonte bate
  )),
  trigger_valor   text,    -- valor do segmento/fonte se trigger != manual
  ativo           boolean not null default true,
  default_template boolean not null default false,
  versao          int not null default 1,
  status          text not null default 'publicado' check (status in ('draft', 'publicado', 'arquivado')),
  parent_fluxo_id bigint references public.cadencia_fluxo(id) on delete set null,
  publicado_em    timestamptz,
  criado_por      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Apenas 1 default por org
create unique index if not exists uniq_cadencia_fluxo_default_per_org
  on public.cadencia_fluxo(organizacao_id)
  where default_template = true and status = 'publicado';

create index if not exists idx_cadencia_fluxo_org on public.cadencia_fluxo(organizacao_id, ativo);

drop trigger if exists trg_cadencia_fluxo_updated on public.cadencia_fluxo;
create trigger trg_cadencia_fluxo_updated
  before update on public.cadencia_fluxo
  for each row execute function public.set_updated_at();

alter table public.cadencia_fluxo enable row level security;
drop policy if exists cadencia_fluxo_all on public.cadencia_fluxo;
create policy cadencia_fluxo_all on public.cadencia_fluxo
  for all to authenticated
  using (organizacao_id in (select public.orgs_do_usuario()))
  with check (organizacao_id in (select public.orgs_do_usuario()));

comment on table public.cadencia_fluxo is
  'Fluxos de cadência configuráveis (substitui hardcoded D0/D3/D7/D11). Gestor cria múltiplos pra diferentes triggers.';

-- =============================================================================
-- Passos do fluxo
-- =============================================================================
create table if not exists public.cadencia_fluxo_passo (
  id              bigserial primary key,
  fluxo_id        bigint not null references public.cadencia_fluxo(id) on delete cascade,
  ordem           int not null check (ordem >= 0),
  -- Tempo desde o início do fluxo (em dias)
  offset_dias     int not null default 0 check (offset_dias >= 0 and offset_dias <= 365),
  canal           text not null check (canal in ('email', 'whatsapp', 'call', 'linkedin', 'sms', 'task_manual')),
  -- Conteúdo
  nome_passo      text not null check (length(trim(nome_passo)) > 0 and length(nome_passo) <= 80),
  assunto         text,                -- pra email
  corpo           text,                -- pode ter {{empresa}}, {{nome}}, etc.
  -- Comportamento
  pular_se_respondeu boolean not null default true,
  -- Se respondeu antes deste passo, pula pra próximo automaticamente
  pular_se_clicou_link boolean not null default false,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (fluxo_id, ordem)
);

create index if not exists idx_cadencia_passo_fluxo on public.cadencia_fluxo_passo(fluxo_id, ordem);

drop trigger if exists trg_cadencia_passo_updated on public.cadencia_fluxo_passo;
create trigger trg_cadencia_passo_updated
  before update on public.cadencia_fluxo_passo
  for each row execute function public.set_updated_at();

alter table public.cadencia_fluxo_passo enable row level security;
drop policy if exists cadencia_passo_all on public.cadencia_fluxo_passo;
create policy cadencia_passo_all on public.cadencia_fluxo_passo
  for all to authenticated
  using (
    exists (
      select 1 from public.cadencia_fluxo f
      where f.id = fluxo_id and f.organizacao_id in (select public.orgs_do_usuario())
    )
  )
  with check (
    exists (
      select 1 from public.cadencia_fluxo f
      where f.id = fluxo_id and f.organizacao_id in (select public.orgs_do_usuario())
    )
  );

comment on table public.cadencia_fluxo_passo is
  'Passos sequenciais de um fluxo. Ordem + offset_dias + canal + conteúdo.';

-- =============================================================================
-- View: fluxo + passos JSONB pra UI rápida
-- =============================================================================
create or replace view public.v_cadencia_fluxo_completo as
select
  f.*,
  (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', p.id,
      'ordem', p.ordem,
      'offset_dias', p.offset_dias,
      'canal', p.canal,
      'nome_passo', p.nome_passo,
      'assunto', p.assunto,
      'corpo', p.corpo,
      'pular_se_respondeu', p.pular_se_respondeu,
      'pular_se_clicou_link', p.pular_se_clicou_link
    ) order by p.ordem), '[]'::jsonb)
    from public.cadencia_fluxo_passo p where p.fluxo_id = f.id
  ) as passos,
  (select count(*) from public.cadencia_fluxo_passo p where p.fluxo_id = f.id)::int as total_passos
from public.cadencia_fluxo f;

grant select on public.v_cadencia_fluxo_completo to authenticated;

-- =============================================================================
-- Seed do fluxo default em cada org existente (D0/D3/D7/D11 = padrão atual)
-- Idempotente: só insere se org não tem nenhum fluxo ainda.
-- =============================================================================
do $$
declare
  v_org record;
  v_fluxo_id bigint;
begin
  for v_org in
    select id from public.organizacoes
    where not exists (select 1 from public.cadencia_fluxo f where f.organizacao_id = organizacoes.id)
  loop
    insert into public.cadencia_fluxo (
      organizacao_id, nome, descricao, trigger, default_template, ativo, status, publicado_em
    ) values (
      v_org.id,
      'Cold outbound padrão',
      'Sequência clássica D0/D3/D7/D11 — espelho do que cadencia.passo já fazia.',
      'manual', true, true, 'publicado', now()
    ) returning id into v_fluxo_id;

    insert into public.cadencia_fluxo_passo (fluxo_id, ordem, offset_dias, canal, nome_passo, assunto, corpo, pular_se_respondeu) values
      (v_fluxo_id, 1, 0,  'email',     'D0 — Abertura',          'Posso te ajudar com {{dor}}?', 'Olá {{nome}},\n\nVi que vocês da {{empresa}} estão trabalhando com {{segmento}}. Tenho uma ideia que pode encurtar caminhos com {{dor}}.\n\nTopa uma conversa de 15min essa semana?', true),
      (v_fluxo_id, 2, 3,  'whatsapp',  'D3 — Reforço WhatsApp',  null,                            'Oi {{nome}}, segui aqui no LinkedIn — só pra deixar visível meu pedido por email. Posso compartilhar 1 case que aplicaria à {{empresa}}.', true),
      (v_fluxo_id, 3, 7,  'email',     'D7 — Case + valor',      'Resultado real com {{segmento}}', 'Olá {{nome}},\n\nMandei um case concreto de empresa do mesmo perfil que reduziu X%. Vou te encaminhar.\n\nQuer ver?', true),
      (v_fluxo_id, 4, 11, 'call',      'D11 — Ligação leve',     null,                            'Ligar pra apresentar brevemente e pedir 5min na agenda.', true);
  end loop;
end $$;
