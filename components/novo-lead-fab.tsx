import { getCurrentOrgId, listarMembrosDaOrg } from "@/lib/supabase/org";
import NovoLeadModal from "./novo-lead-modal";

/** FAB global — botão flutuante "+ Novo lead" disponível em qualquer tela.
 *  Renderiza no layout. Se não houver org ativa ou membros, não aparece. */
export default async function NovoLeadFab() {
  const orgId = await getCurrentOrgId();
  if (!orgId) return null;

  const membros = await listarMembrosDaOrg(orgId);
  const profiles = membros.map(m => ({ id: m.profile_id, display_name: m.display_name }));

  return (
    <div
      className="fixed right-5 z-40 md:right-8 bottom-[calc(env(safe-area-inset-bottom)+5rem)] md:bottom-8"
    >
      <NovoLeadModal profiles={profiles} variant="fab" />
    </div>
  );
}
