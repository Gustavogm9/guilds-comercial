"use client";
import { useState, useRef, useEffect, useTransition } from "react";
import Link from "next/link";
import { Building2, ChevronDown, Check, Plus } from "lucide-react";
import clsx from "clsx";
import { trocarOrg } from "@/app/(app)/org-actions";
import { getClientLocale, getT, type Locale } from "@/lib/i18n";

type OrgLite = { id: string; nome: string; role: "gestor" | "comercial" | "sdr" };

export default function OrgSwitcher({
  orgs,
  activeOrgId,
  isGestor,
}: {
  orgs: OrgLite[];
  activeOrgId: string | null;
  isGestor: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const ref = useRef<HTMLDivElement>(null);
  const [locale, setLocale] = useState<Locale>("pt-BR");
  useEffect(() => setLocale(getClientLocale()), []);
  const t = getT(locale);
  const active = orgs.find(o => o.id === activeOrgId) ?? orgs[0];

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  if (!active) return null;

  // Se só tem 1 org e não é gestor, mostra label estático (sem dropdown)
  const showDropdown = orgs.length > 1 || isGestor;

  if (!showDropdown) {
    return (
      <div className="flex items-center gap-2 px-2.5 py-1.5 text-xs">
        <Building2 className="w-3.5 h-3.5 text-muted-foreground" />
        <span className="font-medium truncate text-foreground" style={{ letterSpacing: "-0.13px" }}>
          {active.nome}
        </span>
      </div>
    );
  }

  const labelOrgs = locale === "en-US" ? "Your organizations" : "Suas organizações";
  const labelNova = locale === "en-US" ? "New organization" : "Nova empresa";

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={clsx(
          "w-full flex items-center gap-2 px-2.5 py-1.5 text-xs rounded-md transition-colors",
          "border border-border bg-card text-foreground",
          "hover:bg-secondary",
          "dark:bg-white/[0.02] dark:border-white/[0.08] dark:hover:bg-white/[0.04]",
          "disabled:opacity-50",
        )}
        disabled={pending}
        style={{ letterSpacing: "-0.13px" }}
      >
        <Building2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        <span className="font-medium truncate flex-1 text-left">{active.nome}</span>
        <ChevronDown
          className={clsx("w-3 h-3 text-muted-foreground transition-transform", open && "rotate-180")}
        />
      </button>

      {open && (
        <div
          className={clsx(
            "absolute left-0 right-0 top-full mt-1 z-50 py-1 rounded-md overflow-hidden",
            "bg-popover border border-border shadow-stripe-md",
            "dark:bg-[hsl(220_5%_10%)] dark:border-white/[0.08] dark:shadow-none",
          )}
        >
          <div className="px-2.5 py-1 text-[10px] uppercase tracking-[0.12em] text-muted-foreground/70 font-semibold border-b border-border dark:border-white/[0.06]">
            {labelOrgs}
          </div>
          {orgs.map(o => (
            <button
              key={o.id}
              onClick={() => {
                setOpen(false);
                startTransition(() => {
                  trocarOrg(o.id);
                });
              }}
              className={clsx(
                "w-full text-left px-2.5 py-1.5 text-xs flex items-center gap-2 transition-colors",
                "hover:bg-secondary dark:hover:bg-white/[0.04]",
                o.id === active.id && "bg-secondary/70 dark:bg-white/[0.04]",
              )}
            >
              <div className="flex-1 min-w-0">
                <div
                  className="font-medium truncate text-foreground"
                  style={{ letterSpacing: "-0.13px" }}
                >
                  {o.nome}
                </div>
                <div className="text-[10px] uppercase text-muted-foreground/70 tracking-[0.12em] font-semibold mt-0.5">
                  {t(`papeis.${o.role}` as any)}
                </div>
              </div>
              {o.id === active.id && <Check className="w-3.5 h-3.5 text-primary shrink-0" />}
            </button>
          ))}
          {isGestor && (
            <div className="border-t border-border dark:border-white/[0.06] mt-1 pt-1">
              <Link
                href="/empresa/nova"
                onClick={() => setOpen(false)}
                className={clsx(
                  "w-full text-left px-2.5 py-1.5 text-xs flex items-center gap-2 transition-colors",
                  "text-primary hover:bg-secondary",
                  "dark:hover:bg-white/[0.04]",
                )}
                style={{ letterSpacing: "-0.13px" }}
              >
                <Plus className="w-3.5 h-3.5" />
                <span className="font-medium">{labelNova}</span>
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
