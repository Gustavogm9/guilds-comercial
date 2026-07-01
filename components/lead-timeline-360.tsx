"use client";
import { useState, useTransition, useRef, useCallback } from "react";
import {
  MessageSquare, PhoneCall, FileText, Zap, ArrowRightLeft,
  MessageCircle, Users, StickyNote, Video, Paperclip, Filter,
  Loader2, X, Send, ChevronDown, Target, Rocket, Globe,
  CheckCircle2, XCircle, Clock,
} from "lucide-react";
import WhatsappImport from "./whatsapp-import";
import GruposManager from "./grupos-manager";
import TimelineRealtime from "./timeline-realtime";

export type TimelineEvento = {
  id: number; tipo: string; titulo: string | null; conteudo: string | null;
  resumo_ia: string | null; metadata: Record<string, any>;
  ref_id: number | null; ref_tabela: string | null; criado_por: string | null;
  created_at: string; profiles?: { display_name: string } | null;
};

type Props = {
  leadId: number; orgId: string; eventosIniciais: TimelineEvento[];
  nomeVendedor: string; whatsapp?: string | null;
};

const TIPO_CFG: Record<string, { icon: any; label: string; cor: string; bg: string }> = {
  nota:               { icon: StickyNote,      label: "Nota",       cor: "text-amber-600",           bg: "bg-amber-500/10"     },
  stage_change:       { icon: ArrowRightLeft,  label: "Stage",      cor: "text-blue-600",             bg: "bg-blue-500/10"      },
  proposta_gerada:    { icon: FileText,         label: "Proposta",   cor: "text-purple-600",           bg: "bg-purple-500/10"    },
  proposta_status:    { icon: FileText,         label: "Proposta",   cor: "text-purple-600",           bg: "bg-purple-500/10"    },
  ligacao:            { icon: PhoneCall,        label: "Ligação",    cor: "text-green-600",            bg: "bg-green-500/10"     },
  cadencia:           { icon: Zap,              label: "Cadência",   cor: "text-primary",              bg: "bg-primary/10"       },
  whatsapp_importado: { icon: MessageCircle,   label: "WhatsApp",   cor: "text-emerald-600",          bg: "bg-emerald-500/10"   },
  whatsapp_direto:    { icon: MessageCircle,   label: "WhatsApp",   cor: "text-emerald-600",          bg: "bg-emerald-500/10"   },
  grupo_whatsapp:     { icon: Users,            label: "Grupo",      cor: "text-teal-600",             bg: "bg-teal-500/10"      },
  reuniao:            { icon: Video,            label: "Reunião",    cor: "text-rose-600",             bg: "bg-rose-500/10"      },
  documento:          { icon: Paperclip,        label: "Documento",  cor: "text-slate-600",            bg: "bg-slate-500/10"     },
  indicacao:          { icon: Target,           label: "Indicação",  cor: "text-orange-600",           bg: "bg-orange-500/10"    },
  motor_prospeccao:   { icon: Rocket,           label: "Motor",      cor: "text-indigo-600",           bg: "bg-indigo-500/10"    },
  sistema:            { icon: Globe,            label: "Sistema",    cor: "text-muted-foreground",     bg: "bg-secondary"        },
};

const FILTROS = [
  { key: "todos", label: "Todos" },
  { key: "nota",               label: "Notas"    },
  { key: "ligacao",            label: "Ligações" },
  { key: "whatsapp_importado", label: "WhatsApp" },
  { key: "proposta_gerada",    label: "Propostas"},
  { key: "stage_change",       label: "Stage"    },
  { key: "cadencia",           label: "Cadência" },
];

function fmtDate(d: string) {
  const dt = new Date(d);
  const diff = Math.floor((Date.now() - dt.getTime()) / 86400_000);
  const hm = dt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  if (diff === 0) return `hoje ${hm}`;
  if (diff === 1) return `ontem ${hm}`;
  return dt.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }) + " " + hm;
}

