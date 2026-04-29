import { defineConfig, devices } from "@playwright/test";

/**
 * Camada 3 — testes E2E.
 *
 * Sobe o app via `npm run dev` automaticamente (reuseExistingServer: true se
 * já estiver rodando). Usa Chromium headless. Roda só sob demanda
 * (`npm run test:e2e`) — exige `.env.local` configurado.
 *
 * Para os testes que tocam o banco (api-public.spec.ts), exporte:
 *   SUPABASE_PERSONAL_ACCESS_TOKEN=sbp_...
 *   SUPABASE_PROJECT_REF=mdmbuekuemcjumxcmkls
 */
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false, // testes que mexem em fixture do banco precisam ser sequenciais
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: "list",
  timeout: 30_000,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npm run dev",
    port: 3000,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
