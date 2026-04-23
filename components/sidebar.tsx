"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Kanban, Users, Search, Activity, Mail, PhoneCall, LogOut, UserCog, Radio, User, BarChart3, Bot } from "lucide-react";
import clsx from "clsx";
import OrgSwitcher from "./org-switcher";

type NavItem = {
  href: string;
  label: string;
  icon: typeof Home;
  gestorOnly?: boolean;
  myPanel?: boolean;
};

const NAV: NavItem[] = [
  { href: "/hoje",       label: "Hoje",       icon: Home },
  { href: "/pipeline",   label: "Pipeline",   icon: Kanban },
  { href: "/funil",      label: "Funil",      icon: BarChart3 },
  { href: "/base",       label: "Base",       icon: Search },
  { href: "/raio-x",     label: "Raio-X",     icon: Activity },
  { href: "/ligacoes",   label: "Ligações",   icon: PhoneCall },
  { href: "/newsletter", label: "Newsletter", icon: Mail },
  { href: "/vendedor",   label: "Meu painel", icon: User,     myPanel: true },
  { href: "/canais",     label: "Canais",     icon: Radio,    gestorOnly: true },
  { href: "/time",       label: "Time",       icon: Users,    gestorOnly: true },
  { href: "/equipe",     label: "Equipe",     icon: UserCog,  gestorOnly: true },
  { href: "/admin/ai",   label: "IA",         icon: Bot,      gestorOnly: true },
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
  return (
    <aside className="hidden md:flex md:flex-col w-60 bg-white border-r border-slate-200 h-screen sticky top-0">
      <div className="px-5 py-4 flex items-center gap-2 border-b border-slate-100">
        <div className="w-8 h-8 rounded-lg bg-guild-600 grid place-items-center text-white font-bold">G</div>
        <div className="min-w-0">
          <div className="font-semibold text-sm leading-tight">Guilds Comercial</div>
          <div className="text-[10px] uppercase text-slate-500 tracking-wider">{isGestor ? "Gestor" : user.role === "sdr" ? "SDR" : "Vendedor"}</div>
        </div>
      </div>

      <div className="px-2 py-2 border-b border-slate-100">
        <OrgSwitcher orgs={orgs} activeOrgId={activeOrgId} isGestor={isGestor} />
      </div>

      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {NAV
          .filter(n => !n.gestorOnly || isGestor)
          .filter(n => !n.myPanel || !isGestor) // gestor usa /time; vendedor tem atalho /vendedor/<id>
          .map(({ href, label, icon: Icon, myPanel }) => {
            const resolvedHref = myPanel ? `/vendedor/${userId}` : href;
            const active = pathname === resolvedHref || pathname?.startsWith(resolvedHref + "/");
            return (
              <Link key={href} href={resolvedHref}
                className={clsx(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition",
                  active ? "bg-guild-50 text-guild-700 font-medium" : "text-slate-600 hover:bg-slate-50"
                )}>
                <Icon className="w-4 h-4"/> {label}
              </Link>
            );
          })}
      </nav>

      <div className="p-3 border-t border-slate-100">
        <div className="text-sm font-medium leading-tight">{user.display_name}</div>
        <div className="text-xs text-slate-500 truncate">{user.email}</div>
        <form action="/api/logout" method="post" className="mt-2">
          <button className="btn-ghost w-full justify-start text-slate-500 hover:text-urgent-500">
            <LogOut className="w-4 h-4"/> Sair
          </button>
        </form>
      </div>
    </aside>
  );
}