function TimelineItem({ ev }: { ev: TimelineEvento }) {
  const cfg = TIPO_CFG[ev.tipo] ?? TIPO_CFG.sistema;
  const Icon = cfg.icon;
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center">
        <div className={`w-8 h-8 rounded-full ${cfg.bg} ${cfg.cor} flex items-center justify-center shrink-0 mt-0.5`}>
          <Icon className="w-4 h-4" />
        </div>
        <div className="w-px flex-1 bg-border/40 mt-1 mb-1 min-h-[8px]" />
      </div>
      <div className="flex-1 pb-4 min-w-0">
        <div className="flex items-start gap-2 flex-wrap">
          <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${cfg.bg} ${cfg.cor}`}>
            {cfg.label}
          </span>
          {ev.tipo === "proposta_status" && (
            ev.metadata?.status_novo === "aceita"
              ? <CheckCircle2 className="w-3.5 h-3.5 text-green-600 mt-0.5" />
              : ev.metadata?.status_novo === "recusada"
              ? <XCircle className="w-3.5 h-3.5 text-destructive mt-0.5" /> : null
          )}
          <span className="text-[10px] text-muted-foreground ml-auto" suppressHydrationWarning>{fmtDate(ev.created_at)}</span>
        </div>
        <div className="mt-1">
          {ev.titulo && <div className="text-sm font-medium">{ev.titulo}</div>}
          {ev.conteudo && (
            <div className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
              {ev.conteudo.length > 200 && !expanded
                ? <>{ev.conteudo.slice(0, 200)}… <button onClick={() => setExpanded(true)} className="text-primary underline">ver mais</button></>
                : ev.conteudo}
            </div>
          )}
          {ev.resumo_ia && (
            <div className="mt-1.5 p-2 bg-primary/[0.04] rounded text-xs text-muted-foreground border border-primary/10">
              <span className="text-primary font-semibold text-[10px]">IA: </span>{ev.resumo_ia}
            </div>
          )}
        </div>
        {ev.tipo === "ligacao" && ev.metadata.tom && (
          <div className="mt-1 flex items-center gap-2">
            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
              ev.metadata.tom === "positivo" ? "bg-green-500/10 text-green-700" :
              ev.metadata.tom === "negativo" ? "bg-red-500/10 text-red-700" : "bg-secondary text-muted-foreground"
            }`}>{ev.metadata.tom}</span>
            {ev.metadata.duracao && <span className="text-[10px] text-muted-foreground">{Math.round(ev.metadata.duracao / 60)}min</span>}
          </div>
        )}
        {ev.tipo === "cadencia" && (
          <div className="mt-1 text-[10px] text-muted-foreground flex items-center gap-2">
            <span className="font-mono bg-secondary px-1.5 py-0.5 rounded">{ev.metadata.passo}</span>
            {ev.metadata.canal && <span>{ev.metadata.canal}</span>}
          </div>
        )}
        {ev.tipo === "whatsapp_importado" && (
          <div className="mt-1 text-[10px] text-muted-foreground">
            {ev.metadata.total_msgs} msgs{ev.metadata.contato_nome ? ` · ${ev.metadata.contato_nome}` : ""}
          </div>
        )}
        {ev.profiles?.display_name && (
          <div className="mt-1 text-[10px] text-muted-foreground/60">{ev.profiles.display_name}</div>
        )}
      </div>
    </div>
  );
}

