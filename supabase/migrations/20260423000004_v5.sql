-- =============================================================
-- MIGRATION v5 — Camada de IA (provedores, features, prompts, logs)
--
-- Arquitetura:
--   ai_providers    : credenciais e base_url por provedor (Anthropic, OpenAI, Google)
--   ai_features     : catálogo das 15 features (enable/disable, modelo, temp, max_tokens)
--   ai_prompts      : biblioteca versionada de prompts (system + user templates)
--   ai_invocations  : log de toda chamada (auditoria, custo, latência, debugging)
--
-- Idempotente (IF NOT EXISTS em tudo).
-- =============================================================

-- -------------------------------------------------------------
-- 1. ai_providers
-- -------------------------------------------------------------
create table if not exists public.ai_providers (
  id               bigserial primary key,
  organizacao_id   uuid references public.organizacoes(id) on delete cascade,
  nome             text not null,           -- 'Anthropic' | 'OpenAI' | 'Google' | 'Local'
  codigo           text not null,           -- 'anthropic' | 'openai' | 'google' | 'local'
  api_key_ref      text,                    -- nome do env var OU referência no Supabase Vault
  base_url         text,                    -- override opcional (self-hosted / proxies)
  ativo            boolean not null default true,
  prioridade       int  not null default 100,   -- menor = tentado primeiro no fallback
  modelo_default   text,                    -- ex: 'claude-sonnet-4-6', 'gpt-4o'
  custo_input_1k   numeric(10,6) default 0, -- USD por 1k tokens de input (pra estimar custo)
  custo_output_1k  numeric(10,6) default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (organizacao_id, codigo)
);

create index if not exists idx_ai_providers_org on public.ai_providers(organizacao_id, ativo);

-- -------------------------------------------------------------
-- 2. ai_features — catálogo das 15 features
-- -------------------------------------------------------------
create table if not exists public.ai_features (
  id              bigserial primary key,
  organizacao_id  uuid references public.organizacoes(id) on delete cascade,
  codigo          text not null,            -- 'enriquecer_lead', 'gerar_cadencia', etc.
  nome            text not null,            -- display
  descricao       text,
  etapa_fluxo     text,                     -- 'base','qualificacao','raiox','cadencia','ligacao','score','proposta','perda','insights','admin'
  ativo           boolean not null default true,
  provider_codigo text default 'anthropic',
  modelo          text default 'claude-sonnet-4-6',
  temperature     numeric(3,2) default 0.5,
  max_tokens      int default 1024,
  -- Budget/rate limit
  limite_dia_org        int default 200,    -- nº máximo de invocações / org / dia
  limite_dia_usuario    int default 50,
  -- Permissões
  papel_minimo    text default 'comercial' check (papel_minimo in ('gestor','comercial','sdr')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organizacao_id, codigo)
);

create index if not exists idx_ai_features_org on public.ai_features(organizacao_id, ativo);

-- -------------------------------------------------------------
-- 3. ai_prompts — versionamento de prompts
-- -------------------------------------------------------------
create table if not exists public.ai_prompts (
  id              bigserial primary key,
  organizacao_id  uuid references public.organizacoes(id) on delete cascade,
  feature_codigo  text not null,
  versao          int  not null default 1,
  ativo           boolean not null default true,
  system_prompt   text,
  user_template   text not null,            -- template com {{variaveis}}
  variaveis_esperadas  jsonb default '[]'::jsonb,  -- ex: ["nome_lead","segmento","contexto"]
  exemplo_input   jsonb default '{}'::jsonb,
  notas_editor    text,                     -- justificativa da versão
  criado_por      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  unique (organizacao_id, feature_codigo, versao)
);

-- Garantir que só UMA versão fica ativa por feature+org
create unique index if not exists uq_ai_prompts_ativa
  on public.ai_prompts(organizacao_id, feature_codigo)
  where ativo = true;

create index if not exists idx_ai_prompts_feature on public.ai_prompts(organizacao_id, feature_codigo);

