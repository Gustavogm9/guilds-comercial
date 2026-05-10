-- Migration: Motor de Raio-X Configurável (Dynamic Forms)
-- Criação das tabelas para suportar templates dinâmicos de diagnóstico e suas respectivas respostas.

create table if not exists public.raiox_templates (
  id uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null references public.organizacoes(id) on delete cascade,
  nome text not null,
  ativo boolean not null default true,
  config_json jsonb not null default '{"secoes": []}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.raiox_templates is 'Armazena a estrutura do Raio-X de cada organização (seções, perguntas, tipos) em JSONB.';

create table if not exists public.raiox_respostas (
  id uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null references public.organizacoes(id) on delete cascade,
  lead_id bigint not null references public.leads(id) on delete cascade,
  template_id uuid not null references public.raiox_templates(id) on delete restrict,
  dados jsonb not null default '{}'::jsonb,
  respondido_por uuid references public.profiles(id) on delete set null,
  finalizado boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.raiox_respostas is 'Armazena as respostas reais dadas a um Raio-X em formato JSONB.';

-- Triggers for updated_at
create trigger trg_raiox_templates_updated
before update on public.raiox_templates
for each row execute function public.touch_updated_at();

create trigger trg_raiox_respostas_updated
before update on public.raiox_respostas
for each row execute function public.touch_updated_at();

-- RLS (Row Level Security)
alter table public.raiox_templates enable row level security;
alter table public.raiox_respostas enable row level security;

create policy raiox_templates_org_rw on public.raiox_templates
for all to authenticated
using (organizacao_id in (select public.orgs_do_usuario()))
with check (organizacao_id in (select public.orgs_do_usuario()));

create policy raiox_respostas_org_rw on public.raiox_respostas
for all to authenticated
using (organizacao_id in (select public.orgs_do_usuario()))
with check (organizacao_id in (select public.orgs_do_usuario()));

-- Inserir feature de IA para avaliar Raio-X
insert into public.ai_features (
  codigo, nome, descricao, etapa_fluxo, provider_codigo, modelo, temperature, max_tokens, papel_minimo
)
select
  'avaliar_raiox', 'Avaliação de Raio-X', 'Analisa as respostas do Raio-X para gerar Score e Perda Anual Estimada', 'conversao', 'openai', 'gpt-4o', 0.2, 500, 'sdr'
where not exists (select 1 from public.ai_features where codigo = 'avaliar_raiox');

insert into public.ai_prompts (
  feature_codigo, versao, ativo, idioma, system_prompt, user_template, variaveis_esperadas
)
select
  'avaliar_raiox', 1, true, 'pt-BR',
  'Você é um especialista em vendas e diagnóstico B2B. Receberá as respostas de um questionário ("Raio-X") realizado com um lead. Seu objetivo é analisar as respostas e retornar EXATAMENTE um objeto JSON com as seguintes chaves:
- "score": número de 0 a 100 indicando a aderência/maturidade do lead (100 = ótimo).
- "nivel": apenas uma das strings "Alto", "Médio" ou "Baixo".
- "perda_anual": número inteiro representando uma estimativa conservadora (em Reais) de perda por ineficiência do lead (ex: 50000).
- "saida": frase curta resumindo o principal gargalo.
- "diagnostico": resumo de até 3 linhas com o diagnóstico para apresentar na proposta.
- "observacoes": notas internas adicionais.
NÃO retorne texto fora do JSON.',
  'Respostas do lead:
{{respostas}}',
  '{"respostas": "string"}'::jsonb
where not exists (select 1 from public.ai_prompts where feature_codigo = 'avaliar_raiox');
