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
  { i18nKey: "configuracoes.perfil", href: "/configuracoes/perfil" },
  { i18nKey: "configuracoes.organizacao", href: "/configuracoes/organizacao", gestorOnly: true },
  { i18nKey: "configuracoes.api_webhooks", href: "/configuracoes/desenvolvedores", gestorOnly: true },
  { i18nKey: "configuracoes.billing", href: "/configuracoes/billing", gestorOnly: true },
];

export default function ConfigTabs({ isGestor }: { isGestor: boolean }) {
  const pathname = usePathname();
  const [locale, setLocale] = useState<Locale>("pt-BR");
  useEffect(() => setLocale(getClientLocale()), []);
  const t = getT(locale);

  return (
    <div className="border-b border-border mb-6 flex overflow-x-auto">
      {TABS.filter(tab => !tab.gestorOnly || isGestor).map((tab) => {
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
