"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { getClientLocale, getT, type Locale } from "@/lib/i18n";
import { Loader2 } from "lucide-react";

export default function CadastroPage() {
  const router = useRouter();

  const [nome, setNome] = useState("");
  const [empresa, setEmpresa] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // `loading` cobre o signup HTTP. `redirecting` cobre a transição pra /onboarding
  // (que é pesada — RSC com várias queries). Sem isto, o botão volta a "Criar conta"
  // enquanto a navegação está em andamento → parece travado.
  const [loading, setLoading] = useState(false);
  const [redirecting, startRedirect] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState(false);
  const [locale, setLocale] = useState<Locale>("pt-BR");
  useEffect(() => setLocale(getClientLocale()), []);
  const t = getT(locale);

  async function cadastrar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setLoading(true);

    const supabase = createClient();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: nome, empresa_nome: empresa },
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      setLoading(false);
      setErro(error.message);
      return;
    }

    if (data.user && data.user.identities && data.user.identities.length === 0) {
      setLoading(false);
      setErro(t("auth.cadastro_email_ja_existe"));
      return;
    }

    if (data.session === null) {
      setLoading(false);
      setSucesso(true);
    } else {
      // Mantém loading=true até a navegação completar (useTransition resolve quando RSC volta)
      startRedirect(() => {
        router.push("/onboarding");
        router.refresh();
      });
    }
  }

  const busy = loading || redirecting;

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

          <button type="submit" disabled={busy} className="btn-primary w-full justify-center">
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            {redirecting
              ? "Preparando seu workspace…"
              : loading
              ? t("auth.cadastro_criando")
              : t("auth.cadastro_criar")}
          </button>
        </form>

        <p className="mt-6 text-sm text-center text-muted-foreground">
          {t("auth.cadastro_ja_tem_conta")} <Link href="/login" className="text-primary font-medium hover:underline">{t("auth.cadastro_entrar")}</Link>
        </p>
      </div>
    </div>
  );
}
