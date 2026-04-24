import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Paleta Guilds (ajuste depois com a identidade real)
        guild: {
          50:  "#f5f7ff",
          100: "#eaeeff",
          500: "#5a6cf6",
          600: "#4c5ee4",
          700: "#3e4dc2",
          900: "#1c2257",
        },
        urgent:  { 500: "#dc2626" },
        warning: { 500: "#f59e0b" },
        success: { 500: "#10b981" },
      },
      fontFamily: {
        sans: ["ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "Inter", "Arial"],
      },
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
};

export default config;
