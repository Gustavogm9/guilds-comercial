"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const supabase = createClient();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      setErro(error.message === "Invalid login credentials"
        ? "Email ou senha incorretos."
        : error.message);
      return;
    }
    router.push("/hoje");
    router.refresh();
  }

  return (
    <div className="min-h-screen grid place-items-center bg-gradient-to-br from-guild-50 via-white to-guild-100 px-4">
      <div className="w-full max-w-sm card p-8">
        <div className="flex items-center gap-2 mb-6">
          <div className="w-9 h-9 rounded-lg bg-guild-600 grid place-items-center text-white font-bold">G</div>
          <div>
            <div className="font-semibold leading-tight">Guilds Comercial</div>
            <div className="text-xs text-slate-500">Cockpit do time</div>
          </div>
        </div>

        <form onSubmit={entrar} className="space-y-4">
          <div>
            <label className="label mb-1">Email</label>
            <input
              type="email" required autoFocus
              value={email} onChange={(e) => setEmail(e.target.value)}
              className="input-base" placeholder="voce@guilds.com.br"
            />
          </div>
          <div>
            <label className="label mb-1">Senha</label>
            <input
              type="password" required
              value={password} onChange={(e) => setPassword(e.target.value)}
              className="input-base" placeholder="••••••••"
            />
          </div>

          {erro && <div className="text-sm text-urgent-500 bg-red-50 border border-red-200 rounded-lg p-2">{erro}</div>}

          <button type="submit" disabled={loading} className="btn-primary w-full justify-center">
            {loading ? "Entrando..." : "Entrar"}
          </button>
        </form>

        <p className="mt-6 text-xs text-center text-slate-500">
          Sem cadastro público. Usuários são criados pelo gestor.
        </p>
      </div>
    </div>
  );
}
