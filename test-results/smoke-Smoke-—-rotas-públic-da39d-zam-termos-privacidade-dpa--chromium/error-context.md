# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: smoke.spec.ts >> Smoke — rotas públicas >> páginas legais renderizam (/termos, /privacidade, /dpa)
- Location: tests\e2e\smoke.spec.ts:27:7

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: page.goto: net::ERR_ABORTED; maybe frame was detached?
Call log:
  - navigating to "http://localhost:3000/dpa", waiting until "load"

```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic [ref=e2]:
    - banner [ref=e3]:
      - generic [ref=e4]:
        - link "G Guilds Comercial" [ref=e5] [cursor=pointer]:
          - /url: /
          - generic [ref=e6]: G
          - generic [ref=e7]: Guilds Comercial
        - navigation [ref=e8]:
          - link "Recursos" [ref=e9] [cursor=pointer]:
            - /url: "#features"
          - link "Como Funciona" [ref=e10] [cursor=pointer]:
            - /url: "#como-funciona"
          - link "Preços" [ref=e11] [cursor=pointer]:
            - /url: "#precos"
        - generic [ref=e12]:
          - link "Entrar" [ref=e13] [cursor=pointer]:
            - /url: /login
          - link "Criar conta grátis" [ref=e14] [cursor=pointer]:
            - /url: /cadastro
    - main [ref=e15]:
      - generic [ref=e17]:
        - heading "Política de Privacidade" [level=1] [ref=e18]
        - generic [ref=e19]:
          - paragraph [ref=e20]: "Última atualização: 24 de Abril de 2026"
          - paragraph [ref=e21]: A sua privacidade é nossa prioridade. Esta Política de Privacidade descreve como a Guilds Comercial ("nós", "nosso" ou "Plataforma") coleta, usa, protege e compartilha suas informações pessoais, em conformidade com a Lei Geral de Proteção de Dados (LGPD - Lei nº 13.709/2018).
          - heading "1. Informações que Coletamos" [level=2] [ref=e22]
          - paragraph [ref=e23]: "Podemos coletar as seguintes categorias de informações:"
          - list [ref=e24]:
            - listitem [ref=e25]:
              - strong [ref=e26]: "Dados de Identificação:"
              - text: Nome, e-mail corporativo, cargo e nome da empresa (coletados no momento do cadastro).
            - listitem [ref=e27]:
              - strong [ref=e28]: "Dados de CRM:"
              - text: Informações de leads, oportunidades de negócio, históricos de comunicação e valores financeiros inseridos por você ou sua equipe.
            - listitem [ref=e29]:
              - strong [ref=e30]: "Dados de Uso e Navegação:"
              - text: Endereço IP, tipo de navegador, sistema operacional e páginas visitadas dentro do sistema.
          - heading "2. Como Utilizamos Suas Informações" [level=2] [ref=e31]
          - paragraph [ref=e32]: "Utilizamos os dados coletados para:"
          - list [ref=e33]:
            - listitem [ref=e34]: Fornecer e manter o funcionamento da Plataforma, isolando seus dados através do nosso sistema multi-tenant.
            - listitem [ref=e35]:
              - text: Alimentar o "Raio-X Impulsionado por IA" e automações de cadência exclusivamente para os seus leads. A inteligência artificial opera sobre seus dados para gerar análises, porém
              - strong [ref=e36]: seus dados não são utilizados para treinar modelos globais de IA de terceiros.
            - listitem [ref=e37]: Enviar comunicações sobre atualizações do sistema, faturamento e suporte técnico.
          - heading "3. Compartilhamento de Dados" [level=2] [ref=e38]
          - paragraph [ref=e39]: "Nós não vendemos ou alugamos seus dados pessoais. O compartilhamento ocorre estritamente para o funcionamento do serviço:"
          - list [ref=e40]:
            - listitem [ref=e41]:
              - strong [ref=e42]: "Provedores de Nuvem e Banco de Dados:"
              - text: "Utilizamos parceiros de infraestrutura seguros (ex: Supabase, Vercel) que atuam como operadores dos dados."
            - listitem [ref=e43]:
              - strong [ref=e44]: "Processadores de Pagamento:"
              - text: "(ex: Stripe) para processamento de assinaturas seguras."
            - listitem [ref=e45]:
              - strong [ref=e46]: "Serviços de IA:"
              - text: "Utilizamos APIs de terceiros (ex: OpenAI, Anthropic) para as funções inteligentes do CRM. O processamento é via API corporativa (zero-retention policy na maioria dos provedores), garantindo que os dados não alimentem LLMs públicos."
          - heading "4. Segurança dos Dados" [level=2] [ref=e47]
          - paragraph [ref=e48]: Implementamos controles técnicos rigorosos para proteger suas informações, incluindo Row Level Security (RLS) no banco de dados, encriptação em trânsito (HTTPS/TLS) e isolamento lógico.
          - heading "5. Seus Direitos (LGPD)" [level=2] [ref=e49]
          - paragraph [ref=e50]: "Você tem o direito de:"
          - list [ref=e51]:
            - listitem [ref=e52]: Solicitar o acesso, a correção ou a exclusão dos seus dados pessoais.
            - listitem [ref=e53]: Exportar seus dados do CRM a qualquer momento (portabilidade).
            - listitem [ref=e54]: Revogar seu consentimento ou solicitar o encerramento da conta e o apagamento da sua base de dados associada.
          - separator [ref=e55]
          - paragraph [ref=e56]: "Contato do DPO (Encarregado de Dados):"
          - paragraph [ref=e57]: Para exercer seus direitos ou tirar dúvidas sobre esta política, envie um e-mail para dpo@guilds.com.br.
    - contentinfo [ref=e58]:
      - generic [ref=e59]:
        - generic [ref=e60]:
          - generic [ref=e61]:
            - link "G Guilds Comercial" [ref=e62] [cursor=pointer]:
              - /url: /
              - generic [ref=e63]: G
              - generic [ref=e64]: Guilds Comercial
            - paragraph [ref=e65]: O CRM turbinado com Inteligência Artificial. Escale suas vendas B2B com cadências automáticas e previsibilidade baseada em dados.
            - generic [ref=e66]:
              - link "Twitter" [ref=e67] [cursor=pointer]:
                - /url: "#"
                - generic [ref=e68]: Twitter
                - img [ref=e69]
              - link "LinkedIn" [ref=e71] [cursor=pointer]:
                - /url: "#"
                - generic [ref=e72]: LinkedIn
                - img [ref=e73]
              - link "GitHub" [ref=e77] [cursor=pointer]:
                - /url: "#"
                - generic [ref=e78]: GitHub
                - img [ref=e79]
          - generic [ref=e82]:
            - heading "Produto" [level=3] [ref=e83]
            - list [ref=e84]:
              - listitem [ref=e85]:
                - link "Funcionalidades" [ref=e86] [cursor=pointer]:
                  - /url: "#features"
              - listitem [ref=e87]:
                - link "Preços" [ref=e88] [cursor=pointer]:
                  - /url: "#precos"
              - listitem [ref=e89]:
                - link "Criar conta grátis" [ref=e90] [cursor=pointer]:
                  - /url: /cadastro
              - listitem [ref=e91]:
                - link "API para Desenvolvedores" [ref=e92] [cursor=pointer]:
                  - /url: /api-docs
          - generic [ref=e93]:
            - heading "Empresa" [level=3] [ref=e94]
            - list [ref=e95]:
              - listitem [ref=e96]:
                - link "Central de Ajuda" [ref=e97] [cursor=pointer]:
                  - /url: /ajuda
              - listitem [ref=e98]:
                - link "Contato" [ref=e99] [cursor=pointer]:
                  - /url: mailto:suporte@guilds.com.br
              - listitem [ref=e100]:
                - link "Termos de Uso" [ref=e101] [cursor=pointer]:
                  - /url: /termos
              - listitem [ref=e102]:
                - link "Política de Privacidade" [ref=e103] [cursor=pointer]:
                  - /url: /privacidade
        - paragraph [ref=e105]: © 2026 Guilds Comercial. Todos os direitos reservados.
  - alert [ref=e106]
```

