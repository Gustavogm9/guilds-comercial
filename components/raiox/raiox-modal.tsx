"use client";

import { useEffect, useState } from "react";
import { X, Loader2 } from "lucide-react";
import DynamicRaioXShell from "./dynamic-raiox-shell";
import { createClient } from "@/lib/supabase/client";

export default function RaioxModal({ 
  open, 
  onClose, 
  leadId 
}: { 
  open: boolean; 
  onClose: () => void; 
  leadId: number; 
}) {
  const [template, setTemplate] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    if (!open) return;
    
    async function loadTemplate() {
      setIsLoading(true);
      // Fetch org_id based on lead or current session.
      // Better to fetch template where org_id matches lead's org.
      // For simplicity in client, we just fetch the template for this org (RLS protects it)
      const { data } = await supabase
        .from("raiox_templates")
        .select("*")
        .limit(1)
        .single();
        
      if (data) {
        setTemplate(data);
      }
      setIsLoading(false);
    }
    
    loadTemplate();
  }, [open, supabase]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
      <div className="bg-card w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-xl border border-border shadow-lg flex flex-col relative animate-in fade-in zoom-in-95">
        
        <div className="sticky top-0 bg-card/90 backdrop-blur border-b border-border p-4 flex justify-between items-center z-10">
          <h2 className="text-lg font-semibold tracking-tight">Diagnóstico Raio-X</h2>
          <button 
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-secondary text-muted-foreground transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="p-2 md:p-6 flex-1">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
              <Loader2 className="w-8 h-8 animate-spin mb-4" />
              <p>Carregando estrutura do Raio-X...</p>
            </div>
          ) : !template ? (
            <div className="text-center py-20 text-muted-foreground">
              Nenhum template de Raio-X configurado pela sua organização.
            </div>
          ) : (
            <DynamicRaioXShell 
              leadId={leadId} 
              template={template} 
              onComplete={onClose} 
            />
          )}
        </div>
        
      </div>
    </div>
  );
}
