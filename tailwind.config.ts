import type { Config } from "tailwindcss";

const config = {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./app/**/*.{ts,tsx}",
    "./src/**/*.{ts,tsx}",
  ],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        // Aliases legados (compat zero-refactor)
        guild: {
          50:  "hsl(var(--guild-50))",
          100: "hsl(var(--guild-100))",
          500: "hsl(var(--guild-500))",
          600: "hsl(var(--guild-600))",
          700: "hsl(var(--guild-700))",
          900: "hsl(var(--guild-900))",
        },
        // Status — agora HSL via vars (não mais hex hardcoded)
        urgent: {
          500: "hsl(var(--destructive))",
          DEFAULT: "hsl(var(--destructive))",
        },
        warning: {
          500: "hsl(var(--warning))",
          DEFAULT: "hsl(var(--warning))",
        },
        success: {
          500: "hsl(var(--success))",
          DEFAULT: "hsl(var(--success))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      fontFamily: {
        // var(--font-sans) é injetada por next/font/google em app/layout.tsx
        sans: [
          "var(--font-sans)",
          "Inter Variable",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "Inter",
          "Arial",
        ],
        mono: [
          "var(--font-mono)",
          "JetBrains Mono",
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "Monaco",
          "Consolas",
          "monospace",
        ],
      },
      // Shadows Stripe-style (blue-tinted) pro light mode.
      // Em dark, classes ficam invisíveis (intencional — luminance stepping toma conta).
      boxShadow: {
        "stripe-xs": "rgba(50,50,93,0.08) 0px 1px 3px",
        "stripe-sm": "rgba(50,50,93,0.11) 0px 4px 6px -2px, rgba(0,0,0,0.06) 0px 2px 3px -1px",
        "stripe-md": "rgba(50,50,93,0.25) 0px 30px 45px -30px, rgba(0,0,0,0.1) 0px 18px 36px -18px",
        "stripe-lg": "rgba(3,3,39,0.25) 0px 14px 21px -14px, rgba(0,0,0,0.1) 0px 8px 17px -8px",
      },
      letterSpacing: {
        // Linear/Stripe: tracking proporcional ao tamanho
        "tighter-display": "-1.584px",
        "tighter-hero":    "-1.4px",
        "tighter-large":   "-1.056px",
        "tight-h1":        "-0.704px",
        "tight-h2":        "-0.288px",
        "tight-h3":        "-0.24px",
        "tight-body":      "-0.165px",
        "tight-caption":   "-0.13px",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "slide-in-from-bottom": {
          from: { transform: "translateY(8px)", opacity: "0" },
          to: { transform: "translateY(0)", opacity: "1" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "fade-in": "fade-in 0.2s ease-out",
        "slide-in-from-bottom": "slide-in-from-bottom 0.25s ease-out",
      },
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
} satisfies Config;

export default config;