# Test source

```ts
  1  | /**
  2  |  * Smoke E2E — rotas públicas e auth gate.
  3  |  *
  4  |  * Não toca banco. Só valida que:
  5  |  *   - Rotas marketing renderizam sem 5xx
  6  |  *   - Rotas autenticadas redirecionam para /login quando sem sessão
  7  |  *   - API REST exige Bearer token
  8  |  *
  9  |  * Pega regressão grossa do middleware e do roteador.
  10 |  */
  11 | import { test, expect } from "@playwright/test";
  12 | 
  13 | test.describe("Smoke — rotas públicas", () => {
  14 |   test("/ (landing) renderiza", async ({ page }) => {
  15 |     const response = await page.goto("/");
  16 |     expect(response?.status()).toBeLessThan(400);
  17 |     // landing tem o nome do produto em algum lugar
  18 |     await expect(page.locator("body")).toContainText(/guilds/i);
  19 |   });
  20 | 
  21 |   test("/login renderiza form de email/senha", async ({ page }) => {
  22 |     await page.goto("/login");
  23 |     await expect(page.locator('input[type="email"], input[name="email"]')).toBeVisible();
  24 |     await expect(page.locator('input[type="password"], input[name="password"]')).toBeVisible();
  25 |   });
  26 | 
  27 |   test("páginas legais renderizam (/termos, /privacidade, /dpa)", async ({ page }) => {
  28 |     for (const path of ["/termos", "/privacidade", "/dpa"]) {
> 29 |       const response = await page.goto(path);
     |                                   ^ Error: page.goto: net::ERR_ABORTED; maybe frame was detached?
  30 |       expect(response?.status(), `${path} status`).toBeLessThan(400);
  31 |     }
  32 |   });
  33 | });
  34 | 
  35 | test.describe("Smoke — auth gate", () => {
  36 |   test("/hoje sem sessão redireciona para /login", async ({ page }) => {
  37 |     await page.goto("/hoje");
  38 |     await expect(page).toHaveURL(/\/login/);
  39 |   });
  40 | 
  41 |   test("/pipeline sem sessão redireciona para /login", async ({ page }) => {
  42 |     await page.goto("/pipeline");
  43 |     await expect(page).toHaveURL(/\/login/);
  44 |   });
  45 | 
  46 |   test("/equipe sem sessão redireciona para /login", async ({ page }) => {
  47 |     await page.goto("/equipe");
  48 |     await expect(page).toHaveURL(/\/login/);
  49 |   });
  50 | 
  51 |   test("/admin/ai sem sessão redireciona para /login", async ({ page }) => {
  52 |     await page.goto("/admin/ai");
  53 |     await expect(page).toHaveURL(/\/login/);
  54 |   });
  55 | });
  56 | 
  57 | test.describe("Smoke — API REST sem auth", () => {
  58 |   test("GET /api/v1/leads sem Authorization → 401", async ({ request }) => {
  59 |     const r = await request.get("/api/v1/leads");
  60 |     expect(r.status()).toBe(401);
  61 |     const body = await r.json();
  62 |     expect(body.error).toMatch(/missing|invalid/i);
  63 |   });
  64 | 
  65 |   test("GET /api/v1/leads com Bearer inválido → 401", async ({ request }) => {
  66 |     const r = await request.get("/api/v1/leads", {
  67 |       headers: { Authorization: "Bearer gk_invalid_xxx" },
  68 |     });
  69 |     expect(r.status()).toBe(401);
  70 |   });
  71 | });
  72 | 
```