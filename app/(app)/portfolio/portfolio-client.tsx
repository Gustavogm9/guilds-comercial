"use client";

/**
 * PortfolioClient — orquestrador do módulo Portfolio & ICP Lab.
 * 4 abas: Produtos · Cases · Hipóteses ICP · Propostas
 */

import { useState } from "react";
import { Package, Briefcase, Target, FileText } from "lucide-react";
import TabProdutos from "./tab-produtos";
import TabCases from "./tab-cases";
import TabHipoteses from "./tab-hipoteses";
import TabPropostas from "./tab-propostas";

type Aba = "produtos" | "cases" | "hipoteses" | "propostas";

type Props = {
  produtos: any[];
  cases: any[];
  hipoteses: any[];
  propostas: any[];
};

const ABAS: { key: Aba; icon: typeof Package; label: string; badge?: string }[] = [
  { key: "produtos",   icon: Package,    label: "Produtos" },
  { key: "cases",      icon: Briefcase,  label: "Portfolio" },
  { key: "hipoteses",  icon: Target,     label: "ICP Lab",    badge: "IA" },
  { key: "propostas",  icon: FileText,   label: "Propostas" },
];

export default function PortfolioClient({ produtos, cases, hipoteses, propostas }: Props) {
  const [aba, setAba] = useState<Aba>("produtos");

  return (
    <div>
      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-secondary/40 rounded-xl w-fit mb-6">
        {ABAS.map(({ key, icon: Icon, label, badge }) => (
          <button
            key={key}
            onClick={() => setAba(key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              aba === key
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
            {badge && (
              <span className="text-[9px] bg-primary text-primary-foreground px-1 py-0.5 rounded uppercase font-bold tracking-wide">
                {badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Conteúdo */}
      {aba === "produtos"  && <TabProdutos  produtos={produtos} />}
      {aba === "cases"     && <TabCases     cases={cases} produtos={produtos} />}
      {aba === "hipoteses" && <TabHipoteses hipoteses={hipoteses} produtos={produtos} />}
      {aba === "propostas" && <TabPropostas propostas={propostas} />}
    </div>
  );
}
