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
  // Suprime o warning "Serializing big strings (Xkb) impacts deserialization performance"
  // em webpack (usado pelo Next em alguns paths). Os JSONs de i18n e prompts grandes
  // disparavam isso; configurar Buffer evita reserialização desnecessária.
  webpack(config, { dev }) {
    if (!dev) {
      config.cache = config.cache && {
        ...config.cache,
        // Aumenta o limite antes de fazer split de strings na cache file system
        compression: "gzip",
      };
    }
    return config;
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
