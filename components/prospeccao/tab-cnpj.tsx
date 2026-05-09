"use client";

/**
 * TabCnpj — modo "buscar empresa por CNPJ".
 *
 * Usa BrasilAPI (gratuita, sem chave de API) para consultar:
 *   - Razão social, nome fantasia, porte
 *   - Capital social, data de abertura, situação cadastral
 *   - CNAE (segmento normalizado)
 *   - Sócios/QSA (até 3)
 *   - Telefone e email da Receita Federal
 *   - Cidade/UF
 *
 * Após consulta, permite enriquecer o site via Firecrawl antes de ativar.
 */

import { useState, useTransition } from "react";
import { Hash, Loader2, Search, Building2, AlertTriangle, Users, Sparkles, Check, ExternalLink } from "lucide-react";
import type { EmpresaEnriquecida } from "@/lib/prospeccao";

type Extras = {
  cnpj_formatado: string;
  razao_social: string;
  porte: string;
  capital_social?: number;
  situacao: string;
  data_inicio?: string;
  cnae_codigo?: number;
  socios: { nome: string; qualificacao: string }[];
};

type Props = {
  onEmpresaEnriquecida: (empresa: EmpresaEnriquecida, jobId?: number) => void;
};

export default function TabCnpj({ onEmpresaEnriquecida }: Props) {
  const [cnpj, setCnpj] = useState("");
  const [empresa, setEmpresa] = useState<EmpresaEnriquecida | null>(null);
  const [extras, setExtras] = useState<Extras | null>(null);
  const [pending, start] = useTransition();
  const [enriquecendo, setEnriquecendo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [adicionado, setAdicionado] = useState(false);

  function formatarCnpj(raw: string) {
    const d = raw.replace(/\D/g, "").slice(0, 14);
    if (d.length <= 2) return d;
    if (d.length <= 5) return `${d.slice(0,2)}.${d.slice(2)}`;
    if (d.length <= 8) return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5)}`;
    if (d.length <= 12) return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8)}`;
    return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8,12)}-${d.slice(12)}`;
  }

  function consultar(e: React.FormEvent) {
    e.preventDefault();
    const raw = cnpj.replace(/\D/g, "");
    if (raw.length !== 14) { setErro("CNPJ deve ter 14 dígitos."); return; }
    setErro(null);
    setEmpresa(null);
    setExtras(null);
    setAdicionado(false);

    start(async () => {
      try {
        const res = await fetch(`/api/prospeccao/cnpj?cnpj=${raw}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.erro);
        setEmpresa(data.empresa);
        setExtras(data.extras);
      } catch (err: any) {
        setErro(err.message);
      }
    });
  }

  async function enriquecerSite() {
    if (!empresa?.site) return;
    setEnriquecendo(true);
    try {
      const res = await fetch("/api/prospeccao/enriquecer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: empresa.site }),
      });
      const data = await res.json();
      if (res.ok && data.empresa) {
        // Mescla dados do Firecrawl com os dados do CNPJ (CNPJ tem prioridade em razão social)
        setEmpresa(prev => prev ? {
          ...data.empresa,
          empresa:  prev.empresa || data.empresa.empresa,
          segmento: prev.segmento || data.empresa.segmento,
          cidade_uf: prev.cidade_uf || data.empresa.cidade_uf,
        } : data.empresa);
      }
    } catch (err) {
      console.error("[enriquecer site cnpj]", err);
    } finally {
      setEnriquecendo(false);
    }
  }

  function adicionar() {
    if (!empresa) return;
    onEmpresaEnriquecida(empresa);
    setAdicionado(true);
    setTimeout(() => { setEmpresa(null); setExtras(null); setCnpj(""); setAdicionado(false); }, 1500);
  }

  const situacaoAtiva = extras?.situacao === "ATIVA";

  return (
    <div className="space-y-4">
      <div className="card p-5">
        <div className="flex items-center gap-2 mb-1">
          <Hash className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold" style={{ letterSpacing: "-0.13px" }}>Buscar por CNPJ</h3>
          <span className="text-[10px] bg-green-500/10 text-green-600 px-1.5 py-0.5 rounded font-medium">Gratuito</span>
        </div>
        <p className="text-xs text-muted-foreground mb-4">
          Consulta a Receita Federal via BrasilAPI — sem chave necessária. Retorna sócios, CNAE, porte e capital social.
        </p>

        <form onSubmit={consultar} className="flex gap-2">
          <input
            className="input-base flex-1 font-mono"
            value={cnpj}
            onChange={e => setCnpj(formatarCnpj(e.target.value))}
            placeholder="00.000.000/0001-00"
            maxLength={18}
            disabled={pending}
          />
          <button type="submit" className="btn-primary shrink-0" disabled={pending || cnpj.replace(/\D/g, "").length !== 14}>
            {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          </button>
        </form>

        {erro && (
          <div className="mt-3 flex items-start gap-2 p-3 rounded-lg bg-destructive/5 border border-destructive/15 text-xs text-destructive">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {erro}
          </div>
        )}
      </div>

      {/* Resultado */}
      {empresa && extras && (
        <div className="card p-5 space-y-4 animate-in fade-in slide-in-from-bottom-2">
          {/* Header da empresa */}
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-primary shrink-0" />
                <span className="text-sm font-semibold text-foreground">
                  {empresa.empresa ?? extras.razao_social}
                </span>
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">{extras.razao_social}</div>
              <div className="text-[10px] font-mono text-muted-foreground">{extras.cnpj_formatado}</div>
            </div>
            <div className="flex flex-col items-end gap-1 shrink-0">
              <span className={`text-[10px] px-2 py-0.5 rounded font-semibold ${
                situacaoAtiva ? "bg-green-500/10 text-green-600" : "bg-destructive/10 text-destructive"
              }`}>
                {situacaoAtiva ? "✓ Ativa" : extras.situacao}
              </span>
              <span className="text-[10px] bg-secondary text-muted-foreground px-1.5 py-0.5 rounded">{extras.porte}</span>
            </div>
          </div>

          {/* Grid de dados */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-2">
            {[
              ["Segmento",     empresa.segmento],
              ["Cidade/UF",    empresa.cidade_uf],
              ["Telefone",     empresa.whatsapp],
              ["Email",        empresa.email],
              ["CNAE",         extras.cnae_codigo?.toString()],
              ["Data de abertura", extras.data_inicio],
            ].filter(([, v]) => v).map(([label, val]) => (
              <div key={label as string}>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</div>
                <div className="text-xs text-foreground">{val}</div>
              </div>
            ))}
            {extras.capital_social && (
              <div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Capital Social</div>
                <div className="text-xs text-foreground">
                  {Number(extras.capital_social).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })}
                </div>
              </div>
            )}
            {empresa.descricao && (
              <div className="col-span-2">
                <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Sobre</div>
                <div className="text-xs text-foreground leading-relaxed">{empresa.descricao}</div>
              </div>
            )}
          </div>

          {/* Sócios/QSA */}
          {extras.socios.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <Users className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-xs font-semibold">Sócios / QSA</span>
              </div>
              <div className="space-y-1.5">
                {extras.socios.map((s, i) => (
                  <div key={i} className="flex items-center gap-2 p-2 rounded-lg bg-secondary/30">
                    <div className="w-6 h-6 rounded-full bg-primary/10 grid place-items-center shrink-0">
                      <span className="text-[10px] text-primary font-bold">{s.nome.charAt(0)}</span>
                    </div>
                    <div>
                      <div className="text-xs font-medium text-foreground">{s.nome}</div>
                      <div className="text-[10px] text-muted-foreground">{s.qualificacao}</div>
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">
                Considere abordar os sócios listados como decisores principais.
              </p>
            </div>
          )}

          {/* Ações */}
          <div className="flex flex-col gap-2 pt-1 border-t border-border/40">
            {empresa.site && (
              <div className="flex items-center gap-2">
                <a href={empresa.site} target="_blank" rel="noreferrer" className="btn-ghost !py-1 !px-2 text-xs gap-1 text-muted-foreground">
                  <ExternalLink className="w-3.5 h-3.5" /> Ver site
                </a>
                <button
                  onClick={enriquecerSite}
                  disabled={enriquecendo}
                  className="btn-secondary !py-1 !px-2 text-xs gap-1"
                >
                  {enriquecendo ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                  {enriquecendo ? "Enriquecendo site…" : "Enriquecer site (Firecrawl)"}
                </button>
              </div>
            )}
            <button
              onClick={adicionar}
              disabled={adicionado}
              className={`w-full text-sm justify-center ${adicionado ? "btn-secondary" : "btn-primary"}`}
            >
              {adicionado
                ? <><Check className="w-4 h-4" /> Adicionado!</>
                : <><Building2 className="w-4 h-4" /> Adicionar à fila de ativação</>
              }
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
