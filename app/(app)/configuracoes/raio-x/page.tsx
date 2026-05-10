import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getCurrentOrgId, getCurrentRole } from "@/lib/supabase/org";
import { Stethoscope } from "lucide-react";
import RaioXForm from "./raiox-form";

export const dynamic = "force-dynamic";

export default async function ConfiguracoesRaioXPage() {
  const role = await getCurrentRole();
  if (role !== "gestor") redirect("/configuracoes/perfil");

  const orgId = await getCurrentOrgId();
  if (!orgId) redirect("/hoje");

  const supabase = createClient();
  
  // Buscar template existente
  let { data: template } = await supabase
    .from("raiox_templates")
    .select("*")
    .eq("organizacao_id", orgId)
    .single();

  // Se não existir, criar um template padrão na hora
  if (!template) {
    const defaultTemplate = {
      organizacao_id: orgId,
      nome: "Raio-X Padrão",
      config_json: {
        secoes: [
          {
            id: "sec_perfil",
            titulo: "1. Perfil",
            perguntas: [
              {
                id: "q_desafio",
                tipo: "text",
                label: "Qual o seu principal desafio hoje?",
                obrigatorio: true
              },
              {
                id: "q_ferramenta",
                tipo: "select",
                label: "Qual ferramenta principal você utiliza?",
                opcoes: ["Planilha", "Sistema Próprio", "Sistema de Mercado", "Nenhuma"],
                obrigatorio: true
              }
            ]
          }
        ]
      }
    };

    const { data: novoTemplate, error } = await supabase
      .from("raiox_templates")
      .insert([defaultTemplate])
      .select()
      .single();

    if (!error && novoTemplate) {
      template = novoTemplate;
    }
  }

  return (
    <div className="max-w-3xl space-y-4">
      <div className="card p-6">
        <h2 className="text-lg font-semibold flex items-center gap-2 mb-2">
          <Stethoscope className="w-5 h-5 text-primary" />
          Configuração do Raio-X
        </h2>
        <p className="text-sm text-muted-foreground mb-6">
          Defina as perguntas e blocos do diagnóstico para a sua organização.
        </p>

        <RaioXForm template={template} />
      </div>
    </div>
  );
}
