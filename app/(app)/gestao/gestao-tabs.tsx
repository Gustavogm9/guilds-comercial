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
  { i18nKey: "sidebar.equipe", href: "/gestao/equipe", gestorOnly: true },
  { i18nKey: "sidebar.time", href: "/gestao/time" },
];

export default function GestaoTabs({ isGestor }: { isGestor: boolean }) {
  const pathname = usePathname();
  const [locale, setLocale] = useState<Locale>("pt-BR");
  
  useEffect(() => {
    setLocale(getClientLocale());
  }, []);
  
  const t = getT(locale);

  // Filter tabs based on user role
  const visibleTabs = TABS.filter((tab) => !tab.gestorOnly || isGestor);

  // If user is not gestor, only Time is available, and typically we don't show tabs for just 1 item,
  // but for consistency we might show it or hide the tabs component entirely.
  // For now, we will render it.
  if (visibleTabs.length === 0) return null;

  return (
    <div className="border-b border-border mb-6 flex overflow-x-auto">
      {visibleTabs.map((tab) => {
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
