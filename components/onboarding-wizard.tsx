"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bot, Mail, Plus, Trash2 } from "lucide-react";
import { finalizarOnboarding } from "@/app/onboarding/actions";
import type { Role } from "@/lib/types";

type InviteDraft = {
  email: string;
  role: Role;
};

export default function OnboardingWizard({ nome, empresa }: { nome: string; empresa: string }) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const [segmento, setSegmento] = useState("");
  const [dor, setDor] = useState("");
  const [cargo, setCargo] = useState("");
  const [convites, setConvites] = useState<InviteDraft[]>([{ email: "", role: "comercial" }]);
  const [habilitarIA, setHabilitarIA] = useState(true);
  const [gerarDemo, setGerarDemo] = useState(true);

  const convitesValidos = convites
    .map((convite) => ({ ...convite, email: convite.email.trim().toLowerCase() }))
    .filter((convite) => convite.email.includes("@"));

  async function concluir() {
    setLoading(true);
    setErro(null);
    try {
      await finalizarOnboarding({
        segmento,
        dor_principal: dor,
        cargo_foco: cargo,
        convites: convitesValidos,
        habilitarIA,
        gerarDemo,
      });
      router.push("/hoje");
      router.refresh();
    } catch (e: any) {
      setErro(e.message || "Erro inesperado");
      setLoading(false);
    }
  }

  function atualizarConvite(index: number, patch: Partial<InviteDraft>) {
    setConvites((atuais) => atuais.map((convite, i) => i === index ? { ...convite, ...patch } : convite));
  }

  function adicionarConvite() {
    setConvites((atuais) => atuais.length >= 5 ? atuais : [...atuais, { email: "", role: "comercial" }]);
  }

  function removerConvite(index: number) {
    setConvites((atuais) => atuais.length === 1 ? [{ email: "", role: "comercial" }] : atuais.filter((_, i) => i !== index));
  }

  return (
    <div className="w-full max-w-2xl card p-6 md:p-8 transition-all relative overflow-hidden">
      {loading && (
        <div className="absolute inset-0 bg-white/85 backdrop-blur flex flex-col items-center justify-center z-10">
          <div className="w-12 h-12 rounded-full border-4 border-guild-200 border-t-guild-600 animate-spin mb-4" />
          <p className="font-medium text-slate-700 animate-pulse">Preparando seu ambiente...</p>
          <p className="text-xs text-slate-500 mt-2">Criando operacao, IA, convites e dados iniciais</p>
        </div>
      )}

      <div className="flex gap-2 mb-8">
        {[1, 2, 3, 4].map((s) => (
          <div key={s} className={`h-1.5 flex-1 rounded-full ${s <= step ? "bg-guild-600" : "bg-slate-100"}`} />
        ))}
      </div>

      {step === 1 && (
        <div className="animate-in fade-in slide-in-from-right-4">
          <h2 className="text-2xl font-bold text-slate-800 mb-2">Bem-vindo, {nome}.</h2>
          <p className="text-slate-600 mb-8">
            Vamos ajustar a operacao da <strong>{empresa}</strong> para o seu mercado.
          </p>
          <div>
            <label className="label mb-1">Segmento de mercado</label>
            <select className="input-base" value={segmento} onChange={(e) => setSegmento(e.target.value)}>
              <option value="">Selecione...</option>
              <option value="SaaS / Tecnologia">SaaS / Tecnologia</option>
              <option value="Servicos B2B">Servicos B2B</option>
              <option value="Saude / Clinicas">Saude / Clinicas</option>
              <option value="Imobiliario">Imobiliario</option>
              <option value="Industria">Industria</option>
              <option value="Educacao">Educacao</option>
              <option value="Outro">Outro</option>
            </select>
          </div>
          <button disabled={!segmento} onClick={() => setStep(2)} className="btn-primary w-full mt-8">
            Continuar
          </button>
        </div>
      )}

      {step === 2 && (
        <div className="animate-in fade-in slide-in-from-right-4">
          <h2 className="text-2xl font-bold text-slate-800 mb-2">Cliente ideal</h2>
          <p className="text-slate-600 mb-8">Esse contexto entra nos scripts, cadencias e proximas acoes.</p>
          <div className="space-y-4">
            <div>
              <label className="label mb-1">Cargo do decisor</label>
              <input
                className="input-base"
                placeholder="Ex: Diretor de RH, Socio, Gerente de TI"
                value={cargo}
                onChange={(e) => setCargo(e.target.value)}
              />
            </div>
            <div>
              <label className="label mb-1">Principal dor que voce resolve</label>
              <textarea
                className="input-base min-h-[92px]"
                placeholder="Ex: baixa eficiencia operacional, perda de vendas, retrabalho..."
                value={dor}
                onChange={(e) => setDor(e.target.value)}
              />
            </div>
          </div>
          <div className="flex gap-4 mt-8">
            <button onClick={() => setStep(1)} className="btn-secondary flex-1">Voltar</button>
            <button disabled={!cargo || !dor} onClick={() => setStep(3)} className="btn-primary flex-1">
              Continuar
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="animate-in fade-in slide-in-from-right-4">
          <div className="flex items-center gap-2 mb-2">
            <Mail className="w-5 h-5 text-guild-700" />
            <h2 className="text-2xl font-bold text-slate-800">Convide seu time</h2>
          </div>
          <p className="text-slate-600 mb-6">Voce pode pular agora e convidar depois em Equipe.</p>

          <div className="space-y-3">
            {convites.map((convite, index) => (
              <div key={index} className="grid grid-cols-[1fr_132px_36px] gap-2 items-end">
                <div>
                  <label className="label mb-1">Email</label>
                  <input
                    type="email"
                    className="input-base"
                    placeholder="pessoa@empresa.com"
                    value={convite.email}
                    onChange={(e) => atualizarConvite(index, { email: e.target.value })}
                  />
                </div>
                <div>
                  <label className="label mb-1">Papel</label>
                  <select
                    className="input-base"
                    value={convite.role}
                    onChange={(e) => atualizarConvite(index, { role: e.target.value as Role })}
                  >
                    <option value="comercial">Comercial</option>
                    <option value="sdr">SDR</option>
                    <option value="gestor">Gestor</option>
                  </select>
                </div>
                <button type="button" onClick={() => removerConvite(index)} className="btn-ghost h-10 px-0" aria-label="Remover convite">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>

          <button type="button" onClick={adicionarConvite} disabled={convites.length >= 5} className="btn-secondary mt-4 text-sm">
            <Plus className="w-4 h-4" /> Adicionar convite
          </button>

          <div className="flex gap-4 mt-8">
            <button onClick={() => setStep(2)} className="btn-secondary flex-1">Voltar</button>
            <button onClick={() => setStep(4)} className="btn-primary flex-1">Continuar</button>
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="animate-in fade-in slide-in-from-right-4">
          <h2 className="text-2xl font-bold text-slate-800 mb-2">Setup final</h2>
          <p className="text-slate-600 mb-6">Trial de 14 dias iniciado com os controles essenciais de operacao.</p>

          <div className="space-y-3">
            <label className="flex items-start gap-3 p-4 rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-50 transition-colors">
              <input
                type="checkbox"
                className="mt-1 w-4 h-4 text-guild-600 rounded"
                checked={habilitarIA}
                onChange={(e) => setHabilitarIA(e.target.checked)}
              />
              <div>
                <div className="font-medium text-slate-800 flex items-center gap-1">
                  <Bot className="w-4 h-4" /> Ativar IA da organizacao
                </div>
                <div className="text-sm text-slate-500">Criar a configuracao inicial de modelos, limites e prompts.</div>
              </div>
            </label>

            <label className="flex items-start gap-3 p-4 rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-50 transition-colors">
              <input
                type="checkbox"
                className="mt-1 w-4 h-4 text-guild-600 rounded"
                checked={gerarDemo}
                onChange={(e) => setGerarDemo(e.target.checked)}
              />
              <div>
                <div className="font-medium text-slate-800">Gerar lead de demonstracao</div>
                <div className="text-sm text-slate-500">Entrar com um lead pronto para testar pipeline, cadencia e proxima acao.</div>
              </div>
            </label>
          </div>

          {erro && <div className="mt-4 text-sm text-urgent-500 bg-red-50 border border-red-200 rounded-lg p-2">{erro}</div>}

          <div className="flex gap-4 mt-8">
            <button onClick={() => setStep(3)} className="btn-secondary flex-1">Voltar</button>
            <button onClick={concluir} className="btn-primary flex-[2]">
              Finalizar setup
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
