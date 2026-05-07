import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const supabase = await createClient();

  // Verifica autenticação
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verifica perfil
  const { data: profile } = await supabase
    .from("profiles")
    .select("organizacao_id, role")
    .eq("id", user.id)
    .single();

  if (!profile || !profile.organizacao_id) {
    return NextResponse.json({ error: "No organization found" }, { status: 403 });
  }

  const orgId = profile.organizacao_id;
  const isGestor = profile.role === "gestor";

  // Extrai query params
  const { searchParams } = new URL(req.url);
  const tab = searchParams.get("tab") || "bruta";
  const q = searchParams.get("q")?.trim() || "";
  const respParam = searchParams.get("resp");
  const tempParam = searchParams.get("temp");
  const prioridadeParam = searchParams.get("prioridade");
  const stageParam = searchParams.get("stage");

  const respFiltro = isGestor ? (respParam ?? "all") : user.id;

  // Monta a query sem limit() para trazer todos os registros filtrados
  let query = supabase
    .from("v_leads_enriched")
    .select("*")
    .eq("organizacao_id", orgId)
    .order("created_at", { ascending: false });

  if (tab !== "todos") {
    query = query.eq("funnel_stage", tab === "bruta" ? "base_bruta" : "base_qualificada");
  }

  if (respFiltro !== "all") query = query.eq("responsavel_id", respFiltro);
  
  if (tempParam) query = query.eq("temperatura", tempParam);
  if (prioridadeParam) query = query.eq("prioridade", prioridadeParam);
  if (stageParam) query = query.eq("crm_stage", stageParam);

  if (q) {
    const limpo = q.replace(/[,()]/g, " ").replace(/\*/g, "_").trim();
    if (limpo.length >= 2) {
      query = query.or(`empresa.ilike.%${limpo}%,nome.ilike.%${limpo}%,email.ilike.%${limpo}%`);
    }
  }

  const { data: leads, error } = await query;

  if (error) {
    console.error("Erro ao exportar leads:", error);
    return NextResponse.json({ error: "Failed to fetch leads" }, { status: 500 });
  }

  if (!leads || leads.length === 0) {
    return NextResponse.json({ error: "No data to export" }, { status: 404 });
  }

  // Gera o CSV
  // Define os headers que queremos exportar
  const headers = [
    "ID", "Funil", "Fase CRM", "Temperatura", "Prioridade", "Empresa", "Nome", 
    "Cargo", "Email", "WhatsApp", "LinkedIn", "Instagram", "Segmento", 
    "Cidade/UF", "Site", "Fonte", "Responsável", "Demo", "Criado Em", "Atualizado Em"
  ];

  // Helper para escapar valores no CSV
  const escapeCsv = (val: any) => {
    if (val === null || val === undefined) return '""';
    const str = String(val);
    // Se tiver vírgula, aspa ou quebra de linha, precisamos colocar entre aspas e dobrar aspas internas
    if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const csvRows = [];
  csvRows.push(headers.join(",")); // header row

  for (const lead of leads) {
    const row = [
      lead.id,
      lead.funnel_stage,
      lead.crm_stage,
      lead.temperatura,
      lead.prioridade,
      lead.empresa,
      lead.nome,
      lead.cargo,
      lead.email,
      lead.whatsapp,
      lead.linkedin,
      lead.instagram,
      lead.segmento,
      lead.cidade_uf,
      lead.site,
      lead.fonte,
      lead.responsavel_nome || lead.responsavel_id,
      lead.is_demo ? "Sim" : "Não",
      lead.created_at ? new Date(lead.created_at).toLocaleString('pt-BR') : "",
      lead.updated_at ? new Date(lead.updated_at).toLocaleString('pt-BR') : ""
    ];
    csvRows.push(row.map(escapeCsv).join(","));
  }

  const csvString = csvRows.join("\n");

  // Adiciona BOM (Byte Order Mark) para o Excel abrir UTF-8 corretamente
  const bom = "\uFEFF";
  
  return new NextResponse(bom + csvString, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="leads_export.csv"',
    },
  });
}
