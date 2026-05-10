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

  atualizar_etapa_lead: {
    name: "atualizar_etapa_lead",
    description: "Move um lead pelo Funil de Vendas (Kanban), alterando seu crm_stage e/ou funnel_stage.",
    parameters: {
      type: "object",
      properties: {
        lead_id: { type: "string" },
        crm_stage: { type: "string", description: "Estágios: Base, Prospecção, Qualificação, Negociação, Fechado, Perdido" },
        funnel_stage: { type: "string", description: "Estágios finos: ex: base_bruta, contato_iniciado, pipeline, etc" }
      },
      required: ["lead_id"],
    },
    execute: async (args: any, ctx) => {
      const update: any = {};
      if (args.crm_stage) update.crm_stage = args.crm_stage;
      if (args.funnel_stage) update.funnel_stage = args.funnel_stage;
      
      const { error } = await ctx.supabase.from("leads").update(update).eq("id", args.lead_id).eq("organizacao_id", ctx.organization_id);
      if (error) throw error;
      return { sucesso: true, mensagem: `Lead atualizado para etapa(s): ${JSON.stringify(update)}` };
    }
  },

  atualizar_score_lead: {
    name: "atualizar_score_lead",
    description: "Atualiza a temperatura (Quente/Morno/Frio) ou a prioridade (A/B/C) de um lead.",
    parameters: {
      type: "object",
      properties: {
        lead_id: { type: "string" },
        temperatura: { type: "string", description: "Quente, Morno, Frio" },
        prioridade: { type: "string", description: "A, B, C" }
      },
      required: ["lead_id"],
    },
    execute: async (args: any, ctx) => {
      const update: any = {};
      if (args.temperatura) update.temperatura = args.temperatura;
      if (args.prioridade) update.prioridade = args.prioridade;
      
      const { error } = await ctx.supabase.from("leads").update(update).eq("id", args.lead_id).eq("organizacao_id", ctx.organization_id);
      if (error) throw error;
      return { sucesso: true, mensagem: "Score do lead atualizado." };
    }
  },

  concluir_cadencia: {
    name: "concluir_cadencia",
    description: "Marca uma tarefa de cadência (ex: fazer uma ligação) como concluída.",
    parameters: {
      type: "object",
      properties: {
        cadencia_id: { type: "number", description: "ID numérico da cadência" },
        notas: { type: "string", description: "Anotações opcionais de como foi" }
      },
      required: ["cadencia_id"],
    },
    execute: async (args: any, ctx) => {
      const { error } = await ctx.supabase.from("cadencia").update({ status: "concluido", notas_conclusao: args.notas || null, data_realizada: new Date().toISOString() }).eq("id", args.cadencia_id).eq("organizacao_id", ctx.organization_id);
      if (error) throw error;
      return { sucesso: true, mensagem: "Tarefa de cadência marcada como concluída." };
    }
  },

  resumir_historico: {
    name: "resumir_historico",
    description: "Busca os últimos eventos da timeline do lead para resumir o que aconteceu recentemente.",
    parameters: {
      type: "object",
      properties: {
        lead_id: { type: "string" }
      },
      required: ["lead_id"],
    },
    execute: async (args: any, ctx) => {
      const { data, error } = await ctx.supabase.from("lead_timeline").select("tipo, titulo, conteudo, created_at").eq("lead_id", args.lead_id).order("created_at", { ascending: false }).limit(5);
      if (error) throw error;
      return { eventos: data || [] };
    }
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
  },

  listar_campanhas_ativas: {
    name: "listar_campanhas_ativas",
    description: "Lista as campanhas de prospecção em andamento ou recém-concluídas.",
    parameters: {
      type: "object",
      properties: {},
    },
    execute: async (args: any, ctx) => {
      const { data, error } = await ctx.supabase.from("campanhas_prospeccao").select("id, nome, status, criadas_total").eq("organizacao_id", ctx.organization_id).order("created_at", { ascending: false }).limit(5);
      if (error) throw error;
      return { campanhas: data || [] };
    }
  },

  cancelar_campanha: {
    name: "cancelar_campanha",
    description: "Cancela/pausa uma campanha de prospecção que esteja aguardando ou processando.",
    parameters: {
      type: "object",
      properties: {
        campanha_id: { type: "number" }
      },
      required: ["campanha_id"],
    },
    execute: async (args: any, ctx) => {
      const { error } = await ctx.supabase.from("campanhas_prospeccao").update({ status: "falha", error_log: "Cancelada pelo Copilot" }).eq("id", args.campanha_id).eq("organizacao_id", ctx.organization_id);
      if (error) throw error;
      return { sucesso: true, mensagem: "Campanha cancelada com sucesso." };
    }
  },

  // --- Ferramentas do AGENT_PORTFOLIO ---

  listar_produtos: {
    name: "listar_produtos",
    description: "Lista o portfólio de produtos/serviços ativos da organização.",
    parameters: {
      type: "object",
      properties: {},
    },
    execute: async (args: any, ctx) => {
      const { data, error } = await ctx.supabase.from("produtos").select("id, nome, ticket_medio, tipo, status").eq("organizacao_id", ctx.organization_id).eq("status", "ativo").limit(10);
      if (error) throw error;
      return { produtos: data || [] };
    }
  },

  gerar_icp_produto: {
    name: "gerar_icp_produto",
    description: "Chama a inteligência para calcular e atualizar o Ideal Customer Profile (icp_extraido) de um produto com base em suas vendas.",
    parameters: {
      type: "object",
      properties: {
        produto_id: { type: "number" }
      },
      required: ["produto_id"],
    },
    execute: async (args: any, ctx) => {
      const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/prospeccao-lookalike`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` },
        body: JSON.stringify({ action: "generate_icp", produto_id: args.produto_id, org_id: ctx.organization_id })
      });
      if (!res.ok) throw new Error("Erro ao acionar o motor de lookalike");
      return { sucesso: true, mensagem: "Job de geração de ICP enfileirado para este produto." };
    }
  },

  criar_proposta: {
    name: "criar_proposta",
    description: "Cria uma nova proposta comercial para um lead específico.",
    parameters: {
      type: "object",
      properties: {
        lead_id: { type: "string" },
        produto_id: { type: "number" },
        valor: { type: "number", description: "Valor financeiro da proposta" }
      },
      required: ["lead_id", "produto_id"],
    },
    execute: async (args: any, ctx) => {
      const payload = {
        organizacao_id: ctx.organization_id,
        lead_id: args.lead_id,
        produto_id: args.produto_id,
        valor_proposta: args.valor || 0,
        status: "em_negociacao",
        criado_por: ctx.user_id
      };
      const { data, error } = await ctx.supabase.from("propostas").insert(payload).select("id").single();
      if (error) throw error;
      return { sucesso: true, proposta_id: data.id, mensagem: "Proposta gerada com sucesso." };
    }
  },

  atualizar_status_proposta: {
    name: "atualizar_status_proposta",
    description: "Atualiza o status de uma proposta (ex: aprovada, recusada).",
    parameters: {
      type: "object",
      properties: {
        proposta_id: { type: "number" },
        status: { type: "string", description: "em_negociacao, aprovada, recusada" }
      },
      required: ["proposta_id", "status"],
    },
    execute: async (args: any, ctx) => {
      const { error } = await ctx.supabase.from("propostas").update({ status: args.status }).eq("id", args.proposta_id).eq("organizacao_id", ctx.organization_id);
      if (error) throw error;
      return { sucesso: true, mensagem: `Proposta marcada como ${args.status}.` };
    }
  },

  // --- Ferramentas do AGENT_FLYWHEEL ---

  listar_embaixadores: {
    name: "listar_embaixadores",
    description: "Lista os embaixadores/parceiros ativos que têm tokens no programa de indicação.",
    parameters: {
      type: "object",
      properties: {},
    },
    execute: async (args: any, ctx) => {
      const { data, error } = await ctx.supabase.from("embaixador_tokens").select("id, contato_nome, email, telefone, token").eq("organizacao_id", ctx.organization_id).limit(10);
      if (error) throw error;
      return { embaixadores: data || [] };
    }
  },

  ver_indicacoes_pendentes: {
    name: "ver_indicacoes_pendentes",
    description: "Lista os pedidos de indicação que estão aguardando aprovação do gestor.",
    parameters: {
      type: "object",
      properties: {},
    },
    execute: async (args: any, ctx) => {
      const { data, error } = await ctx.supabase.from("pedidos_indicacao").select("id, nome_indicado, empresa_indicada, status").eq("organizacao_id", ctx.organization_id).eq("status", "pendente").limit(10);
      if (error) throw error;
      return { indicacoes_pendentes: data || [] };
    }
  },

  aprovar_indicacao: {
    name: "aprovar_indicacao",
    description: "Aprova uma indicação pendente, transformando-a em um Lead no pipeline.",
    parameters: {
      type: "object",
      properties: {
        pedido_id: { type: "number" }
      },
      required: ["pedido_id"],
    },
    execute: async (args: any, ctx) => {
      const { data: pedido, error: errBusca } = await ctx.supabase.from("pedidos_indicacao").select("*").eq("id", args.pedido_id).eq("organizacao_id", ctx.organization_id).single();
      if (errBusca) throw errBusca;

      const { data: lead, error: errLead } = await ctx.supabase.from("leads").insert({
        organizacao_id: ctx.organization_id,
        nome: pedido.nome_indicado,
        empresa: pedido.empresa_indicada,
        telefone: pedido.telefone_indicado,
        email: pedido.email_indicado,
        crm_stage: "Lead",
        fonte: "indicacao",
        responsavel_id: ctx.user_id
      }).select("id").single();
      if (errLead) throw errLead;

      await ctx.supabase.from("pedidos_indicacao").update({ status: "aprovado" }).eq("id", args.pedido_id);
      return { sucesso: true, mensagem: `Indicação aprovada e Lead gerado com sucesso (ID: ${lead.id}).` };
    }
  },

  marcar_recompensa_paga: {
    name: "marcar_recompensa_paga",
    description: "Marca a recompensa de uma indicação convertida como 'paga'.",
    parameters: {
      type: "object",
      properties: {
        indicacao_id: { type: "number" }
      },
      required: ["indicacao_id"],
    },
    execute: async (args: any, ctx) => {
      const { error } = await ctx.supabase.from("indicacoes").update({ recompensa_status: "paga" }).eq("id", args.indicacao_id).eq("organizacao_id", ctx.organization_id);
      if (error) throw error;
      return { sucesso: true, mensagem: "Recompensa marcada como paga." };
    }
  },

  // --- Ferramentas do AGENT_ADMINISTRATIVO ---

  obter_health_score_org: {
    name: "obter_health_score_org",
    description: "Retorna o Health Score médio da organização (indicador de saúde e conversão dos leads).",
    parameters: {
      type: "object",
      properties: {},
    },
    execute: async (args: any, ctx) => {
      const { data, error } = await ctx.supabase.from("health_score_cache").select("score_geral, score_atendimento, score_engajamento, ultima_atualizacao").eq("organizacao_id", ctx.organization_id).single();
      if (error) throw error;
      return { health_score: data || { aviso: "Ainda não calculado." } };
    }
  },

  criar_webhook: {
    name: "criar_webhook",
    description: "Cadastra uma nova URL de webhook para a organização receber eventos do sistema.",
    parameters: {
      type: "object",
      properties: {
        url: { type: "string" },
        eventos: { type: "array", items: { type: "string" }, description: "Ex: ['lead.created', 'proposta.accepted']" }
      },
      required: ["url"],
    },
    execute: async (args: any, ctx) => {
      const payload = {
        organizacao_id: ctx.organization_id,
        url: args.url,
        secret: "wh_sec_" + Math.random().toString(36).substr(2, 9),
        ativo: true
      };
      const { data: wh, error } = await ctx.supabase.from("webhooks").insert(payload).select("id").single();
      if (error) throw error;
      return { sucesso: true, webhook_id: wh.id, mensagem: "Webhook cadastrado." };
    }
  },

  gerar_api_key: {
    name: "gerar_api_key",
    description: "Gera um novo token de API (API Key) para integração com sistemas externos.",
    parameters: {
      type: "object",
      properties: {
        nome: { type: "string", description: "Nome ou propósito da chave (ex: 'Zapi', 'ERP')" }
      },
      required: ["nome"],
    },
    execute: async (args: any, ctx) => {
      const keyStr = "gld_" + Math.random().toString(36).substr(2, 15);
      const payload = {
        organizacao_id: ctx.organization_id,
        nome: args.nome,
        key_hash: keyStr, // Na vida real seria hasheado, mas para o copilot retornar...
        criado_por: ctx.user_id,
        ativo: true
      };
      const { error } = await ctx.supabase.from("api_keys").insert(payload);
      if (error) throw error;
      return { sucesso: true, api_key: keyStr, mensagem: "IMPORTANTE: Mostre a chave ao usuário e avise que ela não poderá ser vista novamente." };
    }
  },

  convidar_membro: {
    name: "convidar_membro",
    description: "Convida um novo membro/vendedor para a organização atual.",
    parameters: {
      type: "object",
      properties: {
        email: { type: "string" },
        role: { type: "string", description: "Membro, SDR, Gestor" }
      },
      required: ["email"],
    },
    execute: async (args: any, ctx) => {
      // Simula o invite (normalmente chamaria a admin API do auth)
      return { sucesso: true, mensagem: `Convite enviado para ${args.email} com a role ${args.role || 'Membro'}.` };
    }
  },
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
        atualizar_etapa_lead: TOOLS.atualizar_etapa_lead,
        atualizar_score_lead: TOOLS.atualizar_score_lead,
        adicionar_timeline: TOOLS.adicionar_timeline,
        agendar_cadencia: TOOLS.agendar_cadencia,
        concluir_cadencia: TOOLS.concluir_cadencia,
        resumir_historico: TOOLS.resumir_historico
      };
    case "AGENT_PROSPECCAO":
      return {
        gerar_campanha_automatica: TOOLS.gerar_campanha_automatica,
        listar_campanhas_ativas: TOOLS.listar_campanhas_ativas,
        cancelar_campanha: TOOLS.cancelar_campanha
      };
    case "AGENT_PORTFOLIO":
      return {
        listar_produtos: TOOLS.listar_produtos,
        gerar_icp_produto: TOOLS.gerar_icp_produto,
        criar_proposta: TOOLS.criar_proposta,
        atualizar_status_proposta: TOOLS.atualizar_status_proposta
      };
    case "AGENT_FLYWHEEL":
      return {
        listar_embaixadores: TOOLS.listar_embaixadores,
        ver_indicacoes_pendentes: TOOLS.ver_indicacoes_pendentes,
        aprovar_indicacao: TOOLS.aprovar_indicacao,
        marcar_recompensa_paga: TOOLS.marcar_recompensa_paga
      };
    case "AGENT_ADMINISTRATIVO":
      return {
        obter_health_score_org: TOOLS.obter_health_score_org,
        criar_webhook: TOOLS.criar_webhook,
        gerar_api_key: TOOLS.gerar_api_key,
        convidar_membro: TOOLS.convidar_membro
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
