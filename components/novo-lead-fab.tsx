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
    <div className="fixed bottom-6 right-6 z-40 md:bottom-8 md:right-8">
      <NovoLeadModal profiles={profiles} variant="fab" />
    </div>
  );
}
