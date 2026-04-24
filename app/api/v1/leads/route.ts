import { NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/api-auth';

export async function GET(req: Request) {
  const auth = await validateApiKey();
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { searchParams } = new URL(req.url);
  const limit = parseInt(searchParams.get('limit') || '50');
  const offset = parseInt(searchParams.get('offset') || '0');
  const status = searchParams.get('status'); // ganho, perdido, em_andamento

  let query = auth.supabaseAdmin!
    .from('leads')
    .select('*', { count: 'exact' })
    .eq('organizacao_id', auth.organizacao_id)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (status) {
    query = query.eq('status', status);
  }

  const { data, count, error } = await query;

  if (error) {
    return NextResponse.json({ error: 'Database error', details: error.message }, { status: 500 });
  }

  return NextResponse.json({
    data,
    meta: {
      total: count,
      limit,
      offset
    }
  });
}

export async function POST(req: Request) {
  const auth = await validateApiKey();
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body;
  try {
    body = await req.json();
  } catch (e) {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { nome, empresa, email, telefone, cargo, segmento, valor_estimado, fonte } = body;

  if (!nome || !empresa) {
    return NextResponse.json({ error: 'Missing required fields: nome, empresa' }, { status: 400 });
  }

  const { data, error } = await auth.supabaseAdmin!
    .from('leads')
    .insert({
      organizacao_id: auth.organizacao_id,
      nome,
      empresa,
      email,
      telefone,
      cargo,
      segmento,
      valor_estimado,
      fonte: fonte || 'API',
      status: 'em_andamento',
      etapa: 'Prospecção'
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: 'Failed to create lead', details: error.message }, { status: 500 });
  }

  // Emissão de evento de Webhook 'lead.created'
  const { dispatchWebhook } = await import('@/lib/webhooks');
  await dispatchWebhook(auth.organizacao_id, 'lead.created', data);

  return NextResponse.json({ data }, { status: 201 });
}
