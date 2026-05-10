import { SupabaseClient } from "npm:@supabase/supabase-js@2.49.1";

// ==============================================================================
// 1. Tipagem e Setup
// ==============================================================================

export interface AgentContext {
  supabase: SupabaseClient;
  user_id: string;
  organization_id: string | null;
  user_name?: string;
  channel: string;
}

export function makeContext(
  supabase: SupabaseClient,
  opts: Omit<AgentContext, "supabase">,
): AgentContext {
  return { supabase, ...opts };
}

export type ToolExecuteFn = (args: any, ctx: AgentContext) => Promise<unknown>;

export interface AgentTool {
  name: string;
  description: string;
  parameters: {
    type: string;
    properties: Record<string, any>;
    required?: string[];
  };
  execute: ToolExecuteFn;
}

// ==============================================================================
// 2. Definição das Tools (Ferramentas)
// ==============================================================================

export const TOOLS: Record<string, AgentTool> = {
  
  // --- Ferramentas do AGENT_CRM ---
  
  buscar_leads: {
    name: "buscar_leads",
    description: "Busca leads no CRM (Pipeline). Útil para verificar se um contato já existe antes de criá-lo ou para buscar o ID de um lead para adicionar tarefas.",
    parameters: {
      type: "object",
      properties: {
        termo: { type: "string", description: "Nome, e-mail, telefone ou empresa do lead para buscar." }
      },
      required: ["termo"],
    },
    execute: async (args: { termo: string }, ctx) => {
      const { data, error } = await ctx.supabase
        .from("leads")
        .select("id, nome, empresa, telefone, email, crm_stage")
        .eq("organizacao_id", ctx.organization_id)
        .or(`nome.ilike.%${args.termo}%,empresa.ilike.%${args.termo}%,email.ilike.%${args.termo}%`)
        .limit(5);
      if (error) throw error;
      if (!data || data.length === 0) return { aviso: "Nenhum lead encontrado com este termo." };
      return { encontrados: data };
    },
  },

  criar_lead: {
    name: "criar_lead",
    description: "Cria um novo lead no Pipeline Comercial.",
    parameters: {
      type: "object",
      properties: {
        nome: { type: "string", description: "Nome do lead" },
        empresa: { type: "string", description: "Empresa do lead" },
        telefone: { type: "string" },
        email: { type: "string" },
        produto_id: { type: "number", description: "ID do produto (se souber). Opcional." }
      },
      required: ["nome"],
    },
    execute: async (args: any, ctx) => {
      const payload: any = {
        organizacao_id: ctx.organization_id,
        nome: args.nome,
        empresa: args.empresa,
        telefone: args.telefone,
        email: args.email,
        responsavel_id: ctx.user_id,
        crm_stage: "Lead",
        fonte: "copilot",
      };
      const { data: lead, error } = await ctx.supabase.from("leads").insert(payload).select("id").single();
      if (error) throw error;
      
      // Vincula ao produto se especificado
      if (args.produto_id) {
        await ctx.supabase.from("lead_produtos").insert({
          lead_id: lead.id,
          produto_id: args.produto_id,
          status: "ativo",
          atribuido_por: ctx.user_id
        });
      }
      return { sucesso: true, lead_id: lead.id, mensagem: "Lead criado com sucesso." };
    },
  },

  adicionar_timeline: {
    name: "adicionar_timeline",
    description: "Adiciona uma nota, ligação ou resumo no histórico (timeline) de um Lead.",
    parameters: {
      type: "object",
      properties: {
        lead_id: { type: "string", description: "ID do lead" },
        tipo: { type: "string", description: "Tipos permitidos: 'nota', 'ligacao', 'reuniao'" },
        titulo: { type: "string", description: "Título breve da interação" },
        conteudo: { type: "string", description: "Descrição detalhada (resumo da call, etc)" }
      },
      required: ["lead_id", "tipo", "titulo"],
    },
    execute: async (args: any, ctx) => {
      const payload = {
        organizacao_id: ctx.organization_id,
        lead_id: args.lead_id,
        tipo: args.tipo,
        titulo: args.titulo,
        conteudo: args.conteudo,
        criado_por: ctx.user_id
      };
      const { error } = await ctx.supabase.from("lead_timeline").insert(payload);
      if (error) throw error;
      return { sucesso: true, mensagem: "Adicionado ao histórico 360 do lead com sucesso." };
    },
  },

  agendar_cadencia: {
    name: "agendar_cadencia",
    description: "Agenda um próximo passo (tarefa/cadência) com o lead para uma data futura.",
    parameters: {
      type: "object",
      properties: {
        lead_id: { type: "string" },
        canal: { type: "string", description: "'WhatsApp', 'Email', 'Ligação' ou 'Reunião'" },
        objetivo: { type: "string", description: "O que deve ser feito (ex: Retorno da proposta)" },
        data_prevista: { type: "string", description: "Data no formato YYYY-MM-DD" }
      },
      required: ["lead_id", "canal", "objetivo", "data_prevista"],
    },
    execute: async (args: any, ctx) => {
      const payload = {
        organizacao_id: ctx.organization_id,
        lead_id: args.lead_id,
        canal: args.canal,
        objetivo: args.objetivo,
        data_prevista: args.data_prevista,
        status: "pendente",
        criado_por: ctx.user_id
      };
      const { error } = await ctx.supabase.from("cadencia").insert(payload);
      if (error) throw error;
      return { sucesso: true, mensagem: "Passo de cadência agendado." };
    },
  },

  // --- Ferramentas do AGENT_PROSPECCAO ---

  gerar_campanha_automatica: {
    name: "gerar_campanha_automatica",
    description: "Dispara uma nova campanha de prospecção usando IA Look-alike. Executar apenas se o usuário pedir explicitamente para buscar ou prospectar novos leads.",
    parameters: {
      type: "object",
      properties: {
        nome_campanha: { type: "string", description: "Ex: Busca Gestores SP" },
        produto_id: { type: "number", description: "ID do produto para usar o ICP (opcional)" },
        max_leads: { type: "number", description: "Quantidade de leads a buscar (padrão 15)" },
        regioes: { type: "array", items: { type: "string" }, description: "Ex: ['SP', 'MG']" }
      },
      required: ["nome_campanha"],
    },
    execute: async (args: any, ctx) => {
      const payload = {
        organizacao_id: ctx.organization_id,
        nome: args.nome_campanha,
        produto_id: args.produto_id || null,
        status: "aguardando",
        configuracao: {
          max_leads: args.max_leads || 15,
          regioes: args.regioes || []
        }
      };
      const { data, error } = await ctx.supabase.from("campanhas_prospeccao").insert(payload).select("id").single();
      if (error) throw error;
      return { sucesso: true, mensagem: `Campanha '${args.nome_campanha}' foi ENFILEIRADA com ID ${data.id}. O motor a executará em breve.` };
    }
  }
};

// ==============================================================================
// 3. Roteamento de Especialistas
// ==============================================================================

export function getToolsForAgent(agentType: string): Record<string, AgentTool> {
  switch (agentType) {
    case "AGENT_CRM":
      return {
        buscar_leads: TOOLS.buscar_leads,
        criar_lead: TOOLS.criar_lead,
        adicionar_timeline: TOOLS.adicionar_timeline,
        agendar_cadencia: TOOLS.agendar_cadencia
      };
    case "AGENT_PROSPECCAO":
      return {
        gerar_campanha_automatica: TOOLS.gerar_campanha_automatica
      };
    case "AGENT_UNIVERSAL":
      // Acesso a todas as ferramentas se houver contexto cruzado
      return TOOLS;
    default:
      return {};
  }
}

export function getToolSchemasForGemini(agentType: string) {
  const agentTools = getToolsForAgent(agentType);
  return Object.values(agentTools).map((t) => ({
    name: t.name,
    description: t.description,
    parameters: t.parameters,
  }));
}
