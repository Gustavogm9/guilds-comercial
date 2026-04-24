import { withSentryConfig } from "@sentry/nextjs";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverActions: { bodySizeLimit: "2mb" },
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
