"use client";

import { useState, useTransition } from "react";
import {
  MessageCircle, Key, Copy, Check, Trash2, RefreshCw,
  ExternalLink, Shield, Zap, AlertCircle, CheckCircle2,
  ChevronDown, Globe,
} from "lucide-react";
import { gerarTokenWhatsapp, salvarProviderWhatsapp, revogarTokenWhatsapp } from "./actions";

const PROVIDERS = [
  {
    key: "manual",
    label: "Apenas importação manual",
    desc: "Importe conversas via arquivo .txt. Sem conexão ao vivo.",
    icon: "📁",
    docs: null,
  },
  {
    key: "zapi",
    label: "Z-API",
    desc: "Conexão via Z-API (R$79/mês). Fácil configuração, popular no Brasil.",
    icon: "⚡",
    docs: "https://developer.z-api.io",
  },
  {
    key: "evolution",
    label: "Evolution API",
    desc: "Open-source, auto-hospedado (gratuito). Requer servidor próprio.",
    icon: "🔧",
    docs: "https://doc.evolution-api.com",
  },
  {
    key: "360dialog",
    label: "360dialog",
    desc: "BSP oficial Meta. Custo por mensagem. Recomendado para alto volume.",
    icon: "✅",
    docs: "https://docs.360dialog.com",
  },
];

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? "https://guilds-comercial.vercel.app";

type Props = {
  orgId: string;
  tokenAtual: string | null;
  providerAtual: string;
};

