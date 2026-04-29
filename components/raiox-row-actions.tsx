"use client";
import { useState, useTransition } from "react";
import { marcarPago, salvarResultado } from "@/app/(app)/raio-x/actions";
import { gerarOfertaRaioX, gerarDocumentoRaioX } from "@/lib/ai/actions";
import { Check, FileText, X, Sparkles, Loader2, Copy, ExternalLink } from "lucide-react";

export default function RaioXRowActions({
  raioxId, leadId, jaPago, jaTemResultado,
  empresa, nome, cargo, segmento, whatsapp,
}: {
  raioxId: number; leadId: number; jaPago: boolean; jaTemResultado: boolean;
  empresa?: string; nome?: string; cargo?: string; segmento?: string; whatsapp?: string;
}) {
  const [pending, start] = useTransition();
  const [open, setOpen] = useState<null | "result">(null);
  const [form, setForm] = useState({
    score: 50,
    perda: 0,
    nivel: "Médio" as "Alto" | "Médio" | "Baixo",
    saida: "Diagnóstico pago",
    diag_pago: "Sim",
    obs: "",
  });

  // IA states
  const [gerandoOferta, setGerandoOferta] = useState(false);
  const [textoOferta, setTextoOferta] = useState("");
  const [gerandoDoc, setGerandoDoc] = useState(false);
  const [textoDoc, setTextoDoc] = useState("");
  const [erroIA, setErroIA] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [showIA, setShowIA] = useState<null | "oferta" | "doc">(null);
  const [transcricao, setTranscricao] = useState("");

  async function gerarOferta(canal: "WhatsApp" | "Email" | "LinkedIn") {
    setGerandoOferta(true);
    setErroIA(null);
    try {
      const r = await gerarOfertaRaioX({
        leadId,
        empresa: empresa ?? "—",
        nome: nome ?? "—",
        cargo,
        segmento,
        canal,
        tipo_voucher: "Nenhum",
      });
      if (r.ok) setTextoOferta(r.texto);
      else setErroIA(r.erro ?? "Erro ao gerar oferta");
    } catch (err) {
      setErroIA(err instanceof Error ? err.message : String(err));
    } finally {
      setGerandoOferta(false);
    }
  }

  async function gerarDoc() {
    if (!transcricao.trim()) return;
    setGerandoDoc(true);
    setErroIA(null);
    try {
      const r = await gerarDocumentoRaioX({
        leadId,
        empresa: empresa ?? "—",
        segmento,
        conteudo_call: transcricao,
      });
      if (r.ok) setTextoDoc(typeof r.texto === "string" ? r.texto : JSON.stringify(r.texto, null, 2));
      else setErroIA(r.erro ?? "Erro ao gerar documento");
    } catch (err) {
      setErroIA(err instanceof Error ? err.message : String(err));
    } finally {
      setGerandoDoc(false);
    }
  }

  async function copiar(text: string) {
    await navigator.clipboard.writeText(text);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 justify-end flex-wrap">
        {!jaPago && (
          <button disabled={pending}
            onClick={() => start(async () => { await marcarPago(raioxId, leadId); })}
            className="btn-secondary text-xs">
            <Check className="w-3.5 h-3.5"/> Pago
          </button>
        )}
        {jaPago && !jaTemResultado && (
          <button onClick={() => setOpen("result")} className="btn-primary text-xs">
            <FileText className="w-3.5 h-3.5"/> Lançar resultado
          </button>
        )}

        {/* FR-RX-04 — Gerar oferta com IA */}
        <button
          onClick={() => setShowIA(showIA === "oferta" ? null : "oferta")}
          className="inline-flex items-center gap-1 text-[11px] font-medium
            bg-primary text-primary-foreground px-2.5 py-1.5 rounded-md
            hover:brightness-110 transition-colors"
        >
          <Sparkles className="w-3 h-3"/> Oferta IA
        </button>

        {/* FR-RX-05 — Gerar documento com IA (só quando pago/concluído) */}
        {jaPago && (
          <button
            onClick={() => setShowIA(showIA === "doc" ? null : "doc")}
            className="inline-flex items-center gap-1 text-[11px] font-medium
              bg-accent text-accent-foreground px-2.5 py-1.5 rounded-md
              hover:brightness-110 transition-colors"
          >
            <FileText className="w-3 h-3"/> Documento IA
          </button>
        )}
      </div>

      {/* Painel IA: Gerar Oferta */}
      {showIA === "oferta" && (
        <div className="bg-primary/5 border border-primary/25 rounded-lg p-3 space-y-2">
          <div className="text-xs font-semibold text-primary">✨ Gerar oferta do Raio-X via IA</div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-muted-foreground">Canal:</span>
            {(["WhatsApp", "Email", "LinkedIn"] as const).map(canal => (
              <button key={canal} disabled={gerandoOferta}
                onClick={() => gerarOferta(canal)}
                className="text-[11px] px-2 py-1 rounded bg-card border border-primary/25
                  hover:bg-primary/10 disabled:opacity-50 transition-colors"
              >
                {gerandoOferta ? <Loader2 className="w-3 h-3 animate-spin inline" /> : canal}
              </button>
            ))}
          </div>
          {erroIA && (
            <div className="text-[11px] text-destructive bg-destructive/10 border border-destructive/25 rounded p-1.5">{erroIA}</div>
          )}
          {textoOferta && (
            <div className="space-y-2">
              <textarea
                value={textoOferta}
                onChange={(e) => setTextoOferta(e.target.value)}
                rows={5}
                className="w-full text-xs border border-primary/25 rounded-md p-2 bg-card text-foreground resize-y"
              />
              <div className="flex items-center gap-2">
                <button onClick={() => copiar(textoOferta)}
                  className="inline-flex items-center gap-1 text-[11px] bg-foreground text-background px-2 py-1 rounded hover:opacity-90">
                  {copiado ? <><Check className="w-3 h-3"/> Copiado!</> : <><Copy className="w-3 h-3"/> Copiar</>}
                </button>
                {whatsapp && (
                  <button
                    onClick={() => {
                      const num = whatsapp.replace(/\D/g, "");
                      window.open(`https://wa.me/${num.startsWith("55") ? num : `55${num}`}?text=${encodeURIComponent(textoOferta)}`, "_blank");
                    }}
                    className="inline-flex items-center gap-1 text-[11px] bg-success-500 text-white px-2 py-1 rounded hover:brightness-110"
                  >
                    <ExternalLink className="w-3 h-3"/> WhatsApp
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Painel IA: Gerar Documento */}
      {showIA === "doc" && (
        <div className="bg-accent/5 border border-accent/25 rounded-lg p-3 space-y-2">
          <div className="text-xs font-semibold text-accent">📄 Gerar documento do Raio-X a partir da call</div>
          <textarea
            value={transcricao}
            onChange={(e) => setTranscricao(e.target.value)}
            placeholder="Cole aqui a transcrição ou resumo da call de Raio-X..."
            rows={4}
            className="w-full text-xs border border-accent/25 rounded-md p-2 bg-card text-foreground resize-y"
          />
          <button onClick={gerarDoc} disabled={gerandoDoc || !transcricao.trim()}
            className="inline-flex items-center gap-1 text-[11px] font-medium
              bg-accent text-accent-foreground px-2.5 py-1.5 rounded-md
              hover:brightness-110 disabled:opacity-50 transition-colors"
          >
            {gerandoDoc ? <><Loader2 className="w-3 h-3 animate-spin"/> Gerando...</> : <><Sparkles className="w-3 h-3"/> Gerar documento</>}
          </button>
          {erroIA && (
            <div className="text-[11px] text-destructive bg-destructive/10 border border-destructive/25 rounded p-1.5">{erroIA}</div>
          )}
          {textoDoc && (
            <div className="space-y-2">
              <textarea
                value={textoDoc}
                onChange={(e) => setTextoDoc(e.target.value)}
                rows={8}
                className="w-full text-xs border border-accent/25 rounded-md p-2 bg-card text-foreground resize-y font-mono"
              />
              <button onClick={() => copiar(textoDoc)}
                className="inline-flex items-center gap-1 text-[11px] bg-foreground text-background px-2 py-1 rounded hover:opacity-90">
                {copiado ? <><Check className="w-3 h-3"/> Copiado!</> : <><Copy className="w-3 h-3"/> Copiar</>}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Modal de resultado (mantido) */}
      {open === "result" && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
             onClick={() => setOpen(null)}>
          <form onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => { e.preventDefault(); start(async () => {
              await salvarResultado({
                raio_x_id: raioxId, lead_id: leadId,
                score: form.score, perda_anual_estimada: form.perda,
                nivel: form.nivel, saida_recomendada: form.saida,
                diagnostico_pago_sugerido: form.diag_pago,
                observacoes: form.obs || undefined,
              });
              setOpen(null);
            })}}
            className="bg-card border border-border rounded-2xl max-w-lg w-full p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="font-semibold">Resultado do Raio-X</div>
              <button type="button" onClick={() => setOpen(null)} className="btn-ghost"><X className="w-4 h-4"/></button>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <label className="label">Score (0-100)</label>
                <input type="number" min={0} max={100} value={form.score}
                  onChange={(e) => setForm({...form, score: parseInt(e.target.value || "0", 10)})}
                  className="input-base mt-1"/>
              </div>
              <div>
                <label className="label">Nível</label>
                <select value={form.nivel}
                  onChange={(e) => setForm({...form, nivel: e.target.value as any})}
                  className="input-base mt-1">
                  <option>Alto</option><option>Médio</option><option>Baixo</option>
                </select>
              </div>
              <div className="col-span-2">
                <label className="label">Perda anual estimada (R$)</label>
                <input type="number" min={0} step={1000} value={form.perda}
                  onChange={(e) => setForm({...form, perda: parseFloat(e.target.value || "0")})}
                  className="input-base mt-1"/>
              </div>
              <div className="col-span-2">
                <label className="label">Saída recomendada</label>
                <input value={form.saida}
                  onChange={(e) => setForm({...form, saida: e.target.value})}
                  className="input-base mt-1"/>
              </div>
              <div className="col-span-2">
                <label className="label">Diagnóstico pago sugerido?</label>
                <select value={form.diag_pago}
                  onChange={(e) => setForm({...form, diag_pago: e.target.value})}
                  className="input-base mt-1">
                  <option>Sim</option><option>Talvez</option><option>Não</option>
                </select>
              </div>
              <div className="col-span-2">
                <label className="label">Observações</label>
                <textarea value={form.obs}
                  onChange={(e) => setForm({...form, obs: e.target.value})}
                  className="input-base mt-1 min-h-[60px]"/>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={() => setOpen(null)} className="btn-ghost text-sm">Cancelar</button>
              <button type="submit" disabled={pending} className="btn-primary text-sm">Salvar</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
