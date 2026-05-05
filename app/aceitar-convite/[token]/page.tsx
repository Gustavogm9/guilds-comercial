import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, Mail, Building2 } from "lucide-react";
import AceitarConviteForm from "./aceitar-convite-form";
import { buscarConvitePublico } from "./actions";

export const dynamic = "force-dynamic";

/**
 * Página pública de aceitação de convite.
 *
 * Acessada quando alguém clica em /api/convite/{token} sem ter conta —
 * a rota /api/convite/{token} agora detecta isto e redireciona pra cá.
 *
 * Mostra info do convite (org, role, email read-only) e form pra escolher
 * nome + senha. Submit chama `aceitarConviteSignup` que cria a conta no
 * Supabase Auth + adiciona em membros_organizacao + marca convite aceito
 * + loga + redireciona pra /hoje.
 */
export default async function AceitarConvitePage(props: {
  params: Promise<{ token: string }>;
}) {
  const params = await props.params;
  const token = params.token;
  if (!token || token.length < 10) notFound();

  const res = await buscarConvitePublico(token);

  if (!res.ok) {
    return (
      <div className="min-h-screen grid place-items-center bg-gradient-to-br from-primary/10 via-background to-primary/5 px-4">
        <div className="w-full max-w-sm card p-8 text-center space-y-4">
          <div className="w-12 h-12 bg-destructive/10 text-destructive rounded-full flex items-center justify-center mx-auto">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <h2 className="text-xl font-semibold text-foreground" style={{ letterSpacing: "-0.24px" }}>
            Convite inválido
          </h2>
          <p className="text-sm text-muted-foreground">{res.erro}</p>
          <Link href="/login" className="btn-primary text-sm w-full justify-center">
            Ir para login
          </Link>
        </div>
      </div>
    );
  }

  const roleLabel =
    res.role === "gestor" ? "Gestor" :
    res.role === "comercial" ? "Vendedor" :
    res.role === "sdr" ? "SDR" :
    res.role;

  return (
    <div className="min-h-screen grid place-items-center bg-gradient-to-br from-primary/10 via-background to-primary/5 px-4 py-8">
      <div className="w-full max-w-md card p-8">
        <div className="flex items-center gap-2 mb-6">
          <div
            className="w-9 h-9 rounded-lg bg-primary grid place-items-center text-primary-foreground font-bold"
            style={{ boxShadow: "inset 0 1px 0 hsl(0 0% 100% / 0.18)" }}
          >
            G
          </div>
          <div>
            <div className="font-semibold leading-tight">Guilds Comercial</div>
            <div className="text-xs text-muted-foreground">Aceitar convite</div>
          </div>
        </div>

        {/* Banner com dados do convite */}
        <div className="mb-6 p-4 rounded-lg bg-primary/5 border border-primary/20 space-y-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Building2 className="w-3.5 h-3.5 text-primary" />
            <span className="uppercase tracking-[0.12em] font-semibold text-[10px]">
              Você foi convidado para
            </span>
          </div>
          <div className="font-semibold text-foreground" style={{ letterSpacing: "-0.13px" }}>
            {res.orgNome}
          </div>
          <div className="text-xs text-muted-foreground">
            Como <span className="font-medium text-foreground">{roleLabel}</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground pt-1 border-t border-primary/15">
            <Mail className="w-3.5 h-3.5" />
            <span className="truncate">{res.email}</span>
          </div>
        </div>

        <AceitarConviteForm token={token} email={res.email} />

        <p className="mt-6 text-xs text-center text-muted-foreground">
          Já tem uma conta com este email?{" "}
          <Link
            href={`/login?email=${encodeURIComponent(res.email)}&next=${encodeURIComponent(`/api/convite/${token}`)}`}
            className="text-primary font-medium hover:underline"
          >
            Entrar
          </Link>
        </p>
      </div>
    </div>
  );
}
