"use client";
import { Suspense, useEffect, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getClientLocale, getT, type Locale } from "@/lib/i18n";
import { Loader2 } from "lucide-react";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState(searchParams.get("email") ?? "");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [redirecting, startRedirect] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [locale, setLocale] = useState<Locale>("pt-BR");
  useEffect(() => setLocale(getClientLocale()), []);
  const t = getT(locale);
  const busy = loading || redirecting;

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setLoading(true);
    const supabase = createClient();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setLoading(false);
      setErro(error.message === "Invalid login credentials"
        ? t("auth.login_credenciais_invalidas")
        : error.message);
      return;
    }

    if (data.user?.user_metadata?.force_password_change === true) {
      startRedirect(() => {
        router.push("/trocar-senha");
        router.refresh();
      });
      return;
    }

    const next = searchParams.get("next");
    const destino = next && next.startsWith("/") ? next : "/hoje";
    // Mantém pending até navegação completar — feedback visual no botão + bar topo
    startRedirect(() => {
      router.push(destino);
      router.refresh();
    });
  }

  return (
    <div className="w-full max-w-sm card p-8">
      <div className="flex items-center gap-2 mb-6">
        <div className="w-9 h-9 rounded-lg bg-primary grid place-items-center text-primary-foreground font-bold">G</div>
        <div>
          <div className="font-semibold leading-tight">Guilds Comercial</div>
          <div className="text-xs text-muted-foreground">{t("auth.login_titulo")}</div>
        </div>
      </div>

      <form onSubmit={entrar} className="space-y-4">
        <div>
          <label className="label mb-1">{t("auth.login_email")}</label>
          <input
            type="email" required autoFocus
            value={email} onChange={(e) => setEmail(e.target.value)}
            className="input-base" placeholder={t("auth.login_email_placeholder")}
          />
        </div>
        <div>
          <label className="label mb-1">{t("auth.login_senha")}</label>
          <input
            type="password" required
            value={password} onChange={(e) => setPassword(e.target.value)}
            className="input-base" placeholder="••••••••"
          />
        </div>

        {erro && <div className="text-sm text-urgent-500 bg-urgent-500/10 border border-urgent-500/30 rounded-lg p-2">{erro}</div>}

        <button type="submit" disabled={busy} className="btn-primary w-full justify-center">
          {busy && <Loader2 className="w-4 h-4 animate-spin" />}
          {redirecting ? "Carregando…" : loading ? t("auth.login_entrando") : t("auth.login_entrar")}
        </button>
      </form>

      <p className="mt-6 text-xs text-center text-muted-foreground">
        {t("auth.login_sem_cadastro")}
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen grid place-items-center bg-gradient-to-br from-primary/10 via-background to-primary/5 px-4">
      <Suspense fallback={
        <div className="w-full max-w-sm card p-8 text-center text-muted-foreground">Loading…</div>
      }>
        <LoginForm />
      </Suspense>
    </div>
  );
}