-- -------------------------------------------------------------
-- 4. ai_invocations — log de chamadas
-- -------------------------------------------------------------
create table if not exists public.ai_invocations (
  id              bigserial primary key,
  organizacao_id  uuid references public.organizacoes(id) on delete cascade,
  feature_codigo  text not null,
  prompt_versao   int,
  provider_codigo text,
  modelo          text,
  ator_id         uuid references public.profiles(id) on delete set null,
  lead_id         bigint references public.leads(id) on delete set null,

  -- Request/response
  input_vars      jsonb default '{}'::jsonb,
  output_texto    text,
  output_json     jsonb,

  -- Metrics
  tokens_input    int,
  tokens_output   int,
  custo_estimado  numeric(10,6),
  latencia_ms     int,

  status          text check (status in ('sucesso','erro','bloqueado_budget','timeout')),
  erro_msg        text,
  created_at      timestamptz not null default now()
);

create index if not exists idx_ai_inv_org_date  on public.ai_invocations(organizacao_id, created_at desc);
create index if not exists idx_ai_inv_feature   on public.ai_invocations(organizacao_id, feature_codigo, created_at desc);
create index if not exists idx_ai_inv_lead      on public.ai_invocations(lead_id, created_at desc);
create index if not exists idx_ai_inv_ator      on public.ai_invocations(ator_id, created_at desc);

-- -------------------------------------------------------------
-- 5. RLS
-- -------------------------------------------------------------
alter table public.ai_providers    enable row level security;
alter table public.ai_features     enable row level security;
alter table public.ai_prompts      enable row level security;
alter table public.ai_invocations  enable row level security;

drop policy if exists ai_providers_org  on public.ai_providers;
drop policy if exists ai_features_org   on public.ai_features;
drop policy if exists ai_prompts_org    on public.ai_prompts;
drop policy if exists ai_invoc_org      on public.ai_invocations;

create policy ai_providers_org on public.ai_providers
  for all using (organizacao_id is null or organizacao_id in (select public.orgs_do_usuario()))
  with check (organizacao_id in (select public.orgs_do_usuario()));

create policy ai_features_org on public.ai_features
  for all using (organizacao_id is null or organizacao_id in (select public.orgs_do_usuario()))
  with check (organizacao_id in (select public.orgs_do_usuario()));

create policy ai_prompts_org on public.ai_prompts
  for all using (organizacao_id is null or organizacao_id in (select public.orgs_do_usuario()))
  with check (organizacao_id in (select public.orgs_do_usuario()));

create policy ai_invoc_org on public.ai_invocations
  for all using (organizacao_id in (select public.orgs_do_usuario()))
  with check (organizacao_id in (select public.orgs_do_usuario()));

-- -------------------------------------------------------------
-- 6. View agregada: custo e uso por feature (últimos 30d)
-- -------------------------------------------------------------
create or replace view public.v_ai_uso_30d as
select
  ai.organizacao_id,
  ai.feature_codigo,
  count(*) filter (where status = 'sucesso')::int as invocacoes_ok,
  count(*) filter (where status = 'erro')::int    as invocacoes_erro,
  count(*) filter (where status = 'bloqueado_budget')::int as bloqueadas,
  coalesce(sum(custo_estimado), 0) as custo_usd,
  coalesce(sum(tokens_input), 0)   as tokens_in_total,
  coalesce(sum(tokens_output), 0)  as tokens_out_total,
  round(avg(latencia_ms)::numeric, 0) as latencia_media_ms
from public.ai_invocations ai
where created_at >= current_timestamp - interval '30 days'
group by ai.organizacao_id, ai.feature_codigo;

grant select on public.v_ai_uso_30d to authenticated;

-- =============================================================
-- SEEDS GLOBAIS (organizacao_id = null = template universal)
-- =============================================================

