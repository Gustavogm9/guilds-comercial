"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "react-hot-toast";
import { Button } from "@/components/ui/button";

export default function RaioXForm({ template }: { template: any }) {
  const supabase = createClient();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [configJson, setConfigJson] = useState(
    JSON.stringify(template?.config_json || { secoes: [] }, null, 2)
  );
  const [nome, setNome] = useState(template?.nome || "Raio-X Padrão");

  async function handleSave() {
    setIsSubmitting(true);
    try {
      let parsedJson;
      try {
        parsedJson = JSON.parse(configJson);
      } catch (err) {
        toast.error("Formato JSON inválido. Verifique a sintaxe.");
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
      
      toast.success("Configuração do Raio-X salva com sucesso!");
    } catch (error) {
      console.error(error);
      toast.error("Erro ao salvar configuração.");
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
        <Button onClick={handleSave} disabled={isSubmitting}>
          {isSubmitting ? "Salvando..." : "Salvar Configuração"}
        </Button>
      </div>
    </div>
  );
}
