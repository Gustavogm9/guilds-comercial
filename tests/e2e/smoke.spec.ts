/**
 * Smoke E2E — rotas públicas e auth gate.
 *
 * Não toca banco. Só valida que:
 *   - Rotas marketing renderizam sem 5xx
 *   - Rotas autenticadas redirecionam para /login quando sem sessão
 *   - API REST exige Bearer token
 *
 * Pega regressão grossa do middleware e do roteador.
 */
import { test, expect } from "@playwright/test";

// Cold start do Next dev compila rotas on-demand. A primeira navegação a
// CADA path pode levar 30-60s. Timeout maior + warmup compensam isso.
test.describe.configure({ timeout: 90_000 });

test.describe("Smoke — rotas públicas", () => {
  test("/ (landing) renderiza", async ({ page }) => {
    test.slow(); // cold start
    const response = await page.goto("/", { timeout: 90_000 });
    expect(response?.status()).toBeLessThan(400);
    // landing tem o nome do produto em algum lugar
    await expect(page.locator("body")).toContainText(/guilds/i);
  });

  test("/login renderiza form de email/senha", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator('input[type="email"], input[name="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"], input[name="password"]')).toBeVisible();
  });

  test("páginas legais renderizam (/termos, /privacidade, /dpa)", async ({ page }) => {
    test.slow(); // cada path cold-compila no dev
    for (const path of ["/termos", "/privacidade", "/dpa"]) {
      const response = await page.goto(path, { timeout: 60_000 });
      expect(response?.status(), `${path} status`).toBeLessThan(400);
    }
  });
});

test.describe("Smoke — auth gate", () => {
  test("/hoje sem sessão redireciona para /login", async ({ page }) => {
    await page.goto("/hoje");
    await expect(page).toHaveURL(/\/login/);
  });

  test("/pipeline sem sessão redireciona para /login", async ({ page }) => {
    await page.goto("/pipeline");
    await expect(page).toHaveURL(/\/login/);
  });

  test("/equipe sem sessão redireciona para /login", async ({ page }) => {
    await page.goto("/equipe");
    await expect(page).toHaveURL(/\/login/);
  });

  test("/admin/ai sem sessão redireciona para /login", async ({ page }) => {
    await page.goto("/admin/ai");
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe("Smoke — API REST sem auth", () => {
  test("GET /api/v1/leads sem Authorization → 401", async ({ request }) => {
    const r = await request.get("/api/v1/leads");
    expect(r.status()).toBe(401);
    const body = await r.json();
    expect(body.error).toMatch(/missing|invalid/i);
  });

  test("GET /api/v1/leads com Bearer inválido → 401", async ({ request }) => {
    const r = await request.get("/api/v1/leads", {
      headers: { Authorization: "Bearer gk_invalid_xxx" },
    });
    expect(r.status()).toBe(401);
  });
});
