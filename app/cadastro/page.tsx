"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { getClientLocale, getT, type Locale } from "@/lib/i18n";

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
  const [locale, setLocale] = useState<Locale>("pt-BR");
  useEffect(() => setLocale(getClientLocale()), []);
  const t = getT(locale);

  async function cadastrar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setLoading(true);

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: nome, empresa_nome: empresa },
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    setLoading(false);

    if (error) {
      setErro(error.message);
      return;
    }

    if (data.user && data.user.identities && data.user.identities.length === 0) {
      setErro(t("auth.cadastro_email_ja_existe"));
      return;
    }

    if (data.session === null) {
      setSucesso(true);
    } else {
      router.push("/onboarding");
      router.refresh();
    }
  }

  if (sucesso) {
    return (
      <div className="min-h-screen grid place-items-center bg-gradient-to-br from-primary/10 via-background to-primary/5 px-4">
        <div className="w-full max-w-sm card p-8 text-center space-y-4">
          <div className="w-12 h-12 bg-success-500/10 text-success-500 rounded-full flex items-center justify-center mx-auto text-xl">
            ✓
          </div>
          <h2 className="text-xl font-bold text-foreground">{t("auth.cadastro_verifique_email_titulo")}</h2>
          <p className="text-sm text-muted-foreground">
            {t("auth.cadastro_verifique_email_msg").replace("{{email}}", email)}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen grid place-items-center bg-gradient-to-br from-primary/10 via-background to-primary/5 px-4">
      <div className="w-full max-w-sm card p-8">
        <div className="flex items-center gap-2 mb-6">
          <div className="w-9 h-9 rounded-lg bg-primary grid place-items-center text-primary-foreground font-bold">G</div>
          <div>
            <div className="font-semibold leading-tight">Guilds Comercial</div>
            <div className="text-xs text-muted-foreground">{t("auth.cadastro_titulo")}</div>
          </div>
        </div>

        <form onSubmit={cadastrar} className="space-y-4">
          <div>
            <label className="label mb-1">{t("auth.cadastro_seu_nome")}</label>
            <input
              type="text" required autoFocus
              value={nome} onChange={(e) => setNome(e.target.value)}
              className="input-base" placeholder={t("auth.cadastro_nome_placeholder")}
            />
          </div>
          <div>
            <label className="label mb-1">{t("auth.cadastro_empresa")}</label>
            <input
              type="text" required
              value={empresa} onChange={(e) => setEmpresa(e.target.value)}
              className="input-base" placeholder={t("auth.cadastro_empresa_placeholder")}
            />
          </div>
          <div>
            <label className="label mb-1">{t("auth.cadastro_email")}</label>
            <input
              type="email" required
              value={email} onChange={(e) => setEmail(e.target.value)}
              className="input-base" placeholder={t("auth.login_email_placeholder")}
            />
          </div>
          <div>
            <label className="label mb-1">{t("auth.login_senha")}</label>
            <input
              type="password" required minLength={6}
              value={password} onChange={(e) => setPassword(e.target.value)}
              className="input-base" placeholder={t("auth.cadastro_senha_placeholder")}
            />
          </div>

          {erro && <div className="text-sm text-urgent-500 bg-urgent-500/10 border border-urgent-500/30 rounded-lg p-2">{erro}</div>}

          <button type="submit" disabled={loading} className="btn-primary w-full justify-center">
            {loading ? t("auth.cadastro_criando") : t("auth.cadastro_criar")}
          </button>
        </form>

        <p className="mt-6 text-sm text-center text-muted-foreground">
          {t("auth.cadastro_ja_tem_conta")} <Link href="/login" className="text-primary font-medium hover:underline">{t("auth.cadastro_entrar")}</Link>
        </p>
      </div>
    </div>
  );
}
