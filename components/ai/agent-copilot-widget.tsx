"use client";

import { useState, useRef, useEffect } from "react";
import { Bot, Send, X, Loader2, Maximize2, Minimize2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import clsx from "clsx";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

export default function AgentCopilotWidget() {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    { id: "1", role: "assistant", content: "Olá! Sou o Copilot do Guilds. Como posso ajudar com seus leads, campanhas ou cadências hoje?" }
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  
  const endRef = useRef<HTMLDivElement>(null);
  const supabase = createClient();

  // Rolar para o final quando mensagens mudam
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userMsg = input.trim();
    setInput("");
    setMessages(prev => [...prev, { id: Date.now().toString(), role: "user", content: userMsg }]);
    setLoading(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Não autenticado");

      const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/agent-copilot`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ message: userMsg, channel: "in_app" })
      });

      if (!res.ok) throw new Error("Erro de comunicação com a IA.");
      
      const data = await res.json();
      setMessages(prev => [...prev, { id: Date.now().toString(), role: "assistant", content: data.reply }]);

    } catch (err: any) {
      setMessages(prev => [...prev, { id: Date.now().toString(), role: "assistant", content: `❌ Erro: ${err.message}` }]);
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <button 
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-50 p-4 bg-primary text-primary-foreground rounded-full shadow-xl hover:scale-105 transition-transform"
      >
        <Bot className="w-6 h-6" />
      </button>
    );
  }

  return (
    <div className={clsx(
      "fixed z-50 bg-background border rounded-2xl shadow-2xl flex flex-col transition-all overflow-hidden",
      expanded 
        ? "bottom-4 right-4 left-4 top-20 md:left-auto md:w-[600px]" 
        : "bottom-6 right-6 w-full max-w-[380px] h-[600px] max-h-[80vh]"
    )}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 bg-primary/5 border-b">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
            <Bot className="w-4 h-4 text-primary" />
          </div>
          <div>
            <div className="text-sm font-semibold">Guilds Copilot</div>
            <div className="text-[10px] text-muted-foreground flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span> Online
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setExpanded(!expanded)} className="p-2 text-muted-foreground hover:bg-black/5 rounded-md">
            {expanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
          <button onClick={() => setOpen(false)} className="p-2 text-muted-foreground hover:bg-black/5 rounded-md">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-muted/30">
        {messages.map(m => (
          <div key={m.id} className={clsx("flex flex-col max-w-[85%]", m.role === "user" ? "ml-auto items-end" : "mr-auto items-start")}>
            <div className={clsx(
              "px-4 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap",
              m.role === "user" 
                ? "bg-primary text-primary-foreground rounded-tr-sm" 
                : "bg-background border shadow-sm rounded-tl-sm"
            )}>
              {m.content}
            </div>
            <span className="text-[10px] text-muted-foreground mt-1 px-1">
              {m.role === "user" ? "Você" : "Copilot"}
            </span>
          </div>
        ))}
        {loading && (
          <div className="mr-auto flex items-center gap-2 px-4 py-3 bg-background border shadow-sm rounded-2xl rounded-tl-sm text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" /> Pensando e operando...
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Input Area */}
      <div className="p-3 bg-background border-t">
        <form onSubmit={handleSend} className="flex gap-2 items-end">
          <textarea 
            className="flex-1 max-h-32 min-h-[44px] bg-muted/50 border-0 rounded-xl px-4 py-3 text-sm resize-none focus:ring-1 focus:ring-primary"
            placeholder="Ex: Crie um lead chamado Carlos da empresa XYZ..."
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend(e);
              }
            }}
            disabled={loading}
            rows={1}
          />
          <button 
            type="submit" 
            disabled={!input.trim() || loading}
            className="w-11 h-11 shrink-0 bg-primary text-primary-foreground rounded-xl flex items-center justify-center disabled:opacity-50 hover:bg-primary/90 transition-colors"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
}
