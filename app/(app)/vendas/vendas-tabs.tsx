"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { useEffect, useState } from "react";
import { getClientLocale, getT, type Locale } from "@/lib/i18n";

type Tab = {
  i18nKey: string;
  href: string;
  gestorOnly?: boolean;
};

const TABS: Tab[] = [
  { i18nKey: "sidebar.pipeline", href: "/vendas/pipeline" },
  { i18nKey: "sidebar.base_leads", href: "/vendas/base" },
  { i18nKey: "sidebar.prospeccao", href: "/vendas/prospeccao" },
  { i18nKey: "sidebar.portfolio", href: "/vendas/portfolio" },
  { i18nKey: "sidebar.propostas", href: "/vendas/propostas" },
  { i18nKey: "sidebar.contratos", href: "/vendas/contratos" },
];

export default function VendasTabs({ isGestor = false }: { isGestor?: boolean }) {
  const pathname = usePathname();
  const [locale, setLocale] = useState<Locale>("pt-BR");
  
  useEffect(() => {
    setLocale(getClientLocale());
  }, []);
  
  const t = getT(locale);

  return (
    <div className="border-b border-border mb-6 flex overflow-x-auto">
      {TABS.filter((tab) => !tab.gestorOnly || isGestor).map((tab) => {
        const active = pathname === tab.href || pathname?.startsWith(tab.href + "/");
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={clsx(
              "px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors",
              active
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
            )}
          >
            {t(tab.i18nKey)}
          </Link>
        );
      })}
    </div>
  );
}