-- Providers default
insert into public.ai_providers (organizacao_id, nome, codigo, api_key_ref, base_url, prioridade, modelo_default, custo_input_1k, custo_output_1k)
values
  (null, 'Anthropic', 'anthropic', 'ANTHROPIC_API_KEY', 'https://api.anthropic.com',   10, 'claude-sonnet-4-6',      0.003, 0.015),
  (null, 'OpenAI',    'openai',    'OPENAI_API_KEY',    'https://api.openai.com',      20, 'gpt-4o',                 0.0025, 0.010),
  (null, 'Google',    'google',    'GOOGLE_API_KEY',    'https://generativelanguage.googleapis.com', 30, 'gemini-2.0-flash', 0.0001, 0.0004)
on conflict do nothing;

-- Features
insert into public.ai_features (organizacao_id, codigo, nome, descricao, etapa_fluxo, provider_codigo, modelo, temperature, max_tokens, papel_minimo) values
  (null, 'enriquecer_lead',      'Enriquecer dados do lead',       'Busca LinkedIn/site e preenche cargo, decisor, segmento, tamanho.', 'base',         'anthropic', 'claude-sonnet-4-6', 0.3, 800,  'sdr'),
  (null, 'gerar_oferta_raiox',   'Gerar oferta do Raio-X',         'Mensagem de convite personalizada para o Raio-X pago.',              'raiox',        'anthropic', 'claude-sonnet-4-6', 0.7, 600,  'comercial'),
  (null, 'gerar_documento_raiox','Gerar documento do Raio-X',      'A partir de resumo/transcrição da call, gera score + recomendações.', 'raiox',        'anthropic', 'claude-sonnet-4-6', 0.3, 2000, 'comercial'),
  (null, 'gerar_mensagem_cadencia', 'Gerar mensagem de cadência',  'Produz D0/D3/D7/D11/D16/D30 personalizada pro contexto do lead.',      'cadencia',     'anthropic', 'claude-sonnet-4-6', 0.7, 500,  'comercial'),
  (null, 'extrair_ligacao',      'Extrair dados da ligação',        'Da transcrição/resumo, extrai decisor, dor, tom, próxima ação.',      'ligacao',      'anthropic', 'claude-sonnet-4-6', 0.2, 1000, 'comercial'),
  (null, 'next_best_action',     'Próxima melhor ação (NBA)',      'Narrativa contextual ao lado do score com recomendação prática.',      'score',        'anthropic', 'claude-sonnet-4-6', 0.5, 400,  'comercial'),
  (null, 'briefing_pre_call',    'Briefing pré-call',              'Dossiê gerado 30min antes da call: histórico, pontos, riscos.',       'ligacao',      'anthropic', 'claude-sonnet-4-6', 0.4, 1500, 'comercial'),
  (null, 'objection_handler',    'Tratamento de objeção',          'Dada uma objeção, sugere 3 abordagens com script.',                   'ligacao',      'anthropic', 'claude-sonnet-4-6', 0.6, 800,  'comercial'),
  (null, 'gerar_proposta',       'Gerar minuta de proposta',       'Proposta em 3 versões (conservador/ideal/premium) a partir do contexto.','proposta',   'anthropic', 'claude-sonnet-4-6', 0.4, 2500, 'comercial'),
  (null, 'sugerir_motivo_perda', 'Padronizar motivo de perda',     'Dado um texto livre do vendedor, sugere o motivo padrão mais próximo.','perda',       'anthropic', 'claude-sonnet-4-6', 0.1, 200,  'comercial'),
  (null, 'detectar_risco',       'Detectar risco no pipeline',     'Varre pipeline diariamente e alerta leads esfriando.',                 'insights',     'anthropic', 'claude-sonnet-4-6', 0.2, 1200, 'comercial'),
  (null, 'resumo_diario',        'Resumo diário do vendedor',      'Ao fim do dia: o que foi feito + recomenda foco de amanhã.',          'insights',     'anthropic', 'claude-sonnet-4-6', 0.4, 600,  'comercial'),
  (null, 'digest_semanal',       'Digest semanal do gestor',       'Na sexta: insights do funil da semana + recomendação estratégica.',    'insights',     'anthropic', 'claude-sonnet-4-6', 0.4, 1500, 'gestor'),
  (null, 'reativar_nutricao',    'Reativar lead em nutrição',      'Escolhe momento certo pra reengajar baseado em gatilhos externos.',   'insights',     'anthropic', 'claude-sonnet-4-6', 0.5, 600,  'comercial'),
  (null, 'forecast_ml',          'Forecast ML ajustado',           'Ajusta forecast heurístico com padrões do histórico da org.',         'insights',     'anthropic', 'claude-sonnet-4-6', 0.2, 800,  'gestor')
