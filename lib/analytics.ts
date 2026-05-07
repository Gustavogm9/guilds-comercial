import type { LeadEnriched, CrmStage } from "@/lib/types";
import { startOfWeek, format, parseISO } from "date-fns";

export type FunilHistRow = { crm_stage: CrmStage; qtd: number; };
export type TempoRow = { crm_stage: CrmStage; dias_media: number; dias_mediana: number; amostras: number; };
export type ValorRow = { crm_stage: CrmStage; leads_abertos: number; valor_aberto: number; valor_weighted: number; prob_media: number; };
export type CohortRow = { semana: string; entraram: number; ganhos: number; perdidos: number; nutricao: number; em_aberto: number; receita_ganha: number; dias_para_fechar: number | null; };
export type PerdaRow = { motivo: string; qtd: number; valor_perdido: number; };

// Tipo base para os eventos que importam
export type LeadEventoLight = {
  lead_id: number;
  tipo: string;
  payload: any;
  created_at: string;
};

// Funil Histórico: Quantos leads passaram por cada etapa.
export function calcularFunilHistorico(
  leads: LeadEnriched[],
  eventos: LeadEventoLight[],
  etapas: CrmStage[]
): FunilHistRow[] {
  // Para cada lead, determinamos o conjunto de etapas pelo qual ele passou.
  // 1. Ele sempre passou pela etapa atual (crm_stage).
  // 2. Ele passou por todas as etapas indicadas no payload->'para' de 'etapa_alterada'.
  // 3. Assumimos que ele passou por "Prospecção" (a primeira etapa) se ele entrou no funil.
  
  const contagem = new Map<CrmStage, number>();
  etapas.forEach(e => contagem.set(e, 0));

  const eventosPorLead = agruparEventos(eventos);

  for (const lead of leads) {
    if (!lead.crm_stage) continue;
    
    const etapasPassadas = new Set<CrmStage>();
    etapasPassadas.add(lead.crm_stage);
    etapasPassadas.add("Prospecção"); // Topo do funil

    const evs = eventosPorLead.get(lead.id) || [];
    for (const ev of evs) {
      if (ev.tipo === "etapa_alterada" && ev.payload?.para) {
        etapasPassadas.add(ev.payload.para as CrmStage);
      }
    }

    // Se o lead chegou em "Fechado", a conversão histórica perfeita dita que 
    // ele passou por todas as etapas anteriores que o vendedor pode ter pulado?
    // Opção: Preencher gaps. Para manter a realidade sistêmica, vamos contar apenas onde ele de fato foi registrado.
    
    // Adicionar 1 para cada etapa que este lead tocou
    for (const etapa of etapasPassadas) {
      if (contagem.has(etapa)) {
        contagem.set(etapa, contagem.get(etapa)! + 1);
      }
    }
  }

  return etapas.map(e => ({
    crm_stage: e,
    qtd: contagem.get(e) ?? 0,
  }));
}

// Tempo Médio: Calcula o tempo gasto entre as transições
export function calcularTempoPorEtapa(
  leads: LeadEnriched[],
  eventos: LeadEventoLight[],
  etapas: CrmStage[]
): TempoRow[] {
  const duracoesPorEtapa = new Map<CrmStage, number[]>();
  etapas.forEach(e => duracoesPorEtapa.set(e, []));

  const eventosPorLead = agruparEventos(eventos);

  for (const lead of leads) {
    const evs = (eventosPorLead.get(lead.id) || []).filter(e => e.tipo === "etapa_alterada");
    if (evs.length === 0) {
      // Nenhum evento de transição: o lead está na 1ª etapa desde data_entrada
      if (lead.data_entrada) {
        const entrada = new Date(lead.data_entrada).getTime();
        const fim = lead.data_fechamento ? new Date(lead.data_fechamento).getTime() : Date.now();
        const dias = (fim - entrada) / 86400000;
        if (dias >= 0) {
          addDuracao(duracoesPorEtapa, "Prospecção", dias);
        }
      }
      continue;
    }

    // Ordenar do mais antigo pro mais novo
    evs.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

    let ultimaData = lead.data_entrada ? new Date(lead.data_entrada).getTime() : new Date(evs[0].created_at).getTime();
    let ultimaEtapa = "Prospecção" as CrmStage;

    for (const ev of evs) {
      const dataEv = new Date(ev.created_at).getTime();
      const dias = (dataEv - ultimaData) / 86400000;
      if (dias >= 0) {
        addDuracao(duracoesPorEtapa, ultimaEtapa, dias);
      }
      ultimaData = dataEv;
      ultimaEtapa = ev.payload?.para as CrmStage;
    }
  }

  return etapas.map(e => {
    const arr = duracoesPorEtapa.get(e) || [];
    if (arr.length === 0) return { crm_stage: e, dias_media: 0, dias_mediana: 0, amostras: 0 };
    
    arr.sort((a, b) => a - b);
    const media = arr.reduce((a, b) => a + b, 0) / arr.length;
    const mediana = arr[Math.floor(arr.length / 2)];
    
    return {
      crm_stage: e,
      dias_media: Number(media.toFixed(1)),
      dias_mediana: Number(mediana.toFixed(1)),
      amostras: arr.length
    };
  });
}

