"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, Square, Loader2, Check, AlertCircle, X } from "lucide-react";

/**
 * Voice note recorder: grava áudio via MediaRecorder, manda pra
 * /api/voice-notes/upload. Cron audio-processor transcreve + analisa.
 *
 * Limite: 60s. Browser support: MediaRecorder API (Chrome/Edge/Firefox/Safari 14+).
 */
export default function VoiceNoteRecorder({
  leadId,
  onUploaded,
}: {
  leadId: number;
  onUploaded?: () => void;
}) {
  const [estado, setEstado] = useState<"idle" | "gravando" | "enviando" | "sucesso" | "erro">("idle");
  const [duracao, setDuracao] = useState(0);
  const [erro, setErro] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const MAX_SEG = 60;

  useEffect(() => {
    return () => {
      // Cleanup on unmount
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  async function iniciar() {
    setErro(null);
    setDuracao(0);
    chunksRef.current = [];
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mime = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/mp4";
      const recorder = new MediaRecorder(stream, { mimeType: mime });
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        // Stream off
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      };
      recorder.start();
      recorderRef.current = recorder;
      setEstado("gravando");

      timerRef.current = setInterval(() => {
        setDuracao((d) => {
          if (d + 1 >= MAX_SEG) {
            parar();
            return MAX_SEG;
          }
          return d + 1;
        });
      }, 1000);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Microfone negado.");
      setEstado("erro");
    }
  }

  function parar() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (recorderRef.current && recorderRef.current.state === "recording") {
      recorderRef.current.stop();
    }
    setEstado("enviando");
    setTimeout(enviarBlob, 200);  // pequeno delay pro recorder finalizar
  }

  async function enviarBlob() {
    try {
      const mime = recorderRef.current?.mimeType ?? "audio/webm";
      const blob = new Blob(chunksRef.current, { type: mime });
      if (blob.size === 0) {
        setErro("Áudio vazio.");
        setEstado("erro");
        return;
      }

      const form = new FormData();
      form.append("audio", blob, `voice-${Date.now()}.${mime.includes("webm") ? "webm" : "mp4"}`);
      form.append("lead_id", String(leadId));

      const res = await fetch("/api/voice-notes/upload", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) {
        setErro(data.erro ?? "Upload falhou.");
        setEstado("erro");
        return;
      }

      setEstado("sucesso");
      onUploaded?.();
      setTimeout(() => setEstado("idle"), 2500);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro.");
      setEstado("erro");
    }
  }

  function cancelar() {
    if (timerRef.current) clearInterval(timerRef.current);
    if (recorderRef.current && recorderRef.current.state === "recording") {
      recorderRef.current.stop();
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    chunksRef.current = [];
    setEstado("idle");
    setDuracao(0);
  }

  if (estado === "idle") {
    return (
      <button onClick={iniciar} className="btn-ghost text-xs text-primary" title="Gravar nota de voz (até 60s)">
        <Mic className="w-3.5 h-3.5" /> Voice note
      </button>
    );
  }

  if (estado === "gravando") {
    return (
      <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-destructive/40 bg-destructive/5">
        <span className="w-2 h-2 rounded-full bg-destructive animate-pulse" />
        <span className="text-xs tabular-nums font-mono text-destructive">
          {String(Math.floor(duracao / 60)).padStart(2, "0")}:{String(duracao % 60).padStart(2, "0")}
        </span>
        <button onClick={parar} className="btn-primary text-xs">
          <Square className="w-3 h-3" /> Parar
        </button>
        <button onClick={cancelar} className="btn-ghost text-xs text-muted-foreground">
          <X className="w-3 h-3" />
        </button>
      </div>
    );
  }

  if (estado === "enviando") {
    return (
      <div className="inline-flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        Enviando...
      </div>
    );
  }

  if (estado === "sucesso") {
    return (
      <div className="inline-flex items-center gap-1.5 text-xs text-success-500">
        <Check className="w-3.5 h-3.5" />
        Enviado — IA vai processar em até 2 min.
      </div>
    );
  }

  return (
    <div className="inline-flex items-center gap-2">
      <AlertCircle className="w-3.5 h-3.5 text-destructive" />
      <span className="text-xs text-destructive">{erro ?? "Erro"}</span>
      <button onClick={() => setEstado("idle")} className="btn-ghost text-xs">Tentar de novo</button>
    </div>
  );
}