on conflict do nothing;

-- =============================================================
-- PROMPTS SEED (versão 1 de cada feature)
-- =============================================================

insert into public.ai_prompts (organizacao_id, feature_codigo, versao, ativo, system_prompt, user_template, variaveis_esperadas, notas_editor) values

-- 1. Enriquecer lead
(null, 'enriquecer_lead', 1, true,
$sys$Você é um pesquisador B2B brasileiro. A partir do nome da empresa e dados parciais, infira: cargo do contato provável, se tem perfil de decisor, segmento padronizado (Saúde, Farmácia/Manipulação, Imobiliária, Corretora/Seguros, Saúde ocupacional, Indústria, Serviços, Fintech/Operações, Outro), tamanho estimado (micro/pequena/média/grande). Seja conservador: só afirme o que é razoavelmente dedutível. Retorne JSON válido.$sys$,
$tpl$Empresa: {{empresa}}
Nome do contato: {{nome}}
Cargo informado: {{cargo}}
Cidade/UF: {{cidade_uf}}
LinkedIn: {{linkedin}}
Site: {{site}}

Retorne JSON com: {"segmento": "...", "tamanho": "...", "decisor_provavel": true/false, "temperatura_sugerida": "Frio|Morno|Quente", "justificativa": "..."}$tpl$,
'["empresa","nome","cargo","cidade_uf","linkedin","site"]'::jsonb,
'Versão inicial. Focada em inferência conservadora sem chutar.'),

-- 2. Gerar oferta do Raio-X
(null, 'gerar_oferta_raiox', 1, true,
$sys$Você é um copywriter B2B da Guilds Lab, empresa brasileira de tecnologia (software, automações, IA). O Raio-X é um diagnóstico pago (R$97 lista, voucher R$50 → R$47) que mostra perda mensal pela ausência de automação. Tom: objetivo, consultivo, provocativo sem ser agressivo. Máximo 120 palavras. Sempre fecha com CTA claro.$sys$,
$tpl$Lead: {{empresa}} — {{nome}} ({{cargo}}) · Segmento: {{segmento}}
Canal de envio: {{canal}}
Voucher escolhido: {{tipo_voucher}}
Contexto/dor que apareceu: {{contexto}}

Escreva a mensagem de oferta do Raio-X. Se canal = WhatsApp, mais curto (até 80 palavras) e informal. Se email, estruturado com assunto e corpo. Use o nome do lead.$tpl$,
'["empresa","nome","cargo","segmento","canal","tipo_voucher","contexto"]'::jsonb,
'Foco em dor latente do segmento. Não ser genérico.'),

-- 3. Gerar documento do Raio-X
(null, 'gerar_documento_raiox', 1, true,
$sys$Você é analista sênior de eficiência operacional da Guilds Lab. Recebe transcrição/resumo da call de diagnóstico e produz o documento do Raio-X: 1) Score 0-100, 2) Nível (Alto/Médio/Baixo), 3) 3-5 gargalos identificados com impacto, 4) Perda anual estimada em R$ (mostrar racional), 5) Saída recomendada (Diagnóstico Pago, Nutrição, Parceria Estratégica), 6) 3 recomendações acionáveis. Seja específico. Retorne JSON estruturado.$sys$,
$tpl$Lead: {{empresa}} — {{segmento}}
Resumo/transcrição da call:
{{conteudo_call}}

Informações adicionais:
- Tamanho estimado: {{tamanho}}
- Dor principal já registrada: {{dor_principal}}
- Valor potencial estimado pelo vendedor: {{valor_potencial}}

