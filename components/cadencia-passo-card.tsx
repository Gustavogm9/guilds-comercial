"use client";
import { useState } from "react";
import { Sparkles, Copy, Check, ExternalLink, Loader2 } from "lucide-react";
import { gerarMensagemCadencia } from "@/lib/ai/actions";

interface CadenciaPassoCardProps {
  passo: "D0" | "D3" | "D7" | "D11" | "D16" | "D30";
  status: string;
  objetivo: string;
  canal: string;
  dataPrevista: string;
  /** Dados do lead para gerar mensagem via IA */
  leadId: number;
  empresa: string;
  nome: string;
  cargo?: string;
  dorPrincipal?: string;
  ultimaInteracao?: string;
  tomAnterior?: "positivo" | "neutro" | "negativo" | null;
  raioxStatus?: string;
  raioxScore?: number;
  vendedor: string;
  whatsapp?: string;
}

export default function CadenciaPassoCard(props: CadenciaPassoCardProps) {
  const {
    passo, status, objetivo, canal, dataPrevista,
    leadId, empresa, nome, cargo, dorPrincipal,
    ultimaInteracao, tomAnterior, raioxStatus, raioxScore,
    vendedor, whatsapp,
  } = props;

  const [gerando, setGerando] = useState(false);
  const [mensagem, setMensagem] = useState("");
  const [copiado, setCopiado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const tone = status === "enviado" ? "bg-emerald-50 text-emerald-700 border-emerald-200"
    : status === "respondido" ? "bg-blue-50 text-blue-700 border-blue-200"
    : status === "pular" ? "bg-zinc-50 text-zinc-500 border-zinc-200"
    : "bg-slate-50 text-slate-700 border-slate-200";

  async function gerarComIA() {
    setGerando(true);
    setErro(null);
    try {
      const result = await gerarMensagemCadencia({
        leadId,
        empresa,
        nome,
        cargo,
        passo,
        canal: canal.includes("WhatsApp") ? "WhatsApp"
          : canal.includes("LinkedIn") ? "LinkedIn"
          : "Email",
        dor_principal: dorPrincipal,
        ultima_interacao: ultimaInteracao,
        tom_anterior: tomAnterior,
        raiox_status: raioxStatus,
        raiox_score: raioxScore,
        vendedor,
      });
      if (result.ok) {
        setMensagem(result.texto);
      } else {
        setErro(result.erro ?? "Erro desconhecido ao gerar mensagem");
      }
    } catch (err) {
      setErro(err instanceof Error ? err.message : String(err));
    } finally {
      setGerando(false);
    }
  }

  async function copiar() {
    await navigator.clipboard.writeText(mensagem);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  }

  function abrirWhatsApp() {
    if (!whatsapp) return;
    const num = whatsapp.replace(/\D/g, "");
    const url = `https://wa.me/${num.startsWith("55") ? num : `55${num}`}?text=${encodeURIComponent(mensagem)}`;
    window.open(url, "_blank");
  }

  const fmt = (d: string) => {
    try { return new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }); }
    catch { return d; }
  };

  return (
    <li className={`rounded-lg border p-3 text-xs ${tone} flex flex-col gap-2`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="font-semibold text-sm">{passo}</div>
        <span className="opacity-60 text-[10px]">{status}</span>
      </div>
      <div className="opacity-80 truncate">{objetivo}</div>
      <div className="opacity-60 text-[10px]">{dataPrevista ? fmt(dataPrevista) : ""} · {canal}</div>

      {/* Botão Gerar com IA */}
      {status === "pendente" && (
        <button
          type="button"
          onClick={gerarComIA}
          disabled={gerando}
          className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium
            bg-indigo-600 text-white px-2.5 py-1.5 rounded-md
            hover:bg-indigo-700 disabled:opacity-50 transition-colors self-start"
        >
          {gerando
            ? <><Loader2 className="w-3 h-3 animate-spin" /> Gerando...</>
            : <><Sparkles className="w-3 h-3" /> Gerar com IA</>
          }
        </button>
      )}

      {/* Erro */}
      {erro && (
        <div className="text-[11px] text-rose-600 bg-rose-50 border border-rose-200 rounded p-1.5 mt-1">
          {erro}
        </div>
      )}

      {/* Mensagem gerada */}
      {mensagem && (
        <div className="mt-1 space-y-2">
          <textarea
            value={mensagem}
            onChange={(e) => setMensagem(e.target.value)}
            rows={4}
            className="w-full text-xs border border-slate-300 rounded-md p-2
              bg-white text-slate-800 resize-y focus:ring-2 focus:ring-indigo-400 focus:outline-none"
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={copiar}
              className="inline-flex items-center gap-1 text-[11px] font-medium
                bg-slate-700 text-white px-2 py-1 rounded hover:bg-slate-800 transition-colors"
            >
              {copiado ? <><Check className="w-3 h-3" /> Copiado!</> : <><Copy className="w-3 h-3" /> Copiar</>}
            </button>
            {whatsapp && (
              <button
                type="button"
                onClick={abrirWhatsApp}
                className="inline-flex items-center gap-1 text-[11px] font-medium
                  bg-emerald-600 text-white px-2 py-1 rounded hover:bg-emerald-700 transition-colors"
              >
                <ExternalLink className="w-3 h-3" /> WhatsApp
              </button>
            )}
          </div>
        </div>
      )}
    </li>
  );
}
