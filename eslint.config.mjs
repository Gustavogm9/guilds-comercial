import nextVitals from "eslint-config-next/core-web-vitals";

export default [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "supabase/functions/**",
      "lib/database.types.ts",
      "**/*-Guilds.ts",
      "**/*-Guilds.tsx",
      "next-env.d-Guilds.ts",
      "proxy-Guilds.ts",
    ],
  },
  ...nextVitals,
  {
    rules: {
      "react/no-unescaped-entities": "off",
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/purity": "off",
      "react-hooks/refs": "off",
      "import/no-anonymous-default-export": "off",
    },
  },
];
