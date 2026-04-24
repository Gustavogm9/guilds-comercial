"use client";

import { useState } from "react";
import { Bot, FileText, PhoneCall, Save, X } from "lucide-react";
import { processarLigacaoAIAcion } from "./actions"; // Criaremos a seguir
import clsx from "clsx";

export default function NovaLigacaoAIModal({ orgId, leadId, onClose, onSaved }: { orgId: string, leadId?: string, onClose: () => void, onSaved: () => void }) {
  const [transcricao, setTranscricao] = useState("");
  const [loading, setLoading] = useState(false);
  const [resultado, setResultado] = useState<any>(null);

  async function handleExtrair() {
    if (!transcricao.trim()) return;
    setLoading(true);
    const res = await processarLigacaoAIAcion(orgId, transcricao);
    if (res.error) {
      alert(res.error);
    } else {
      setResultado(res.data);
    }
    setLoading(false);
  }

  async function handleSalvar() {
    // Apenas simulação do salvar para o MVP
    setLoading(true);
    // await salvarNoBanco(resultado);
    setTimeout(() => {
      onSaved();
      onClose();
    }, 500);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-guild-100 text-guild-600 grid place-items-center">
              <Bot className="w-4 h-4" />
            </div>
            <h2 className="font-semibold text-slate-900">Extração de Ligação (Copiloto)</h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5"/></button>
        </div>

        <div className="p-6 overflow-y-auto flex-1">
          {!resultado ? (
            <div className="space-y-4">
              <p className="text-sm text-slate-500">Cole a transcrição da call ou as suas anotações brutas. A IA irá estruturar os principais tópicos, objeções e o sentimento do cliente.</p>
              <textarea 
                className="input w-full min-h-[200px] font-mono text-sm leading-relaxed"
                placeholder="Ex: O cliente falou que gostou da proposta mas achou caro. Pediu desconto de 10% e falou pra ligar na sexta..."
                value={transcricao}
                onChange={e => setTranscricao(e.target.value)}
              />
              <button onClick={handleExtrair} disabled={loading || !transcricao.trim()} className="btn-primary w-full justify-center">
                {loading ? <span className="animate-pulse">Analisando...</span> : <><Bot className="w-4 h-4 mr-2"/> Analisar com IA</>}
              </button>
            </div>
          ) : (
            <div className="space-y-6 animate-in slide-in-from-right-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 rounded-xl border border-slate-100 bg-slate-50">
                  <div className="text-xs font-semibold uppercase text-slate-500 mb-1">Sentimento</div>
                  <div className={clsx("font-medium", resultado.sentimento === 'positivo' ? "text-success-600" : resultado.sentimento === 'negativo' ? "text-urgent-600" : "text-slate-700")}>
                    {resultado.sentimento.toUpperCase()}
                  </div>
                </div>
                <div className="p-4 rounded-xl border border-slate-100 bg-slate-50">
                  <div className="text-xs font-semibold uppercase text-slate-500 mb-1">Probabilidade</div>
                  <div className="font-medium text-slate-900">{resultado.probabilidade_fechamento}%</div>
                </div>
              </div>

              <div>
                <h3 className="font-medium text-slate-900 mb-2">Resumo Estruturado</h3>
                <p className="text-sm text-slate-600 leading-relaxed bg-slate-50 p-4 rounded-lg border border-slate-100">{resultado.resumo}</p>
              </div>

              {resultado.objecoes && resultado.objecoes.length > 0 && (
                <div>
                  <h3 className="font-medium text-urgent-700 mb-2 flex items-center gap-2">Objeções Levantadas</h3>
                  <ul className="space-y-2">
                    {resultado.objecoes.map((obj: string, i: number) => (
                      <li key={i} className="text-sm bg-urgent-50 text-urgent-800 px-3 py-2 rounded-md border border-urgent-100">{obj}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div>
                <h3 className="font-medium text-success-700 mb-2">Próximos Passos Sugeridos</h3>
                <ul className="list-disc pl-5 space-y-1">
                  {resultado.proximos_passos.map((passo: string, i: number) => (
                    <li key={i} className="text-sm text-slate-700">{passo}</li>
                  ))}
                </ul>
              </div>

            </div>
          )}
        </div>

        {resultado && (
          <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
            <button onClick={() => setResultado(null)} className="btn-ghost">Voltar</button>
            <button onClick={handleSalvar} disabled={loading} className="btn-primary">
              <Save className="w-4 h-4 mr-2" />
              Salvar Histórico
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
