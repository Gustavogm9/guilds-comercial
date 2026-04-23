import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient, getCurrentProfile } from "@/lib/supabase/server";
import { getCurrentOrgId, getCurrentRole, listarMembrosDaOrg } from "@/lib/supabase/org";
import { PhoneCall, PhoneOff, Phone, CheckCircle2 } from "lucide-react";

export const dynamic = "force-dynamic";

type LigacaoRow = {
  id: number;
  lead_id: number;
  data_hora: string;
  resultado: string | null;
  observacoes: string | null;
  atendeu: boolean | null;
  responsavel_id: string | null;
  leads: { empresa: string | null; nome: string | null; segmento: string | null } | null;
};

export default async function LigacoesPage({ searchParams }: { searchParams: { dias?: string; resp?: string } }) {
  const supabase = createClient();
  const me = await getCurrentProfile();
  if (!me) return null;

  const orgId = await getCurrentOrgId();
  if (!orgId) redirect("/hoje");
  const role = await getCurrentRole();
  const isGestor = role === "gestor";

  const dias = parseInt(searchParams.dias ?? "7", 10);
  const respFiltro = searchParams.resp ?? (isGestor ? "all" : me.id);

  const desde = new Date();
  desde.setDate(desde.getDate() - dias);

  let q = supabase
    .from("ligacoes")
    .select("*, leads ( empresa, nome, segmento )")
    .eq("organizacao_id", orgId)
    .gte("data_hora", desde.toISOString())
    .order("data_hora", { ascending: false });

  if (respFiltro !== "all") q = q.eq("responsavel_id", respFiltro);

  const [{ data: ligacoes }, membros] = await Promise.all([
    q,
    listarMembrosDaOrg(orgId),
  ]);

  const list = (ligacoes ?? []) as unknown as LigacaoRow[];
  const profs = membros.map(m => ({ id: m.profile_id, display_name: m.display_name }));

  const total = list.length;
  const atenderam = list.filter(l => l.atendeu).length;
  const taxa = total > 0 ? Math.round((atenderam / total) * 100) : 0;
  const qualif = list.filter(l => l.resultado === "Atendeu e qualificou").length;
  const agendou = list.filter(l => l.resultado === "Agendou call").length;

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      <header className="mb-4">
        <h1 className="text-2xl font-semibold tracking-tight">Ligações</h1>
        <p className="text-sm text-slate-500">Histórico de tentativas. Olho na taxa de atendimento.</p>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 my-4">
        <KPI title="Total" v={total} icon={<PhoneCall className="w-4 h-4"/>} tone="neutral"/>
        <KPI title="Atenderam" v={`${atenderam} (${taxa}%)`} icon={<Phone className="w-4 h-4"/>} tone="success"/>
        <KPI title="Qualificados" v={qualif} icon={<CheckCircle2 className="w-4 h-4"/>} tone="success"/>
        <KPI title="Agendaram call" v={agendou} icon={<CheckCircle2 className="w-4 h-4"/>} tone="success"/>
      </div>

      <form className="flex items-center gap-2 mb-3 flex-wrap">
        <select name="dias" defaultValue={String(dias)} className="input-base !text-xs w-32">
          <option value="1">Hoje</option>
          <option value="7">Últimos 7 dias</option>
          <option value="14">Últimos 14 dias</option>
          <option value="30">Últimos 30 dias</option>
          <option value="90">Últimos 90 dias</option>
        </select>
        {isGestor && (
          <select name="resp" defaultValue={respFiltro} className="input-base !text-xs w-40">
            <option value="all">Todo o time</option>
            {profs.map(p => <option key={p.id} value={p.id}>{p.display_name}</option>)}
          </select>
        )}
        <button className="btn-secondary text-xs">Filtrar</button>
      </form>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th className="text-left px-3 py-2 font-medium">Data</th>
                <th className="text-left px-3 py-2 font-medium">Lead</th>
                <th className="text-left px-3 py-2 font-medium">Resultado</th>
                <th className="text-left px-3 py-2 font-medium">Observações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {list.length === 0 && (
                <tr><td colSpan={4} className="text-center py-12 text-slate-400">
                  Nenhuma ligação no período selecionado.
                </td></tr>
              )}
              {list.map(l => (
                <tr key={l.id} className="hover:bg-slate-50">
                  <td className="px-3 py-2 text-xs text-slate-500 whitespace-nowrap">{fmtDateTime(l.data_hora)}</td>
                  <td className="px-3 py-2">
                    <Link href={`/pipeline/${l.lead_id}`} className="font-medium hover:text-guild-700">
                      {l.leads?.empresa || l.leads?.nome || "(?)"}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {l.atendeu === false
                      ? <span className="inline-flex items-center gap-1 text-slate-500"><PhoneOff className="w-3 h-3"/> {l.resultado || "Sem resposta"}</span>
                      : <span className="inline-flex items-center gap-1 text-emerald-700"><Phone className="w-3 h-3"/> {l.resultado || "—"}</span>}
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-600 max-w-[300px] truncate">{l.observacoes || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function KPI({ title, v, icon, tone }: { title: string; v: string | number; icon: React.ReactNode; tone: "neutral" | "success" }) {
  const tones = { neutral: "bg-slate-100 text-slate-600", success: "bg-emerald-50 text-success-500" };
  return (
    <div className="card p-4 flex items-center gap-3">
      <div className={`w-9 h-9 rounded-lg grid place-items-center ${tones[tone]}`}>{icon}</div>
      <div>
        <div className="text-xs text-slate-500 uppercase tracking-wider">{title}</div>
        <div className="text-2xl font-semibold leading-tight">{v}</div>
      </div>
    </div>
  );
}

function fmtDateTime(d: string) {
  return new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}
