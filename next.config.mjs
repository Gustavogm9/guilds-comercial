import { withSentryConfig } from "@sentry/nextjs";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "api.qrserver.com",
      },
    ],
  },
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
  /**
   * Redirects de retrocompatibilidade.
   *
   * Em maio/2026 a estrutura de rotas foi reorganizada hub-and-spoke:
   *   - /pipeline, /base, /prospeccao, /portfolio → /vendas/*
   *   - /funil, /raio-x, /indicacoes               → /growth/*
   *   - /pos-venda, /cadencia, /ligacoes, /canais, /newsletter → /comunicacao/*
   *   - /equipe, /time, /vendedor                  → /gestao/*
   *
   * Componentes/links/bookmarks dos usuários ainda apontam pros caminhos antigos.
   * Em vez de caçar 20+ referências em código + invalidar bookmarks dos clientes,
   * usamos redirects 308 (permanent) — Next.js + browser cacheiam e tudo continua
   * funcionando sem mudança de código.
   */
  async redirects() {
    return [
      // Vendas
      { source: "/pipeline", destination: "/vendas/pipeline", permanent: true },
      { source: "/pipeline/:path*", destination: "/vendas/pipeline/:path*", permanent: true },
      { source: "/base", destination: "/vendas/base", permanent: true },
      { source: "/base/:path*", destination: "/vendas/base/:path*", permanent: true },
      { source: "/prospeccao", destination: "/vendas/prospeccao", permanent: true },
      { source: "/prospeccao/:path*", destination: "/vendas/prospeccao/:path*", permanent: true },
      { source: "/portfolio", destination: "/vendas/portfolio", permanent: true },
      { source: "/portfolio/:path*", destination: "/vendas/portfolio/:path*", permanent: true },
      // Growth
      { source: "/funil", destination: "/growth/funil", permanent: true },
      { source: "/funil/:path*", destination: "/growth/funil/:path*", permanent: true },
      { source: "/raio-x", destination: "/growth/raio-x", permanent: true },
      { source: "/raio-x/:path*", destination: "/growth/raio-x/:path*", permanent: true },
      { source: "/indicacoes", destination: "/growth/indicacoes", permanent: true },
      { source: "/indicacoes/:path*", destination: "/growth/indicacoes/:path*", permanent: true },
      // Comunicação
      { source: "/pos-venda", destination: "/comunicacao/pos-venda", permanent: true },
      { source: "/pos-venda/:path*", destination: "/comunicacao/pos-venda/:path*", permanent: true },
      { source: "/cadencia", destination: "/comunicacao/cadencia", permanent: true },
      { source: "/cadencia/:path*", destination: "/comunicacao/cadencia/:path*", permanent: true },
      { source: "/ligacoes", destination: "/comunicacao/ligacoes", permanent: true },
      { source: "/ligacoes/:path*", destination: "/comunicacao/ligacoes/:path*", permanent: true },
      { source: "/canais", destination: "/comunicacao/canais", permanent: true },
      { source: "/canais/:path*", destination: "/comunicacao/canais/:path*", permanent: true },
      { source: "/newsletter", destination: "/comunicacao/newsletter", permanent: true },
      { source: "/newsletter/:path*", destination: "/comunicacao/newsletter/:path*", permanent: true },
      // Gestão
      { source: "/equipe", destination: "/gestao/equipe", permanent: true },
      { source: "/equipe/:path*", destination: "/gestao/equipe/:path*", permanent: true },
      { source: "/time", destination: "/gestao/time", permanent: true },
      { source: "/time/:path*", destination: "/gestao/time/:path*", permanent: true },
      { source: "/vendedor", destination: "/gestao/vendedor", permanent: true },
      { source: "/vendedor/:path*", destination: "/gestao/vendedor/:path*", permanent: true },
    ];
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
