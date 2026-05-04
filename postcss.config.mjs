/**
 * PostCSS config — Tailwind 4.
 *
 * Tailwind 4 traz seu próprio plugin PostCSS (@tailwindcss/postcss) e Lightning CSS
 * embutido — autoprefixer não é mais necessário.
 */
export default {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};
