"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { importarLeadsEmMassa } from "../actions";
import { Upload, CheckCircle2, AlertCircle, X } from "lucide-react";
import Link from "next/link";

type Row = {
  empresa?: string;
  nome?: string;
  cargo?: string;
  email?: string;
  whatsapp?: string;
  linkedin?: string;
  segmento?: string;
  cidade_uf?: string;
  fonte?: string;
  observacoes?: string;
  __valid?: boolean;
  __erro?: string;
};

const COLUNAS_ACEITAS = [
  "empresa", "nome", "cargo", "email", "whatsapp", "linkedin",
  "segmento", "cidade_uf", "fonte", "observacoes",
];

function parseCsv(text: string): Row[] {
  // Parser simples — trata aspas, vírgulas e \r\n.
  const linhas: string[][] = [];
  let cur: string[] = [];
  let campo = "";
  let dentroAspas = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const next = text[i + 1];
    if (dentroAspas) {
      if (c === '"' && next === '"') { campo += '"'; i++; continue; }
      if (c === '"') { dentroAspas = false; continue; }
      campo += c; continue;
    }
    if (c === '"') { dentroAspas = true; continue; }
    if (c === ",") { cur.push(campo); campo = ""; continue; }
    if (c === "\n" || c === "\r") {
      if (c === "\r" && next === "\n") i++;
      cur.push(campo); campo = "";
      if (cur.some(x => x.length > 0)) linhas.push(cur);
      cur = []; continue;
    }
    campo += c;
  }
  if (campo.length > 0 || cur.length > 0) { cur.push(campo); if (cur.some(x => x.length > 0)) linhas.push(cur); }

  if (linhas.length === 0) return [];
  const header = linhas[0].map(h => h.trim().toLowerCase().replace(/\s+/g, "_"));
  const rows: Row[] = [];
  for (let r = 1; r < linhas.length; r++) {
    const obj: Row = {};
    header.forEach((col, idx) => {
      if (COLUNAS_ACEITAS.includes(col)) {
        (obj as any)[col] = (linhas[r][idx] ?? "").trim();
      }
    });
    obj.__valid = !!(obj.empresa && obj.empresa.length > 0);
    if (!obj.__valid) obj.__erro = "Falta empresa";
    rows.push(obj);
  }
  return rows;
}

