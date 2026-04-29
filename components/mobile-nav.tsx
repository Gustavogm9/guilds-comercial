"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Kanban, Search, Activity, BarChart3 } from "lucide-react";
import clsx from "clsx";
import { useEffect, useState } from "react";
import { getClientLocale, getT, type Locale } from "@/lib/i18n";

const NAV = [
  { href: "/hoje",     i18nKey: "mobile_nav.hoje",     icon: Home },
  { href: "/pipeline", i18nKey: "mobile_nav.pipeline", icon: Kanban },
  { href: "/funil",    i18nKey: "mobile_nav.funil",    icon: BarChart3 },
  { href: "/base",     i18nKey: "mobile_nav.base",     icon: Search },
  { href: "/raio-x",   i18nKey: "mobile_nav.raio_x",   icon: Activity },
];

export default function MobileNav() {
  const pathname = usePathname();
  const [locale, setLocale] = useState<Locale>("pt-BR");
  useEffect(() => setLocale(getClientLocale()), []);
  const t = getT(locale);

  return (
    <nav
      className={clsx(
        "md:hidden fixed bottom-0 inset-x-0 z-30",
        "bg-card/90 backdrop-blur-xl border-t border-border",
        "dark:bg-[hsl(220_5%_5%)]/90 dark:border-white/[0.06]",
      )}
      // safe-area pra iOS
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="grid grid-cols-5">
        {NAV.map(({ href, i18nKey, icon: Icon }) => {
          const active = pathname === href || pathname?.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              className={clsx(
                "relative flex flex-col items-center justify-center py-2 text-[10px] gap-1 transition-colors",
                active ? "text-primary" : "text-muted-foreground hover:text-foreground",
              )}
              style={{ letterSpacing: "-0.1px" }}
            >
              {/* Indicador superior (Linear-style) */}
              {active && (
                <span
                  aria-hidden
                  className="absolute top-0 left-1/2 -translate-x-1/2 h-[2px] w-8 rounded-full bg-primary"
                />
              )}
              <Icon className="w-5 h-5" />
              <span className="font-medium">{t(i18nKey)}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
