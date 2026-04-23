"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Kanban, Search, Activity, BarChart3 } from "lucide-react";
import clsx from "clsx";

const NAV = [
  { href: "/hoje",     label: "Hoje",     icon: Home },
  { href: "/pipeline", label: "Pipeline", icon: Kanban },
  { href: "/funil",    label: "Funil",    icon: BarChart3 },
  { href: "/base",     label: "Base",     icon: Search },
  { href: "/raio-x",   label: "Raio-X",   icon: Activity },
];

export default function MobileNav() {
  const pathname = usePathname();
  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 bg-white border-t border-slate-200 z-30">
      <div className="grid grid-cols-5">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname?.startsWith(href + "/");
          return (
            <Link key={href} href={href}
              className={clsx(
                "flex flex-col items-center justify-center py-2 text-[10px] gap-0.5 transition",
                active ? "text-guild-700" : "text-slate-500"
              )}>
              <Icon className="w-5 h-5"/> {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
