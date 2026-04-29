/**
 * API pública E2E — valida que /api/v1/leads funciona com API key real.
 *
 * Cria fixture de API key via Management API:
 *   - Gera token raw `gk_e2e_<rand>`
 *   - Calcula SHA-256 e insere row em `api_keys` (mesmo formato que validateApiKey espera)
 *
 * Bate o endpoint via `request.fixtures` do Playwright (não precisa de browser).
 *
 * Pula automaticamente se SUPABASE_PERSONAL_ACCESS_TOKEN não estiver setado.
 */
import { test, expect } from "@playwright/test";
import crypto from "node:crypto";

const TOKEN = process.env.SUPABASE_PERSONAL_ACCESS_TOKEN;
const REF = process.env.SUPABASE_PROJECT_REF ?? "mdmbuekuemcjumxcmkls";
const ORG_E2E = "ddddddd1-dddd-dddd-dddd-dddddddddddd";
const OWNER_E2E = "ddddddd2-dddd-dddd-dddd-dddddddddddd";

let rawApiKey = "";
let apiKeyId = -1;

async function adminSql(query: string): Promise<{ rows: any[]; error: string | null }> {
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${REF}/database/query`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
    }
  );
  const text = await res.text();
  let body: any;
  try { body = JSON.parse(text); } catch { body = text; }
  if (!res.ok || (body && !Array.isArray(body) && body.message)) {
    return { rows: [], error: typeof body === "string" ? body : (body.message ?? JSON.stringify(body)) };
  }
  return { rows: Array.isArray(body) ? body : [], error: null };
}

test.describe("API REST com API key real", () => {
  test.skip(!TOKEN, "SUPABASE_PERSONAL_ACCESS_TOKEN não setado — pulando E2E que toca banco");

  // Warmup + setup pode tomar até 90s (cold start do Next dev + queries)
  test.describe.configure({ timeout: 60_000 });

  test.beforeAll(async () => {
    // Hooks no Playwright herdam timeout dos testes; aumentamos aqui pois o
    // setup faz warmup + queries de DB. Sem isso, o webpack on-demand do Next
    // dev pode estourar antes do primeiro 401.
    test.setTimeout(120_000);

    // Warmup do Next dev: a primeira chamada a uma rota não-pré-compilada pode
    // levar >30s (webpack on-demand). Pré-compila aqui para os testes reais
    // não estourarem timeout.
    const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
    for (let i = 0; i < 2; i++) {
      try {
        const r = await fetch(`${baseURL}/api/v1/leads`, {
          headers: { Authorization: "Bearer warmup" },
          signal: AbortSignal.timeout(60_000),
        });
        if (r.status === 401) break; // rota compilada
      } catch { /* tenta de novo */ }
    }

    // Limpa restos de runs anteriores (idempotente)
    await adminSql(`
      delete from public.api_keys where organizacao_id = '${ORG_E2E}';
      delete from public.leads    where organizacao_id = '${ORG_E2E}';
      delete from public.organizacao_config where organizacao_id = '${ORG_E2E}';
      delete from public.organizacoes where id = '${ORG_E2E}';
      delete from public.profiles where id = '${OWNER_E2E}';
      delete from auth.users where id = '${OWNER_E2E}';
    `);

    // Cria org de teste + owner
    await adminSql(`insert into auth.users (id) values ('${OWNER_E2E}') on conflict (id) do nothing;`);
    await adminSql(`
      insert into public.profiles (id, email, display_name, role) values
        ('${OWNER_E2E}', 'test-e2e-owner@example.invalid', 'E2E Owner', 'gestor');
      insert into public.organizacoes (id, nome, slug, owner_id, ativa) values
        ('${ORG_E2E}', 'Test E2E Org', 'test-e2e-${Date.now()}', '${OWNER_E2E}', true);
      insert into public.organizacao_config (organizacao_id) values ('${ORG_E2E}');
      insert into public.leads (organizacao_id, empresa, funnel_stage, crm_stage) values
        ('${ORG_E2E}', 'E2E Test Lead', 'pipeline', 'Prospecção');
    `);

    // Gera API key raw e insere hash
    const random = crypto.randomBytes(24).toString("hex");
    rawApiKey = `gk_e2e_${random}`;
    const keyHash = crypto.createHash("sha256").update(rawApiKey).digest("hex");
    const prefix = rawApiKey.slice(0, 10);

    const r = await adminSql(`
      insert into public.api_keys (organizacao_id, name, prefix, key_hash)
      values ('${ORG_E2E}', 'e2e test', '${prefix}', '${keyHash}')
      returning id;
    `);
    if (r.error) throw new Error(`falha criando api_key: ${r.error}`);
    apiKeyId = r.rows[0]?.id;
  });

  test.afterAll(async () => {
    await adminSql(`
      delete from public.api_keys where organizacao_id = '${ORG_E2E}';
      delete from public.leads    where organizacao_id = '${ORG_E2E}';
      delete from public.organizacao_config where organizacao_id = '${ORG_E2E}';
      delete from public.organizacoes where id = '${ORG_E2E}';
      delete from public.profiles where id = '${OWNER_E2E}';
      delete from auth.users where id = '${OWNER_E2E}';
    `);
  });

  test("GET /api/v1/leads com Bearer válido → 200 + payload com data e meta", async ({ request }) => {
    const r = await request.get("/api/v1/leads", {
      headers: { Authorization: `Bearer ${rawApiKey}` },
    });
    expect(r.status()).toBe(200);
    const body = await r.json();
    expect(body).toHaveProperty("data");
    expect(body).toHaveProperty("meta");
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.meta.limit).toBeGreaterThan(0);
    // O lead seed deve estar presente (apenas 1 lead nesta org de teste)
    expect(body.data.some((l: any) => l.empresa === "E2E Test Lead")).toBe(true);
  });

  test("GET /api/v1/leads?limit=1 respeita limit", async ({ request }) => {
    const r = await request.get("/api/v1/leads?limit=1", {
      headers: { Authorization: `Bearer ${rawApiKey}` },
    });
    expect(r.status()).toBe(200);
    const body = await r.json();
    expect(body.meta.limit).toBe(1);
    expect(body.data.length).toBeLessThanOrEqual(1);
  });

  test("POST /api/v1/leads cria lead na org da API key", async ({ request }) => {
    const r = await request.post("/api/v1/leads", {
      headers: { Authorization: `Bearer ${rawApiKey}` },
      data: { nome: "Pessoa E2E", empresa: "Empresa Criada via API" },
    });
    expect(r.status()).toBe(201);
    const body = await r.json();
    expect(body.data.nome).toBe("Pessoa E2E");
    expect(body.data.organizacao_id).toBe(ORG_E2E);
    expect(body.data.fonte).toBe("API");
    expect(body.data.crm_stage).toBe("Prospecção");
  });

  test("POST /api/v1/leads sem nome/empresa → 400", async ({ request }) => {
    const r = await request.post("/api/v1/leads", {
      headers: { Authorization: `Bearer ${rawApiKey}` },
      data: { email: "x@y.com" },
    });
    expect(r.status()).toBe(400);
    const body = await r.json();
    expect(body.error).toMatch(/required.*nome.*empresa/i);
  });
});
