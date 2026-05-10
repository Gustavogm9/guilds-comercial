-- ==============================================================================
-- Migração Sprint 10 - Agent Copilot (Tabelas de IA)
-- Cria `agent_conversations` (memória) e `agent_actions` (auditoria de ferramentas).
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.agent_conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacao_id BIGINT REFERENCES public.organizacoes(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    channel TEXT NOT NULL DEFAULT 'in_app', -- 'in_app', 'whatsapp'
    channel_session_id TEXT,
    role TEXT NOT NULL CHECK (role IN ('user', 'model', 'tool', 'function')),
    content TEXT,
    tool_call JSONB,
    tool_response JSONB,
    tokens_in INTEGER,
    tokens_out INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.agent_actions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacao_id BIGINT REFERENCES public.organizacoes(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    conversation_id UUID REFERENCES public.agent_conversations(id) ON DELETE CASCADE,
    channel TEXT NOT NULL,
    tool_name TEXT NOT NULL,
    tool_arguments JSONB,
    result_summary TEXT,
    success BOOLEAN NOT NULL,
    error_message TEXT,
    latency_ms INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RLS
ALTER TABLE public.agent_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Ver conversas da propria org" ON public.agent_conversations FOR SELECT
USING (organizacao_id IN (SELECT organizacao_id FROM public.membros_organizacao WHERE user_id = auth.uid()));

CREATE POLICY "Criar conversas da propria org" ON public.agent_conversations FOR INSERT
WITH CHECK (organizacao_id IN (SELECT organizacao_id FROM public.membros_organizacao WHERE user_id = auth.uid()));

CREATE POLICY "Ver acoes da propria org" ON public.agent_actions FOR SELECT
USING (organizacao_id IN (SELECT organizacao_id FROM public.membros_organizacao WHERE user_id = auth.uid()));

CREATE POLICY "Criar acoes da propria org" ON public.agent_actions FOR INSERT
WITH CHECK (organizacao_id IN (SELECT organizacao_id FROM public.membros_organizacao WHERE user_id = auth.uid()));
