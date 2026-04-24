import { NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/api-auth';

/**
 * Endpoint de Portabilidade de Dados (LGPD)
 * Retorna todos os dados associados a uma organização.
 */
export async function GET(req: Request) {
  const auth = await validateApiKey();
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { supabaseAdmin, organizacao_id } = auth;

  try {
    // Busca informações da organização
    const { data: orgData } = await supabaseAdmin!
      .from('organizacoes')
      .select('*')
      .eq('id', organizacao_id)
      .single();

    // Busca todos os membros
    const { data: members } = await supabaseAdmin!
      .from('membros_organizacao')
      .select('*, perfis(*)')
      .eq('organizacao_id', organizacao_id);

    // Busca todos os leads
    const { data: leads } = await supabaseAdmin!
      .from('leads')
      .select('*')
      .eq('organizacao_id', organizacao_id);

    // Busca todas as cadências configuradas
    const { data: cadencias } = await supabaseAdmin!
      .from('cadencia_templates')
      .select('*')
      .eq('organizacao_id', organizacao_id);

    const exportData = {
      timestamp: new Date().toISOString(),
      organizacao: orgData,
      membros: members,
      leads: leads,
      cadencias: cadencias
    };

    // Retorna JSON para download/portabilidade
    return NextResponse.json(exportData, {
      status: 200,
      headers: {
        'Content-Disposition': 'attachment; filename="dados_lgpd_guilds.json"',
      }
    });

  } catch (err: any) {
    return NextResponse.json({ error: 'Erro ao gerar exportação', details: err.message }, { status: 500 });
  }
}
