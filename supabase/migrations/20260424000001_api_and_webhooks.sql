-- Extensão para geração de IDs e tokens se necessário
-- CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==========================================
-- 1. Tabela api_keys
-- ==========================================
CREATE TABLE public.api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizacao_id uuid NOT NULL REFERENCES public.organizacoes(id) ON DELETE CASCADE,
  name text NOT NULL,
  key_hash text NOT NULL UNIQUE,
  prefix text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz
);

COMMENT ON TABLE public.api_keys IS 'Armazena o hash das chaves de API. A chave real nunca é salva.';

-- RLS para api_keys
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Acesso as chaves da sua propria organizacao"
  ON public.api_keys
  FOR ALL
  TO authenticated
  USING (
    organizacao_id IN (
      SELECT m.organizacao_id 
      FROM public.membros_organizacao m 
      WHERE m.profile_id = auth.uid() AND m.role = 'gestor'
    )
  );

-- ==========================================
-- 2. Tabela webhooks
-- ==========================================
CREATE TABLE public.webhooks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizacao_id uuid NOT NULL REFERENCES public.organizacoes(id) ON DELETE CASCADE,
  url text NOT NULL,
  events text[] NOT NULL DEFAULT '{}',
  secret text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.webhooks IS 'Registros de endpoints de webhook inscritos por eventos.';

-- RLS para webhooks
ALTER TABLE public.webhooks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Acesso aos webhooks da organizacao"
  ON public.webhooks
  FOR ALL
  TO authenticated
  USING (
    organizacao_id IN (
      SELECT m.organizacao_id 
      FROM public.membros_organizacao m 
      WHERE m.profile_id = auth.uid() AND m.role = 'gestor'
    )
  );

-- ==========================================
-- 3. Tabela webhook_events (Fila)
-- ==========================================
CREATE TABLE public.webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_id uuid NOT NULL REFERENCES public.webhooks(id) ON DELETE CASCADE,
  organizacao_id uuid NOT NULL REFERENCES public.organizacoes(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending', -- pending, success, failed
  attempts integer NOT NULL DEFAULT 0,
  last_attempt_at timestamptz,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.webhook_events IS 'Fila de eventos para disparo de webhooks.';

-- RLS para webhook_events (somente leitura pelo front-end para logs se necessário)
ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Leitura dos eventos do webhook"
  ON public.webhook_events
  FOR SELECT
  TO authenticated
  USING (
    organizacao_id IN (
      SELECT m.organizacao_id 
      FROM public.membros_organizacao m 
      WHERE m.profile_id = auth.uid() AND m.role = 'gestor'
    )
  );

-- Function and trigger para updated_at no webhooks
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_webhooks_updated_at
BEFORE UPDATE ON public.webhooks
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();
