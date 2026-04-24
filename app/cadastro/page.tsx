"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";

export default function CadastroPage() {
  const supabase = createClient();
  const router = useRouter();
  
  const [nome, setNome] = useState("");
  const [empresa, setEmpresa] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState(false);

  async function cadastrar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setLoading(true);
    
    const { data, error } = await supabase.auth.signUp({ 
      email, 
      password,
      options: {
        data: {
          full_name: nome,
          empresa_nome: empresa
        },
        emailRedirectTo: `${window.location.origin}/auth/callback`
      }
    });
    
    setLoading(false);
    
    if (error) {
      setErro(error.message);
      return;
    }

    if (data.user && data.user.identities && data.user.identities.length === 0) {
      setErro("Este email já está cadastrado.");
      return;
    }

    // Se o Supabase estiver configurado para confirmar email
    if (data.session === null) {
      setSucesso(true);
    } else {
      // Se não precisar de confirmação, vai direto pro onboarding
      router.push("/onboarding");
      router.refresh();
    }
  }

  if (sucesso) {
    return (
      <div className="min-h-screen grid place-items-center bg-gradient-to-br from-guild-50 via-white to-guild-100 px-4">
        <div className="w-full max-w-sm card p-8 text-center space-y-4">
          <div className="w-12 h-12 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto text-xl">
            ✓
          </div>
          <h2 className="text-xl font-bold text-slate-800">Verifique seu email</h2>
          <p className="text-sm text-slate-600">
            Enviamos um link de confirmação para <strong>{email}</strong>. 
            Clique nele para ativar sua conta e continuar.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen grid place-items-center bg-gradient-to-br from-guild-50 via-white to-guild-100 px-4">
      <div className="w-full max-w-sm card p-8">
        <div className="flex items-center gap-2 mb-6">
          <div className="w-9 h-9 rounded-lg bg-guild-600 grid place-items-center text-white font-bold">G</div>
          <div>
            <div className="font-semibold leading-tight">Guilds Comercial</div>
            <div className="text-xs text-slate-500">Crie sua conta</div>
          </div>
        </div>

        <form onSubmit={cadastrar} className="space-y-4">
          <div>
            <label className="label mb-1">Seu Nome</label>
            <input
              type="text" required autoFocus
              value={nome} onChange={(e) => setNome(e.target.value)}
              className="input-base" placeholder="Como quer ser chamado?"
            />
          </div>
          <div>
            <label className="label mb-1">Nome da Empresa</label>
            <input
              type="text" required
              value={empresa} onChange={(e) => setEmpresa(e.target.value)}
              className="input-base" placeholder="Sua empresa"
            />
          </div>
          <div>
            <label className="label mb-1">Email Profissional</label>
            <input
              type="email" required
              value={email} onChange={(e) => setEmail(e.target.value)}
              className="input-base" placeholder="voce@empresa.com.br"
            />
          </div>
          <div>
            <label className="label mb-1">Senha</label>
            <input
              type="password" required minLength={6}
              value={password} onChange={(e) => setPassword(e.target.value)}
              className="input-base" placeholder="Mínimo 6 caracteres"
            />
          </div>

          {erro && <div className="text-sm text-urgent-500 bg-red-50 border border-red-200 rounded-lg p-2">{erro}</div>}

          <button type="submit" disabled={loading} className="btn-primary w-full justify-center">
            {loading ? "Criando..." : "Criar minha conta grátis"}
          </button>
        </form>

        <p className="mt-6 text-sm text-center text-slate-500">
          Já tem uma conta? <Link href="/login" className="text-guild-600 font-medium hover:underline">Entrar</Link>
        </p>
      </div>
    </div>
  );
}
