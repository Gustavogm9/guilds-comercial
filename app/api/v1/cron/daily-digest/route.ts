import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Rota acionada via pg_cron do Supabase
export async function POST(req: Request) {
  try {
    // 1. Validar Secret do Cron
    const authHeader = req.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // 2. Lógica do Daily Digest (Copiloto)
    // Para MVP, vamos apenas iterar sobre organizações ativas e simular o disparo.
    const { data: orgs } = await supabaseAdmin.from('organizacoes').select('id').eq('ativa', true);
    
    if (!orgs) return NextResponse.json({ message: 'Nenhuma organização ativa.' });

    for (const org of orgs) {
      // Simula a compilação do digest
      // Em produção real, você conectaria com Brevo para enviar e-mail 
      // ou chamaria a IA para compilar um resumo textual dos leads que esfriaram.
      console.log(`[Daily Digest] Gerando resumo diário para org ${org.id}`);
    }

    return NextResponse.json({ success: true, processedOrgs: orgs.length });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
