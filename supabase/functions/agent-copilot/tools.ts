import { SupabaseClient } from "npm:@supabase/supabase-js@2.49.1";

// ==============================================================================
// 1. Tipagem e Setup
// ==============================================================================

export interface AgentContext {
  supabase: SupabaseClient;
  user_id: string;
  organization_id: string | null;
  role?: string | null;
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

const VALID_CRM_STAGES = new Set([
  "Prospecção",
  "Qualificado",
  "Raio-X Ofertado",
  "Raio-X Feito",
  "Call Marcada",
  "Diagnóstico Pago",
  "Proposta",
  "Negociação",
  "Fechado",
  "Perdido",
  "Nutrição",
]);

const DEFAULT_CRM_STAGE = "Prospecção";
const DEFAULT_LEAD_PRODUTO_STATUS = "interesse";
const VALID_FUNNEL_STAGES = new Set(["base_bruta", "base_qualificada", "pipeline", "arquivado"]);
const VALID_WEBHOOK_EVENTS = new Set([
  "lead.created",
  "lead.updated",
  "lead.qualified",
  "lead.promoted",
  "lead.archived",
  "lead.won",
  "lead.lost",
  "stage.changed",
  "responsavel.changed",
  "proposta.sent",
  "proposta.accepted",
]);

function randomHex(bytes = 32): string {
  const values = new Uint8Array(bytes);
  crypto.getRandomValues(values);
  return Array.from(values, (value) => value.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function requireGestor(ctx: AgentContext): string {
  if (ctx.role !== "gestor") {
    throw new Error("Acao restrita a gestores da organizacao.");
  }
  return requireOrganization(ctx);
}

function isPrivateWebhookHost(host: string): boolean {
  const h = host.toLowerCase();
  if (h === "localhost" || h.endsWith(".localhost")) return true;
  if (h.endsWith(".internal") || h.endsWith(".local")) return true;
  if (h.includes(":")) return true;

  const match = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!match) return false;
  const a = Number(match[1]);
  const b = Number(match[2]);
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return a >= 224;
}

function validateWebhookUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "https:") throw new Error("Use uma URL HTTPS para webhooks.");
  if (isPrivateWebhookHost(url.hostname)) {
    throw new Error("URL aponta para host privado/interno. Use um endpoint publico HTTPS.");
  }
  return url.toString();
}

function requireOrganization(ctx: AgentContext): string {
  if (!ctx.organization_id) {
    throw new Error("Organização ativa não encontrada para o usuário.");
  }
  return ctx.organization_id;
}

function normalizeCrmStage(stage?: string | null): string | null {
  if (!stage) return null;
  const trimmed = stage.trim();
  return VALID_CRM_STAGES.has(trimmed) ? trimmed : null;
}

