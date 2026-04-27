import { NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/api-auth';
import crypto from 'crypto';

/**
 * Endpoint de Direito ao Esquecimento (LGPD)
 * Anonimiza/deleta permanentemente os dados (soft delete ou data obfuscation).
 */
export async function DELETE(req: Request) {
  const auth = await validateApiKey();
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { supabaseAdmin, organizacao_id } = auth;

  try {
    // 1. Apagar Leads (ou obfuscar nomes e contatos se houver histórico contábil)
    // Usaremos Obfuscação de Dados Pessoais (PII)
    const { data: leads } = await supabaseAdmin!
      .from('leads')
      .select('id')
      .eq('organizacao_id', organizacao_id);

    if (leads && leads.length > 0) {
      const obfString = "ANON_" + crypto.randomBytes(4).toString('hex');
      await supabaseAdmin!
        .from('leads')
        .update({
          nome: obfString,
          email: `${obfString}@anon.local`,
          whatsapp: null,
          linkedin: null,
          empresa: 'Empresa Removida (LGPD)'
        })
        .eq('organizacao_id', organizacao_id);
    }

    // 2. Apagar Webhooks e API Keys
    await supabaseAdmin!.from('api_keys').delete().eq('organizacao_id', organizacao_id);
    await supabaseAdmin!.from('webhooks').delete().eq('organizacao_id', organizacao_id);

    // Nota: Por questões de integridade de faturamento e sistema, o cancelamento 
    // completo da organização (Drop de Tenant) no nível master deve ser feito por 
    // um processo manual/gestão para garantir que faturas do Stripe sejam pagas, etc.
    
    // Devolve resposta de sucesso
    return NextResponse.json({
      success: true,
      message: 'Dados anonimizados e apagados com sucesso de acordo com a LGPD.'
    }, { status: 200 });

  } catch (err: any) {
    return NextResponse.json({ error: 'Erro ao anonimizar dados', details: err.message }, { status: 500 });
  }
}
