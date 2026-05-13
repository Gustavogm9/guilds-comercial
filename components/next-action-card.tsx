/**
 * NextActionCard — card de próxima ação sugerida por etapa do pipeline.
 *
 * Exibido no detalhe do lead (/pipeline/[id]) logo após o header principal.
 * Cada etapa do CRM tem:
 *   - Uma ação principal sugerida (o que fazer agora)
 *   - Um indicador visual (ícone + cor)
 *   - Uma dica de contexto (por que fazer isso)
 *   - Um link/ação recomendada
 *
 * Não aparece para leads em Fechado, Perdido ou Nutrição.
 */

import { ArrowRight, Calendar, Phone, FileText, Zap, MessageSquare, Target, Send, Handshake } from "lucide-react";
import Link from "next/link";

type EtapaConfig = {
  acao: string;
  dica: string;
  icone: React.ElementType;
  cor: string;
  bgCor: string;
  borderCor: string;
  /** Link para a ação — se null, apenas exibe a dica */
  href?: string | ((leadId: number) => string);
  hrefLabel?: string;
};

const ETAPA_CONFIG: Record<string, EtapaConfig> = {
  "Prospecção": {
    acao: "Iniciar cadência de outreach",
    dica: "O lead ainda não foi contatado. Envie o D0 via WhatsApp e Email para quebrar o gelo.",
    icone: Send,
    cor: "text-slate-600 dark:text-slate-300",
    bgCor: "bg-slate-100/80 dark:bg-slate-500/15",
    borderCor: "border-slate-200/70 dark:border-slate-500/25",
    href: "#cadencia",
    hrefLabel: "Ver cadência →",
  },
  "Qualificado": {
    acao: "Ofertar o Raio-X de Diagnóstico",
    dica: "Lead qualificado e com interesse. Momento certo para apresentar o Raio-X como próximo passo concreto.",
    icone: Zap,
    cor: "text-sky-600 dark:text-sky-300",
    bgCor: "bg-sky-100/80 dark:bg-sky-500/15",
    borderCor: "border-sky-200/70 dark:border-sky-500/25",
    href: "#acoes-lead",
    hrefLabel: "Ofertar Raio-X →",
  },
  "Raio-X Ofertado": {
    acao: "Fazer follow-up da oferta do Raio-X",
    dica: "Oferta enviada, aguardando decisão. Se passaram mais de 2 dias, faça contato para tirar dúvidas e reforçar o valor.",
    icone: MessageSquare,
    cor: "text-indigo-600 dark:text-indigo-300",
    bgCor: "bg-indigo-100/80 dark:bg-indigo-500/15",
    borderCor: "border-indigo-200/70 dark:border-indigo-500/25",
    href: "#cadencia",
    hrefLabel: "Fazer follow-up →",
  },
  "Raio-X Feito": {
    acao: "Agendar call de revisão do Raio-X",
    dica: "Diagnóstico concluído! Agende uma call de 30 min para apresentar os resultados e os próximos passos.",
    icone: Calendar,
    cor: "text-violet-600 dark:text-violet-300",
    bgCor: "bg-violet-100/80 dark:bg-violet-500/15",
    borderCor: "border-violet-200/70 dark:border-violet-500/25",
    href: "#ligacoes",
    hrefLabel: "Registrar call →",
  },
  "Call Marcada": {
    acao: "Preparar briefing pré-call",
    dica: "Call agendada! Revise o perfil do lead, a dor principal e prepare perguntas de diagnóstico antes da reunião.",
    icone: Phone,
    cor: "text-amber-600 dark:text-amber-300",
    bgCor: "bg-amber-100/80 dark:bg-amber-500/15",
    borderCor: "border-amber-200/70 dark:border-amber-500/25",
    href: "#ligacoes",
    hrefLabel: "Registrar resultado →",
  },
  "Diagnóstico Pago": {
    acao: "Elaborar e enviar proposta comercial",
    dica: "Diagnóstico entregue e pago — alta intenção de compra. Prepare uma proposta personalizada baseada nos achados do Raio-X.",
    icone: FileText,
    cor: "text-orange-600 dark:text-orange-300",
    bgCor: "bg-orange-100/80 dark:bg-orange-500/15",
    borderCor: "border-orange-200/70 dark:border-orange-500/25",
    href: (leadId) => `/proposta/${leadId}`,
    hrefLabel: "Gerar proposta com IA →",
  },
  "Proposta": {
    acao: "Follow-up da proposta",
    dica: "Proposta enviada. Se passaram mais de 3 dias sem resposta, entre em contato — 80% dos fechamentos acontecem após 3+ follow-ups.",
    icone: Target,
    cor: "text-rose-600 dark:text-rose-300",
    bgCor: "bg-rose-100/80 dark:bg-rose-500/15",
    borderCor: "border-rose-200/70 dark:border-rose-500/25",
    href: (leadId) => `/proposta/${leadId}`,
    hrefLabel: "Abrir proposta →",
  },
  "Negociação": {
    acao: "Fechar negociação",
    dica: "Em fase final! Identifique as últimas objeções, valide condições (prazo, desconto, forma de pagamento) e conduza ao fechamento.",
    icone: Handshake,
    cor: "text-pink-600 dark:text-pink-300",
    bgCor: "bg-pink-100/80 dark:bg-pink-500/15",
    borderCor: "border-pink-200/70 dark:border-pink-500/25",
    href: "#acoes-lead",
    hrefLabel: "Atualizar etapa →",
  },
};

type Props = {
  crmStage: string | null;
  leadId: number;
};

export default function NextActionCard({ crmStage, leadId }: Props) {
  if (!crmStage) return null;

  const config = ETAPA_CONFIG[crmStage];
  if (!config) return null; // Fechado, Perdido, Nutrição, Base → não exibe

  const Icon = config.icone;

  // Resolve href: se começa com '#', é âncora local na página do lead
  const href = typeof config.href === "function" ? config.href(leadId) : config.href;
  const resolvedHref = href?.startsWith("#")
    ? `${href}` // âncora na página atual
    : href;

  return (
    <div className={`mt-4 flex items-start gap-3 p-3.5 rounded-xl border ${config.bgCor} ${config.borderCor}`}>
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${config.bgCor} border ${config.borderCor}`}>
        <Icon className={`w-4 h-4 ${config.cor}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className={`text-xs font-semibold uppercase tracking-[0.1em] mb-0.5 ${config.cor}`}>
          Próxima ação recomendada
        </div>
        <div className="text-sm font-medium text-foreground" style={{ letterSpacing: "-0.13px" }}>
          {config.acao}
        </div>
        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
          {config.dica}
        </p>
        {config.hrefLabel && (
          <div className="mt-2">
            {resolvedHref ? (
              <Link
                href={resolvedHref}
                className={`inline-flex items-center gap-1 text-xs font-semibold ${config.cor} hover:underline`}
              >
                {config.hrefLabel} <ArrowRight className="w-3 h-3" />
              </Link>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
