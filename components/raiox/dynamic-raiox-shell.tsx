"use client";

import { useState, useEffect } from "react";
import { Loader2, CheckCircle2, ChevronRight, ChevronLeft, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "react-hot-toast";
import { createClient } from "@/lib/supabase/client";
import { concluirRaioXDinamico } from "@/app/(app)/raio-x/actions";

type Question = {
  id: string;
  tipo: "text" | "select" | "textarea" | "number";
  label: string;
  obrigatorio?: boolean;
  opcoes?: string[];
};

type Section = {
  id: string;
  titulo: string;
  perguntas: Question[];
};

type RaioxConfig = {
  secoes: Section[];
};

type DynamicRaioXShellProps = {
  leadId: number;
  template: {
    id: number;
    config_json: RaioxConfig;
  };
  onComplete?: () => void;
};

export default function DynamicRaioXShell({ leadId, template, onComplete }: DynamicRaioXShellProps) {
  const supabase = createClient();
  const config = template.config_json;
  const secoes = config.secoes || [];
  
  const [currentStep, setCurrentStep] = useState(0);
  const [respostas, setRespostas] = useState<Record<string, any>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [respostaId, setRespostaId] = useState<number | null>(null);

  useEffect(() => {
    async function fetchRespostas() {
      const { data } = await supabase
        .from("raiox_respostas")
        .select("*")
        .eq("lead_id", leadId)
        .eq("template_id", template.id)
        .single();
        
      if (data) {
        setRespostas(data.respostas_json || {});
        setRespostaId(data.id);
        setCurrentStep(data.progresso_step || 0);
      }
      setIsLoading(false);
    }
    fetchRespostas();
  }, [leadId, template.id, supabase]);

  const handleNext = async () => {
    await saveProgress(currentStep + 1);
    if (currentStep < secoes.length - 1) {
      setCurrentStep(c => c + 1);
    } else {
      // Finalizado
      setIsSaving(true);
      try {
        await concluirRaioXDinamico(leadId, template.id);
        toast.success("Raio-X concluído e avaliado com IA!");
        if (onComplete) onComplete();
      } catch (error: any) {
        toast.error(error.message || "Erro ao concluir Raio-X.");
        console.error(error);
      } finally {
        setIsSaving(false);
      }
    }
  };

  const handlePrev = async () => {
    if (currentStep > 0) {
      await saveProgress(currentStep - 1);
      setCurrentStep(c => c - 1);
    }
  };

  const saveProgress = async (step: number) => {
    setIsSaving(true);
    try {
      if (respostaId) {
        await supabase
          .from("raiox_respostas")
          .update({ 
            respostas_json: respostas,
            progresso_step: step,
            concluido: step >= secoes.length
          })
          .eq("id", respostaId);
      } else {
        const { data } = await supabase
          .from("raiox_respostas")
          .insert([{
            lead_id: leadId,
            template_id: template.id,
            respostas_json: respostas,
            progresso_step: step,
            concluido: step >= secoes.length
          }])
          .select()
          .single();
          
        if (data) setRespostaId(data.id);
      }
    } catch (error) {
      console.error(error);
      toast.error("Erro ao salvar progresso.");
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (secoes.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        Nenhuma seção configurada neste Raio-X.
      </div>
    );
  }

  const currentSection = secoes[currentStep];

  return (
    <div className="space-y-6 max-w-2xl mx-auto py-6">
      {/* Progresso Segmentado (Baseado no OnboardingShell) */}
      <div className="mb-8">
        <div className="flex items-center justify-between gap-1 mb-2">
          {secoes.map((sec, idx) => (
            <div key={sec.id} className="flex-1 flex flex-col items-center gap-1">
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold transition-all duration-300
                  ${currentStep === idx 
                    ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/30' 
                    : currentStep > idx
                      ? 'bg-primary/20 text-primary border border-primary/30'
                      : 'bg-secondary text-muted-foreground border border-border'
                  }
                `}
              >
                {currentStep > idx ? <CheckCircle2 className="w-3 h-3" /> : idx + 1}
              </div>
              <span className={`text-[10px] font-medium tracking-tight line-clamp-1 px-1 text-center ${
                currentStep >= idx ? 'text-foreground' : 'text-muted-foreground'
              }`}>
                {sec.titulo}
              </span>
            </div>
          ))}
        </div>
        
        {/* Barras de Conexão */}
        <div className="flex gap-1 px-4">
          {secoes.slice(0, -1).map((_, i) => (
            <div key={i} className="flex-1 h-1 rounded-full overflow-hidden bg-secondary">
              <div 
                className="h-full bg-primary transition-all duration-500 ease-out"
                style={{ width: currentStep > i ? '100%' : currentStep === i ? '50%' : '0%' }}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Conteúdo do Bloco Atual */}
      <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
        <h3 className="text-lg font-semibold mb-4">{currentSection.titulo}</h3>
        
        <div className="space-y-5">
          {currentSection.perguntas.map((q) => (
            <div key={q.id}>
              <label className="block text-sm font-medium mb-1.5">
                {q.label} {q.obrigatorio && <span className="text-destructive">*</span>}
              </label>
              
              {q.tipo === "text" && (
                <input 
                  type="text"
                  className="w-full bg-background border border-border rounded px-3 py-2 text-sm focus:ring-1 focus:ring-primary outline-none"
                  value={respostas[q.id] || ""}
                  onChange={(e) => setRespostas({ ...respostas, [q.id]: e.target.value })}
                />
              )}

              {q.tipo === "textarea" && (
                <textarea 
                  className="w-full bg-background border border-border rounded px-3 py-2 text-sm focus:ring-1 focus:ring-primary outline-none min-h-[100px]"
                  value={respostas[q.id] || ""}
                  onChange={(e) => setRespostas({ ...respostas, [q.id]: e.target.value })}
                />
              )}

              {q.tipo === "select" && (
                <select 
                  className="w-full bg-background border border-border rounded px-3 py-2 text-sm focus:ring-1 focus:ring-primary outline-none"
                  value={respostas[q.id] || ""}
                  onChange={(e) => setRespostas({ ...respostas, [q.id]: e.target.value })}
                >
                  <option value="">Selecione...</option>
                  {q.opcoes?.map(opt => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              )}

              {q.tipo === "number" && (
                <input 
                  type="number"
                  className="w-full bg-background border border-border rounded px-3 py-2 text-sm focus:ring-1 focus:ring-primary outline-none"
                  value={respostas[q.id] || ""}
                  onChange={(e) => setRespostas({ ...respostas, [q.id]: e.target.value })}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Controles de Navegação */}
      <div className="flex items-center justify-between pt-2">
        <Button 
          variant="outline" 
          onClick={handlePrev} 
          disabled={currentStep === 0 || isSaving}
        >
          <ChevronLeft className="w-4 h-4 mr-2" />
          Anterior
        </Button>
        
        <div className="flex items-center gap-2">
          {isSaving && <span className="text-xs text-muted-foreground flex items-center gap-1"><Save className="w-3 h-3 animate-pulse"/> Salvando...</span>}
          
          <Button onClick={handleNext} disabled={isSaving}>
            {currentStep === secoes.length - 1 ? "Concluir Raio-X" : "Próximo"}
            {currentStep < secoes.length - 1 && <ChevronRight className="w-4 h-4 ml-2" />}
          </Button>
        </div>
      </div>
    </div>
  );
}