export default function LeadTimeline360({ leadId, orgId, eventosIniciais, nomeVendedor, whatsapp }: Props) {
  const [eventos, setEventos] = useState<TimelineEvento[]>(eventosIniciais);
  const [filtro, setFiltro] = useState("todos");
  const [loading, setLoading] = useState(false);
  const [temMais, setTemMais] = useState(eventosIniciais.length === 50);
  const [aba, setAba] = useState<"timeline" | "whatsapp" | "grupos">("timeline");
  const [nota, setNota] = useState("");
  const [enviandoNota, startNota] = useTransition();

  // Realtime: prepend de novos eventos sem duplicar
  const prependEvento = useCallback((ev: TimelineEvento) => {
    setEventos(prev => {
      if (prev.some(e => e.id === ev.id)) return prev;
      return [ev, ...prev];
    });
  }, []);

  const eventosFiltrados = filtro === "todos" ? eventos
    : eventos.filter(e => {
        if (filtro === "whatsapp_importado") return e.tipo.startsWith("whatsapp");
        if (filtro === "proposta_gerada") return e.tipo.startsWith("proposta");
        return e.tipo === filtro;
      });

  async function carregarMais() {
    if (loading || !temMais) return;
    const ultimo = eventos[eventos.length - 1];
    if (!ultimo) return;
    setLoading(true);
    try {
      const r = await fetch(`/api/leads/${leadId}/timeline?limit=50&before=${encodeURIComponent(ultimo.created_at)}${filtro !== "todos" ? `&tipo=${filtro}` : ""}`);
      const d = await r.json();
      if (d.eventos?.length) { setEventos(p => [...p, ...d.eventos]); setTemMais(d.eventos.length === 50); }
      else setTemMais(false);
    } finally { setLoading(false); }
  }

  function adicionarNota() {
    const txt = nota.trim();
    if (!txt) return;
    startNota(async () => {
      const r = await fetch(`/api/leads/${leadId}/timeline`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo: "nota", titulo: "Nota", conteudo: txt }),
      });
      const d = await r.json();
      if (d.ok) {
        setEventos(p => [{ id: d.id, tipo: "nota", titulo: "Nota", conteudo: txt, resumo_ia: null, metadata: {}, ref_id: null, ref_tabela: null, criado_por: null, created_at: new Date().toISOString(), profiles: { display_name: nomeVendedor } }, ...p]);
        setNota("");
      }
    });
  }

  return (
    <div className="space-y-4">
      {/* Subscriber headless de Realtime */}
      <TimelineRealtime leadId={leadId} orgId={orgId} onNovoEvento={prependEvento} />

      {/* Abas */}
      <div className="flex items-center gap-1 p-0.5 bg-secondary/40 rounded-lg w-fit">
        {([
          { key: "timeline", label: "Timeline", icon: Clock },
          { key: "whatsapp", label: "WhatsApp", icon: MessageCircle },
          { key: "grupos",   label: "Grupos",   icon: Users },
        ] as const).map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setAba(key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-all ${aba === key ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
            <Icon className="w-3.5 h-3.5" />{label}
          </button>
        ))}
      </div>

      {aba === "timeline" && (
        <>
          {/* Filtros */}
          <div className="flex items-center gap-1 flex-wrap">
            <Filter className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            {FILTROS.map(f => (
              <button key={f.key} onClick={() => setFiltro(f.key)}
                className={`text-[10px] px-2 py-1 rounded border transition-all ${filtro === f.key ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-foreground/30"}`}>
                {f.label}
              </button>
            ))}
          </div>

          {/* Nota rápida */}
          <div className="card p-3">
            <div className="flex gap-2">
              <div className="w-7 h-7 rounded-full bg-amber-500/10 flex items-center justify-center shrink-0 mt-0.5">
                <StickyNote className="w-3.5 h-3.5 text-amber-600" />
              </div>
              <div className="flex-1">
                <textarea value={nota} onChange={e => setNota(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) adicionarNota(); }}
                  placeholder="Adicionar nota… (Ctrl+Enter para salvar)"
                  className="w-full text-sm bg-transparent resize-none outline-none placeholder:text-muted-foreground/60 min-h-[28px]" rows={1} />
                {nota.trim() && (
                  <div className="flex justify-end gap-2 mt-1.5">
                    <button onClick={() => setNota("")}><X className="w-3.5 h-3.5 text-muted-foreground" /></button>
                    <button onClick={adicionarNota} disabled={enviandoNota} className="btn-primary !py-1 !px-2 text-xs gap-1">
                      {enviandoNota ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />} Salvar nota
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Lista */}
          {eventosFiltrados.length === 0
            ? <div className="card p-8 text-center border-dashed">
                <Clock className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Nenhuma interação registrada.</p>
              </div>
            : <div className="space-y-0">
                {eventosFiltrados.map(ev => <TimelineItem key={ev.id} ev={ev} />)}
                {temMais && (
                  <button onClick={carregarMais} disabled={loading} className="btn-ghost text-xs w-full gap-1.5 mt-2">
                    {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    Carregar mais
                  </button>
                )}
              </div>
          }
        </>
      )}

      {aba === "whatsapp" && <WhatsappImport leadId={leadId} nomeVendedor={nomeVendedor} whatsapp={whatsapp} />}
      {aba === "grupos"   && <GruposManager leadId={leadId} />}
    </div>
  );
}
