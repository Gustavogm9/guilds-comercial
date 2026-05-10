"use client";

/**
 * PortfolioClient — orquestrador do módulo Portfolio & ICP Lab.
 * Sprint 10: 6 abas — Métricas · Produtos · Projetos · Portfolio · ICP Lab · Propostas
 */

import { useState } from "react";
import { BarChart3, Package, FolderOpen, Briefcase, Target, FileText } from "lucide-react";
import TabProdutos from "./tab-produtos";
import TabCases from "./tab-cases";
import TabHipoteses from "./tab-hipoteses";
import TabPropostas from "./tab-propostas";
import TabMetricas from "./tab-metricas";
import TabProjetos from "./tab-projetos";

type Aba = "metricas" | "produtos" | "projetos" | "cases" | "hipoteses" | "propostas";

type Props = {
  produtos: any[];
  cases: any[];
  hipoteses: any[];
  propostas: any[];
  metricas: any[];
  projetos: any[];
};

const ABAS: { key: Aba; icon: typeof Package; label: string; badge?: string }[] = [
  { key: "metricas",  icon: BarChart3,   label: "Métricas" },
  { key: "produtos",  icon: Package,     label: "Produtos" },
  { key: "projetos",  icon: FolderOpen,  label: "Projetos" },
  { key: "cases",     icon: Briefcase,   label: "Portfolio" },
  { key: "hipoteses", icon: Target,      label: "ICP Lab", badge: "IA" },
  { key: "propostas", icon: FileText,    label: "Propostas" },
];

export default function PortfolioClient({
  produtos, cases, hipoteses, propostas, metricas, projetos
}: Props) {
  const [aba, setAba] = useState<Aba>("metricas");

  return (
    <div>
      {/* Tabs — scrollável em mobile */}
      <div className="flex gap-1 p-1 bg-secondary/40 rounded-xl w-fit mb-6 overflow-x-auto max-w-full">
        {ABAS.map(({ key, icon: Icon, label, badge }) => (
          <button
            key={key}
            onClick={() => setAba(key)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
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
      {aba === "metricas"  && <TabMetricas  metricas={metricas}  onSelecionarProduto={() => setAba("produtos")} />}
      {aba === "produtos"  && <TabProdutos  produtos={produtos} />}
      {aba === "projetos"  && <TabProjetos  projetos={projetos} produtos={produtos} />}
      {aba === "cases"     && <TabCases     cases={cases} produtos={produtos} />}
      {aba === "hipoteses" && <TabHipoteses hipoteses={hipoteses} produtos={produtos} />}
      {aba === "propostas" && <TabPropostas propostas={propostas} />}
    </div>
  );
}
