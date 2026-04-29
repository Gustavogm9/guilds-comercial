# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: api-public.spec.ts >> API REST com API key real >> GET /api/v1/leads com Bearer válido → 200 + payload com data e meta
- Location: tests\e2e\api-public.spec.ts:110:7

# Error details

```
"beforeAll" hook timeout of 30000ms exceeded.
```

# Test source

```ts
  1   | /**
  2   |  * API pública E2E — valida que /api/v1/leads funciona com API key real.
  3   |  *
  4   |  * Cria fixture de API key via Management API:
  5   |  *   - Gera token raw `gk_e2e_<rand>`
  6   |  *   - Calcula SHA-256 e insere row em `api_keys` (mesmo formato que validateApiKey espera)
  7   |  *
  8   |  * Bate o endpoint via `request.fixtures` do Playwright (não precisa de browser).
  9   |  *
  10  |  * Pula automaticamente se SUPABASE_PERSONAL_ACCESS_TOKEN não estiver setado.
  11  |  */
  12  | import { test, expect } from "@playwright/test";
  13  | import crypto from "node:crypto";
  14  | 
  15  | const TOKEN = process.env.SUPABASE_PERSONAL_ACCESS_TOKEN;
  16  | const REF = process.env.SUPABASE_PROJECT_REF ?? "mdmbuekuemcjumxcmkls";
  17  | const ORG_E2E = "ddddddd1-dddd-dddd-dddd-dddddddddddd";
  18  | const OWNER_E2E = "ddddddd2-dddd-dddd-dddd-dddddddddddd";
  19  | 
  20  | let rawApiKey = "";
  21  | let apiKeyId = -1;
  22  | 
  23  | async function adminSql(query: string): Promise<{ rows: any[]; error: string | null }> {
  24  |   const res = await fetch(
  25  |     `https://api.supabase.com/v1/projects/${REF}/database/query`,
  26  |     {
  27  |       method: "POST",
  28  |       headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
  29  |       body: JSON.stringify({ query }),
  30  |     }
  31  |   );
  32  |   const text = await res.text();
  33  |   let body: any;
  34  |   try { body = JSON.parse(text); } catch { body = text; }
  35  |   if (!res.ok || (body && !Array.isArray(body) && body.message)) {
  36  |     return { rows: [], error: typeof body === "string" ? body : (body.message ?? JSON.stringify(body)) };
  37  |   }
  38  |   return { rows: Array.isArray(body) ? body : [], error: null };
  39  | }
  40  | 
  41  | test.describe("API REST com API key real", () => {
  42  |   test.skip(!TOKEN, "SUPABASE_PERSONAL_ACCESS_TOKEN não setado — pulando E2E que toca banco");
  43  | 
  44  |   // Warmup + setup pode tomar até 90s (cold start do Next dev + queries)
  45  |   test.describe.configure({ timeout: 60_000 });
  46  | 
> 47  |   test.beforeAll(async () => {
      |        ^ "beforeAll" hook timeout of 30000ms exceeded.
  48  |     // Warmup do Next dev: a primeira chamada a uma rota não-pré-compilada pode
  49  |     // levar >30s (webpack on-demand). Pré-compila aqui para os testes reais
  50  |     // não estourarem timeout.
  51  |     const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
  52  |     for (let i = 0; i < 2; i++) {
  53  |       try {
  54  |         const r = await fetch(`${baseURL}/api/v1/leads`, {
  55  |           headers: { Authorization: "Bearer warmup" },
  56  |           signal: AbortSignal.timeout(60_000),
  57  |         });
  58  |         if (r.status === 401) break; // rota compilada
  59  |       } catch { /* tenta de novo */ }
  60  |     }
  61  | 
  62  |     // Limpa restos de runs anteriores (idempotente)
  63  |     await adminSql(`
  64  |       delete from public.api_keys where organizacao_id = '${ORG_E2E}';
  65  |       delete from public.leads    where organizacao_id = '${ORG_E2E}';
  66  |       delete from public.organizacao_config where organizacao_id = '${ORG_E2E}';
  67  |       delete from public.organizacoes where id = '${ORG_E2E}';
  68  |       delete from public.profiles where id = '${OWNER_E2E}';
  69  |       delete from auth.users where id = '${OWNER_E2E}';
  70  |     `);
  71  | 
  72  |     // Cria org de teste + owner
  73  |     await adminSql(`insert into auth.users (id) values ('${OWNER_E2E}') on conflict (id) do nothing;`);
  74  |     await adminSql(`
  75  |       insert into public.profiles (id, email, display_name, role) values
  76  |         ('${OWNER_E2E}', 'test-e2e-owner@example.invalid', 'E2E Owner', 'gestor');
  77  |       insert into public.organizacoes (id, nome, slug, owner_id, ativa) values
  78  |         ('${ORG_E2E}', 'Test E2E Org', 'test-e2e-${Date.now()}', '${OWNER_E2E}', true);
  79  |       insert into public.organizacao_config (organizacao_id) values ('${ORG_E2E}');
  80  |       insert into public.leads (organizacao_id, empresa, funnel_stage, crm_stage) values
  81  |         ('${ORG_E2E}', 'E2E Test Lead', 'pipeline', 'Prospecção');
  82  |     `);
  83  | 
  84  |     // Gera API key raw e insere hash
  85  |     const random = crypto.randomBytes(24).toString("hex");
  86  |     rawApiKey = `gk_e2e_${random}`;
  87  |     const keyHash = crypto.createHash("sha256").update(rawApiKey).digest("hex");
  88  |     const prefix = rawApiKey.slice(0, 10);
  89  | 
  90  |     const r = await adminSql(`
  91  |       insert into public.api_keys (organizacao_id, name, prefix, key_hash)
  92  |       values ('${ORG_E2E}', 'e2e test', '${prefix}', '${keyHash}')
  93  |       returning id;
  94  |     `);
  95  |     if (r.error) throw new Error(`falha criando api_key: ${r.error}`);
  96  |     apiKeyId = r.rows[0]?.id;
  97  |   }, 120_000);
  98  | 
  99  |   test.afterAll(async () => {
  100 |     await adminSql(`
  101 |       delete from public.api_keys where organizacao_id = '${ORG_E2E}';
  102 |       delete from public.leads    where organizacao_id = '${ORG_E2E}';
  103 |       delete from public.organizacao_config where organizacao_id = '${ORG_E2E}';
  104 |       delete from public.organizacoes where id = '${ORG_E2E}';
  105 |       delete from public.profiles where id = '${OWNER_E2E}';
  106 |       delete from auth.users where id = '${OWNER_E2E}';
  107 |     `);
  108 |   });
  109 | 
  110 |   test("GET /api/v1/leads com Bearer válido → 200 + payload com data e meta", async ({ request }) => {
  111 |     const r = await request.get("/api/v1/leads", {
  112 |       headers: { Authorization: `Bearer ${rawApiKey}` },
  113 |     });
  114 |     expect(r.status()).toBe(200);
  115 |     const body = await r.json();
  116 |     expect(body).toHaveProperty("data");
  117 |     expect(body).toHaveProperty("meta");
  118 |     expect(Array.isArray(body.data)).toBe(true);
  119 |     expect(body.meta.limit).toBeGreaterThan(0);
  120 |     // O lead seed deve estar presente (apenas 1 lead nesta org de teste)
  121 |     expect(body.data.some((l: any) => l.empresa === "E2E Test Lead")).toBe(true);
  122 |   });
  123 | 
  124 |   test("GET /api/v1/leads?limit=1 respeita limit", async ({ request }) => {
  125 |     const r = await request.get("/api/v1/leads?limit=1", {
  126 |       headers: { Authorization: `Bearer ${rawApiKey}` },
  127 |     });
  128 |     expect(r.status()).toBe(200);
  129 |     const body = await r.json();
  130 |     expect(body.meta.limit).toBe(1);
  131 |     expect(body.data.length).toBeLessThanOrEqual(1);
  132 |   });
  133 | 
  134 |   test("POST /api/v1/leads cria lead na org da API key", async ({ request }) => {
  135 |     const r = await request.post("/api/v1/leads", {
  136 |       headers: { Authorization: `Bearer ${rawApiKey}` },
  137 |       data: { nome: "Pessoa E2E", empresa: "Empresa Criada via API" },
  138 |     });
  139 |     expect(r.status()).toBe(201);
  140 |     const body = await r.json();
  141 |     expect(body.data.nome).toBe("Pessoa E2E");
  142 |     expect(body.data.organizacao_id).toBe(ORG_E2E);
  143 |     expect(body.data.fonte).toBe("API");
  144 |     expect(body.data.crm_stage).toBe("Prospecção");
  145 |   });
  146 | 
  147 |   test("POST /api/v1/leads sem nome/empresa → 400", async ({ request }) => {
```