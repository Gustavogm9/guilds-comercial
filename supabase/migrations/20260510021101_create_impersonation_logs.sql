-- Migration: Create Impersonation Logs

CREATE TABLE IF NOT EXISTS public.impersonation_logs (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    organizacao_id uuid REFERENCES public.organizacoes(id) ON DELETE CASCADE NOT NULL,
    admin_id uuid REFERENCES auth.users(id) NOT NULL,
    target_user_id uuid REFERENCES auth.users(id) NOT NULL,
    action_type text NOT NULL CHECK (action_type IN ('start', 'end', 'action')),
    action_details jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Habilitar RLS
ALTER TABLE public.impersonation_logs ENABLE ROW LEVEL SECURITY;

-- Gestores podem ver os logs da sua organizacao
CREATE POLICY "Gestores podem ver logs de impersonificacao de sua org" 
ON public.impersonation_logs 
FOR SELECT 
USING (
    EXISTS (
        SELECT 1 FROM public.membros_organizacao m
        WHERE m.organizacao_id = impersonation_logs.organizacao_id
        AND m.profile_id = auth.uid()
        AND m.role = 'gestor'
    )
);

-- Admin (quem realiza a acao) pode inserir os proprios logs
CREATE POLICY "Admins podem inserir logs" 
ON public.impersonation_logs 
FOR INSERT 
WITH CHECK (
    admin_id = auth.uid()
);

-- Indices para performance
CREATE INDEX IF NOT EXISTS idx_impersonation_logs_org ON public.impersonation_logs(organizacao_id);
CREATE INDEX IF NOT EXISTS idx_impersonation_logs_admin ON public.impersonation_logs(admin_id);
CREATE INDEX IF NOT EXISTS idx_impersonation_logs_target ON public.impersonation_logs(target_user_id);