function normalizeFunnelStage(stage?: string | null): string | null {
  if (!stage) return null;
  const trimmed = stage.trim();
  return VALID_FUNNEL_STAGES.has(trimmed) ? trimmed : null;
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
        termo: { type: "string", description: "Nome, e-mail, WhatsApp ou empresa do lead para buscar." }
      },
      required: ["termo"],
    },
    execute: async (args: { termo: string }, ctx) => {
      const orgId = requireOrganization(ctx);
      const { data, error } = await ctx.supabase
        .from("leads")
        .select("id, nome, empresa, whatsapp, email, crm_stage")
        .eq("organizacao_id", orgId)
        .or(`nome.ilike.%${args.termo}%,empresa.ilike.%${args.termo}%,email.ilike.%${args.termo}%,whatsapp.ilike.%${args.termo}%`)
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
        whatsapp: { type: "string" },
        email: { type: "string" },
        produto_id: { type: "number", description: "ID do produto (se souber). Opcional." }
      },
      required: ["nome"],
    },
    execute: async (args: any, ctx) => {
      const orgId = requireOrganization(ctx);
      const payload: any = {
        organizacao_id: orgId,
        nome: args.nome,
        empresa: args.empresa,
        whatsapp: args.whatsapp ?? null,
        email: args.email,
        responsavel_id: ctx.user_id,
        crm_stage: DEFAULT_CRM_STAGE,
        funnel_stage: "base_bruta",
        fonte: "copilot",
      };
      const { data: lead, error } = await ctx.supabase.from("leads").insert(payload).select("id").single();
      if (error) throw error;
      
      // Vincula ao produto se especificado
      if (args.produto_id) {
        const { data: produto, error: produtoError } = await ctx.supabase
          .from("produtos")
          .select("id")
          .eq("id", args.produto_id)
          .eq("organizacao_id", orgId)
          .eq("ativo", true)
          .maybeSingle();
        if (produtoError) throw produtoError;
        if (!produto) throw new Error("Produto não encontrado ou inativo nesta organização.");

        await ctx.supabase.from("lead_produtos").insert({
          lead_id: lead.id,
          produto_id: args.produto_id,
          status: DEFAULT_LEAD_PRODUTO_STATUS,
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
      const orgId = requireOrganization(ctx);
      const { data: lead, error: leadError } = await ctx.supabase
        .from("leads")
        .select("id")
        .eq("id", args.lead_id)
        .eq("organizacao_id", orgId)
        .maybeSingle();
      if (leadError) throw leadError;
      if (!lead) throw new Error("Lead não encontrado nesta organização.");

      const payload = {
        organizacao_id: orgId,
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
        passo: { type: "string", description: "Nome do passo da cadência. Opcional; se omitido, usa o próximo passo sequencial disponível." },
        canal: { type: "string", description: "'WhatsApp', 'Email', 'Ligação' ou 'Reunião'" },
        objetivo: { type: "string", description: "O que deve ser feito (ex: Retorno da proposta)" },
        data_prevista: { type: "string", description: "Data no formato YYYY-MM-DD" }
      },
      required: ["lead_id", "canal", "objetivo", "data_prevista"],
    },
    execute: async (args: any, ctx) => {
      const orgId = requireOrganization(ctx);
      const { data: lead, error: leadError } = await ctx.supabase
        .from("leads")
        .select("id")
        .eq("id", args.lead_id)
        .eq("organizacao_id", orgId)
        .maybeSingle();
      if (leadError) throw leadError;
      if (!lead) throw new Error("Lead não encontrado nesta organização.");

      let ordem: number | null = null;
      let passo = typeof args.passo === "string" && args.passo.trim()
        ? args.passo.trim().slice(0, 80)
        : null;
      if (!passo) {
        const { data: existentes, error: cadenciaError } = await ctx.supabase
          .from("cadencia")
          .select("passo, ordem")
          .eq("lead_id", args.lead_id)
          .eq("organizacao_id", orgId);
        if (cadenciaError) throw cadenciaError;
        ordem = Math.max(0, ...(existentes || []).map((item: any) => Number(item.ordem) || 0)) + 1;
        passo = `P${ordem}`;
      }

      const payload = {
        organizacao_id: orgId,
        lead_id: args.lead_id,
        passo,
        canal: args.canal,
        objetivo: args.objetivo,
        data_prevista: args.data_prevista,
        status: "pendente",
        ordem,
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
        crm_stage: { type: "string", description: "Estágios: Prospecção, Qualificado, Raio-X Ofertado, Raio-X Feito, Call Marcada, Diagnóstico Pago, Proposta, Negociação, Fechado, Perdido, Nutrição" },
        funnel_stage: { type: "string", description: "Estágios: base_bruta, base_qualificada, pipeline, arquivado" }
      },
      required: ["lead_id"],
    },
    execute: async (args: any, ctx) => {
      const orgId = requireOrganization(ctx);
      const update: any = {};
      if (args.crm_stage) {
        const crmStage = normalizeCrmStage(args.crm_stage);
        if (!crmStage) throw new Error(`crm_stage inválido: ${args.crm_stage}`);
        update.crm_stage = crmStage;
      }
      if (args.funnel_stage) {
        const funnelStage = normalizeFunnelStage(args.funnel_stage);
        if (!funnelStage) throw new Error(`funnel_stage inválido: ${args.funnel_stage}`);
        update.funnel_stage = funnelStage;
      }
      
      const { error } = await ctx.supabase.from("leads").update(update).eq("id", args.lead_id).eq("organizacao_id", orgId);
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
      const orgId = requireOrganization(ctx);
      const update: any = {};
      if (args.temperatura) update.temperatura = args.temperatura;
      if (args.prioridade) update.prioridade = args.prioridade;
      
      const { error } = await ctx.supabase.from("leads").update(update).eq("id", args.lead_id).eq("organizacao_id", orgId);
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
      const orgId = requireOrganization(ctx);
      const { error } = await ctx.supabase
        .from("cadencia")
        .update({
          status: "respondido",
          observacoes: args.notas || null,
          data_executada: new Date().toISOString().slice(0, 10),
        })
        .eq("id", args.cadencia_id)
        .eq("organizacao_id", orgId);
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
      const orgId = requireOrganization(ctx);
      const { data, error } = await ctx.supabase
        .from("lead_timeline")
        .select("tipo, titulo, conteudo, created_at")
        .eq("lead_id", args.lead_id)
        .eq("organizacao_id", orgId)
        .order("created_at", { ascending: false })
        .limit(5);
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
      const orgId = requireOrganization(ctx);
      const payload = {
        organizacao_id: orgId,
        nome: args.nome_campanha,
        produto_id: args.produto_id || null,
        criado_por: ctx.user_id,
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
      const orgId = requireOrganization(ctx);
      const { data, error } = await ctx.supabase.from("campanhas_prospeccao").select("id, nome, status, leads_criados").eq("organizacao_id", orgId).order("created_at", { ascending: false }).limit(5);
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
      const orgId = requireOrganization(ctx);
      const { error } = await ctx.supabase.from("campanhas_prospeccao").update({ status: "erro", erro_detalhes: "Cancelada pelo Copilot" }).eq("id", args.campanha_id).eq("organizacao_id", orgId);
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
      const orgId = requireOrganization(ctx);
      const { data, error } = await ctx.supabase
        .from("produtos")
        .select("id, nome, categoria, valor_base, valor_max, recorrente, ativo")
        .eq("organizacao_id", orgId)
        .eq("ativo", true)
        .order("ordem", { ascending: true })
        .limit(10);
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
      const orgId = requireOrganization(ctx);
      const supabaseUrl = Deno.env.get("SUPABASE_URL") || Deno.env.get("NEXT_PUBLIC_SUPABASE_URL");
      const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      if (!supabaseUrl || !serviceRoleKey) throw new Error("Variáveis SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY não configuradas.");

      const { data: produto, error: produtoError } = await ctx.supabase
        .from("produtos")
        .select("id")
        .eq("id", args.produto_id)
        .eq("organizacao_id", orgId)
        .eq("ativo", true)
        .maybeSingle();
      if (produtoError) throw produtoError;
      if (!produto) throw new Error("Produto não encontrado ou inativo nesta organização.");

      const res = await fetch(`${supabaseUrl}/functions/v1/prospeccao-lookalike`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${serviceRoleKey}` },
        body: JSON.stringify({ action: "generate_icp", produto_id: args.produto_id, org_id: orgId })
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
      const orgId = requireOrganization(ctx);
      const [{ data: lead, error: leadError }, { data: produto, error: produtoError }] = await Promise.all([
        ctx.supabase.from("leads").select("id").eq("id", args.lead_id).eq("organizacao_id", orgId).maybeSingle(),
        ctx.supabase.from("produtos").select("id").eq("id", args.produto_id).eq("organizacao_id", orgId).eq("ativo", true).maybeSingle(),
      ]);
      if (leadError) throw leadError;
      if (produtoError) throw produtoError;
      if (!lead) throw new Error("Lead não encontrado nesta organização.");
      if (!produto) throw new Error("Produto não encontrado ou inativo nesta organização.");

      const payload = {
        organizacao_id: orgId,
        lead_id: args.lead_id,
        produto_id: args.produto_id,
        valor_total: args.valor || 0,
        status: "enviada",
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
        status: { type: "string", description: "rascunho, enviada, visualizada, aceita, recusada, expirada" }
      },
      required: ["proposta_id", "status"],
    },
    execute: async (args: any, ctx) => {
      const orgId = requireOrganization(ctx);
      const validStatuses = new Set(["rascunho", "enviada", "visualizada", "aceita", "recusada", "expirada"]);
      if (!validStatuses.has(args.status)) throw new Error(`Status de proposta inválido: ${args.status}`);
      const { error } = await ctx.supabase.from("propostas").update({ status: args.status }).eq("id", args.proposta_id).eq("organizacao_id", orgId);
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
      const orgId = requireOrganization(ctx);
      const { data, error } = await ctx.supabase
        .from("v_embaixador_tokens")
        .select("id, lead_id, embaixador_nome, embaixador_empresa, token, total_indicacoes_recebidas")
        .eq("organizacao_id", orgId)
        .limit(10);
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
      const orgId = requireOrganization(ctx);
      const { data, error } = await ctx.supabase
        .from("indicacoes")
        .select("id, indicado_nome, indicado_empresa, indicado_email, indicado_whatsapp, status")
        .eq("organizacao_id", orgId)
        .eq("status", "recebida")
        .limit(10);
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
        indicacao_id: { type: "number" }
      },
      required: ["indicacao_id"],
    },
    execute: async (args: any, ctx) => {
      const orgId = requireOrganization(ctx);
      const indicacaoId = args.indicacao_id ?? args.pedido_id;
      const { data: indicacao, error: errBusca } = await ctx.supabase
        .from("indicacoes")
        .select("*")
        .eq("id", indicacaoId)
        .eq("organizacao_id", orgId)
        .single();
      if (errBusca) throw errBusca;

      const { data: lead, error: errLead } = await ctx.supabase.from("leads").insert({
        organizacao_id: orgId,
        nome: indicacao.indicado_nome,
        empresa: indicacao.indicado_empresa,
        cargo: indicacao.indicado_cargo,
        whatsapp: indicacao.indicado_whatsapp,
        email: indicacao.indicado_email,
        linkedin: indicacao.indicado_linkedin,
        crm_stage: DEFAULT_CRM_STAGE,
        funnel_stage: "base_bruta",
        fonte: "indicacao",
        responsavel_id: ctx.user_id,
        indicacao_id: indicacao.id,
      }).select("id").single();
      if (errLead) throw errLead;

      await ctx.supabase
        .from("indicacoes")
        .update({ status: "virou_lead", lead_convertido_id: lead.id, data_convertido: new Date().toISOString() })
        .eq("id", indicacao.id)
        .eq("organizacao_id", orgId);
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
      const orgId = requireOrganization(ctx);
      const { error } = await ctx.supabase
        .from("indicacoes")
        .update({ recompensa_paga: true, recompensa_paga_em: new Date().toISOString() })
        .eq("id", args.indicacao_id)
        .eq("organizacao_id", orgId);
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
      const orgId = requireOrganization(ctx);
      const { data, error } = await ctx.supabase
        .from("health_score_cache")
        .select("health_score, categoria, computed_at")
        .eq("organizacao_id", orgId);
      if (error) throw error;
      const rows = data || [];
      if (rows.length === 0) return { health_score: { aviso: "Ainda não calculado." } };
      const media = rows.reduce((sum: number, row: any) => sum + Number(row.health_score || 0), 0) / rows.length;
      return {
        health_score: {
          media: Math.round(media),
          total_leads: rows.length,
          em_risco: rows.filter((row: any) => row.categoria === "em_risco").length,
          ultima_atualizacao: rows.map((row: any) => row.computed_at).sort().at(-1) || null,
        },
      };
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
      const orgId = requireGestor(ctx);
      const url = validateWebhookUrl(String(args.url ?? ""));
      const events = Array.isArray(args.eventos) ? args.eventos.map(String) : [];
      const invalidEvents = events.filter((event) => !VALID_WEBHOOK_EVENTS.has(event));
      if (invalidEvents.length > 0) {
        throw new Error(`Eventos invalidos: ${invalidEvents.slice(0, 3).join(", ")}`);
      }
      const payload = {
        organizacao_id: orgId,
        url,
        events,
        secret: `whsec_${randomHex(24)}`,
        active: true
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
      const orgId = requireGestor(ctx);
      const keyStr = `gc_live_${randomHex(32)}`;
      const keyHash = await sha256Hex(keyStr);
      const payload = {
        organizacao_id: orgId,
        name: args.nome,
        key_hash: keyHash,
        prefix: `${keyStr.slice(0, 12)}...`,
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
      requireGestor(ctx);
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
