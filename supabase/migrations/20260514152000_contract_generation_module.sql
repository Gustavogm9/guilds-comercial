-- Contract generation module: post-close contract/briefing workflow.

create table if not exists public.contratos (
  id bigserial primary key,
  organizacao_id uuid not null references public.organizacoes(id) on delete cascade,
  lead_id bigint references public.leads(id) on delete set null,
  proposta_id bigint references public.propostas(id) on delete set null,
  criado_por uuid references public.profiles(id) on delete set null,
  modo text not null default 'contrato_template'
    check (modo in ('contrato_template','briefing_juridico','revisao_juridica')),
  status text not null default 'rascunho'
    check (status in ('rascunho','em_revisao','aguardando_assinatura','assinado','cancelado')),
  template_docx_nome text,
  template_docx_ref text,
  texto_contrato text,
  html_contrato text,
  briefing_juridico text,
  input_vars jsonb not null default '{}'::jsonb,
  versao_atual int not null default 1,
  ultimo_pedido_melhoria text,
  data_envio date,
  data_assinatura date,
  link_contrato text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_contratos_org_date on public.contratos (organizacao_id, created_at desc);
create index if not exists idx_contratos_lead on public.contratos (lead_id, created_at desc);
create index if not exists idx_contratos_proposta on public.contratos (proposta_id, created_at desc);

create table if not exists public.contrato_versoes (
  id bigserial primary key,
  organizacao_id uuid not null references public.organizacoes(id) on delete cascade,
  contrato_id bigint not null references public.contratos(id) on delete cascade,
  lead_id bigint references public.leads(id) on delete set null,
  proposta_id bigint references public.propostas(id) on delete set null,
  versao int not null,
  modo text not null check (modo in ('contrato_template','briefing_juridico','revisao_juridica')),
  texto_contrato text,
  html_contrato text,
  briefing_juridico text,
  input_vars jsonb not null default '{}'::jsonb,
  pedido_melhoria text,
  ai_invocation_id bigint references public.ai_invocations(id) on delete set null,
  criado_por uuid references public.profiles(id) on delete set null,
  status text not null default 'gerada' check (status in ('gerada','validada','enviada','descartada')),
  created_at timestamptz not null default now(),
  unique (contrato_id, versao)
);

create index if not exists idx_contrato_versoes_org_date on public.contrato_versoes (organizacao_id, created_at desc);
create index if not exists idx_contrato_versoes_contrato on public.contrato_versoes (contrato_id, versao desc);

create table if not exists public.contrato_feedback (
  id bigserial primary key,
  organizacao_id uuid not null references public.organizacoes(id) on delete cascade,
  contrato_id bigint not null references public.contratos(id) on delete cascade,
  versao_id bigint references public.contrato_versoes(id) on delete set null,
  tipo text not null check (tipo in ('correcao','melhoria','aprovacao','rejeicao','juridico')),
  conteudo text not null,
  resolvido boolean not null default false,
  criado_por uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_contrato_feedback_org_date on public.contrato_feedback (organizacao_id, created_at desc);
create index if not exists idx_contrato_feedback_contrato on public.contrato_feedback (contrato_id, created_at desc);

create table if not exists public.contrato_skill_configs (
  id bigserial primary key,
  organizacao_id uuid not null references public.organizacoes(id) on delete cascade,
  nome text not null,
  modo text not null default 'contrato_template'
    check (modo in ('contrato_template','briefing_juridico','revisao_juridica')),
  template_docx_nome text,
  template_docx_ref text,
  skill_chain text not null,
  modelo_referencia text,
  ativo boolean not null default true,
  padrao boolean not null default false,
  criado_por uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_contrato_skill_configs_org on public.contrato_skill_configs (organizacao_id, ativo, modo);

alter table public.contratos enable row level security;
alter table public.contrato_versoes enable row level security;
alter table public.contrato_feedback enable row level security;
alter table public.contrato_skill_configs enable row level security;

drop policy if exists contratos_org on public.contratos;
drop policy if exists contrato_versoes_org on public.contrato_versoes;
drop policy if exists contrato_feedback_org on public.contrato_feedback;
drop policy if exists contrato_skill_configs_org on public.contrato_skill_configs;

create policy contratos_org on public.contratos
  for all using (organizacao_id in (select public.orgs_do_usuario()))
  with check (organizacao_id in (select public.orgs_do_usuario()));

create policy contrato_versoes_org on public.contrato_versoes
  for all using (organizacao_id in (select public.orgs_do_usuario()))
  with check (organizacao_id in (select public.orgs_do_usuario()));

create policy contrato_feedback_org on public.contrato_feedback
  for all using (organizacao_id in (select public.orgs_do_usuario()))
  with check (organizacao_id in (select public.orgs_do_usuario()));

create policy contrato_skill_configs_org on public.contrato_skill_configs
  for all using (organizacao_id in (select public.orgs_do_usuario()))
  with check (organizacao_id in (select public.orgs_do_usuario()));

insert into public.ai_features (
  organizacao_id, codigo, nome, descricao, etapa_fluxo,
  provider_codigo, modelo, temperature, max_tokens, papel_minimo
)
select
  null,
  'gerar_contrato',
  'Gerar contrato ou briefing juridico',
  'Contrato pos-fechamento com template DOCX, briefing para juridico e revisoes versionadas.',
  'proposta',
  'anthropic',
  'claude-sonnet-4-6',
  0.25,
  3500,
  'comercial'
where not exists (
  select 1 from public.ai_features where organizacao_id is null and codigo = 'gerar_contrato'
);

insert into public.ai_prompts (
  organizacao_id, feature_codigo, versao, ativo, idioma,
  system_prompt, user_template, variaveis_esperadas, notas_editor
)
select
  null,
  'gerar_contrato',
  1,
  true,
  'pt-BR',
  $sys$Voce apoia a preparacao contratual B2B pos-fechamento. Nao invente clausulas legais definitivas nem substitua advogado. Organize contrato, briefing ou revisao a partir da proposta aceita, dados do lead, template aprovado e skills juridicas/comerciais. Aponte riscos, lacunas e itens que exigem validacao juridica. Retorne JSON valido com HTML seguro para preview.$sys$,
  $tpl$Modo: {{modo_contrato}}
Lead/cliente: {{empresa}} - {{nome}} - {{segmento}}
Proposta aprovada:
{{proposta_contexto}}

Dados comerciais e juridicos:
{{briefing_contrato}}

Template DOCX/referencia:
{{template_referencia}}

Sequencia de skills obrigatoria:
{{skills_contrato}}

Contrato de saida:
{{schema_saida}}

Siga cada skill em ordem. Retorne somente JSON valido.$tpl$,
  '["modo_contrato","empresa","nome","segmento","proposta_contexto","briefing_contrato","template_referencia","skills_contrato","schema_saida"]'::jsonb,
  'V1: contrato/briefing juridico pos-fechamento com HTML preview e checklist de riscos.'
where not exists (
  select 1 from public.ai_prompts
  where organizacao_id is null and feature_codigo = 'gerar_contrato' and versao = 1 and idioma = 'pt-BR'
);

insert into public.ai_prompts (
  organizacao_id, feature_codigo, versao, ativo, idioma,
  system_prompt, user_template, variaveis_esperadas, notas_editor
)
select
  null,
  'gerar_contrato',
  1,
  true,
  'en-US',
  $sys$You support post-close B2B contract preparation. Do not invent definitive legal clauses or replace counsel. Organize a contract, legal briefing, or review from the accepted proposal, lead data, approved template, and legal/commercial skills. Flag risks, gaps, and items requiring legal validation. Return valid JSON with safe HTML preview.$sys$,
  $tpl$Mode: {{modo_contrato}}
Lead/client: {{empresa}} - {{nome}} - {{segmento}}
Accepted proposal:
{{proposta_contexto}}

Commercial and legal inputs:
{{briefing_contrato}}

DOCX template/reference:
{{template_referencia}}

Mandatory skill chain:
{{skills_contrato}}

Output contract:
{{schema_saida}}

Follow each skill in order. Return only valid JSON.$tpl$,
  '["modo_contrato","empresa","nome","segmento","proposta_contexto","briefing_contrato","template_referencia","skills_contrato","schema_saida"]'::jsonb,
  'V1: post-close contract/legal briefing with HTML preview and risk checklist.'
where not exists (
  select 1 from public.ai_prompts
  where organizacao_id is null and feature_codigo = 'gerar_contrato' and versao = 1 and idioma = 'en-US'
);
