import type { MetadataRoute } from "next";

/**
 * PWA Manifest — Next 14 file convention.
 * Servido em /manifest.webmanifest automaticamente.
 *
 * Atualizar:
 *  - `name`/`short_name` se a marca mudar
 *  - `start_url` se a rota inicial logada mudar (hoje: /hoje)
 *  - `theme_color` deve casar com hsl(var(--primary)) / 233 72% 43% (#4c5ee4)
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Guilds Comercial",
    short_name: "Guilds",
    description: "CRM B2B brasileiro com copiloto de IA. Pipeline, cadência, raio-x.",
    start_url: "/hoje",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#f8fafc",
    theme_color: "#4c5ee4",
    lang: "pt-BR",
    categories: ["business", "productivity", "sales"],
    icons: [
      {
        src: "/icon",
        sizes: "256x256",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon",
        sizes: "256x256",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/apple-icon",
        sizes: "180x180",
        type: "image/png",
        purpose: "any",
      },
    ],
    shortcuts: [
      {
        name: "Pipeline",
        short_name: "Pipeline",
        description: "Kanban de leads",
        url: "/pipeline",
        icons: [{ src: "/icon", sizes: "256x256" }],
      },
      {
        name: "Hoje",
        short_name: "Hoje",
        description: "Cockpit do dia",
        url: "/hoje",
        icons: [{ src: "/icon", sizes: "256x256" }],
      },
    ],
  };
}
