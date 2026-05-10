-- ============================================================
-- Sprint 9-B: WhatsApp AI + Webhook Setup
-- ============================================================

-- 1. Feature de IA: analisar_whatsapp
do $$ begin
  if exists (select 1 from pg_type where typname = 'ai_feature_codigo') then
    begin
      alter type public.ai_feature_codigo add value if not exists 'analisar_whatsapp';
    exception when others then null;
    end;
  end if;
end $$;

insert into public.ai_features
  (organizacao_id, codigo, nome, descricao, etapa_fluxo, ativo, provider_codigo, modelo,
   temperature, max_tokens, limite_dia_org, limite_dia_usuario, papel_minimo)
select
  o.id, 'analisar_whatsapp', 'Analisar conversa WhatsApp',
  'Analisa exportação de conversa do WhatsApp e extrai resumo, sentimento e pontos-chave de venda.',
  'pos_import', true, 'google', 'gemini-2.0-flash', 0.3, 1024, 200, 50, 'sdr'
from public.organizacoes o
where not exists (select 1 from public.ai_features af where af.organizacao_id = o.id and af.codigo = 'analisar_whatsapp');

insert into public.ai_prompts
  (organizacao_id, feature_codigo, versao, ativo, idioma, system_prompt, user_template, variaveis_esperadas)
select
  o.id, 'analisar_whatsapp', 1, true, 'pt-BR',
  'Você é um especialista em análise de conversas comerciais via WhatsApp. Sua tarefa é extrair inteligência de vendas de uma conversa exportada. Seja objetivo, foque em informações úteis para o vendedor fechar o negócio. Responda SOMENTE em JSON válido, sem markdown.',
  'Analise a seguinte conversa de WhatsApp entre {{vendedor}} e o lead {{contato}} (empresa: {{empresa}}).

Total de mensagens: {{total_msgs}}
Período: {{periodo}}

AMOSTRA DA CONVERSA (últimas {{amostra_msgs}} mensagens):
{{amostra}}

Responda em JSON com exatamente este formato:
{
  "resumo": "resumo em 2-3 frases objetivas do que foi discutido",
  "sentimento": "positivo",
  "nivel_interesse": 7,
  "pontos_chave": ["interesse em X", "perguntou sobre Y"],
  "proxima_acao_sugerida": "ação recomendada para o vendedor",
  "sinais_compra": ["perguntou sobre prazo", "pediu proposta"],
  "objecoes": ["preço alto"]
}',
  '["vendedor","contato","empresa","total_msgs","periodo","amostra_msgs","amostra"]'::jsonb
from public.organizacoes o
where not exists (select 1 from public.ai_prompts ap where ap.organizacao_id = o.id and ap.feature_codigo = 'analisar_whatsapp');

-- 2. Token webhook e provider WhatsApp na tabela organizacoes
alter table public.organizacoes
  add column if not exists whatsapp_webhook_token text unique,
  add column if not exists whatsapp_provider text default 'manual'
    check (whatsapp_provider in ('manual', 'zapi', 'evolution', '360dialog', 'twilio'));

-- 3. Índice para lookup rápido de token
create index if not exists idx_org_wh_token on public.organizacoes (whatsapp_webhook_token)
  where whatsapp_webhook_token is not null;

-- 4. Função helper para gerar token webhook (chamada pela UI de configuração)
create or replace function public.gerar_whatsapp_webhook_token(p_org_id uuid)
returns text language plpgsql security definer as $$
declare v_token text;
begin
  -- Verifica que o usuário é da org
  if not exists (
    select 1 from public.membros_organizacao
    where organizacao_id = p_org_id
      and profile_id = auth.uid()
      and papel in ('gestor', 'admin')
  ) then
    raise exception 'Acesso negado';
  end if;
  -- Gera token único
  v_token := encode(gen_random_bytes(24), 'hex');
  update public.organizacoes set whatsapp_webhook_token = v_token where id = p_org_id;
  return v_token;
end;
$$;
