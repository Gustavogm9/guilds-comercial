-- ============================================================
-- TABELA DE TEMPLATES DE CADÊNCIA POR ORG
-- Permite que cada organização tenha seus próprios textos
-- ============================================================
create table public.cadencia_templates (
  id bigserial primary key,
  organizacao_id uuid not null references public.organizacoes(id) on delete cascade,
  passo text not null check (passo in ('D0','D3','D7','D11','D16','D30')),
  canal text not null check (canal in ('Email','WhatsApp','Ligação')),
  objetivo text,
  assunto text,
  corpo text not null,
  created_at timestamptz not null default now()
);

create index idx_cadencia_templates_org on public.cadencia_templates(organizacao_id);

alter table public.cadencia_templates enable row level security;
create policy cadencia_templates_org on public.cadencia_templates
  for all to authenticated
  using (organizacao_id in (select public.orgs_do_usuario()))
  with check (organizacao_id in (select public.orgs_do_usuario()));
