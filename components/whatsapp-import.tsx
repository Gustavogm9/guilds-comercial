"use client";
import { useState, useTransition } from "react";
import { Upload, MessageCircle, Loader2, CheckCircle2, X, Eye, ThumbsUp, ThumbsDown, Minus } from "lucide-react";

type Conversa = {
  id: number; contato_nome: string | null; arquivo_nome: string | null;
  total_msgs: number; primeira_msg: string | null; ultima_msg: string | null;
  resumo_ia: string | null; sentimento: string | null; pontos_chave: any[];
  nivel_interesse: number | null;
};

export default function WhatsappImport({ leadId, nomeVendedor, whatsapp }: {
  leadId: number; nomeVendedor: string; whatsapp?: string | null;
}) {
  const [conversas, setConversas] = useState<Conversa[]>([]);
  const [carregado, setCarregado] = useState(false);
  const [arrastando, setArrastando] = useState(false);
  const [importando, startImport] = useTransition();
  const [resultado, setResultado] = useState<any | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [conversaAberta, setConversaAberta] = useState<number | null>(null);

  if (!carregado) {
    setCarregado(true);
    fetch(`/api/leads/${leadId}/whatsapp`)
      .then(r => r.json()).then(d => d.conversas && setConversas(d.conversas)).catch(() => null);
  }

  function importarArquivo(file: File) {
    if (!file.name.endsWith(".txt") && !file.name.endsWith(".zip")) {
      setErro("Formato inválido. Exporte a conversa do WhatsApp como .txt");
      return;
    }
    setErro(null);
    setResultado(null);
    startImport(async () => {
      try {
        const form = new FormData();
        form.append("file", file);
        form.append("nome_vendedor", nomeVendedor);
        const r = await fetch(`/api/leads/${leadId}/whatsapp`, { method: "POST", body: form });
        const d = await r.json();
        if (!r.ok) throw new Error(d.erro);
        setResultado(d);
        const lista = await fetch(`/api/leads/${leadId}/whatsapp`).then(r => r.json());
        if (lista.conversas) setConversas(lista.conversas);
      } catch (e: any) { setErro(e.message); }
    });
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault(); setArrastando(false);
    const file = e.dataTransfer.files[0];
    if (file) importarArquivo(file);
  }

  const sentIcon = (s: string | null) =>
    s === "positivo" ? <ThumbsUp className="w-3.5 h-3.5 text-green-600" /> :
    s === "negativo" ? <ThumbsDown className="w-3.5 h-3.5 text-red-600" /> :
    <Minus className="w-3.5 h-3.5 text-muted-foreground" />;

  return (
    <div className="space-y-4">
      {/* Instrução de export */}
      <div className="card p-3 bg-emerald-500/[0.03] border-emerald-500/20 text-xs text-muted-foreground">
        <div className="font-semibold text-emerald-700 mb-1">Como importar uma conversa</div>
        <ol className="list-decimal list-inside space-y-0.5">
          <li>Abra o WhatsApp → conversa → ⋮ → Exportar conversa</li>
          <li>Escolha <strong>Sem mídia</strong> → compartilhe o arquivo .txt</li>
          <li>Arraste o arquivo aqui ou clique para selecionar</li>
        </ol>
        {whatsapp && (
          <a href={`https://wa.me/${whatsapp.replace(/\D/g, "")}`} target="_blank" rel="noreferrer"
            className="inline-flex items-center gap-1 mt-2 text-emerald-700 underline font-semibold">
            <MessageCircle className="w-3.5 h-3.5" /> Abrir chat no WhatsApp
          </a>
        )}
      </div>

      {/* Drop zone */}
      <div
        onDrop={handleDrop}
        onDragOver={e => { e.preventDefault(); setArrastando(true); }}
        onDragLeave={() => setArrastando(false)}
        className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer ${
          arrastando ? "border-emerald-500 bg-emerald-500/5" : "border-border hover:border-emerald-500/50"
        }`}
        onClick={() => document.getElementById("wpp-upload")?.click()}
      >
        <input id="wpp-upload" type="file" accept=".txt" className="hidden"
          onChange={e => e.target.files?.[0] && importarArquivo(e.target.files[0])} />
        {importando
          ? <><Loader2 className="w-8 h-8 text-emerald-600 animate-spin mx-auto mb-2" /><p className="text-sm">Importando e analisando…</p></>
          : <><Upload className="w-8 h-8 text-muted-foreground/50 mx-auto mb-2" /><p className="text-sm text-muted-foreground">Arraste o arquivo .txt ou clique para selecionar</p></>
        }
      </div>

      {/* Resultado do import */}
      {resultado && (
        <div className="card p-3 bg-green-500/5 border-green-500/20 flex items-start gap-2 animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0 mt-0.5" />
          <div className="text-sm">
            <div className="font-semibold">{resultado.total_msgs} mensagens importadas!</div>
            {resultado.contato_nome && <div className="text-xs text-muted-foreground">Contato: {resultado.contato_nome}</div>}
            <div className="text-xs text-muted-foreground">
              {resultado.primeira_msg && new Date(resultado.primeira_msg).toLocaleDateString("pt-BR")} → {resultado.ultima_msg && new Date(resultado.ultima_msg).toLocaleDateString("pt-BR")}
            </div>
          </div>
          <button onClick={() => setResultado(null)} className="ml-auto"><X className="w-3.5 h-3.5" /></button>
        </div>
      )}
      {erro && (
        <div className="card p-3 bg-destructive/5 border-destructive/20 text-sm text-destructive flex items-start gap-2">
          <X className="w-4 h-4 shrink-0" /> {erro}
        </div>
      )}

      {/* Lista de conversas */}
      {conversas.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Conversas importadas
          </div>
          {conversas.map(c => (
            <div key={c.id} className="card p-3">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-emerald-500/10 flex items-center justify-center shrink-0">
                  <MessageCircle className="w-4 h-4 text-emerald-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{c.contato_nome ?? c.arquivo_nome ?? "Conversa"}</span>
                    {sentIcon(c.sentimento)}
                    {c.nivel_interesse && (
                      <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded font-bold">
                        Interesse {c.nivel_interesse}/10
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {c.total_msgs} msgs ·{" "}
                    {c.primeira_msg && new Date(c.primeira_msg).toLocaleDateString("pt-BR")} →{" "}
                    {c.ultima_msg && new Date(c.ultima_msg).toLocaleDateString("pt-BR")}
                  </div>
                  {c.resumo_ia && (
                    <div className="mt-2 p-2 bg-primary/[0.04] rounded text-xs text-muted-foreground border border-primary/10">
                      <span className="text-primary font-semibold text-[10px]">Resumo IA: </span>{c.resumo_ia}
                    </div>
                  )}
                  {c.pontos_chave?.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {(c.pontos_chave as string[]).map((pk, i) => (
                        <span key={i} className="text-[10px] bg-secondary px-1.5 py-0.5 rounded text-muted-foreground">{pk}</span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
