import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import ServiceWorkerRegister from "@/components/sw-register";
import InstallPrompt from "@/components/install-prompt";

// Linear DNA: Inter Variable com features cv01/ss03/ss01 ativadas globalmente
// (features são aplicadas via CSS no body em globals.css — next/font só serve a fonte).
const fontSans = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  // Linear usa weights 300, 400, 510, 590. Como Inter Google só serve 100-900,
  // pegamos os mais próximos: 300, 400, 500, 600.
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
});

// Substituto open-source pro Berkeley Mono (proprietário do Linear).
const fontMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  weight: ["400", "500", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Guilds Comercial",
  description: "CRM B2B brasileiro com copiloto de IA — pipeline, cadência, raio-x.",
  applicationName: "Guilds Comercial",
  appleWebApp: {
    capable: true,
    title: "Guilds",
    statusBarStyle: "black-translucent",
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  // Cor da barra de status casa com o tema atual (Linear bg dark, Stripe-feel light)
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f8f8" },
    { media: "(prefers-color-scheme: dark)",  color: "#08090a" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="pt-BR"
      suppressHydrationWarning
      className={`${fontSans.variable} ${fontMono.variable}`}
    >
      <body>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          {children}
          <ServiceWorkerRegister />
          <InstallPrompt />
        </ThemeProvider>
      </body>
    </html>
  );
}
