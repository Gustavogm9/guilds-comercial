-- Proposal generation v3: skill chain + structured HTML preview.
-- Keeps org-specific prompts untouched; updates only global defaults.

update public.ai_prompts
set ativo = false
where organizacao_id is null
  and feature_codigo = 'gerar_proposta'
  and idioma in ('pt-BR', 'en-US')
  and versao <> 3
  and ativo = true;

insert into public.ai_prompts (
  organizacao_id,
  feature_codigo,
  versao,
  ativo,
  idioma,
  system_prompt,
  user_template,
  variaveis_esperadas,
  notas_editor
)
select
  null,
  'gerar_proposta',
  3,
  true,
  'pt-BR',
  $sys$Voce e um estrategista comercial senior da Guilds Lab. Gere propostas B2B seguindo rigorosamente a sequencia de skills fornecida pelo time. Use os dados de pipeline, portfolio, produtos, projetos proprios, cases, briefing do vendedor e variacao comercial. A resposta deve ser validavel pelo vendedor e pronta para virar preview HTML/PDF. Nao inclua scripts, iframes, tracking pixels, CSS externo ou links inventados.$sys$,
  $tpl$Lead: {{empresa}} - {{segmento}}
Contato: {{nome}}
Dor principal: {{dor_principal}}
Etapa/variacao/formato: {{variacao}} / {{formato_proposta}}
Valor potencial estimado: R$ {{valor_potencial}}
Briefing comercial:
{{briefing_comercial}}

Produtos disponiveis:
{{produtos_disponiveis}}

Produtos ja vinculados ao lead:
{{produtos_vinculados_ao_lead}}

Cases e projetos relevantes:
{{cases_relevantes}}

Sequencia de skills obrigatoria:
{{skills_proposta}}

Contrato de saida:
{{schema_saida}}

Antes de responder, siga cada skill em ordem. Retorne somente JSON valido seguindo o contrato de saida. O campo "html" deve conter a proposta/renderizacao final em HTML sem markdown.$tpl$,
  '["empresa","nome","segmento","dor_principal","valor_potencial","variacao","formato_proposta","briefing_comercial","produtos_disponiveis","produtos_vinculados_ao_lead","cases_relevantes","skills_proposta","schema_saida"]'::jsonb,
  'V3: aceita sequencia de skills comerciais, integra portfolio/projetos/produtos e retorna JSON com HTML para preview/PDF.'
where not exists (
  select 1 from public.ai_prompts
  where organizacao_id is null
    and feature_codigo = 'gerar_proposta'
    and versao = 3
    and idioma = 'pt-BR'
);

update public.ai_prompts
set ativo = true
where organizacao_id is null
  and feature_codigo = 'gerar_proposta'
  and versao = 3
  and idioma in ('pt-BR', 'en-US');

insert into public.ai_prompts (
  organizacao_id,
  feature_codigo,
  versao,
  ativo,
  idioma,
  system_prompt,
  user_template,
  variaveis_esperadas,
  notas_editor
)
select
  null,
  'gerar_proposta',
  3,
  true,
  'en-US',
  $sys$You are a senior commercial strategist at Guilds Lab. Generate B2B proposals by strictly following the sales skill chain provided by the team. Use pipeline, portfolio, products, owned projects, cases, seller briefing, and commercial variation. The response must be seller-reviewable and ready to become an HTML/PDF preview. Do not include scripts, iframes, tracking pixels, external CSS, or invented links.$sys$,
  $tpl$Lead: {{empresa}} - {{segmento}}
Contact: {{nome}}
Main pain: {{dor_principal}}
Stage/variation/format: {{variacao}} / {{formato_proposta}}
Estimated deal value: {{valor_potencial}}
Seller briefing:
{{briefing_comercial}}

Available products:
{{produtos_disponiveis}}

Products already linked to this lead:
{{produtos_vinculados_ao_lead}}

Relevant cases and projects:
{{cases_relevantes}}

Mandatory skill chain:
{{skills_proposta}}

Output contract:
{{schema_saida}}

Before answering, follow each skill in order. Return only valid JSON following the output contract. The "html" field must contain the final proposal/rendering in HTML without markdown.$tpl$,
  '["empresa","nome","segmento","dor_principal","valor_potencial","variacao","formato_proposta","briefing_comercial","produtos_disponiveis","produtos_vinculados_ao_lead","cases_relevantes","skills_proposta","schema_saida"]'::jsonb,
  'V3: accepts commercial skill chain, integrates portfolio/projects/products, and returns JSON with HTML for preview/PDF.'
where not exists (
  select 1 from public.ai_prompts
  where organizacao_id is null
    and feature_codigo = 'gerar_proposta'
    and versao = 3
    and idioma = 'en-US'
);
