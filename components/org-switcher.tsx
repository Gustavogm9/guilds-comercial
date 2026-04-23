"use client";
import { useState, useRef, useEffect, useTransition } from "react";
import Link from "next/link";
import { Building2, ChevronDown, Check, Plus } from "lucide-react";
import { trocarOrg } from "@/app/(app)/org-actions";

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
      <div className="flex items-center gap-2 px-3 py-2 text-xs">
        <Building2 className="w-3.5 h-3.5 text-slate-400"/>
        <span className="font-medium truncate">{active.nome}</span>
      </div>
    );
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-3 py-2 text-xs rounded-lg hover:bg-slate-50 transition"
        disabled={pending}
      >
        <Building2 className="w-3.5 h-3.5 text-slate-500 shrink-0"/>
        <span className="font-medium truncate flex-1 text-left">{active.nome}</span>
        <ChevronDown className={`w-3 h-3 text-slate-400 transition ${open ? "rotate-180" : ""}`}/>
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-50 py-1">
          <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-slate-400 border-b border-slate-100">
            Suas organizações
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
              className={`w-full text-left px-3 py-2 text-xs hover:bg-slate-50 flex items-center gap-2 ${
                o.id === active.id ? "bg-slate-50" : ""
              }`}
            >
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{o.nome}</div>
                <div className="text-[10px] uppercase text-slate-400 tracking-wider">{o.role}</div>
              </div>
              {o.id === active.id && <Check className="w-3.5 h-3.5 text-guild-600 shrink-0"/>}
            </button>
          ))}
          {isGestor && (
            <>
              <div className="border-t border-slate-100 mt-1 pt-1">
                <Link
                  href="/empresa/nova"
                  onClick={() => setOpen(false)}
                  className="w-full text-left px-3 py-2 text-xs hover:bg-slate-50 flex items-center gap-2 text-guild-700"
                >
                  <Plus className="w-3.5 h-3.5"/>
                  Nova empresa
                </Link>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