export default function WhatsappConfigClient({ orgId, tokenAtual, providerAtual }: Props) {
  const [token, setToken] = useState(tokenAtual);
  const [provider, setProvider] = useState(providerAtual);
  const [novoToken, setNovoToken] = useState<string | null>(null);
  const [copied, setCopied] = useState<"token" | "url" | null>(null);
  const [gerando, startGerar] = useTransition();
  const [salvando, startSalvar] = useTransition();
  const [revogando, startRevogar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  const webhookUrl = token ? `${APP_URL}/api/webhooks/whatsapp/${token}` : null;
  const novaWebhookUrl = novoToken ? `${APP_URL}/api/webhooks/whatsapp/${novoToken}` : null;

  function copiar(texto: string, tipo: "token" | "url") {
    navigator.clipboard.writeText(texto);
    setCopied(tipo);
    setTimeout(() => setCopied(null), 2000);
  }

  function gerarToken() {
    setErro(null);
    setNovoToken(null);
    startGerar(async () => {
      const r = await gerarTokenWhatsapp(new FormData());
      if (r.error) { setErro(r.error); return; }
      if (r.token) {
        setToken(r.token);
        setNovoToken(r.token);
      }
    });
  }

  function salvarProvider(prov: string) {
    setErro(null);
    const fd = new FormData();
    fd.append("provider", prov);
    startSalvar(async () => {
      const r = await salvarProviderWhatsapp(fd);
      if (r.error) { setErro(r.error); return; }
      setProvider(prov);
    });
  }

  function revogar() {
    if (!confirm("Revogar o token? Qualquer integração ativa vai parar de funcionar.")) return;
    setErro(null);
    startRevogar(async () => {
      const r = await revogarTokenWhatsapp();
      if (r.error) { setErro(r.error); return; }
      setToken(null);
      setNovoToken(null);
      setProvider("manual");
    });
  }

  const cfgAtual = PROVIDERS.find(p => p.key === provider) ?? PROVIDERS[0];

  return (
    <div className="space-y-6">
      {erro && (
        <div className="card p-3 bg-destructive/5 border-destructive/20 text-sm text-destructive flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" /> {erro}
        </div>
      )}

      {/* Status geral */}
      <div className={`card p-4 flex items-center gap-3 ${token ? "border-emerald-500/30 bg-emerald-500/[0.03]" : "border-border"}`}>
        <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${token ? "bg-emerald-500/10" : "bg-secondary"}`}>
          <MessageCircle className={`w-5 h-5 ${token ? "text-emerald-600" : "text-muted-foreground"}`} />
        </div>
        <div className="flex-1">
          <div className="font-medium text-sm">
            {token ? "Integração ativa" : "Integração não configurada"}
          </div>
          <div className="text-xs text-muted-foreground">
            {token
              ? `Provider: ${cfgAtual.label} · Webhook configurado`
              : "Gere um token para ativar a recepção de mensagens ao vivo"}
          </div>
        </div>
        {token && <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />}
      </div>

      {/* 1. Escolha do provider */}
      <div className="card overflow-hidden">
        <div className="p-4 border-b border-border/50">
          <h2 className="font-semibold text-sm flex items-center gap-2">
            <Zap className="w-4 h-4 text-primary" />
            1. Provider de WhatsApp
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            Escolha como o sistema vai receber mensagens do WhatsApp.
          </p>
        </div>
        <div className="p-4 space-y-2">
          {PROVIDERS.map(p => (
            <button
              key={p.key}
              onClick={() => salvarProvider(p.key)}
              disabled={salvando}
              className={`w-full text-left p-3 rounded-lg border transition-all ${
                provider === p.key
                  ? "border-primary bg-primary/5 text-foreground"
                  : "border-border hover:border-foreground/30 text-muted-foreground hover:text-foreground"
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="text-base">{p.icon}</span>
                <div className="flex-1">
                  <div className="text-sm font-medium">{p.label}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{p.desc}</div>
                </div>
                {provider === p.key && <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />}
                {p.docs && (
                  <a href={p.docs} target="_blank" rel="noreferrer"
                    onClick={e => e.stopPropagation()}
                    className="text-[10px] text-primary underline flex items-center gap-0.5 shrink-0">
                    <ExternalLink className="w-3 h-3" /> Docs
                  </a>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* 2. Token webhook — só mostra se provider !== manual */}
      {provider !== "manual" && (
        <div className="card overflow-hidden">
          <div className="p-4 border-b border-border/50">
            <h2 className="font-semibold text-sm flex items-center gap-2">
              <Key className="w-4 h-4 text-primary" />
              2. Webhook URL
            </h2>
            <p className="text-xs text-muted-foreground mt-1">
              Configure esta URL no painel do {cfgAtual.label} para receber mensagens em tempo real.
            </p>
          </div>
          <div className="p-4 space-y-4">
            {/* Token novo — mostrar só uma vez */}
            {novoToken && (
              <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                <div className="flex items-center gap-2 text-xs text-amber-700 font-medium mb-2">
                  <AlertCircle className="w-3.5 h-3.5" />
                  Guarde a URL abaixo — o token não será exibido novamente.
                </div>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-[10px] font-mono bg-background border border-border rounded px-2 py-1.5 overflow-hidden text-ellipsis whitespace-nowrap">
                    {novaWebhookUrl}
                  </code>
                  <button
                    onClick={() => copiar(novaWebhookUrl!, "url")}
                    className="btn-secondary !py-1 !px-2 shrink-0"
                  >
                    {copied === "url" ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            )}

            {/* URL atual (ofuscada se não for recém-gerada) */}
            {token && !novoToken && (
              <div className="space-y-2">
                <label className="label">URL do Webhook</label>
                <div className="flex items-center gap-2">
                  <div className="flex-1 text-xs font-mono bg-secondary px-3 py-2 rounded border border-border overflow-hidden text-ellipsis whitespace-nowrap text-muted-foreground">
                    {APP_URL}/api/webhooks/whatsapp/<span className="blur-sm select-none">{"•".repeat(16)}</span>
                  </div>
                  <button
                    onClick={() => copiar(webhookUrl!, "url")}
                    className="btn-secondary !py-1.5 !px-2 shrink-0"
                  >
                    {copied === "url" ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Token ofuscado por segurança. Gere um novo se precisar reconfigurar.
                </p>
              </div>
            )}

            {/* Ações */}
            <div className="flex items-center gap-2 flex-wrap pt-1">
              <button
                onClick={gerarToken}
                disabled={gerando}
                className="btn-primary gap-1.5"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${gerando ? "animate-spin" : ""}`} />
                {token ? "Regenerar token" : "Gerar token webhook"}
              </button>
              {token && (
                <button
                  onClick={revogar}
                  disabled={revogando}
                  className="btn-ghost text-destructive gap-1.5 border border-destructive/30 hover:bg-destructive/5"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Revogar
                </button>
              )}
            </div>

            {/* Instruções por provider */}
            <div className="border border-border/50 rounded-lg p-3 bg-secondary/20 space-y-2 text-xs text-muted-foreground">
              <div className="font-semibold text-foreground text-[11px] uppercase tracking-wider">
                Como configurar no {cfgAtual.label}
              </div>
              {provider === "zapi" && (
                <ol className="list-decimal list-inside space-y-1">
                  <li>Acesse o painel Z-API → sua instância</li>
                  <li>Vá em <strong>Webhooks → On Message Received</strong></li>
                  <li>Cole a URL do webhook acima</li>
                  <li>Ative os eventos: <code>received</code> e <code>fromMe</code></li>
                  <li>Salve e teste com uma mensagem</li>
                </ol>
              )}
              {provider === "evolution" && (
                <ol className="list-decimal list-inside space-y-1">
                  <li>No painel Evolution API → Instância → Configurações</li>
                  <li>Em <strong>Webhook</strong>, cole a URL acima</li>
                  <li>Ative os eventos: <code>MESSAGES_UPSERT</code></li>
                  <li>Salve e conecte o WhatsApp via QR Code</li>
                </ol>
              )}
              {provider === "360dialog" && (
                <ol className="list-decimal list-inside space-y-1">
                  <li>No 360dialog Hub → sua conta</li>
                  <li>Em <strong>Channel Settings → Webhook</strong>, cole a URL</li>
                  <li>Configure o método: <code>POST</code></li>
                </ol>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 3. Status do batch de IA */}
      <div className="card p-4">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            <Shield className="w-4 h-4 text-primary" />
          </div>
          <div className="flex-1">
            <div className="text-sm font-medium">Análise automática com IA</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              Todo dia às 03:00 BRT, o sistema analisa automaticamente conversas importadas ainda sem análise.
              Extrai resumo, sentimento, nível de interesse e próxima ação sugerida.
            </div>
            <div className="mt-2 flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[10px] text-emerald-700 font-medium">Ativo — pg_cron jobid:6 · 0 6 * * *</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
