"use client";
import { useState, useTransition, useMemo } from "react";
import { importarLeadsEmMassa, type DedupPolitica } from "../actions";
import { Upload, CheckCircle2, AlertCircle, X, ArrowRight, ArrowLeft, Save, Layers } from "lucide-react";
import Link from "next/link";
import {
  parseCsv, inferirMapping, aplicarMapping, CAMPOS_LEAD,
  type CampoLead,
} from "@/lib/utils/csv-import";

type Step = "upload" | "mapping" | "preview" | "resultado";

interface Template {
  nome: string;
  mapping: Record<string, CampoLead | null>;
  criadoEm: number;
}

const TEMPLATES_LS_KEY = "guilds-csv-import-templates";

function carregarTemplates(): Template[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(TEMPLATES_LS_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as Template[];
  } catch {
    return [];
  }
}

function salvarTemplate(t: Template) {
  if (typeof window === "undefined") return;
  const atual = carregarTemplates().filter((x) => x.nome !== t.nome);
  localStorage.setItem(TEMPLATES_LS_KEY, JSON.stringify([...atual, t]));
}

export default function ImportarCsvClient() {
  const [step, setStep] = useState<Step>("upload");
  const [filename, setFilename] = useState<string | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Record<string, CampoLead | null>>({});
  const [politica, setPolitica] = useState<DedupPolitica>("ignorar");
  const [resultado, setResultado] = useState<{
    criados: number;
    atualizados: number;
    duplicados: number;
    sem_empresa: number;
    erros: string[];
  } | null>(null);
  const [pending, start] = useTransition();
  const [templates, setTemplates] = useState<Template[]>(carregarTemplates());
  const [novoTemplateNome, setNovoTemplateNome] = useState("");

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFilename(f.name);
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      const { headers: h, rows: r } = parseCsv(text);
      setHeaders(h);
      setRawRows(r);
      setMapping(inferirMapping(h));
      setStep("mapping");
    };
    reader.readAsText(f, "UTF-8");
  }

  function reset() {
    setStep("upload");
    setFilename(null);
    setHeaders([]);
    setRawRows([]);
    setMapping({});
    setResultado(null);
  }

  function aplicarTemplate(t: Template) {
    const novo: Record<string, CampoLead | null> = {};
    headers.forEach((h) => {
      novo[h] = t.mapping[h] ?? null;
    });
    setMapping(novo);
  }

  function salvarComoTemplate() {
    if (!novoTemplateNome.trim()) return;
    const t: Template = { nome: novoTemplateNome.trim(), mapping, criadoEm: Date.now() };
    salvarTemplate(t);
    setTemplates(carregarTemplates());
    setNovoTemplateNome("");
  }

  const rowsMapeadas = useMemo(() => {
    return rawRows.map((row) => aplicarMapping(row, mapping));
  }, [rawRows, mapping]);

  const totalSemEmpresa = rowsMapeadas.filter((r) => !r.empresa).length;
  const totalValidos = rowsMapeadas.length - totalSemEmpresa;
  const empresaMapeada = Object.values(mapping).includes("empresa");

  function importar() {
    start(async () => {
      const r = await importarLeadsEmMassa(rowsMapeadas as any, politica);
      setResultado(r);
      setStep("resultado");
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-xs">
        <StepDot active={step === "upload"} done={step !== "upload"} label="1. Arquivo" />
        <ArrowRight className="w-3 h-3 text-muted-foreground" />
        <StepDot active={step === "mapping"} done={step === "preview" || step === "resultado"} label="2. Mapear" />
        <ArrowRight className="w-3 h-3 text-muted-foreground" />
        <StepDot active={step === "preview"} done={step === "resultado"} label="3. Conferir" />
        <ArrowRight className="w-3 h-3 text-muted-foreground" />
        <StepDot active={step === "resultado"} done={false} label="4. Pronto" />
      </div>

      {step === "upload" && (
        <div className="card p-8 border-2 border-dashed text-center">
          <Upload className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm text-foreground mb-3">Arraste um CSV ou clique para selecionar</p>
          <label className="btn-primary cursor-pointer inline-flex">
            <input type="file" accept=".csv,text/csv" onChange={handleFile} className="hidden" />
            Escolher arquivo CSV
          </label>
          <p className="text-xs text-muted-foreground mt-4 max-w-md mx-auto">
            Aceita exports de Pipedrive, RD Station, HubSpot ou qualquer CSV com cabeçalho.
            O sistema detecta o mapeamento automaticamente — você confere e ajusta antes de importar.
          </p>
          <p className="text-xs text-muted-foreground mt-2">
            <a
              href={`data:text/csv;charset=utf-8,${encodeURIComponent(
                "empresa,nome,cargo,email,whatsapp,segmento,cidade_uf,fonte\nClínica X,Maria,Diretora,maria@clinica.com.br,(11)99999-0000,Saúde,São Paulo/SP,Indicação\n"
              )}`}
              download="template_leads.csv"
              className="text-primary underline"
            >
              Baixar template de exemplo
            </a>
          </p>
        </div>
      )}

      {step === "mapping" && (
        <>
          <div className="card p-4 flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <Upload className="w-4 h-4 text-muted-foreground" />
              <div>
                <div className="text-sm font-medium">{filename}</div>
                <div className="text-xs text-muted-foreground">
                  {headers.length} colunas · {rawRows.length} linhas detectadas
                </div>
              </div>
            </div>
            <button onClick={reset} className="btn-ghost text-xs">
              <X className="w-3.5 h-3.5" /> Trocar arquivo
            </button>
          </div>

          {templates.length > 0 && (
            <div className="card p-3">
              <div className="text-xs uppercase tracking-wider font-semibold text-muted-foreground mb-2 flex items-center gap-1">
                <Layers className="w-3 h-3" /> Templates salvos
              </div>
              <div className="flex flex-wrap gap-1.5">
                {templates.map((t) => (
                  <button
                    key={t.nome}
                    onClick={() => aplicarTemplate(t)}
                    className="text-xs px-2 py-1 rounded-md bg-muted/50 hover:bg-muted text-foreground border border-border"
                  >
                    {t.nome}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="card p-4">
            <div className="text-sm font-medium text-foreground mb-2">Mapear colunas do CSV → campos do Guilds</div>
            <p className="text-xs text-muted-foreground mb-4">
              O sistema sugeriu o mapeamento. Confira e ajuste o que precisar.
              Coluna mapeada como <span className="font-mono bg-muted px-1 rounded">— não importar</span> é descartada.
            </p>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border/50">
                  <tr>
                    <th className="text-left py-2 font-medium">Coluna no CSV</th>
                    <th className="text-left py-2 font-medium">→</th>
                    <th className="text-left py-2 font-medium">Campo do Guilds</th>
                    <th className="text-left py-2 font-medium">Exemplo (1ª linha)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/30">
                  {headers.map((h) => (
                    <tr key={h}>
                      <td className="py-2 font-mono text-xs text-foreground">{h}</td>
                      <td className="py-2 text-muted-foreground"><ArrowRight className="w-3 h-3" /></td>
                      <td className="py-2">
                        <select
                          value={mapping[h] ?? ""}
                          onChange={(e) => {
                            const v = e.target.value as CampoLead | "";
                            setMapping({ ...mapping, [h]: v === "" ? null : v });
                          }}
                          className="input-base text-sm py-1 min-w-[200px]"
                        >
                          <option value="">— não importar —</option>
                          {CAMPOS_LEAD.map((c) => (
                            <option key={c.value} value={c.value}>{c.label}</option>
                          ))}
                        </select>
                      </td>
                      <td className="py-2 text-xs text-muted-foreground truncate max-w-[200px]">
                        {rawRows[0]?.[h] ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {!empresaMapeada && (
              <div className="mt-3 p-2 rounded-lg bg-urgent-500/10 border border-urgent-500/30 text-xs text-foreground flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-urgent-500" />
                Você precisa mapear ao menos uma coluna como <strong>Empresa</strong>.
              </div>
            )}

            <div className="mt-4 pt-4 border-t border-border/50 flex items-center gap-2">
              <input
                type="text"
                value={novoTemplateNome}
                onChange={(e) => setNovoTemplateNome(e.target.value)}
                placeholder="Salvar este mapeamento como template (ex: Pipedrive Export)"
                className="input-base text-xs flex-1"
              />
              <button
                onClick={salvarComoTemplate}
                disabled={!novoTemplateNome.trim()}
                className="btn-secondary text-xs"
              >
                <Save className="w-3 h-3" /> Salvar
              </button>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2">
            <button onClick={reset} className="btn-ghost text-sm">
              <ArrowLeft className="w-3.5 h-3.5" /> Trocar arquivo
            </button>
            <button
              onClick={() => setStep("preview")}
              disabled={!empresaMapeada}
              className="btn-primary text-sm"
            >
              Conferir importação <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </>
      )}

      {step === "preview" && (
        <>
          <div className="card p-4">
            <div className="text-sm font-medium mb-2">Pré-visualização</div>
            <div className="text-xs text-muted-foreground mb-3">
              {totalValidos} linha(s) válidas
              {totalSemEmpresa > 0 && (
                <> · {totalSemEmpresa} sem empresa (serão ignoradas)</>
              )}
            </div>

            <div className="overflow-x-auto max-h-[400px] overflow-y-auto border border-border/30 rounded-lg">
              <table className="w-full text-xs">
                <thead className="bg-muted/50 sticky top-0">
                  <tr>
                    <th className="text-left px-2 py-1.5 font-medium">#</th>
                    <th className="text-left px-2 py-1.5 font-medium">Empresa</th>
                    <th className="text-left px-2 py-1.5 font-medium">Nome</th>
                    <th className="text-left px-2 py-1.5 font-medium">Email</th>
                    <th className="text-left px-2 py-1.5 font-medium">WhatsApp</th>
                    <th className="text-left px-2 py-1.5 font-medium">Segmento</th>
                    <th className="text-left px-2 py-1.5 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/30">
                  {rowsMapeadas.slice(0, 100).map((r, i) => (
                    <tr key={i} className={!r.empresa ? "bg-urgent-500/5" : ""}>
                      <td className="px-2 py-1 text-muted-foreground">{i + 1}</td>
                      <td className="px-2 py-1 text-foreground">{(r.empresa as string) || <span className="text-muted-foreground">—</span>}</td>
                      <td className="px-2 py-1 text-muted-foreground">{(r.nome as string) || "—"}</td>
                      <td className="px-2 py-1 text-muted-foreground">{(r.email as string) || "—"}</td>
                      <td className="px-2 py-1 text-muted-foreground">{(r.whatsapp as string) || "—"}</td>
                      <td className="px-2 py-1 text-muted-foreground">{(r.segmento as string) || "—"}</td>
                      <td className="px-2 py-1">
                        {r.empresa ? (
                          <span className="inline-flex items-center gap-1 text-success-500">
                            <CheckCircle2 className="w-3 h-3" /> ok
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-urgent-500">
                            <AlertCircle className="w-3 h-3" /> sem empresa
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {rowsMapeadas.length > 100 && (
              <div className="text-[11px] text-muted-foreground mt-2">
                Mostrando 100 de {rowsMapeadas.length} linhas. Todas serão processadas no import.
              </div>
            )}
          </div>

          <div className="card p-4">
            <div className="text-xs uppercase tracking-wider font-semibold text-muted-foreground mb-2">
              O que fazer com leads duplicados (mesmo email ou WhatsApp)?
            </div>
            <div className="space-y-2">
              {(
                [
                  { value: "ignorar", label: "Ignorar duplicatas (recomendado)", desc: "Pula linhas que já existem na sua base." },
                  { value: "atualizar", label: "Atualizar leads existentes", desc: "Sobrescreve campos não-vazios do CSV no lead existente." },
                  { value: "criar_mesmo_assim", label: "Criar de qualquer forma", desc: "Insere mesmo com duplicatas. Útil para testes." },
                ] as { value: DedupPolitica; label: string; desc: string }[]
              ).map((opt) => (
                <label key={opt.value} className="flex items-start gap-2 p-2 rounded-lg border border-border cursor-pointer hover:bg-muted/30">
                  <input
                    type="radio"
                    name="politica_dedup"
                    value={opt.value}
                    checked={politica === opt.value}
                    onChange={() => setPolitica(opt.value)}
                    className="mt-1"
                  />
                  <div>
                    <div className="text-sm font-medium text-foreground">{opt.label}</div>
                    <div className="text-xs text-muted-foreground">{opt.desc}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-end gap-2">
            <button onClick={() => setStep("mapping")} className="btn-ghost text-sm">
              <ArrowLeft className="w-3.5 h-3.5" /> Voltar ao mapeamento
            </button>
            <button onClick={importar} disabled={pending || totalValidos === 0} className="btn-primary text-sm">
              {pending ? "Importando…" : `Importar ${totalValidos} lead(s) para Base bruta`}
            </button>
          </div>
        </>
      )}

      {step === "resultado" && resultado && (
        <div className="card p-6 text-center space-y-3">
          <CheckCircle2 className="w-10 h-10 mx-auto text-success-500" />
          <div>
            <div className="text-lg font-semibold">Importação concluída</div>
            <div className="text-sm text-muted-foreground">
              <strong className="text-success-500">{resultado.criados}</strong> criados
              {resultado.atualizados > 0 && (
                <> · <strong className="text-primary">{resultado.atualizados}</strong> atualizados</>
              )}
              {resultado.duplicados > 0 && politica === "ignorar" && (
                <> · <strong className="text-warning-500">{resultado.duplicados}</strong> duplicatas ignoradas</>
              )}
              {resultado.sem_empresa > 0 && (
                <> · {resultado.sem_empresa} sem empresa</>
              )}
            </div>
          </div>
          {resultado.erros.length > 0 && (
            <div className="text-xs text-urgent-500 bg-urgent-500/10 border border-urgent-500/30 rounded-lg p-2 text-left">
              <div className="font-semibold mb-1">{resultado.erros.length} erro(s):</div>
              <ul className="list-disc list-inside">
                {resultado.erros.slice(0, 5).map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            </div>
          )}
          <div className="flex items-center justify-center gap-2 pt-2">
            <button onClick={reset} className="btn-secondary text-sm">Importar outro arquivo</button>
            <Link href="/base?tab=bruta" className="btn-primary text-sm">Ver na Base bruta</Link>
          </div>
        </div>
      )}
    </div>
  );
}

function StepDot({ active, done, label }: { active: boolean; done: boolean; label: string }) {
  return (
    <div className={`flex items-center gap-1.5 px-2 py-1 rounded-full ${
      active ? "bg-primary/10 text-primary" : done ? "bg-success-500/10 text-success-500" : "text-muted-foreground"
    }`}>
      <div className={`w-1.5 h-1.5 rounded-full ${
        active ? "bg-primary" : done ? "bg-success-500" : "bg-muted-foreground/40"
      }`} />
      <span className="font-medium">{label}</span>
    </div>
  );
}
