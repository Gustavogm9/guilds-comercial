import { withSentryConfig } from "@sentry/nextjs";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverActions: { bodySizeLimit: "2mb" },
    // Tree-shake imports nas libs com barrel files (lucide tem 1.4k ícones).
    // Sem isto, importar 1 ícone inclui várias dezenas no bundle.
    optimizePackageImports: ["lucide-react", "@dnd-kit/core", "@dnd-kit/sortable"],
  },
};

export default withSentryConfig(nextConfig, {
  org: "guilds-1o",
  project: "javascript-nextjs",

  // Source map upload auth token
  authToken: process.env.SENTRY_AUTH_TOKEN,

  // Upload mais arquivos client-side para melhor resolução de stack traces
  widenClientFileUpload: true,

  // Rota proxy para burlar ad-blockers
  tunnelRoute: "/monitoring",

  // Suprimir output fora do CI
  silent: !process.env.CI,
});
