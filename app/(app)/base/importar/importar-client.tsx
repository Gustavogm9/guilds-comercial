"use client";
import { useEffect, useState, useTransition, useMemo } from "react";
import { importarLeadsEmMassa, type DedupPolitica } from "../actions";
import { Upload, CheckCircle2, AlertCircle, X, ArrowRight, ArrowLeft, Save, Layers, Trash2 } from "lucide-react";
import Link from "next/link";
import {
  parseCsv, inferirMapping, aplicarMapping, CAMPOS_LEAD,
  type CampoLead,
} from "@/lib/utils/csv-import";
import { getClientLocale, getT, type Locale } from "@/lib/i18n";
import { ETAPAS_CRM } from "@/lib/lists";

const MAX_CSV_SIZE = 10 * 1024 * 1024; // 10 MB

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

export default function ImportarCsvClient({
  profiles = [],
}: {
  profiles?: { id: string; display_name: string }[];
}) {
  const [locale, setLocale] = useState<Locale>("pt-BR");
  useEffect(() => setLocale(getClientLocale()), []);
  const t = getT(locale);
  const [step, setStep] = useState<Step>("upload");
  const [filename, setFilename] = useState<string | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Record<string, CampoLead | null>>({});
  const [politica, setPolitica] = useState<DedupPolitica>("ignorar");
  const [erroUpload, setErroUpload] = useState<string | null>(null);
  const [resultado, setResultado] = useState<{
    criados: number;
    atualizados: number;
    duplicados: number;
    sem_empresa: number;
    erros: string[];
  } | null>(null);
  const [pending, start] = useTransition();
  const [templates, setTemplates] = useState<Template[]>([]);
  // Carrega templates só no client (evita SSR/hydration mismatch com localStorage)
  useEffect(() => setTemplates(carregarTemplates()), []);
  const [novoTemplateNome, setNovoTemplateNome] = useState("");
  const [page, setPage] = useState(0);
  const [edicoes, setEdicoes] = useState<Record<number, Partial<Record<string, any>>>>({});
  const [linhasRemovidas, setLinhasRemovidas] = useState<Set<number>>(new Set());

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setErroUpload(null);
    // Bloco B: limite de tamanho — evita travar o navegador com CSV gigante
    if (f.size > MAX_CSV_SIZE) {
      setErroUpload(t("base.import_arquivo_grande"));
      e.target.value = "";
      return;
    }
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
    reader.onerror = () => {
      setErroUpload(t("base.row_toast_erro"));
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
    setErroUpload(null);
    setPage(0);
    setEdicoes({});
    setLinhasRemovidas(new Set());
  }

  function aplicarTemplate(tpl: Template) {
    const novo: Record<string, CampoLead | null> = {};
    headers.forEach((h) => {
      novo[h] = tpl.mapping[h] ?? null;
    });
    setMapping(novo);
  }

  function salvarComoTemplate() {
    const nome = novoTemplateNome.trim();
    if (!nome) return;
    // Bloco B: confirma sobrescrita se já existe template com o mesmo nome
    const existente = templates.find((x) => x.nome === nome);
    if (existente && !window.confirm(t("base.import_template_existente"))) return;
    const novo: Template = { nome, mapping, criadoEm: Date.now() };
    salvarTemplate(novo);
    setTemplates(carregarTemplates());
    setNovoTemplateNome("");
  }

  const rowsMapeadas = useMemo(() => {
    return rawRows.map((row, i) => {
      const mapeado = aplicarMapping(row, mapping);
      const editado = edicoes[i];
      if (editado) {
        return { ...mapeado, ...editado };
      }
      return mapeado;
    });
  }, [rawRows, mapping, edicoes]);

  const rowsAtivas = useMemo(() => {
    return rowsMapeadas
      .map((r, i) => ({ ...r, _originalIndex: i }))
      .filter((r) => !linhasRemovidas.has(r._originalIndex));
  }, [rowsMapeadas, linhasRemovidas]);

  const totalSemEmpresa = rowsAtivas.filter((r) => !r.empresa).length;
  const totalValidos = rowsAtivas.length - totalSemEmpresa;
  const empresaMapeada = Object.values(mapping).includes("empresa");

  function importar() {
    start(async () => {
      try {
        const rowsParaImportar = rowsMapeadas.filter((_, i) => !linhasRemovidas.has(i));
        const r = await importarLeadsEmMassa(rowsParaImportar as any, politica);
        setResultado(r);
        setStep("resultado");
      } catch (e) {
        setErroUpload(e instanceof Error ? e.message : t("base.row_toast_erro"));
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-xs">
        <StepDot active={step === "upload"} done={step !== "upload"} label={t("base.import_step_arquivo")} />
        <ArrowRight className="w-3 h-3 text-muted-foreground" aria-hidden="true" />
        <StepDot active={step === "mapping"} done={step === "preview" || step === "resultado"} label={t("base.import_step_mapear")} />
        <ArrowRight className="w-3 h-3 text-muted-foreground" aria-hidden="true" />
        <StepDot active={step === "preview"} done={step === "resultado"} label={t("base.import_step_conferir")} />
        <ArrowRight className="w-3 h-3 text-muted-foreground" aria-hidden="true" />
        <StepDot active={step === "resultado"} done={false} label={t("base.import_step_pronto")} />
      </div>

      {step === "upload" && (
        <div className="card p-8 border-2 border-dashed text-center">
          <Upload className="w-8 h-8 mx-auto text-muted-foreground mb-2" aria-hidden="true" />
          <p className="text-sm text-foreground mb-3">{t("base.import_arraste_csv")}</p>
          <label className="btn-primary cursor-pointer inline-flex">
            <input type="file" accept=".csv,text/csv" onChange={handleFile} className="hidden" />
            {t("base.import_escolher_arquivo")}
          </label>
          {erroUpload && (
            <p
              role="alert"
              className="mt-3 text-xs text-destructive bg-destructive/5 border border-destructive/30 rounded-lg px-3 py-2 inline-flex items-center gap-1.5"
            >
              <AlertCircle className="w-3.5 h-3.5" aria-hidden="true" /> {erroUpload}
            </p>
          )}
          <p className="text-xs text-muted-foreground mt-4 max-w-md mx-auto">
            {t("base.import_aceita_exports")}
          </p>
          <p className="text-xs text-muted-foreground mt-2">
            <a
              href={`data:text/csv;charset=utf-8,${encodeURIComponent(
                "empresa,nome,cargo,email,whatsapp,segmento,cidade_uf,fonte\nClínica X,Maria,Diretora,maria@clinica.com.br,(11)99999-0000,Saúde,São Paulo/SP,Indicação\n"
              )}`}
              download="template_leads.csv"
              className="text-primary underline"
            >
              {t("base.import_baixar_template")}
            </a>
          </p>
        </div>
      )}

      {step === "mapping" && (
        <>
          <div className="card p-4 flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <Upload className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
              <div>
                <div className="text-sm font-medium">{filename}</div>
                <div className="text-xs text-muted-foreground">
                  {t("base.import_colunas_linhas")
                    .replace("{{cols}}", String(headers.length))
                    .replace("{{rows}}", String(rawRows.length))}
                </div>
              </div>
            </div>
            <button onClick={reset} className="btn-ghost text-xs">
              <X className="w-3.5 h-3.5" aria-hidden="true" /> {t("base.import_trocar_arquivo")}
            </button>
          </div>

          {templates.length > 0 && (
            <div className="card p-3">
              <div className="text-xs uppercase tracking-wider font-semibold text-muted-foreground mb-2 flex items-center gap-1">
                <Layers className="w-3 h-3" aria-hidden="true" /> {t("base.import_templates_salvos")}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {templates.map((tpl) => (
                  <button
                    key={tpl.nome}
                    onClick={() => aplicarTemplate(tpl)}
                    className="text-xs px-2 py-1 rounded-md bg-muted/50 hover:bg-muted text-foreground border border-border"
                  >
                    {tpl.nome}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="card p-4">
            <div className="text-sm font-medium text-foreground mb-2">{t("base.import_mapear_titulo")}</div>
            <p className="text-xs text-muted-foreground mb-4">
              {t("base.import_mapear_desc")}{" "}
              <span className="font-mono bg-muted px-1 rounded">{t("base.import_nao_importar")}</span>
            </p>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border/50">
                  <tr>
                    <th className="text-left py-2 font-medium">{t("base.import_coluna_csv")}</th>
                    <th className="text-left py-2 font-medium" aria-hidden="true">→</th>
                    <th className="text-left py-2 font-medium">{t("base.import_campo_guilds")}</th>
                    <th className="text-left py-2 font-medium">{t("base.import_exemplo")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/30">
                  {headers.map((h) => (
                    <tr key={h}>
                      <td className="py-2 font-mono text-xs text-foreground">{h}</td>
                      <td className="py-2 text-muted-foreground"><ArrowRight className="w-3 h-3" aria-hidden="true" /></td>
                      <td className="py-2">
                        <select
                          value={mapping[h] ?? ""}
                          onChange={(e) => {
                            const v = e.target.value as CampoLead | "";
                            setMapping({ ...mapping, [h]: v === "" ? null : v });
                          }}
                          aria-label={`${t("base.import_campo_guilds")} ${h}`}
                          className="input-base text-sm py-1 min-w-[200px]"
                        >
                          <option value="">{t("base.import_nao_importar")}</option>
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
              <div role="alert" className="mt-3 p-2 rounded-lg bg-urgent-500/10 border border-urgent-500/30 text-xs text-foreground flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-urgent-500" aria-hidden="true" />
                {t("base.import_empresa_obrigatorio")}
              </div>
            )}

            <div className="mt-4 pt-4 border-t border-border/50 flex items-center gap-2">
              <input
                type="text"
                value={novoTemplateNome}
                onChange={(e) => setNovoTemplateNome(e.target.value)}
                placeholder={t("base.import_salvar_template_placeholder")}
                aria-label={t("base.import_salvar_template_placeholder")}
                className="input-base text-xs flex-1"
              />
              <button
                onClick={salvarComoTemplate}
                disabled={!novoTemplateNome.trim()}
                className="btn-secondary text-xs"
              >
                <Save className="w-3 h-3" aria-hidden="true" /> {t("base.import_salvar")}
              </button>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2">
            <button onClick={reset} className="btn-ghost text-sm">
              <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" /> {t("base.import_trocar_arquivo")}
            </button>
            <button
              onClick={() => setStep("preview")}
              disabled={!empresaMapeada}
              className="btn-primary text-sm"
            >
              {t("base.import_conferir_btn")} <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>
        </>
      )}

      {step === "preview" && (
        <>
          <div className="card p-4">
            <div className="text-sm font-medium mb-2">{t("base.import_preview_titulo")}</div>
            <div className="text-xs text-muted-foreground mb-4">
              {t("base.import_validas").replace("{{n}}", String(totalValidos))}
              {totalSemEmpresa > 0 && (
                <> · {t("base.import_sem_empresa").replace("{{n}}", String(totalSemEmpresa))}</>
              )}
            </div>

            <div className="mb-4 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 text-xs text-foreground/80 space-y-1.5">
              <p className="font-medium text-blue-600 dark:text-blue-400">💡 Como o Status (CRM) afeta a importação:</p>
              <ul className="list-disc pl-4 space-y-0.5">
                <li><strong className="font-medium text-foreground">Vazio / Sem status:</strong> O lead cai na <strong>Base Bruta</strong> e precisará ser qualificado manualmente.</li>
                <li><strong className="font-medium text-foreground">Fechado, Perdido ou Nutrição:</strong> O lead é <strong>Arquivado</strong> como histórico (não pede qualificação e Fechados vão pro Kanban).</li>
                <li><strong className="font-medium text-foreground">Qualquer outra etapa:</strong> O lead vai <strong>direto para o Pipeline</strong> do Kanban (pulando a Base).</li>
              </ul>
            </div>

            <div className="overflow-x-auto max-h-[400px] overflow-y-auto border border-border/30 rounded-lg">
              <table className="w-full text-xs">
                <thead className="bg-muted/50 sticky top-0">
                  <tr>
                    <th className="text-left px-2 py-1.5 font-medium">#</th>
                    <th className="text-left px-2 py-1.5 font-medium">{t("base.tabela_empresa")}</th>
                    <th className="text-left px-2 py-1.5 font-medium">{t("modais.campo_nome")}</th>
                    <th className="text-left px-2 py-1.5 font-medium">{t("modais.campo_email")}</th>
                    <th className="text-left px-2 py-1.5 font-medium">{t("modais.campo_whatsapp")}</th>
                    <th className="text-left px-2 py-1.5 font-medium">{t("base.tabela_segmento")}</th>
                    <th className="px-3 py-2 text-left font-semibold">Resp. / Datas</th>
                    <th className="text-left px-2 py-1.5 font-medium">Status (CRM)</th>
                    <th className="text-left px-2 py-1.5 font-medium">{t("comum.status")}</th>
                    <th className="text-left px-2 py-1.5 font-medium"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/30">
                  {rowsAtivas.slice(page * 100, (page + 1) * 100).map((r, pIndex) => {
                    const i = r._originalIndex;
                    return (
                    <tr key={i} className={!r.empresa ? "bg-urgent-500/5" : ""}>
                      <td className="px-2 py-1 text-muted-foreground">{i + 1}</td>
                      <td className="px-1 py-1">
                        <input
                          value={(r.empresa as string) || ""}
                          onChange={(e) => setEdicoes(prev => ({ ...prev, [i]: { ...prev[i], empresa: e.target.value } }))}
                          placeholder="—"
                          className="w-full bg-transparent border border-transparent hover:border-border focus:border-primary focus:bg-background rounded px-1 py-0.5 text-foreground outline-none transition-colors"
                        />
                      </td>
                      <td className="px-1 py-1">
                        <input
                          value={(r.nome as string) || ""}
                          onChange={(e) => setEdicoes(prev => ({ ...prev, [i]: { ...prev[i], nome: e.target.value } }))}
                          placeholder="—"
                          className="w-full bg-transparent border border-transparent hover:border-border focus:border-primary focus:bg-background rounded px-1 py-0.5 text-muted-foreground focus:text-foreground outline-none transition-colors"
                        />
                      </td>
                      <td className="px-1 py-1">
                        <input
                          value={(r.email as string) || ""}
                          onChange={(e) => setEdicoes(prev => ({ ...prev, [i]: { ...prev[i], email: e.target.value } }))}
                          placeholder="—"
                          className="w-full bg-transparent border border-transparent hover:border-border focus:border-primary focus:bg-background rounded px-1 py-0.5 text-muted-foreground focus:text-foreground outline-none transition-colors"
                        />
                      </td>
                      <td className="px-1 py-1">
                        <input
                          value={(r.whatsapp as string) || ""}
                          onChange={(e) => setEdicoes(prev => ({ ...prev, [i]: { ...prev[i], whatsapp: e.target.value } }))}
                          placeholder="—"
                          className="w-full bg-transparent border border-transparent hover:border-border focus:border-primary focus:bg-background rounded px-1 py-0.5 text-muted-foreground focus:text-foreground outline-none transition-colors"
                        />
                      </td>
                      <td className="px-1 py-1">
                        <input
                          value={(r.segmento as string) || ""}
                          onChange={(e) => setEdicoes(prev => ({ ...prev, [i]: { ...prev[i], segmento: e.target.value } }))}
                          placeholder="—"
                          className="w-full bg-transparent border border-transparent hover:border-border focus:border-primary focus:bg-background rounded px-1 py-0.5 text-muted-foreground focus:text-foreground outline-none transition-colors"
                        />
                      </td>
                      <td className="px-3 py-2 align-top">
                        <select
                          value={r.responsavel_id || ""}
                          onChange={(e) => setEdicoes(prev => ({ ...prev, [i]: { ...prev[i], responsavel_id: e.target.value } }))}
                          className="input-base text-xs !py-1 !px-2 h-7"
                          aria-label="Responsável"
                        >
                          <option value="">(Automático)</option>
                          {profiles.map(p => (
                            <option key={p.id} value={p.id}>{p.display_name}</option>
                          ))}
                        </select>
                        <div className="flex flex-col gap-1.5 mt-1 min-w-[130px]">
                          <div className="flex items-center gap-1.5 bg-background/50 px-1.5 py-0.5 rounded border border-border/50 focus-within:border-primary/50 transition-colors">
                            <span className="text-[9px] uppercase tracking-wider text-muted-foreground font-medium w-12 shrink-0" title="Data em que o lead entrou">Entrou</span>
                            <input
                              type="date"
                              value={r.data_entrada || ""}
                              onChange={(e) => setEdicoes(prev => ({ ...prev, [i]: { ...prev[i], data_entrada: e.target.value } }))}
                              className="bg-transparent text-[10px] w-full outline-none text-foreground"
                              title="Data Entrou no CRM"
                            />
                          </div>
                          <div className="flex items-center gap-1.5 bg-background/50 px-1.5 py-0.5 rounded border border-border/50 focus-within:border-primary/50 transition-colors">
                            <span className="text-[9px] uppercase tracking-wider text-muted-foreground font-medium w-12 shrink-0" title="Data de Fechamento/Ganho">Fechou</span>
                            <input
                              type="date"
                              value={r.data_fechamento || ""}
                              onChange={(e) => setEdicoes(prev => ({ ...prev, [i]: { ...prev[i], data_fechamento: e.target.value } }))}
                              className="bg-transparent text-[10px] w-full outline-none text-foreground"
                              title="Data de Fechamento"
                            />
                          </div>
                        </div>
                      </td>
                      <td className="px-1 py-1">
                        <select
                          value={(r.crm_stage as string) || ""}
                          onChange={(e) => setEdicoes(prev => ({ ...prev, [i]: { ...prev[i], crm_stage: e.target.value } }))}
                          className="w-full bg-transparent border border-transparent hover:border-border focus:border-primary focus:bg-background rounded px-1 py-0.5 text-muted-foreground focus:text-foreground outline-none transition-colors appearance-none"
                        >
                          <option value="">Automático / Base</option>
                          {ETAPAS_CRM.map(st => (
                            <option key={st} value={st}>{st}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-2 py-1">
                        {r.empresa ? (
                          <span className="inline-flex items-center gap-1 text-success-500">
                            <CheckCircle2 className="w-3 h-3" aria-hidden="true" /> {t("base.import_status_ok")}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-urgent-500">
                            <AlertCircle className="w-3 h-3" aria-hidden="true" /> {t("base.import_status_sem_empresa")}
                          </span>
                        )}
                      </td>
                      <td className="px-1 py-1 text-center">
                        <button
                          onClick={() => {
                            setLinhasRemovidas(prev => {
                              const next = new Set(prev);
                              next.add(i);
                              return next;
                            });
                          }}
                          className="p-1 hover:bg-destructive/10 text-muted-foreground hover:text-destructive rounded transition-colors"
                          title="Remover linha"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {rowsAtivas.length > 100 && (
              <div className="flex items-center justify-between mt-3">
                <div className="text-[11px] text-muted-foreground">
                  Exibindo {page * 100 + 1} a {Math.min((page + 1) * 100, rowsAtivas.length)} de {rowsAtivas.length} linhas
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPage(p => Math.max(0, p - 1))}
                    disabled={page === 0}
                    className="btn-ghost text-xs px-2 py-1"
                  >
                    Anterior
                  </button>
                  <button
                    onClick={() => setPage(p => Math.min(Math.ceil(rowsAtivas.length / 100) - 1, p + 1))}
                    disabled={(page + 1) * 100 >= rowsAtivas.length}
                    className="btn-secondary text-xs px-2 py-1"
                  >
                    Próxima
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="card p-4">
            <div className="text-xs uppercase tracking-wider font-semibold text-muted-foreground mb-2">
              {t("base.import_dedup_titulo")}
            </div>
            <div className="space-y-2">
              {(
                [
                  { value: "ignorar", label: t("base.import_dedup_ignorar"), desc: t("base.import_dedup_ignorar_desc") },
                  { value: "atualizar", label: t("base.import_dedup_atualizar"), desc: t("base.import_dedup_atualizar_desc") },
                  { value: "criar_mesmo_assim", label: t("base.import_dedup_criar"), desc: t("base.import_dedup_criar_desc") },
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

          {erroUpload && (
            <p
              role="alert"
              className="text-xs text-destructive bg-destructive/5 border border-destructive/30 rounded-lg px-3 py-2 inline-flex items-center gap-1.5"
            >
              <AlertCircle className="w-3.5 h-3.5" aria-hidden="true" /> {erroUpload}
            </p>
          )}

          <div className="flex items-center justify-end gap-2">
            <button onClick={() => setStep("mapping")} className="btn-ghost text-sm">
              <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" /> {t("base.import_voltar_mapeamento")}
            </button>
            <button onClick={importar} disabled={pending || totalValidos === 0} className="btn-primary text-sm">
              {pending ? t("base.import_importando") : t("base.import_btn_importar").replace("{{n}}", String(totalValidos))}
            </button>
          </div>
        </>
      )}

      {step === "resultado" && resultado && (
        <div className="card p-6 text-center space-y-3">
          <CheckCircle2 className="w-10 h-10 mx-auto text-success-500" aria-hidden="true" />
          <div>
            <div className="text-lg font-semibold">{t("base.import_concluido")}</div>
            <div className="text-sm text-muted-foreground">
              <strong className="text-success-500">{resultado.criados}</strong> {t("base.import_criados")}
              {resultado.atualizados > 0 && (
                <> · <strong className="text-primary">{resultado.atualizados}</strong> {t("base.import_atualizados")}</>
              )}
              {resultado.duplicados > 0 && politica === "ignorar" && (
                <> · <strong className="text-warning-500">{resultado.duplicados}</strong> {t("base.import_duplicadas_ignoradas")}</>
              )}
              {resultado.sem_empresa > 0 && (
                <> · {t("base.import_sem_empresa").replace("{{n}}", String(resultado.sem_empresa))}</>
              )}
            </div>
          </div>
          {resultado.erros.length > 0 && (
            <div className="text-xs text-urgent-500 bg-urgent-500/10 border border-urgent-500/30 rounded-lg p-2 text-left">
              <div className="font-semibold mb-1">{t("base.import_erros_titulo").replace("{{n}}", String(resultado.erros.length))}</div>
              <ul className="list-disc list-inside">
                {resultado.erros.slice(0, 5).map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            </div>
          )}
          <div className="flex items-center justify-center gap-2 pt-2 flex-wrap">
            {resultado.erros.length > 0 && (
               <button onClick={() => setStep("conferencia")} className="btn-ghost text-sm">
                 <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" /> {t("base.import_voltar_conferencia") || "Voltar para conferência"}
               </button>
            )}
            <button onClick={reset} className="btn-secondary text-sm">{t("base.import_outro_arquivo")}</button>
            <Link href="/base?tab=bruta" className="btn-primary text-sm">{t("base.import_ver_base")}</Link>
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
