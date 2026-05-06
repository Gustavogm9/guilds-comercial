-- Altera a constraint leads_crm_stage_check para incluir "Negociação"

ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_crm_stage_check;

ALTER TABLE public.leads ADD CONSTRAINT leads_crm_stage_check
CHECK (crm_stage in (
  'Prospecção','Qualificado','Raio-X Ofertado','Raio-X Feito',
  'Call Marcada','Diagnóstico Pago','Proposta','Negociação','Fechado','Perdido','Nutrição'
));
