# Contratos em producao com Clicksign

## Variaveis

- `CLICKSIGN_ENV`: `sandbox` ou `production`.
- `CLICKSIGN_ACCESS_TOKEN`: access token da Clicksign.
- `CLICKSIGN_BASE_URL`: opcional. Use apenas para sobrescrever a URL default.
- `CLICKSIGN_WEBHOOK_SECRET`: opcional, usado em `/api/webhooks/clicksign?secret=...`.

## Fluxo operacional

1. Comercial gera o contrato em `/vendas/contratos`.
2. Juridico acompanha em `/vendas/juridico`.
3. Juridico clica em `Preparar documento` para congelar uma versao revisavel.
4. Juridico informa signatario e cria envelope Clicksign.
5. Clicksign envia eventos para `/api/webhooks/clicksign`.
6. O webhook atualiza status, timeline, feedback e dispara webhooks externos `contract.*`.
7. Juridico define vigencia e, se marcado, alimenta renovacao automatica no pos-venda.

## Observacoes

- O fallback atual envia minuta `text/plain`, formato aceito pela Clicksign.
- Para contrato final, preferir anexar/gerar PDF ou DOCX antes do envio.
- A API 3.0 da Clicksign usa Envelope: criar envelope, adicionar documento, adicionar signatario, configurar requisitos, ativar e notificar.
- Se a ativacao falhar por falta de requisito/configuracao, o sistema registra `draft_activation_pending` e cria nota juridica com o erro retornado.

## Proximos hardenings

- Renderizador oficial HTML -> PDF/DOCX.
- Upload de arquivo final pelo juridico.
- Configuracao explicita de requisitos Clicksign por tipo de contrato.
- Comparacao visual entre versoes e comentarios por trecho.