Retorne JSON: {"score": N, "nivel": "...", "gargalos": [{"nome":"","impacto":""}], "perda_anual": N, "perda_racional": "...", "saida": "...", "recomendacoes": ["...","..."]}$tpl$,
'["empresa","segmento","conteudo_call","tamanho","dor_principal","valor_potencial"]'::jsonb,
'Versão inicial. Se score < 40, saída = Nutrição.'),

-- 4. Gerar mensagem de cadência
(null, 'gerar_mensagem_cadencia', 1, true,
$sys$Você escreve mensagens de follow-up B2B pela Guilds Lab. Cadência: D0 (primeiro contato após qualificação), D3 (reforço leve), D7 (valor — envia case), D11 (quebra de padrão), D16 (última tentativa direta), D30 (carta de saída / nutrição). Sempre personalizado ao contexto do lead. Tom humano, nunca AI-slop. Máximo 120 palavras (WhatsApp até 80).$sys$,
$tpl$Lead: {{empresa}} — {{nome}} ({{cargo}})
Passo da cadência: {{passo}}
Canal: {{canal}}
Dor registrada: {{dor_principal}}
Última interação: {{ultima_interacao}} (tom: {{tom_anterior}})
Raio-X: {{raiox_status}} (score {{raiox_score}})

Vendedor que assina: {{vendedor}}

Escreva a mensagem {{passo}}. Usa o primeiro nome do lead. Se tom_anterior=negativo, abre reconhecendo objeção.$tpl$,
'["empresa","nome","cargo","passo","canal","dor_principal","ultima_interacao","tom_anterior","raiox_status","raiox_score","vendedor"]'::jsonb,
'Prompt crítico. Calibrar com amostras reais depois.'),

-- 5. Extrair da ligação
(null, 'extrair_ligacao', 1, true,
$sys$Você é um analista que transforma transcrições de ligações B2B em dados estruturados. Seja fiel ao que foi dito — não invente. Se algo não foi claro, retorne null. Retorne JSON válido.$sys$,
$tpl$Transcrição/resumo da ligação com {{empresa}}:

{{transcricao}}

Extraia JSON com:
{
  "tom_interacao": "positivo|neutro|negativo",
  "decisor_identificado": true|false|null,
  "dor_principal": "...",
  "objecoes": ["...","..."],
  "proximo_passo_sugerido": "...",
  "data_proxima_acao_sugerida": "YYYY-MM-DD ou null",
  "etapa_sugerida": "uma das etapas CRM ou null",
  "percepcao_sugerida": "Muito baixa|Baixa|Média|Alta|Muito alta",
  "resumo_executivo": "1-2 frases"
}$tpl$,
'["empresa","transcricao"]'::jsonb,
'Temperature baixa pra consistência.'),

-- 6. Next Best Action
(null, 'next_best_action', 1, true,
$sys$Você é o copiloto do vendedor. Dado o contexto completo do lead, produz UMA recomendação prática e específica — não genérica. Máximo 3 parágrafos curtos. Sempre inclui: (1) diagnóstico do momento, (2) ação específica com script/anexo se aplicável, (3) prazo.$sys$,
$tpl$Lead: {{empresa}} — score {{score}} ({{rotulo_score}})
Etapa: {{crm_stage}}
Dias sem tocar: {{dias_sem_tocar}}
Última interação: {{ultima_interacao}} (tom: {{tom_anterior}})
Dor: {{dor_principal}}
Cadência pendente: {{cadencia_pendente}}
Valor: R$ {{valor_potencial}}

Produza a Next Best Action.$tpl$,
'["empresa","score","rotulo_score","crm_stage","dias_sem_tocar","ultima_interacao","tom_anterior","dor_principal","cadencia_pendente","valor_potencial"]'::jsonb,
'Deve ser acionável em <5 min.'),

-- 7. Briefing pré-call
(null, 'briefing_pre_call', 1, true,
$sys$Você prepara briefings executivos pra calls B2B da Guilds Lab. Formato estrito: 1) CONTEXTO (3 bullets), 2) LINHA DO TEMPO (últimas 3 interações), 3) 3 PERGUNTAS PRA FAZER, 4) 2 RISCOS PRA MITIGAR, 5) OBJETIVO DA CALL (1 frase). Direto ao ponto, sem floreio.$sys$,
$tpl$Call com {{empresa}} agendada para {{data_call}}.
Participantes: {{participantes}}
Etapa CRM atual: {{crm_stage}}
Score: {{score}}