export default function ImportarCsvClient() {
  const [rows, setRows] = useState<Row[]>([]);
  const [filename, setFilename] = useState<string | null>(null);
  const [resultado, setResultado] = useState<{ criados: number; ignorados: number } | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFilename(f.name);
    setResultado(null);
    const reader = new FileReader();
    reader.onload = () => setRows(parseCsv(String(reader.result ?? "")));
    reader.readAsText(f, "UTF-8");
  }

  function descartar() {
    setRows([]); setFilename(null); setResultado(null);
  }

  function importar() {
    const validos = rows.filter(r => r.__valid).map(r => ({
      empresa: r.empresa, nome: r.nome, cargo: r.cargo,
      email: r.email, whatsapp: r.whatsapp, linkedin: r.linkedin,
      segmento: r.segmento, cidade_uf: r.cidade_uf,
      fonte: r.fonte, observacoes: r.observacoes,
    }));
    start(async () => {
      const r = await importarLeadsEmMassa(validos);
      setResultado({ criados: r.criados, ignorados: r.ignorados });
    });
  }

  const totalValidos = rows.filter(r => r.__valid).length;
  const totalInvalidos = rows.length - totalValidos;

  return (
    <div className="space-y-4">
      {!filename && (
        <div className="card p-8 border-2 border-dashed border-slate-200 text-center">
          <Upload className="w-8 h-8 mx-auto text-slate-400 mb-2"/>
          <p className="text-sm text-slate-600 mb-3">Arraste um CSV ou clique para selecionar</p>
          <label className="btn-primary cursor-pointer inline-flex">
            <input type="file" accept=".csv,text/csv" onChange={handleFile} className="hidden"/>
            Escolher arquivo CSV
          </label>
          <div className="mt-6 text-left max-w-xl mx-auto">
            <p className="text-xs font-semibold text-slate-600 mb-2">Colunas aceitas (cabeçalho):</p>
            <div className="flex flex-wrap gap-1.5">
              {COLUNAS_ACEITAS.map(c => (
                <code key={c} className="text-[11px] bg-slate-100 px-1.5 py-0.5 rounded text-slate-700">{c}</code>
              ))}
            </div>
            <p className="text-xs text-slate-500 mt-3">
              <b>empresa</b> é obrigatório. Linhas sem empresa são ignoradas.
              Você pode baixar um{" "}
              <a
                href={`data:text/csv;charset=utf-8,${encodeURIComponent(
                  "empresa,nome,cargo,email,whatsapp,segmento,cidade_uf,fonte\nClínica X,Maria,Diretora,maria@clinica.com.br,(11)99999-0000,Saúde,São Paulo/SP,Indicação\n"
                )}`}
                download="template_leads.csv"
                className="text-guild-700 underline">
                template de exemplo
              </a>.
            </p>
          </div>
        </div>
      )}

      {filename && !resultado && (
        <>
          <div className="card p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Upload className="w-4 h-4 text-slate-500"/>
              <div>
                <div className="text-sm font-medium">{filename}</div>
                <div className="text-xs text-slate-500">
                  {rows.length} linha(s) · <span className="text-emerald-600">{totalValidos} válidas</span>
                  {totalInvalidos > 0 && <> · <span className="text-rose-600">{totalInvalidos} com erro</span></>}
                </div>
              </div>
            </div>
            <button onClick={descartar} className="btn-ghost text-xs">
              <X className="w-3.5 h-3.5"/> Descartar
            </button>
          </div>

          <div className="card overflow-hidden">
            <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 sticky top-0">
                  <tr>
                    <th className="text-left px-2 py-1.5 font-medium">#</th>
                    <th className="text-left px-2 py-1.5 font-medium">Empresa</th>
                    <th className="text-left px-2 py-1.5 font-medium">Nome</th>
                    <th className="text-left px-2 py-1.5 font-medium">Email</th>
                    <th className="text-left px-2 py-1.5 font-medium">WhatsApp</th>
                    <th className="text-left px-2 py-1.5 font-medium">Segmento</th>
                    <th className="text-left px-2 py-1.5 font-medium">Fonte</th>
                    <th className="text-left px-2 py-1.5 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((r, i) => (
                    <tr key={i} className={r.__valid ? "" : "bg-rose-50"}>
                      <td className="px-2 py-1 text-slate-400">{i + 1}</td>
                      <td className="px-2 py-1 font-medium">{r.empresa || <span className="text-slate-400">—</span>}</td>
                      <td className="px-2 py-1">{r.nome || "—"}</td>
                      <td className="px-2 py-1">{r.email || "—"}</td>
                      <td className="px-2 py-1">{r.whatsapp || "—"}</td>
                      <td className="px-2 py-1">{r.segmento || "—"}</td>
                      <td className="px-2 py-1">{r.fonte || "Lista fria"}</td>
                      <td className="px-2 py-1">
                        {r.__valid
                          ? <span className="inline-flex items-center gap-1 text-emerald-600"><CheckCircle2 className="w-3 h-3"/> ok</span>
                          : <span className="inline-flex items-center gap-1 text-rose-600"><AlertCircle className="w-3 h-3"/> {r.__erro}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2">
            <button onClick={descartar} className="btn-ghost text-sm">Cancelar</button>
            <button onClick={importar} disabled={pending || totalValidos === 0} className="btn-primary text-sm">
              {pending ? "Importando…" : `Importar ${totalValidos} lead(s) para Base bruta`}
            </button>
          </div>
        </>
      )}

      {resultado && (
        <div className="card p-6 text-center space-y-3">
          <CheckCircle2 className="w-10 h-10 mx-auto text-emerald-500"/>
          <div>
            <div className="text-lg font-semibold">Importação concluída</div>
            <div className="text-sm text-slate-600">
              <b className="text-emerald-600">{resultado.criados}</b> lead(s) criados.
              {resultado.ignorados > 0 && <> {resultado.ignorados} ignorado(s).</>}
            </div>
          </div>
          <div className="flex items-center justify-center gap-2 pt-2">
            <button onClick={descartar} className="btn-secondary text-sm">Importar outro arquivo</button>
            <Link href="/base?tab=bruta" className="btn-primary text-sm">Ver na Base bruta</Link>
          </div>
        </div>
      )}
    </div>
  );
}
