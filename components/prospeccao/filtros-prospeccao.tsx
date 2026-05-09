"use client";

/**
 * FiltrosProspeccao — painel lateral de filtros avançados.
 *
 * Aplicado sobre a fila de leads coletados no ProspeccaoHub.
 * Filtros: região, segmento, confiança IA, completude social,
 *          cargo, score mínimo de similaridade e completude.
 */

import { useState } from "react";
import { SlidersHorizontal, X, ChevronDown, ChevronUp } from "lucide-react";
import type { FiltrosProspeccao } from "@/lib/prospeccao-lookalike";

type Props = {
  filtros: FiltrosProspeccao;
  onChange: (f: FiltrosProspeccao) => void;
  segmentosDisponiveis: string[];
  regioes: string[];
};

export default function FiltrosProspeccaoPanel({ filtros, onChange, segmentosDisponiveis, regioes }: Props) {
  const [aberto, setAberto] = useState(false);

  const totalAtivos = [
    filtros.regioes?.length,
    filtros.segmentos?.length,
    filtros.confianca?.length,
    filtros.tem_email,
    filtros.tem_whatsapp,
    filtros.tem_linkedin,
    filtros.tem_site,
    filtros.cargo_contains,
    filtros.completude_min && filtros.completude_min > 0,
    filtros.similaridade_min && filtros.similaridade_min > 0,
  ].filter(Boolean).length;

  function set<K extends keyof FiltrosProspeccao>(key: K, value: FiltrosProspeccao[K]) {
    onChange({ ...filtros, [key]: value });
  }

  function limparTudo() {
    onChange({});
  }

  function toggleArrayItem<T extends string>(
    key: keyof FiltrosProspeccao,
    value: T,
    current: T[] | undefined
  ) {
    const arr = current ?? [];
    const novo = arr.includes(value) ? arr.filter(v => v !== value) : [...arr, value];
    onChange({ ...filtros, [key]: novo.length ? novo : undefined });
  }

  return (
    <div className="card overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setAberto(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-secondary/30 transition-colors"
      >
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold" style={{ letterSpacing: "-0.13px" }}>
            Filtros avançados
          </span>
          {totalAtivos > 0 && (
            <span className="text-[10px] bg-primary text-primary-foreground px-1.5 py-0.5 rounded-full font-bold">
              {totalAtivos}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {totalAtivos > 0 && (
            <button
              onClick={e => { e.stopPropagation(); limparTudo(); }}
              className="text-[11px] text-muted-foreground hover:text-destructive flex items-center gap-0.5"
            >
              <X className="w-3 h-3" /> Limpar
            </button>
          )}
          {aberto ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </div>
      </button>

      {aberto && (
        <div className="px-4 pb-4 space-y-4 border-t border-border/40">

          {/* Confiança IA */}
          <div>
            <div className="label mt-3 mb-2">Confiança da IA</div>
            <div className="flex gap-2">
              {(["alta", "media", "baixa"] as const).map(c => (
                <button
                  key={c}
                  onClick={() => toggleArrayItem("confianca", c, filtros.confianca)}
                  className={`flex-1 text-xs py-1.5 rounded-lg border transition-colors capitalize ${
                    filtros.confianca?.includes(c)
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border text-muted-foreground hover:border-primary/50"
                  }`}
                >
                  {c === "alta" ? "✓ Alta" : c === "media" ? "~ Média" : "? Baixa"}
                </button>
              ))}
            </div>
          </div>

          {/* Completude social */}
          <div>
            <div className="label mb-2">Dados obrigatórios</div>
            <div className="space-y-1.5">
              {([
                { key: "tem_email",     label: "Tem e-mail" },
                { key: "tem_whatsapp",  label: "Tem WhatsApp" },
                { key: "tem_linkedin",  label: "Tem LinkedIn" },
                { key: "tem_site",      label: "Tem site" },
              ] as const).map(({ key, label }) => (
                <label key={key} className="flex items-center gap-2 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={!!filtros[key]}
                    onChange={e => set(key, e.target.checked ? true : undefined as any)}
                    className="accent-primary w-3.5 h-3.5"
                  />
                  <span className="text-xs text-foreground group-hover:text-primary transition-colors">{label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Cargo do decisor */}
          <div>
            <label className="label mb-1">Cargo contém</label>
            <input
              type="text"
              className="input-base text-sm"
              placeholder="Ex: Proprietário, Diretor…"
              value={filtros.cargo_contains ?? ""}
              onChange={e => set("cargo_contains", e.target.value || undefined)}
            />
          </div>

          {/* Segmentos */}
          {segmentosDisponiveis.length > 0 && (
            <div>
              <div className="label mb-2">Segmento</div>
              <div className="flex flex-wrap gap-1.5">
                {segmentosDisponiveis.map(seg => (
                  <button
                    key={seg}
                    onClick={() => toggleArrayItem("segmentos", seg, filtros.segmentos)}
                    className={`text-[11px] px-2 py-0.5 rounded-md border transition-colors ${
                      filtros.segmentos?.includes(seg)
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-border text-muted-foreground hover:border-primary/50"
                    }`}
                  >
                    {seg}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Scores mínimos */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label mb-1">
                Completude mín. <span className="text-primary font-bold">{filtros.completude_min ?? 0}%</span>
              </label>
              <input
                type="range" min={0} max={100} step={10}
                value={filtros.completude_min ?? 0}
                onChange={e => set("completude_min", Number(e.target.value) || undefined as any)}
                className="w-full accent-primary"
              />
            </div>
            <div>
              <label className="label mb-1">
                Fit ICP mín. <span className="text-primary font-bold">{filtros.similaridade_min ?? 0}</span>
              </label>
              <input
                type="range" min={0} max={100} step={10}
                value={filtros.similaridade_min ?? 0}
                onChange={e => set("similaridade_min", Number(e.target.value) || undefined as any)}
                className="w-full accent-primary"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
