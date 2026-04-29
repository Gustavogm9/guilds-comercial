"use client";

import { useEffect, useState } from "react";
import { Globe } from "lucide-react";
import { getClientLocale, setClientLocale, type Locale } from "@/lib/i18n";

const LABELS: Record<Locale, string> = {
  "pt-BR": "Português (BR)",
  "en-US": "English (US)",
};

export default function LocaleToggle() {
  const [locale, setLocale] = useState<Locale>("pt-BR");

  useEffect(() => {
    setLocale(getClientLocale());
  }, []);

  function trocar(l: Locale) {
    setLocale(l);
    setClientLocale(l); // recarrega
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <Globe className="w-4 h-4 text-muted-foreground" />
        <span className="text-sm font-medium text-foreground">Idioma / Language</span>
      </div>
      <div className="flex gap-2">
        {(Object.keys(LABELS) as Locale[]).map((l) => (
          <button
            key={l}
            onClick={() => trocar(l)}
            className={`px-3 py-2 rounded-lg border text-sm transition ${
              locale === l
                ? "border-primary bg-primary/10 text-primary font-medium"
                : "border-border text-foreground hover:bg-muted/40"
            }`}
          >
            {LABELS[l]}
          </button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground mt-2">
        A página recarrega ao trocar. The page reloads when switching.
      </p>
    </div>
  );
}
