import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentOrgId, getCurrentRole } from "@/lib/supabase/org";
import { createClient } from "@/lib/supabase/server";
import { ArrowRight, BookOpen, Workflow } from "lucide-react";
import TemplatesClient from "./templates-client";
import type { TemplateDB } from "./actions";

export const dynamic = "force-dynamic";

export default async function CadenciaConfigPage() {
  const role = await getCurrentRole();
  if (role !== "gestor") redirect("/configuracoes/perfil");

  const orgId = await getCurrentOrgId();
  if (!orgId) redirect("/hoje");

  const supabase = createClient();
  const { data } = await supabase
    .from("cadencia_templates")
    .select("*")
    .eq("organizacao_id", orgId)
    .eq("ativo", true)
    .order("passo")
    .order("canal")
    .order("versao", { ascending: false });

  const templates = (data ?? []) as TemplateDB[];

  return (
    <div className="max-w-3xl space-y-6">
      <div className="card p-6">
        <div className="flex items-center gap-2 mb-1">
          <BookOpen className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-semibold">Templates de Cadência</h2>
        </div>
        <p className="text-sm text-muted-foreground mb-6">
          Personalize as mensagens da cadência D0→D30 para sua organização. Os templates aqui sobrepõem os padrões da plataforma.
          Editar um template cria uma nova versão — o histórico completo fica disponível para restauração.
        </p>

        <Link
          href="/configuracoes/cadencia/fluxos"
          className="mb-6 flex items-center justify-between gap-3 rounded-lg border border-primary/15 bg-primary/5 p-3 text-sm hover:border-primary/30 hover:bg-primary/10 transition-colors"
        >
          <span className="flex items-center gap-2 min-w-0">
            <Workflow className="w-4 h-4 text-primary shrink-0" />
            <span>
              <span className="font-medium text-foreground">Editar fluxo completo</span>
              <span className="block text-xs text-muted-foreground">
                Configure número de passos, dias, canais e diretrizes usadas ao iniciar novas cadências.
              </span>
            </span>
          </span>
          <ArrowRight className="w-4 h-4 text-primary shrink-0" />
        </Link>

        <div className="mb-6 p-3 rounded-lg bg-primary/5 border border-primary/15 text-xs text-muted-foreground space-y-1">
          <p><strong>Variáveis disponíveis:</strong></p>
          <p><code className="text-primary">{"{{nome}}"}</code> — nome do contato &nbsp;|&nbsp; <code className="text-primary">{"{{empresa}}"}</code> — empresa do lead &nbsp;|&nbsp; <code className="text-primary">{"{{dor}}"}</code> — dor principal &nbsp;|&nbsp; <code className="text-primary">{"{{vendedor}}"}</code> — seu nome</p>
          <p className="mt-1"><strong>Fallback:</strong> se nenhum template personalizado existir para um passo, o padrão da biblioteca é usado automaticamente.</p>
        </div>

        <TemplatesClient initial={templates} />
      </div>
    </div>
  );
}
