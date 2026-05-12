import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentOrgId, getCurrentRole } from "@/lib/supabase/org";
import { createClient } from "@/lib/supabase/server";
import { BookOpen, Workflow, ArrowRight } from "lucide-react";
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
      {/* Quick-link pros fluxos visuais (substitui o D0/D3/D7/D11 hardcoded) */}
      <Link href="/configuracoes/cadencia/fluxos" className="card p-4 flex items-start gap-3 hover:border-primary/40 transition-colors group">
        <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary grid place-items-center shrink-0">
          <Workflow className="w-5 h-5" />
        </div>
        <div className="flex-1">
          <div className="font-semibold text-sm inline-flex items-center gap-1">
            Fluxos de cadência customizáveis
            <ArrowRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Sequências configuráveis (passos, offsets, canais, regras) — substitui o D0/D3/D7/D11 fixo.
            Crie múltiplos fluxos pra diferentes triggers (cold outbound, pós-evento, re-engajamento).
          </p>
        </div>
      </Link>

      <div className="card p-6">
        <div className="flex items-center gap-2 mb-1">
          <BookOpen className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-semibold">Templates de Cadência</h2>
        </div>
        <p className="text-sm text-muted-foreground mb-6">
          Personalize as mensagens da cadência D0→D30 para sua organização. Os templates aqui sobrepõem os padrões da plataforma.
          Editar um template cria uma nova versão — o histórico completo fica disponível para restauração.
        </p>

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
