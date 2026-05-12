"use client";

import { useState } from "react";
import { generateApiKey, revokeApiKey, createWebhook, deleteWebhook } from "./actions";
import { Trash2, Copy, Check, Plus, AlertCircle, Eye, EyeOff } from "lucide-react";

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
    <div className="card overflow-hidden mb-8">
      <div className="p-6 border-b border-border/50">
        <h2 className="text-lg font-semibold text-foreground">Chaves de API</h2>
        <p className="text-sm text-muted-foreground mt-1">Gere chaves para autenticar suas requisições REST.</p>
      </div>

      <div className="p-6">
        {newKey && (
          <div className="mb-6 bg-warning-500/10 border border-warning-500/30 rounded-xl p-4">
            <div className="flex items-start">
              <AlertCircle className="w-5 h-5 text-warning-500 mt-0.5 mr-3 flex-shrink-0" />
              <div>
                <h3 className="text-sm font-medium text-foreground">Guarde sua nova chave com segurança</h3>
                <p className="text-sm text-muted-foreground mt-1 mb-3">
                  Esta chave não será exibida novamente. Copie-a e guarde-a em um local seguro.
                </p>
                <div className="flex items-center gap-2">
                  <code className="bg-background px-3 py-1.5 rounded-lg border border-border text-sm font-mono text-foreground w-full overflow-hidden text-ellipsis">
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
            className="input-base flex-1"
          />
          <button type="submit" disabled={loading} className="btn-primary">
            {loading ? "Gerando..." : "Gerar Chave"}
          </button>
        </form>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-muted/40 text-muted-foreground border-y border-border/50">
              <tr>
                <th className="px-4 py-3 font-medium">Nome</th>
                <th className="px-4 py-3 font-medium">Prefixo</th>
                <th className="px-4 py-3 font-medium">Último uso</th>
                <th className="px-4 py-3 font-medium text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {apiKeys.length === 0 ? (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">Nenhuma chave gerada.</td></tr>
              ) : (
                apiKeys.map(key => (
                  <tr key={key.id}>
                    <td className="px-4 py-3 font-medium text-foreground">{key.name}</td>
                    <td className="px-4 py-3 font-mono text-muted-foreground">{key.prefix}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {key.last_used_at ? new Date(key.last_used_at).toLocaleString('pt-BR') : 'Nunca usada'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => { if(confirm('Revogar esta chave permanentemente?')) revokeApiKey(key.id) }}
                        className="text-urgent-500 hover:brightness-110 p-1 rounded-md hover:bg-urgent-500/10 transition"
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
  const [secretsVisiveis, setSecretsVisiveis] = useState<Set<string>>(new Set());
  const [secretsCopiados, setSecretsCopiados] = useState<Set<string>>(new Set());

  function toggleSecret(id: string) {
    setSecretsVisiveis((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function copiarSecret(id: string, secret: string) {
    try {
      await navigator.clipboard.writeText(secret);
      setSecretsCopiados((cur) => new Set(cur).add(id));
      setTimeout(() => {
        setSecretsCopiados((cur) => { const n = new Set(cur); n.delete(id); return n; });
      }, 1500);
    } catch {/* ignore */}
  }

  function mascarar(s: string): string {
    if (!s) return "";
    if (s.length <= 8) return "•••••••";
    return `••••••${s.slice(-4)}`;
  }

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
    <div className="card overflow-hidden">
      <div className="p-6 border-b border-border/50">
        <h2 className="text-lg font-semibold text-foreground">Webhooks</h2>
        <p className="text-sm text-muted-foreground mt-1">Receba notificações em tempo real quando eventos ocorrerem.</p>
      </div>

      <div className="p-6">
        <form onSubmit={handleCreate} className="mb-8 space-y-4 bg-muted/40 p-4 rounded-xl border border-border/50">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">URL do Endpoint</label>
            <input
              type="url"
              name="url"
              required
              placeholder="https://sua-api.com/webhook"
              className="input-base w-full"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">Eventos a assinar</label>
            <div className="space-y-3">
              <div>
                <div className="text-[10px] uppercase tracking-[0.12em] font-semibold text-muted-foreground mb-1.5">
                  Pipeline / aquisição
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {['lead.created', 'lead.stage_changed', 'lead.won', 'lead.lost', 'raiox.completed'].map(evt => (
                    <label key={evt} className="flex items-center gap-2 text-sm text-foreground bg-background p-2 border border-border rounded-lg cursor-pointer hover:bg-muted/50">
                      <input type="checkbox" name="events" value={evt} className="rounded text-primary focus:ring-primary" />
                      <span className="font-mono text-xs">{evt}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-[0.12em] font-semibold text-muted-foreground mb-1.5">
                  Flywheel / pós-venda
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {['indicacao.recebida', 'indicacao.recompensa_paga', 'expansao.fechada', 'nps.respondido'].map(evt => (
                    <label key={evt} className="flex items-center gap-2 text-sm text-foreground bg-background p-2 border border-border rounded-lg cursor-pointer hover:bg-muted/50">
                      <input type="checkbox" name="events" value={evt} className="rounded text-primary focus:ring-primary" />
                      <span className="font-mono text-xs">{evt}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-[0.12em] font-semibold text-muted-foreground mb-1.5">
                  Prospecção
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {['prospeccao.empresa_enriquecida', 'prospeccao.empresa_situacao_mudou', 'prospeccao.bulk_concluido'].map(evt => (
                    <label key={evt} className="flex items-center gap-2 text-sm text-foreground bg-background p-2 border border-border rounded-lg cursor-pointer hover:bg-muted/50">
                      <input type="checkbox" name="events" value={evt} className="rounded text-primary focus:ring-primary" />
                      <span className="font-mono text-xs">{evt}</span>
                    </label>
                  ))}
                </div>
              </div>
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
            <p className="text-center text-muted-foreground py-4">Nenhum webhook cadastrado.</p>
          ) : (
            webhooks.map(wh => (
              <div key={wh.id} className="border border-border rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="font-medium text-foreground mb-1 flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-success-500" />
                    {wh.url}
                  </div>
                  <div className="flex flex-wrap gap-1 mb-2">
                    {wh.events.map((e: string) => (
                      <span key={e} className="inline-block px-2 py-0.5 bg-muted text-muted-foreground rounded text-xs">
                        {e}
                      </span>
                    ))}
                  </div>
                  <div className="text-xs text-muted-foreground font-mono bg-muted/40 px-2 py-1 rounded inline-flex items-center gap-2">
                    <span>Secret:</span>
                    <span className="select-all">
                      {secretsVisiveis.has(wh.id) ? wh.secret : mascarar(wh.secret ?? "")}
                    </span>
                    <button
                      type="button"
                      onClick={() => toggleSecret(wh.id)}
                      className="text-muted-foreground hover:text-foreground"
                      aria-label={secretsVisiveis.has(wh.id) ? "Esconder secret" : "Mostrar secret"}
                      title={secretsVisiveis.has(wh.id) ? "Esconder" : "Mostrar"}
                    >
                      {secretsVisiveis.has(wh.id) ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => copiarSecret(wh.id, wh.secret)}
                      className="text-muted-foreground hover:text-foreground"
                      aria-label="Copiar secret"
                      title="Copiar"
                    >
                      {secretsCopiados.has(wh.id) ? <Check className="w-3 h-3 text-success-500" /> : <Copy className="w-3 h-3" />}
                    </button>
                  </div>
                </div>
                <button
                  onClick={() => { if(confirm('Remover este webhook?')) deleteWebhook(wh.id) }}
                  className="text-urgent-500 hover:brightness-110 p-2 rounded-lg hover:bg-urgent-500/10 transition self-start sm:self-center"
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
