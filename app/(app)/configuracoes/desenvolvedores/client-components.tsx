"use client";

import { useState } from "react";
import { generateApiKey, revokeApiKey, createWebhook, deleteWebhook } from "./actions";
import { Trash2, Copy, Check, Plus, AlertCircle } from "lucide-react";

export function ApiKeysManager({ organizacaoId, apiKeys }: { organizacaoId: string, apiKeys: any[] }) {
  const [loading, setLoading] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleGenerate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setNewKey(null);
    const formData = new FormData(e.currentTarget);
    formData.append("organizacao_id", organizacaoId);
    
    const res = await generateApiKey(formData);
    if (res.rawKey) {
      setNewKey(res.rawKey);
      (e.target as HTMLFormElement).reset();
    } else if (res.error) {
      alert(res.error);
    }
    setLoading(false);
  }

  const copyToClipboard = () => {
    if (newKey) {
      navigator.clipboard.writeText(newKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden mb-8">
      <div className="p-6 border-b border-slate-100">
        <h2 className="text-lg font-semibold text-slate-900">Chaves de API</h2>
        <p className="text-sm text-slate-500 mt-1">Gere chaves para autenticar suas requisições REST.</p>
      </div>

      <div className="p-6">
        {newKey && (
          <div className="mb-6 bg-amber-50 border border-amber-200 rounded-xl p-4">
            <div className="flex items-start">
              <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5 mr-3 flex-shrink-0" />
              <div>
                <h3 className="text-sm font-medium text-amber-800">Guarde sua nova chave com segurança</h3>
                <p className="text-sm text-amber-700 mt-1 mb-3">
                  Esta chave não será exibida novamente. Copie-a e guarde-a em um local seguro.
                </p>
                <div className="flex items-center gap-2">
                  <code className="bg-white px-3 py-1.5 rounded-lg border border-amber-200 text-sm font-mono text-slate-900 w-full overflow-hidden text-ellipsis">
                    {newKey}
                  </code>
                  <button onClick={copyToClipboard} className="btn-secondary whitespace-nowrap">
                    {copied ? <Check className="w-4 h-4 text-success-500" /> : <Copy className="w-4 h-4" />}
                    {copied ? 'Copiado' : 'Copiar'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        <form onSubmit={handleGenerate} className="flex gap-3 mb-6">
          <input 
            type="text" 
            name="name" 
            required 
            placeholder="Nome da chave (ex: Zapier)" 
            className="input flex-1"
          />
          <button type="submit" disabled={loading} className="btn-primary">
            {loading ? "Gerando..." : "Gerar Chave"}
          </button>
        </form>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 text-slate-500 border-y border-slate-100">
              <tr>
                <th className="px-4 py-3 font-medium">Nome</th>
                <th className="px-4 py-3 font-medium">Prefixo</th>
                <th className="px-4 py-3 font-medium">Último uso</th>
                <th className="px-4 py-3 font-medium text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {apiKeys.length === 0 ? (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-500">Nenhuma chave gerada.</td></tr>
              ) : (
                apiKeys.map(key => (
                  <tr key={key.id}>
                    <td className="px-4 py-3 font-medium text-slate-900">{key.name}</td>
                    <td className="px-4 py-3 font-mono text-slate-500">{key.prefix}</td>
                    <td className="px-4 py-3 text-slate-500">
                      {key.last_used_at ? new Date(key.last_used_at).toLocaleString('pt-BR') : 'Nunca usada'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button 
                        onClick={() => { if(confirm('Revogar esta chave permanentemente?')) revokeApiKey(key.id) }}
                        className="text-urgent-500 hover:text-urgent-700 p-1 rounded-md hover:bg-urgent-50 transition"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export function WebhooksManager({ organizacaoId, webhooks }: { organizacaoId: string, webhooks: any[] }) {
  const [loading, setLoading] = useState(false);

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const formData = new FormData(e.currentTarget);
    formData.append("organizacao_id", organizacaoId);
    
    const res = await createWebhook(formData);
    if (res.error) {
      alert(res.error);
    } else {
      (e.target as HTMLFormElement).reset();
    }
    setLoading(false);
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="p-6 border-b border-slate-100">
        <h2 className="text-lg font-semibold text-slate-900">Webhooks</h2>
        <p className="text-sm text-slate-500 mt-1">Receba notificações em tempo real quando eventos ocorrerem.</p>
      </div>

      <div className="p-6">
        <form onSubmit={handleCreate} className="mb-8 space-y-4 bg-slate-50 p-4 rounded-xl border border-slate-100">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">URL do Endpoint</label>
            <input 
              type="url" 
              name="url" 
              required 
              placeholder="https://sua-api.com/webhook" 
              className="input w-full"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Eventos a assinar</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {['lead.created', 'lead.stage_changed', 'lead.won', 'lead.lost', 'raiox.completed'].map(evt => (
                <label key={evt} className="flex items-center gap-2 text-sm text-slate-700 bg-white p-2 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50">
                  <input type="checkbox" name="events" value={evt} className="rounded text-guild-600 focus:ring-guild-500" />
                  {evt}
                </label>
              ))}
            </div>
          </div>
          <div className="flex justify-end pt-2">
            <button type="submit" disabled={loading} className="btn-primary">
              <Plus className="w-4 h-4 mr-2" />
              {loading ? "Adicionando..." : "Adicionar Webhook"}
            </button>
          </div>
        </form>

        <div className="space-y-4">
          {webhooks.length === 0 ? (
            <p className="text-center text-slate-500 py-4">Nenhum webhook cadastrado.</p>
          ) : (
            webhooks.map(wh => (
              <div key={wh.id} className="border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="font-medium text-slate-900 mb-1 flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-success-500" />
                    {wh.url}
                  </div>
                  <div className="flex flex-wrap gap-1 mb-2">
                    {wh.events.map((e: string) => (
                      <span key={e} className="inline-block px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-xs">
                        {e}
                      </span>
                    ))}
                  </div>
                  <div className="text-xs text-slate-500 font-mono bg-slate-50 px-2 py-1 rounded inline-block">
                    Secret: <span className="select-all">{wh.secret}</span>
                  </div>
                </div>
                <button 
                  onClick={() => { if(confirm('Remover este webhook?')) deleteWebhook(wh.id) }}
                  className="text-urgent-500 hover:text-urgent-700 p-2 rounded-lg hover:bg-urgent-50 transition self-start sm:self-center"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
