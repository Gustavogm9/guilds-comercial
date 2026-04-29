import { defineConfig } from "vitest/config";
import path from "node:path";

/**
 * Config dedicado para testes de banco (`npm run test:db`).
 *
 * Toca o projeto Supabase remoto via Management API. Pula automaticamente
 * se SUPABASE_PERSONAL_ACCESS_TOKEN não está setado (ver tests/db/*.test.ts).
 *
 * Não rode em CI compartilhado sem cuidado — usa token de produção.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/db/**/*.test.ts"],
    testTimeout: 30_000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
