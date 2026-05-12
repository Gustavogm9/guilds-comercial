"use client";

import { useState, useTransition } from "react";
import { Send, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { submeterLpAction } from "./actions";

interface Lp {
  id: number;
  titulo: string;
  subtitulo: string | null;
  conteudo: Record<string, unknown>;
  campos: string[];
  cta_texto: string;
  agradecimento_titulo: string;
  agradecimento_texto: string;
  logo_url: string | null;
  cor_primaria: string | null;
}

const CAMPO_CONFIG: Record<string, { label: string; type: string; placeholder: string }> = {
  nome: { label: "Nome", type: "text", placeholder: "Seu nome completo" },
  email: { label: "Email", type: "email", placeholder: "voce@empresa.com" },
  whatsapp: { label: "WhatsApp", type: "tel", placeholder: "(11) 99999-0000" },
  empresa: { label: "Empresa", type: "text", placeholder: "Onde você trabalha" },
  cargo: { label: "Cargo", type: "text", placeholder: "Seu cargo atual" },
  mensagem: { label: "Mensagem", type: "textarea", placeholder: "Conte mais (opcional)" },
};

export default function LpClient({ slug, lp }: { slug: string; lp: Lp }) {
  const [dados, setDados] = useState<Record<string, string>>({});
  const [erro, setErro] = useState<string | null>(null);
  const [enviado, setEnviado] = useState(false);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    startTransition(async () => {
      try {
        const r = await submeterLpAction(slug, dados);
        if (!r.ok) {
          setErro(r.erro ?? "Erro.");
        } else {
          setEnviado(true);
        }
      } catch (err) {
        setErro(err instanceof Error ? err.message : "Erro.");
      }
    });
  }

  const corCustom = lp.cor_primaria;
  const bgStyle = corCustom
    ? { background: `linear-gradient(135deg, ${corCustom}10 0%, transparent 50%, ${corCustom}05 100%)` }
    : undefined;

  if (enviado) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={bgStyle}>
        <div className="card max-w-md w-full p-8 text-center">
          {lp.logo_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={lp.logo_url} alt="" className="h-12 mx-auto mb-4" loading="lazy" decoding="async" />
          )}
          <CheckCircle2 className="w-12 h-12 mx-auto text-success-500 mb-3" />
          <h1 className="text-2xl font-semibold mb-2">{lp.agradecimento_titulo}</h1>
          <p className="text-sm text-muted-foreground">{lp.agradecimento_texto}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={bgStyle}>
      <div className="max-w-lg w-full">
        {lp.logo_url && (
          <div className="text-center mb-6">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={lp.logo_url} alt="" className="h-12 mx-auto" loading="lazy" decoding="async" />
          </div>
        )}

        <div className="card p-6 md:p-8">
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight mb-2" style={{ letterSpacing: "-0.5px" }}>
            {lp.titulo}
          </h1>
          {lp.subtitulo && (
            <p className="text-sm text-muted-foreground mb-6">{lp.subtitulo}</p>
          )}

          <form onSubmit={submit} className="space-y-3">
            {lp.campos.map((campo) => {
              const cfg = CAMPO_CONFIG[campo];
              if (!cfg) return null;
              if (cfg.type === "textarea") {
                return (
                  <div key={campo}>
                    <label className="label text-xs">{cfg.label}</label>
                    <textarea
                      value={dados[campo] ?? ""}
                      onChange={(e) => setDados({ ...dados, [campo]: e.target.value })}
                      placeholder={cfg.placeholder}
                      className="input-base mt-1 text-sm min-h-[80px]"
                    />
                  </div>
                );
              }
              return (
                <div key={campo}>
                  <label className="label text-xs">{cfg.label}</label>
                  <input
                    type={cfg.type}
                    value={dados[campo] ?? ""}
                    onChange={(e) => setDados({ ...dados, [campo]: e.target.value })}
                    placeholder={cfg.placeholder}
                    required={campo === "email" || campo === "whatsapp" ? false : campo === "nome"}
                    className="input-base mt-1 text-sm"
                  />
                </div>
              );
            })}

            {erro && (
              <p role="alert" className="text-xs text-destructive inline-flex items-center gap-1">
                <AlertCircle className="w-3 h-3" /> {erro}
              </p>
            )}

            <button
              type="submit"
              disabled={pending}
              className="btn-primary w-full text-sm py-3"
              style={corCustom ? { background: corCustom } : undefined}
            >
              {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {pending ? "Enviando..." : lp.cta_texto}
            </button>
          </form>
        </div>

        <p className="text-center text-[11px] text-muted-foreground/60 mt-4">
          Powered by Guilds Comercial
        </p>
      </div>
    </div>
  );
}
