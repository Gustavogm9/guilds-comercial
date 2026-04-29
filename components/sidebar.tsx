"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home, Kanban, Users, Search, Activity, Mail, PhoneCall, LogOut, UserCog,
  Radio, User, BarChart3, Bot, Settings, ShieldCheck,
} from "lucide-react";
import clsx from "clsx";
import OrgSwitcher from "./org-switcher";
import { ThemeToggle } from "./theme-toggle";
import { useEffect, useState } from "react";
import { getClientLocale, getT, type Locale } from "@/lib/i18n";

type NavItem = {
  href: string;
  i18nKey: string;
  icon: typeof Home;
  gestorOnly?: boolean;
  myPanel?: boolean;
};

type NavGroup = {
  titleKey: string;
  items: NavItem[];
};

const NAV_GROUPS: NavGroup[] = [
  {
    titleKey: "sidebar.workspace",
    items: [
      { href: "/hoje",       i18nKey: "sidebar.hoje",       icon: Home },
      { href: "/pipeline",   i18nKey: "sidebar.pipeline",   icon: Kanban },
      { href: "/base",       i18nKey: "sidebar.base_leads", icon: Search },
    ],
  },
  {
    titleKey: "sidebar.analise",
    items: [
      { href: "/funil",      i18nKey: "sidebar.funil_vendas", icon: BarChart3 },
      { href: "/raio-x",     i18nKey: "sidebar.raio_x",     icon: Activity },
    ],
  },
  {
    titleKey: "sidebar.comunicacao",
    items: [
      { href: "/ligacoes",   i18nKey: "sidebar.ligacoes",   icon: PhoneCall },
      { href: "/canais",     i18nKey: "sidebar.canais",     icon: Radio,    gestorOnly: true },
      { href: "/newsletter", i18nKey: "sidebar.newsletter", icon: Mail },
    ],
  },
  {
    titleKey: "sidebar.equipe",
    items: [
      { href: "/vendedor",   i18nKey: "sidebar.meu_painel", icon: User,     myPanel: true },
      { href: "/time",       i18nKey: "sidebar.meu_time",   icon: Users,    gestorOnly: true },
      { href: "/equipe",     i18nKey: "sidebar.membros",    icon: UserCog,  gestorOnly: true },
    ],
  },
  {
    titleKey: "sidebar.sistema",
    items: [
      { href: "/admin/ai",      i18nKey: "sidebar.ia",            icon: Bot,         gestorOnly: true },
      { href: "/auditoria",     i18nKey: "sidebar.auditoria",     icon: ShieldCheck, gestorOnly: true },
      { href: "/configuracoes", i18nKey: "sidebar.configuracoes", icon: Settings },
    ],
  },
];

type OrgLite = { id: string; nome: string; role: "gestor" | "comercial" | "sdr" };

