"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { finalizarOnboarding } from "@/app/onboarding/actions";

export default function OnboardingWizard({ nome, empresa }: { nome: string; empresa: string }) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // Form state
  const [segmento, setSegmento] = useState("");
  const [dor, setDor] = useState("");
  const [cargo, setCargo] = useState("");
  const [gerarDemo, setGerarDemo] = useState(true);

  async function concluir() {
    setLoading(true);
    setErro(null);
    try {
      await finalizarOnboarding({
        segmento,
        dor_principal: dor,
        cargo_foco: cargo,
        gerarDemo
      });
      // Tudo certo, vai pro app
      router.push("/hoje");
      router.refresh();
    } catch (e: any) {
      setErro(e.message || "Erro inesperado");
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-lg card p-8 transition-all relative overflow-hidden">
      {loading && (
        <div className="absolute inset-0 bg-white/80 backdrop-blur flex flex-col items-center justify-center z-10">
          <div className="w-12 h-12 rounded-full border-4 border-guild-200 border-t-guild-600 animate-spin mb-4"></div>
          <p className="font-medium text-slate-700 animate-pulse">Preparando seu ambiente...</p>
          <p className="text-xs text-slate-500 mt-2">Criando organização e motores de IA</p>
        </div>
      )}

      {/* Progress Bar */}
      <div className="flex gap-2 mb-8">
        {[1, 2, 3].map((s) => (
          <div key={s} className={`h-1.5 flex-1 rounded-full ${s <= step ? "bg-guild-600" : "bg-slate-100"}`} />
        ))}
      </div>

      {step === 1 && (
        <div className="animate-in fade-in slide-in-from-right-4">
          <h2 className="text-2xl font-bold text-slate-800 mb-2">Bem-vindo, {nome}!</h2>
          <p className="text-slate-600 mb-8">
            Vamos preparar a <strong>{empresa}</strong> para operar com inteligência e escala. 
            Isso vai levar menos de 1 minuto.
          </p>
          <div className="space-y-4">
            <div>
              <label className="label mb-1">Qual o seu segmento de mercado?</label>
              <select 
                className="input-base"
                value={segmento}
                onChange={e => setSegmento(e.target.value)}
              >
                <option value="">Selecione...</option>
                <option value="SaaS / Tecnologia">SaaS / Tecnologia</option>
                <option value="Serviços B2B">Serviços B2B</option>
                <option value="Saúde / Clínicas">Saúde / Clínicas</option>
                <option value="Imobiliário">Imobiliário</option>
                <option value="Indústria">Indústria</option>
                <option value="Outro">Outro</option>
              </select>
            </div>
          </div>
          <button 
            disabled={!segmento}
            onClick={() => setStep(2)} 
            className="btn-primary w-full mt-8"
          >
            Continuar
          </button>
        </div>
      )}

      {step === 2 && (
        <div className="animate-in fade-in slide-in-from-right-4">
          <h2 className="text-2xl font-bold text-slate-800 mb-2">Perfil do Cliente Ideal</h2>
          <p className="text-slate-600 mb-8">
            A IA vai usar isso para gerar emails e scripts personalizados.
          </p>
          <div className="space-y-4">
            <div>
              <label className="label mb-1">Cargo do Decisor</label>
              <input 
                className="input-base" placeholder="Ex: Diretor de RH, Sócio, Gerente de TI"
                value={cargo} onChange={e => setCargo(e.target.value)}
              />
            </div>
            <div>
              <label className="label mb-1">Qual a principal dor que você resolve?</label>
              <textarea 
                className="input-base min-h-[80px]" placeholder="Ex: Baixa eficiência operacional, perda de vendas, retrabalho..."
                value={dor} onChange={e => setDor(e.target.value)}
              />
            </div>
          </div>
          <div className="flex gap-4 mt-8">
            <button onClick={() => setStep(1)} className="btn-secondary flex-1">Voltar</button>
            <button 
              disabled={!cargo || !dor}
              onClick={() => setStep(3)} 
              className="btn-primary flex-1"
            >
              Continuar
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="animate-in fade-in slide-in-from-right-4">
          <h2 className="text-2xl font-bold text-slate-800 mb-2">Tudo pronto!</h2>
          <p className="text-slate-600 mb-8">
            O ambiente da {empresa} foi desenhado. Você já pode convidar seu time depois pelo painel.
          </p>
          
          <label className="flex items-start gap-3 p-4 rounded-xl border border-slate-200 cursor-pointer hover:bg-slate-50 transition-colors">
            <input 
              type="checkbox" 
              className="mt-1 w-4 h-4 text-guild-600 rounded"
              checked={gerarDemo}
              onChange={e => setGerarDemo(e.target.checked)}
            />
            <div>
              <div className="font-medium text-slate-800">Gerar lead de demonstração</div>
              <div className="text-sm text-slate-500">
                Criar um lead falso para eu testar a automação e as cadências assim que entrar.
              </div>
            </div>
          </label>

          {erro && <div className="mt-4 text-sm text-urgent-500 bg-red-50 border border-red-200 rounded-lg p-2">{erro}</div>}

          <div className="flex gap-4 mt-8">
            <button onClick={() => setStep(2)} className="btn-secondary flex-1">Voltar</button>
            <button 
              onClick={concluir} 
              className="btn-primary flex-[2]"
            >
              Finalizar Setup
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
