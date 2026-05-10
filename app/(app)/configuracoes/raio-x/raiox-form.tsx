"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { AlertCircle, CheckCircle2, X } from "lucide-react";

export default function RaioXForm({ template }: { template: any }) {
  const supabase = createClient();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [configJson, setConfigJson] = useState(
    JSON.stringify(template?.config_json || { secoes: [] }, null, 2)
  );
  const [nome, setNome] = useState(template?.nome || "Raio-X Padrão");
  const [feedback, setFeedback] = useState<{ tipo: "sucesso" | "erro"; mensagem: string } | null>(null);

  useEffect(() => {
    if (!feedback) return;
    const ms = feedback.tipo === "sucesso" ? 2500 : 4500;
    const timer = setTimeout(() => setFeedback(null), ms);
    return () => clearTimeout(timer);
  }, [feedback]);

  async function handleSave() {
    setIsSubmitting(true);
    try {
      let parsedJson;
      try {
        parsedJson = JSON.parse(configJson);
      } catch (err) {
        setFeedback({ tipo: "erro", mensagem: "Formato JSON inválido. Verifique a sintaxe." });
        setIsSubmitting(false);
        return;
      }

      if (template?.id) {
        // Atualizar
        const { error } = await supabase
          .from("raiox_templates")
          .update({ nome, config_json: parsedJson })
          .eq("id", template.id);
        
        if (error) throw error;
      } else {
        // Para uma implementação mais robusta, lidar com a criação aqui se o template não existisse.
        // Mas a page.tsx vai garantir que exista.
      }
      
      setFeedback({ tipo: "sucesso", mensagem: "Configuração do Raio-X salva com sucesso!" });
    } catch (error) {
      console.error(error);
      setFeedback({ tipo: "erro", mensagem: "Erro ao salvar configuração." });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-1">Nome do Formulário</label>
        <input 
          type="text" 
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          className="w-full bg-background border border-border rounded px-3 py-2 text-sm"
          placeholder="Ex: Raio-X Padrão"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1 flex justify-between items-center">
          <span>Configuração JSON (MVP)</span>
        </label>
        <p className="text-xs text-muted-foreground mb-2">
          Edite a estrutura do formulário em formato JSON. Defina seções, perguntas (text, select) e opções.
        </p>
        <textarea 
          value={configJson}
          onChange={(e) => setConfigJson(e.target.value)}
          className="w-full h-[400px] bg-background border border-border rounded px-3 py-2 text-sm font-mono"
        />
      </div>

      <div className="flex justify-end">
        <button className="btn-primary" type="button" onClick={handleSave} disabled={isSubmitting}>
          {isSubmitting ? "Salvando..." : "Salvar Configuração"}
        </button>
      </div>

      {feedback && (
        <div
          role="status"
          aria-live="polite"
          className={`fixed bottom-24 right-6 md:right-8 md:bottom-28 z-[100] max-w-sm card p-3 flex items-start gap-2.5 shadow-stripe-md animate-in fade-in slide-in-from-bottom-2 ${
            feedback.tipo === "sucesso"
              ? "border-success-500/30 bg-success-500/5"
              : "border-destructive/30 bg-destructive/5"
          }`}
        >
          {feedback.tipo === "sucesso" ? (
            <CheckCircle2 className="w-4 h-4 text-success-500 mt-0.5 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
          )}
          <span className="text-sm text-foreground flex-1">{feedback.mensagem}</span>
          <button type="button" onClick={() => setFeedback(null)} className="text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
