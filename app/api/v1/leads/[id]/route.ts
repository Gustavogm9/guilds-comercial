import { NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/api-auth';
import { dispatchWebhook } from '@/lib/webhooks';

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const auth = await validateApiKey();
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { data, error } = await auth.supabaseAdmin!
    .from('leads')
    .select('*')
    .eq('id', params.id)
    .eq('organizacao_id', auth.organizacao_id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
  }

  return NextResponse.json({ data }, { status: 200 });
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
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

  // Primeiro busca o lead atual para saber se a etapa/status mudou
  const { data: currentLead, error: selectError } = await auth.supabaseAdmin!
    .from('leads')
    .select('*')
    .eq('id', params.id)
    .eq('organizacao_id', auth.organizacao_id)
    .single();

  if (selectError || !currentLead) {
    return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
  }

  const { data: updatedLead, error: updateError } = await auth.supabaseAdmin!
    .from('leads')
    .update(body)
    .eq('id', params.id)
    .eq('organizacao_id', auth.organizacao_id)
    .select()
    .single();

  if (updateError) {
    return NextResponse.json({ error: 'Failed to update lead', details: updateError.message }, { status: 500 });
  }

  // Verificar quais eventos emitir baseados na mudança
  if (body.etapa && body.etapa !== currentLead.etapa) {
    await dispatchWebhook(auth.organizacao_id, 'lead.stage_changed', { lead: updatedLead, from: currentLead.etapa, to: body.etapa });
  }

  if (body.status && body.status !== currentLead.status) {
    if (body.status === 'ganho') {
      await dispatchWebhook(auth.organizacao_id, 'lead.won', { lead: updatedLead });
    } else if (body.status === 'perdido') {
      await dispatchWebhook(auth.organizacao_id, 'lead.lost', { lead: updatedLead });
    }
  }

  return NextResponse.json({ data: updatedLead }, { status: 200 });
}
