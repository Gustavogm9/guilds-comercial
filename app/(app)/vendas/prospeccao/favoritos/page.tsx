import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Star, Building2 } from "lucide-react";
import { createClient, getCurrentProfile } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/supabase/org";
import VendasTabs from "../../vendas-tabs";

export const dynamic = "force-dynamic";

/**
 * /vendas/prospeccao/favoritos — empresas marcadas pelo user atual.
 */
export default async function FavoritosPage() {
  const me = await getCurrentProfile();
  if (!me) return null;
  const orgId = await getCurrentOrgId();
  if (!orgId) redirect("/hoje");

  const supabase = createClient();
  const { data: bookmarks } = await supabase
    .from("prospeccao_empresa_bookmark")
    .select(`
      id, nota_pessoal, created_at,
      empresa:empresa_id(
        id, cnpj, razao_social, nome_fantasia, porte,
        capital_social, cidade, uf, situacao, cnae_normalizado
      )
    `)
    .eq("profile_id", me.id)
    .eq("organizacao_id", orgId)
    .order("created_at", { ascending: false });

  const lista = (bookmarks ?? []) as any[];

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto">
      <VendasTabs />
      <Link href="/vendas/prospeccao" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mb-3">
        <ArrowLeft className="w-3 h-3" /> Voltar
      </Link>

      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <Star className="w-6 h-6 text-warning-500 fill-warning-500" aria-hidden="true" />
          Meus favoritos
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Empresas que você marcou pra acompanhar. Privado por usuário.
        </p>
      </header>

      {lista.length === 0 ? (
        <div className="card p-12 text-center">
          <Star className="w-10 h-10 mx-auto text-muted-foreground/40 mb-3" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">
            Nenhum favorito ainda.
          </p>
          <p className="text-xs text-muted-foreground/70 mt-1">
            Vá em <Link href="/vendas/prospeccao/base-de-empresas" className="text-primary hover:underline">base de empresas</Link> e clique no ⭐ pra adicionar.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {lista.map((b) => {
            const e = b.empresa as any;
            if (!e) return null;
            return (
              <li key={b.id} className="card p-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <Link href={`/vendas/prospeccao/empresa/${e.id}`} className="font-medium text-foreground hover:text-primary inline-flex items-center gap-1.5">
                      <Building2 className="w-3.5 h-3.5" />
                      {e.nome_fantasia || e.razao_social}
                    </Link>
                    <div className="text-xs text-muted-foreground tabular-nums font-mono mt-0.5">
                      {e.cnpj.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5")}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1.5 flex items-center gap-2 flex-wrap">
                      {e.cidade && <span>{e.cidade}/{e.uf}</span>}
                      {e.porte && <span>· {e.porte}</span>}
                      {e.cnae_normalizado && <span>· {e.cnae_normalizado}</span>}
                    </div>
                    {b.nota_pessoal && (
                      <p className="text-xs text-foreground/80 mt-1.5 italic">"{b.nota_pessoal}"</p>
                    )}
                  </div>
                  <span className="text-[11px] text-muted-foreground tabular-nums shrink-0">
                    {new Date(b.created_at).toLocaleDateString("pt-BR")}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