Histórico de interações (mais recente primeiro):
{{historico_interacoes}}

Raio-X: {{raiox_resumo}}
Dor registrada: {{dor_principal}}
Objeções já ouvidas: {{objecoes}}

Produza o briefing no formato solicitado.$tpl$,
'["empresa","data_call","participantes","crm_stage","score","historico_interacoes","raiox_resumo","dor_principal","objecoes"]'::jsonb,
'Objetivo: vendedor lê em 90s antes da call.'),

-- 8. Objection handler
(null, 'objection_handler', 1, true,
$sys$Você é coach de vendas da Guilds Lab. Recebe uma objeção e retorna 3 abordagens com SCRIPT pronto. Ordena por probabilidade de sucesso. Cada abordagem tem: nome, racional (1 frase), script pronto pra falar/enviar (2-4 frases). Formato JSON.$sys$,
$tpl$Objeção do lead {{empresa}} ({{crm_stage}}):

"{{objecao}}"

Contexto adicional: {{contexto}}

Retorne JSON: {"abordagens": [{"nome":"","racional":"","script":""}]} — 3 itens ordenados por eficácia.$tpl$,
'["empresa","crm_stage","objecao","contexto"]'::jsonb,
'Considerar em fine-tune futuro: aprender com deals Fechado após essa objeção.'),

-- 9. Gerar proposta
(null, 'gerar_proposta', 1, true,
$sys$Você é consultor comercial da Guilds Lab. Produz 3 versões da proposta (Conservador, Ideal, Premium) com: escopo, entregas, cronograma, valor, payment terms, observações. Base: raio-x + histórico. Valores coerentes com mercado brasileiro B2B tech.$sys$,
$tpl$Lead: {{empresa}} — {{segmento}}
Dor principal: {{dor_principal}}
Raio-X: score {{raiox_score}}, perda anual R$ {{perda_anual}}
Valor potencial estimado: R$ {{valor_potencial}}
Preferências captadas nas calls: {{preferencias}}

Retorne JSON: {"conservador": {...}, "ideal": {...}, "premium": {...}} — cada um com: escopo (bullets), entregas, cronograma, valor_total, parcelas, observacoes.$tpl$,
'["empresa","segmento","dor_principal","raiox_score","perda_anual","valor_potencial","preferencias"]'::jsonb,
'Versão inicial. Requer validação comercial antes de ativar em produção.'),

-- 10. Sugerir motivo de perda
(null, 'sugerir_motivo_perda', 1, true,
$sys$Você categoriza motivos de perda de lead B2B. Opções fixas: Preço, Timing, Concorrência, Sumiu, Sem orçamento, Sem fit, Decisor errado, Outro. Retorne APENAS o JSON — sem explicação extra.$sys$,
$tpl$Texto do vendedor: "{{texto_livre}}"

Retorne JSON: {"motivo_padrao": "Preço|Timing|Concorrência|Sumiu|Sem orçamento|Sem fit|Decisor errado|Outro", "confianca": 0.0-1.0, "detalhe_se_outro": ""}$tpl$,
'["texto_livre"]'::jsonb,
'Temperature quase 0 pra consistência máxima.'),

-- 11. Detectar risco
(null, 'detectar_risco', 1, true,
$sys$Você é analista de pipeline. Recebe lista de leads ativos e flagga os em risco iminente de virar Perdido. Critério: score caindo, dias sem tocar crescendo, cadência atrasada, tom das interações piorando. Retorne até 5 leads de maior risco com explicação curta.$sys$,
$tpl$Leads ativos da semana (JSON):
{{leads_json}}

Retorne JSON: {"alertas": [{"lead_id":N, "motivo":"...", "acao_recomendada":"..."}]} — ordenado por severidade, máximo 5.$tpl$,
'["leads_json"]'::jsonb,
'Executado via cron diário.'),

