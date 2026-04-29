# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: smoke.spec.ts >> Smoke — rotas públicas >> / (landing) renderiza
- Location: tests\e2e\smoke.spec.ts:14:7

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: page.goto: net::ERR_ABORTED; maybe frame was detached?
Call log:
  - navigating to "http://localhost:3000/", waiting until "load"

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
> 15 |     const response = await page.goto("/");
     |                                 ^ Error: page.goto: net::ERR_ABORTED; maybe frame was detached?
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
  29 |       const response = await page.goto(path);
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