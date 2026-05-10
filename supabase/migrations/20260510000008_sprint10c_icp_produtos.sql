-- ============================================================
-- Sprint 10-C: Portfolio & ICP Lab — ICP Extraído do Produto
-- ============================================================

-- Adiciona a coluna icp_extraido na tabela produtos
-- Armazenará o perfil estruturado (JSONB) gerado pela IA com base
-- nos leads fechados deste produto.
alter table public.produtos
  add column if not exists icp_extraido jsonb;

-- Exemplo de payload esperado:
-- {
--   "segmento": "Tecnologia / Varejo",
--   "porte": "Média empresa (50-200 funcionários)",
--   "cargos_decisores": ["Diretor Comercial", "CEO", "Gerente de Vendas"],
--   "dores_comuns": ["Falta de visibilidade do funil", "Baixa conversão"],
--   "motivos_compra": ["Necessidade de centralização de dados", "Busca por IA para qualificação"],
--   "ultimo_calculo": "2026-05-10T12:00:00Z"
-- }