-- 12. Resumo diário
(null, 'resumo_diario', 1, true,
$sys$Você escreve resumos diários curtos (até 150 palavras) pro vendedor ao fim do dia. Formato: parágrafo único, tom encorajador mas realista. Sempre fecha com a prioridade #1 de amanhã.$sys$,
$tpl$Vendedor: {{vendedor}}
Data: {{data}}
Atividade de hoje:
- Ligações: {{total_ligacoes}} ({{ligacoes_com_atendimento}} atendidas)
- Raio-X enviados: {{raiox_ofertados}}
- Raio-X pagos: {{raiox_pagos}}
- Leads promovidos de etapa: {{promocoes}}
- Leads perdidos: {{perdidos}} ({{motivos_principais}})
- Pendências pra amanhã: {{pendencias_amanha}}

Escreva o resumo do dia.$tpl$,
'["vendedor","data","total_ligacoes","ligacoes_com_atendimento","raiox_ofertados","raiox_pagos","promocoes","perdidos","motivos_principais","pendencias_amanha"]'::jsonb,
'Executado via cron 19h.'),

-- 13. Digest semanal do gestor
(null, 'digest_semanal', 1, true,
$sys$Você escreve digests semanais executivos pro gestor comercial da Guilds Lab. 400 palavras máximo. Estrutura: 1) Placar da semana, 2) Quem se destacou e por quê, 3) Gargalo do funil + recomendação específica, 4) Risco mais pesado, 5) Experimento pra semana seguinte.$sys$,
$tpl$Semana: {{periodo}}
KPIs agregados:
{{kpis_json}}

Por vendedor:
{{por_vendedor_json}}

Funil:
{{funil_json}}

Top leads perdidos da semana com motivos:
{{perdidos_json}}

Escreva o digest no formato solicitado.$tpl$,
'["periodo","kpis_json","por_vendedor_json","funil_json","perdidos_json"]'::jsonb,
'Enviado via email sexta 17h.'),

-- 14. Reativar nutrição
(null, 'reativar_nutricao', 1, true,
$sys$Você identifica o momento certo de reengajar leads em Nutrição. Recebe perfil do lead, motivo da nutrição e sinais externos recentes. Decide: reengajar agora (com script) ou esperar (com nova data sugerida). Tom: relevância antes de insistência.$sys$,
$tpl$Lead em nutrição: {{empresa}} — {{nome}} ({{cargo}})
Motivo original da nutrição: {{motivo_nutricao}}
Há quanto tempo em nutrição: {{dias_nutricao}}
Sinais externos recentes (notícias, LinkedIn, setor): {{sinais}}

Retorne JSON: {"decisao": "reengajar_agora|esperar", "razao":"", "script_mensagem":"", "proxima_data": "YYYY-MM-DD ou null"}$tpl$,
'["empresa","nome","cargo","motivo_nutricao","dias_nutricao","sinais"]'::jsonb,
'Requer integração com feed externo — Fase 3.'),

-- 15. Forecast ML
(null, 'forecast_ml', 1, true,
$sys$Você ajusta previsões de forecast comercial a partir de padrões do histórico da própria organização. Recebe: forecast heurístico atual (best/likely/worst) + amostra de deals fechados/perdidos do histórico. Produz ajuste calibrado com justificativa. Seja conservador — só ajuste se houver sinal claro.$sys$,
$tpl$Forecast heurístico atual (30 dias):
- Best:   R$ {{forecast_best}}
- Likely: R$ {{forecast_likely}}
- Worst:  R$ {{forecast_worst}}

Amostra de deals ({{n_amostras}} nos últimos 6 meses):
{{amostra_json}}

Retorne JSON: {"ajustado": {"best":N,"likely":N,"worst":N}, "fator_ajuste_likely": 0.N, "padroes_detectados": ["..."], "confianca": 0.0-1.0}$tpl$,
'["forecast_best","forecast_likely","forecast_worst","n_amostras","amostra_json"]'::jsonb,
'Só ativar quando houver n_amostras >= 50.')

on conflict do nothing;
