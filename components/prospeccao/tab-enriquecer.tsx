"use client";

/**
 * TabEnriquecer — modo "colar URL do site da empresa".
 *
 * O vendedor cola o site (ou domínio) e o Firecrawl extrai:
 *   - Nome do responsável / decisor
 *   - Email, WhatsApp, cargo, segmento, cidade
 *   - Resumo da empresa
 *
 * Após enriquecimento, exibe um formulário de revisão editável
 * antes de enviar para a fila de ativação.
 */

import { useState, useTransition } from "react";
import { Globe, Loader2, Sparkles, AlertTriangle, ChevronDown, ChevronUp, Check } from "lucide-react";
import type { EmpresaEnriquecida } from "@/lib/prospeccao";

type Props = {
  onEmpresaEnriquecida: (empresa: EmpresaEnriquecida, jobId?: number) => void;
  icp: { segmento?: string | null; cargo_decisor?: string | null } | null;
};

type CampoEditavel = keyof Pick<EmpresaEnriquecida,
  "nome" | "empresa" | "cargo" | "email" | "whatsapp" | "segmento" | "cidade_uf" | "descricao"
>;

const CAMPOS: { key: CampoEditavel; label: string; placeholder: string }[] = [
  { key: "empresa",   label: "Empresa",         placeholder: "Nome da empresa" },
  { key: "nome",      label: "Contato",          placeholder: "Nome do responsável/decisor" },
  { key: "cargo",     label: "Cargo",            placeholder: "Ex: Diretor Comercial" },
  { key: "email",     label: "E-mail",           placeholder: "contato@empresa.com.br" },
  { key: "whatsapp",  label: "WhatsApp",         placeholder: "(11) 99999-9999" },
  { key: "segmento",  label: "Segmento",         placeholder: "Ex: Seguros, Imóveis…" },
  { key: "cidade_uf", label: "Cidade/Estado",    placeholder: "Ex: São Paulo, SP" },
  { key: "descricao", label: "Sobre a empresa",  placeholder: "Breve descrição do que fazem" },
];

export default function TabEnriquecer({ onEmpresaEnriquecida, icp }: Props) {
  const [url, setUrl] = useState("");
  const [pending, start] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [empresa, setEmpresa] = useState<EmpresaEnriquecida | null>(null);
  const [jobId, setJobId] = useState<number | undefined>();
  const [editando, setEditando] = useState(false);
  const [adicionado, setAdicionado] = useState(false);

  function enriquecer(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    setErro(null);
    setEmpresa(null);
    setAdicionado(false);

    start(async () => {
      try {
        const res = await fetch("/api/prospeccao/enriquecer", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: url.trim() }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.erro);
        setEmpresa(data.empresa);
        setJobId(data.job_id);
        setEditando(false);
      } catch (err: any) {
        setErro(err.message || "Erro ao enriquecer. Verifique a URL e tente novamente.");
      }
    });
  }

  function atualizar(campo: CampoEditavel, valor: string) {
    setEmpresa(prev => prev ? { ...prev, [campo]: valor || null } : prev);
  }

  function adicionar() {
    if (!empresa) return;
    onEmpresaEnriquecida(empresa, jobId);
    setAdicionado(true);
    setTimeout(() => {
      setEmpresa(null);
      setUrl("");
      setAdicionado(false);
    }, 1500);
  }

  return (
    <div className="space-y-4">
      <div className="card p-5">
        <div className="flex items-center gap-2 mb-1">
          <Globe className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold" style={{ letterSpacing: "-0.13px" }}>Enriquecer por Site</h3>
        </div>
        <p className="text-xs text-muted-foreground mb-4">
          Cole o site da empresa. A IA extrai contato, cargo, segmento e uma descrição automaticamente.
        </p>

        <form onSubmit={enriquecer} className="space-y-3">
          <div className="flex gap-2">
            <input
              type="url"
              className="input-base flex-1"
              placeholder="https://empresa.com.br"
              value={url}
              onChange={e => setUrl(e.target.value)}
              disabled={pending}
              required
            />
            <button
              type="submit"
              className="btn-primary shrink-0"
              disabled={pending || !url.trim()}
            >
              {pending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4" />
              )}
              {pending ? "Extraindo…" : "Extrair"}
            </button>
          </div>
          {pending && (
            <div className="text-xs text-muted-foreground flex items-center gap-2 animate-pulse">
              <Loader2 className="w-3 h-3 animate-spin" />
              Firecrawl analisando o site… pode levar 15–30s.
            </div>
          )}
        </form>

        {erro && (
          <div className="mt-3 flex items-start gap-2 p-3 rounded-lg bg-destructive/5 border border-destructive/15 text-xs text-destructive">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            {erro}
          </div>
        )}
      </div>

      {/* Resultado do enriquecimento */}
      {empresa && (
        <div className="card p-5 space-y-4 animate-in fade-in slide-in-from-bottom-2">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold" style={{ letterSpacing: "-0.13px" }}>
                {empresa.empresa || empresa.nome || "Empresa encontrada"}
              </div>
              <div className={`text-[10px] mt-0.5 font-medium ${
                empresa._confianca === "alta" ? "text-green-600" :
                empresa._confianca === "media" ? "text-amber-600" :
                "text-muted-foreground"
              }`}>
                {empresa._confianca === "alta" ? "✓ Alta confiança" :
                 empresa._confianca === "media" ? "~ Confiança média — revise os dados" :
                 "⚠ Dados incompletos — preencha manualmente"}
              </div>
            </div>
            <button
              onClick={() => setEditando(v => !v)}
              className="btn-ghost !py-1 !px-2 text-xs text-muted-foreground gap-1"
            >
              {editando ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              {editando ? "Fechar" : "Editar"}
            </button>
          </div>

          {/* Preview resumido */}
          {!editando && (
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
              {([
                ["Contato", empresa.nome],
                ["Cargo", empresa.cargo],
                ["E-mail", empresa.email],
                ["WhatsApp", empresa.whatsapp],
                ["Segmento", empresa.segmento],
                ["Cidade", empresa.cidade_uf],
              ] as [string, string | null][]).map(([label, val]) => val ? (
                <div key={label}>
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</div>
                  <div className="text-xs text-foreground truncate">{val}</div>
                </div>
              ) : null)}
              {empresa.descricao && (
                <div className="col-span-2 mt-1">
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Sobre</div>
                  <div className="text-xs text-foreground leading-relaxed line-clamp-2">{empresa.descricao}</div>
                </div>
              )}
            </div>
          )}

          {/* Formulário de edição */}
          {editando && (
            <div className="space-y-2.5">
              {CAMPOS.map(({ key, label, placeholder }) => (
                <div key={key}>
                  <label className="label mb-0.5">{label}</label>
                  {key === "descricao" ? (
                    <textarea
                      className="input-base min-h-[80px] text-xs"
                      value={empresa[key] ?? ""}
                      placeholder={placeholder}
                      onChange={e => atualizar(key, e.target.value)}
                    />
                  ) : (
                    <input
                      className="input-base text-sm"
                      value={empresa[key] ?? ""}
                      placeholder={placeholder}
                      onChange={e => atualizar(key, e.target.value)}
                    />
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Botão de adicionar */}
          <button
            onClick={adicionar}
            disabled={adicionado}
            className={`w-full text-sm justify-center ${adicionado ? "btn-secondary" : "btn-primary"}`}
          >
            {adicionado ? (
              <><Check className="w-4 h-4" /> Adicionado à fila!</>
            ) : (
              <><Sparkles className="w-4 h-4" /> Adicionar à fila de ativação</>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