function addDuracao(map: Map<CrmStage, number[]>, etapa: CrmStage, dias: number) {
  if (map.has(etapa)) {
    map.get(etapa)!.push(dias);
  }
}

// Valor por Etapa (Snapshot Atual)
export function calcularValorPorEtapa(
  leads: LeadEnriched[],
  etapas: CrmStage[]
): ValorRow[] {
  const contagem = new Map<CrmStage, ValorRow>();
  etapas.forEach(e => contagem.set(e, { crm_stage: e, leads_abertos: 0, valor_aberto: 0, valor_weighted: 0, prob_media: 0 }));

  const probs = new Map<CrmStage, number[]>();
  etapas.forEach(e => probs.set(e, []));

  for (const lead of leads) {
    const stage = lead.crm_stage;
    if (!stage || !contagem.has(stage)) continue;

    const isOpen = !["Fechado", "Perdido", "Nutrição"].includes(stage);
    
    const row = contagem.get(stage)!;
    if (isOpen) {
      row.leads_abertos++;
      row.valor_aberto += Number(lead.valor_potencial || 0);
      row.valor_weighted += Number(lead.receita_ponderada || 0);
      probs.get(stage)!.push(Number(lead.probabilidade || 0));
    }
  }

  return etapas.map(e => {
    const row = contagem.get(e)!;
    const pArr = probs.get(e) || [];
    if (pArr.length > 0) {
      row.prob_media = pArr.reduce((a, b) => a + b, 0) / pArr.length;
    }
    return row;
  });
}

// Cohort
export function calcularCohort(leads: LeadEnriched[], agrupamento: "semana" | "mes" = "semana"): CohortRow[] {
  const map = new Map<string, CohortRow>();

  for (const lead of leads) {
    if (!lead.data_entrada) continue;
    const d = new Date(lead.data_entrada);
    let chave = "";
    if (agrupamento === "semana") {
      chave = format(startOfWeek(d, { weekStartsOn: 1 }), "yyyy-MM-dd");
    } else {
      chave = format(d, "yyyy-MM");
    }

    if (!map.has(chave)) {
      map.set(chave, {
        semana: chave,
        entraram: 0, ganhos: 0, perdidos: 0, nutricao: 0, em_aberto: 0, receita_ganha: 0, dias_para_fechar: null
      });
    }

    const row = map.get(chave)!;
    row.entraram++;
    
    if (lead.crm_stage === "Fechado") {
      row.ganhos++;
      row.receita_ganha += Number(lead.valor_potencial || 0);
    } else if (lead.crm_stage === "Perdido") {
      row.perdidos++;
    } else if (lead.crm_stage === "Nutrição") {
      row.nutricao++;
    } else {
      row.em_aberto++;
    }
  }

  // Ordenar cronologicamente
  const arr = Array.from(map.values()).sort((a, b) => a.semana.localeCompare(b.semana));
  
  // Limitar às últimas 12 semanas ou 12 meses
  return arr.slice(-12);
}

// Perdas
export function calcularPerdas(leads: LeadEnriched[], eventos: LeadEventoLight[]): PerdaRow[] {
  const map = new Map<string, PerdaRow>();
  const eventosPorLead = agruparEventos(eventos);

  for (const lead of leads) {
    if (lead.crm_stage !== "Perdido") continue;

    const evs = (eventosPorLead.get(lead.id) || []).filter(e => e.tipo === "arquivado" || e.tipo === "perdido");
    // Pegar o último evento de arquivamento
    evs.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    
    let motivo = "Não informado";
    if (evs.length > 0 && evs[0].payload?.motivo) {
      motivo = String(evs[0].payload.motivo).trim();
    }
    if (!motivo) motivo = "Não informado";

    if (!map.has(motivo)) {
      map.set(motivo, { motivo, qtd: 0, valor_perdido: 0 });
    }
    const row = map.get(motivo)!;
    row.qtd++;
    row.valor_perdido += Number(lead.valor_potencial || 0);
  }

  return Array.from(map.values()).sort((a, b) => b.qtd - a.qtd);
}


// Helper
function agruparEventos(eventos: LeadEventoLight[]) {
  const map = new Map<number, LeadEventoLight[]>();
  for (const ev of eventos) {
    if (!map.has(ev.lead_id)) map.set(ev.lead_id, []);
    map.get(ev.lead_id)!.push(ev);
  }
  return map;
}
