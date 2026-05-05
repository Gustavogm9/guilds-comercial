"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { aceitarConviteSignup } from "./actions";

export default function AceitarConviteForm({
  token,
  email,
}: {
  token: string;
  email: string;
}) {
  const router = useRouter();
  const [nome, setNome] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);

    if (password.length < 6) {
      setErro("Senha precisa ter no mínimo 6 caracteres.");
      return;
    }
    if (password !== confirmPassword) {
      setErro("Senhas não conferem.");
      return;
    }

    start(async () => {
      const res = await aceitarConviteSignup({ token, nome, password });
      if (res.ok) {
        router.push(res.redirect);
        router.refresh();
      } else {
        setErro(res.erro);
      }
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label className="label mb-1">Email</label>
        <input
          type="email"
          value={email}
          disabled
          readOnly
          className="input-base opacity-60 cursor-not-allowed"
          aria-label="Email do convite (não editável)"
        />
        <p className="text-[10px] text-muted-foreground/70 mt-1">
          Email do convite — não pode ser alterado.
        </p>
      </div>

      <div>
        <label className="label mb-1">Seu nome</label>
        <input
          type="text"
          required
          autoFocus
          minLength={2}
          maxLength={80}
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          className="input-base"
          placeholder="Como quer ser chamado?"
          disabled={pending}
        />
      </div>

      <div>
        <label className="label mb-1">Senha</label>
        <input
          type="password"
          required
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="input-base"
          placeholder="Mínimo 6 caracteres"
          disabled={pending}
        />
      </div>

      <div>
        <label className="label mb-1">Confirmar senha</label>
        <input
          type="password"
          required
          minLength={6}
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          className="input-base"
          placeholder="Digite a senha novamente"
          disabled={pending}
        />
      </div>

      {erro && (
        <div className="text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded-lg p-2">
          {erro}
        </div>
      )}

      <button
        type="submit"
        disabled={pending || !nome || !password || !confirmPassword}
        className="btn-primary w-full justify-center"
      >
        {pending && <Loader2 className="w-4 h-4 animate-spin" />}
        {pending ? "Criando conta…" : "Aceitar convite e entrar"}
      </button>
    </form>
  );
}