export default function Sidebar({
  user,
  userId,
  isGestor,
  orgs,
  activeOrgId,
}: {
  user: { display_name: string; email: string; role: string };
  userId: string;
  isGestor: boolean;
  orgs: OrgLite[];
  activeOrgId: string | null;
}) {
  const pathname = usePathname();
  const [locale, setLocale] = useState<Locale>("pt-BR");
  useEffect(() => setLocale(getClientLocale()), []);
  const t = getT(locale);

  return (
    <aside
      className={clsx(
        "hidden md:flex md:flex-col w-60 h-screen sticky top-0",
        // Light: bg-card sólido com border soft-blue.
        // Dark: Linear panel #0f1011 com border translúcida branca.
        "bg-card border-r border-border",
        "dark:bg-[hsl(220_5%_6%)] dark:border-white/[0.06]",
      )}
    >
      {/* HEADER LOGO — compacto, Linear-style */}
      <div className="px-4 pt-4 pb-3 flex items-center gap-2.5">
        <div
          className={clsx(
            "w-7 h-7 rounded-md grid place-items-center text-primary-foreground font-semibold text-[13px] flex-shrink-0",
            "bg-primary",
          )}
          style={{ boxShadow: "inset 0 1px 0 hsl(0 0% 100% / 0.18), 0 1px 2px hsl(220 5% 4% / 0.15)" }}
        >
          G
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-medium text-[13px] leading-tight text-foreground truncate" style={{ letterSpacing: "-0.13px" }}>
            Guilds Comercial
          </div>
          <div className="text-[10px] uppercase text-muted-foreground tracking-widest font-semibold mt-0.5">
            {isGestor ? t("papeis.gestor") : user.role === "sdr" ? t("papeis.sdr") : t("papeis.comercial")}
          </div>
        </div>
      </div>

      {/* ORG SWITCHER */}
      <div className="px-2 pb-2">
        <OrgSwitcher orgs={orgs} activeOrgId={activeOrgId} isGestor={isGestor} />
      </div>

      {/* NAVIGATION */}
      <nav className="flex-1 px-2 py-3 space-y-5 overflow-y-auto">
        {NAV_GROUPS.map((group, idx) => {
          const visibleItems = group.items
            .filter(n => !n.gestorOnly || isGestor)
            .filter(n => !n.myPanel || !isGestor);

          if (visibleItems.length === 0) return null;

          return (
            <div key={idx} className="space-y-0.5">
              <h3 className="px-2.5 text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-[0.12em] mb-1.5 select-none">
                {t(group.titleKey)}
              </h3>
              {visibleItems.map(({ href, i18nKey, icon: Icon, myPanel }) => {
                const resolvedHref = myPanel ? `/vendedor/${userId}` : href;
                const active = pathname === resolvedHref || pathname?.startsWith(resolvedHref + "/");

                return (
                  <Link
                    key={href}
                    href={resolvedHref}
                    className={clsx(
                      "group flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] font-medium transition-colors duration-150 relative",
                      active
                        ? // Active: Linear-style — bg sutil + accent à esquerda como indicador
                          "text-foreground bg-secondary/80 dark:bg-white/[0.04]"
                        : "text-muted-foreground hover:text-foreground hover:bg-secondary/60 dark:hover:bg-white/[0.03]",
                    )}
                    style={{ letterSpacing: "-0.13px", fontWeight: 510 }}
                  >
                    {/* Indicador vertical à esquerda quando ativo */}
                    {active && (
                      <span
                        aria-hidden
                        className="absolute left-0 top-1.5 bottom-1.5 w-[2px] rounded-full bg-primary"
                      />
                    )}
                    <Icon
                      className={clsx(
                        "w-4 h-4 transition-colors shrink-0",
                        active ? "text-primary" : "text-muted-foreground group-hover:text-foreground",
                      )}
                    />
                    <span className="truncate">{t(i18nKey)}</span>
                  </Link>
                );
              })}
            </div>
          );
        })}
      </nav>

      {/* FOOTER USER PROFILE & THEME */}
      <div className="p-2 border-t border-border dark:border-white/[0.06]">
        <div className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-secondary/60 dark:hover:bg-white/[0.03] transition-colors group relative">
          <div
            className={clsx(
              "w-7 h-7 rounded-full grid place-items-center text-[11px] font-semibold flex-shrink-0",
              "bg-secondary text-foreground border border-border",
              "dark:bg-white/[0.06] dark:border-white/[0.08]",
            )}
          >
            {user.display_name.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0 pr-12">
            <div className="text-[12px] font-medium text-foreground truncate leading-tight" style={{ letterSpacing: "-0.13px" }}>
              {user.display_name}
            </div>
            <div className="text-[11px] text-muted-foreground truncate mt-0.5">
              {user.email}
            </div>
          </div>

          <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
            <ThemeToggle />
            <form action="/api/logout" method="post">
              <button
                title={t("sidebar.sair")}
                className={clsx(
                  "p-1.5 rounded-md text-muted-foreground transition-colors flex items-center justify-center",
                  "hover:bg-card hover:text-destructive",
                  "dark:hover:bg-white/[0.06]",
                )}
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </form>
          </div>
        </div>
      </div>
    </aside>
  );
}
