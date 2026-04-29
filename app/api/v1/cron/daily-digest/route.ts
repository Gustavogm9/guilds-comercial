import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { invokeAISystem } from '@/lib/ai/dispatcher';
import { sendPushToMany } from '@/lib/push';

export const runtime = 'nodejs';

/**
 * Rota acionada via pg_cron do Supabase (diariamente às 8h UTC).
 *
 * Features ativadas:
 * - resumo_diario — resumo do pipeline para cada org
 * - detectar_risco — leads esfriando (5+ dias sem toque ou ação vencida)
 * - digest_semanal — consolidado da semana (sexta-feira)
 */
export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: orgs } = await supabaseAdmin
      .from('organizacoes')
      .select('id, nome')
      .eq('ativa', true);

    if (!orgs || orgs.length === 0) {
      return NextResponse.json({ message: 'Nenhuma organização ativa.' });
    }

    const hoje = new Date();
    const isSexta = hoje.getUTCDay() === 5;
    const results: Array<{ orgId: string; resumo: boolean; riscos: number; semanal: boolean }> = [];

    for (const org of orgs) {
      let resumoOk = false;
      let riscosDetectados = 0;
      let semanalOk = false;

      try {
        // Buscar leads ativos no pipeline
        const { data: leads } = await supabaseAdmin
          .from('v_leads_enriched')
          .select('id, empresa, nome, crm_stage, dias_sem_tocar, proxima_acao, data_proxima_acao, valor_potencial, percepcao_vendedor, urgencia')
          .eq('organizacao_id', org.id)
          .not('crm_stage', 'in', '("Fechado","Perdido","Nutrição")')
          .order('data_proxima_acao', { ascending: true });

        const leadsAtivos = leads ?? [];

        // ──── RESUMO DIÁRIO ────
        if (leadsAtivos.length > 0) {
          const resumoLeads = leadsAtivos.slice(0, 20).map(l =>
            `${l.empresa || l.nome || 'sem-nome'} | ${l.crm_stage} | ${l.dias_sem_tocar}d sem tocar | ${l.urgencia}`
          ).join('\n');

          const result = await invokeAISystem(org.id, {
            feature: 'resumo_diario',
            vars: {
              orgNome: org.nome ?? org.id,
              totalLeads: leadsAtivos.length,
              leadsResumo: resumoLeads,
              data: hoje.toLocaleDateString('pt-BR'),
            },
          });

          if (result.ok) {
            await supabaseAdmin.from('lead_evento').insert({
              organizacao_id: org.id,
              lead_id: leadsAtivos[0].id,
              tipo: 'digest_diario',
              payload: { texto: result.texto, custoUsd: result.custoUsd },
            });
            resumoOk = true;

            // Push do resumo: respeita opt-in granular + janela de horário por user
            const { data: membros } = await supabaseAdmin
              .from('membros_organizacao')
              .select('profile_id')
              .eq('organizacao_id', org.id)
              .eq('ativo', true);
            const profileIds = (membros ?? []).map(m => m.profile_id).filter(Boolean) as string[];
            if (profileIds.length > 0) {
              sendPushToMany(profileIds, {
                evento: 'resumo_diario',
                title: 'Seu resumo de hoje chegou',
                body: `${leadsAtivos.length} leads ativos no pipeline. Veja o que priorizar.`,
                url: '/hoje',
                tag: `resumo-${org.id}-${hoje.toISOString().slice(0, 10)}`,
              }).catch(err => console.warn('[push] resumo_diario:', err));
            }
          }
        }

        // ──── DETECTAR RISCO ────
        const leadsEmRisco = leadsAtivos.filter(l =>
          (l.dias_sem_tocar ?? 0) >= 5 || l.urgencia === 'vencida'
        );

        if (leadsEmRisco.length > 0) {
          const riscoInput = leadsEmRisco.slice(0, 15).map(l =>
            `${l.empresa || l.nome} | ${l.crm_stage} | ${l.dias_sem_tocar}d sem tocar | valor: ${l.valor_potencial ?? 0}`
          ).join('\n');

          const riscoResult = await invokeAISystem(org.id, {
            feature: 'detectar_risco',
            vars: {
              orgNome: org.nome ?? org.id,
              leadsEmRisco: riscoInput,
              totalRisco: leadsEmRisco.length,
            },
          });

          if (riscoResult.ok) {
            const alertas = leadsEmRisco.slice(0, 10).map(l => ({
              organizacao_id: org.id,
              lead_id: l.id,
              tipo: 'alerta_risco' as const,
              payload: { motivo: `${l.dias_sem_tocar}d sem tocar`, analise_ia: riscoResult.texto.slice(0, 500) },
            }));
            await supabaseAdmin.from('lead_evento').insert(alertas);
            riscosDetectados = leadsEmRisco.length;
          }
        }

        // ──── DIGEST SEMANAL (sexta) ────
        if (isSexta && leadsAtivos.length > 0) {
          const inicioSemana = new Date(hoje);
          inicioSemana.setDate(hoje.getDate() - 7);

          const { count: novosCount } = await supabaseAdmin
            .from('leads')
            .select('id', { count: 'exact', head: true })
            .eq('organizacao_id', org.id)
            .gte('created_at', inicioSemana.toISOString());

          const { count: movCount } = await supabaseAdmin
            .from('lead_evento')
            .select('id', { count: 'exact', head: true })
            .eq('organizacao_id', org.id)
            .eq('tipo', 'mudou_etapa')
            .gte('created_at', inicioSemana.toISOString());

          const semanalResult = await invokeAISystem(org.id, {
            feature: 'digest_semanal',
            vars: {
              orgNome: org.nome ?? org.id,
              periodo: `${inicioSemana.toLocaleDateString('pt-BR')} a ${hoje.toLocaleDateString('pt-BR')}`,
              novosLeads: novosCount ?? 0,
              movimentacoes: movCount ?? 0,
              leadsAtivos: leadsAtivos.length,
              leadsEmRisco: leadsEmRisco?.length ?? 0,
            },
          });

          if (semanalResult.ok) {
            await supabaseAdmin.from('lead_evento').insert({
              organizacao_id: org.id,
              lead_id: leadsAtivos[0].id,
              tipo: 'digest_semanal',
              payload: { texto: semanalResult.texto, custoUsd: semanalResult.custoUsd },
            });
            semanalOk = true;
          }
        }
      } catch (orgErr) {
        console.error(`[Daily Digest] Erro org ${org.id}:`, orgErr);
      }

      results.push({ orgId: org.id, resumo: resumoOk, riscos: riscosDetectados, semanal: semanalOk });
    }

    return NextResponse.json({ success: true, processedOrgs: orgs.length, results });
  } catch (err: any) {
    console.error('[Daily Digest] Erro geral:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
