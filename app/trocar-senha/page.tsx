"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function TrocarSenhaPage() {
  const supabase = createClient();
  const router = useRouter();
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmarSenha, setConfirmarSenha] = useState("");
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);

    if (novaSenha.length < 8) {
      setErro("A nova senha deve ter no mínimo 8 caracteres.");
      return;
    }
    if (novaSenha !== confirmarSenha) {
      setErro("As senhas não coincidem.");
      return;
    }

    setLoading(true);

    // 1) Atualiza a senha
    const { error: pwError } = await supabase.auth.updateUser({
      password: novaSenha,
    });

    if (pwError) {
      setLoading(false);
      setErro(pwError.message);
      return;
    }

    // 2) Remove o flag de troca obrigatória
    const { error: metaError } = await supabase.auth.updateUser({
      data: { force_password_change: false },
    });

    if (metaError) {
      // Senha já foi trocada, mas falhou ao limpar flag — segue em frente
      console.warn("Falha ao limpar flag force_password_change:", metaError.message);
    }

    setSucesso(true);
    setLoading(false);

    // Redireciona após 1.5s para o dashboard
    setTimeout(() => {
      router.push("/hoje");
      router.refresh();
    }, 1500);
  }

  return (
    <div className="min-h-screen grid place-items-center bg-gradient-to-br from-guild-50 via-white to-guild-100 px-4">
      <div className="w-full max-w-sm card p-8">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-9 h-9 rounded-lg bg-guild-600 grid place-items-center text-white font-bold">G</div>
          <div>
            <div className="font-semibold leading-tight">Guilds Comercial</div>
            <div className="text-xs text-slate-500">Troca de senha</div>
          </div>
        </div>

        <div className="mb-6 p-3 rounded-lg bg-amber-50 border border-amber-200">
          <p className="text-sm text-amber-800 font-medium">
            🔒 Troca obrigatória de senha
          </p>
          <p className="text-xs text-amber-700 mt-1">
            Por segurança, você precisa definir uma nova senha antes de continuar.
          </p>
        </div>

        {sucesso ? (
          <div className="text-center py-4">
            <div className="text-3xl mb-2">✅</div>
            <p className="text-sm font-medium text-green-700">Senha alterada com sucesso!</p>
            <p className="text-xs text-slate-500 mt-1">Redirecionando para o dashboard…</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label mb-1">Nova senha</label>
              <input
                type="password"
                required
                autoFocus
                minLength={8}
                value={novaSenha}
                onChange={(e) => setNovaSenha(e.target.value)}
                className="input-base"
                placeholder="Mínimo 8 caracteres"
              />
            </div>
            <div>
              <label className="label mb-1">Confirmar nova senha</label>
              <input
                type="password"
                required
                minLength={8}
                value={confirmarSenha}
                onChange={(e) => setConfirmarSenha(e.target.value)}
                className="input-base"
                placeholder="Repita a nova senha"
              />
            </div>

            {erro && (
              <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-2">
                {erro}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full justify-center"
            >
              {loading ? "Salvando…" : "Definir nova senha"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
