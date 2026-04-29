import { headers } from 'next/headers';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

// Rate limit: persistente via SQL function `consume_rate_token` (DB-based,
// atomic) — sobrevive ao reset do serverless. Default 1000 req/min por org.
// Veja migration 20260427100003_api_rate_limit_persistent.sql.
const RATE_LIMIT_MAX_PER_MIN = 1000;

export async function validateApiKey() {
  const headersList = headers();
  const authHeader = headersList.get('authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { error: 'Missing or invalid Authorization header', status: 401 };
  }

  const token = authHeader.split(' ')[1];
  
  if (!token) {
    return { error: 'Token not provided', status: 401 };
  }

  // Gera o hash da chave para buscar no banco
  const keyHash = crypto.createHash('sha256').update(token).digest('hex');

  // Usamos service_role para checar chaves ignorando RLS
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: apiKey, error } = await supabaseAdmin
    .from('api_keys')
    .select('id, organizacao_id, organizacoes(ativa)')
    .eq('key_hash', keyHash)
    .single();

  if (error || !apiKey) {
    return { error: 'Invalid API Key', status: 401 };
  }

  // Ignorar o erro do TypeScript aqui pois sabemos a estrutura que o select com join retorna
  const orgAtiva = (apiKey.organizacoes as any)?.ativa;

  if (!orgAtiva) {
    return { error: 'Organization is disabled', status: 403 };
  }

  const orgId = apiKey.organizacao_id;

  // Rate Limiting persistente: chama função SQL atômica que faz upsert
  // em api_rate_counters (org, minuto). Retorna false se passou do limite.
  const { data: tokenAccepted, error: rateErr } = await supabaseAdmin.rpc(
    'consume_rate_token',
    { _org: orgId, _max_per_min: RATE_LIMIT_MAX_PER_MIN }
  );

  if (rateErr) {
    // Fail open em caso de erro do limiter: melhor processar a request
    // do que bloquear toda a API por bug de DB. Logamos para Sentry pegar.
    console.error('[api-auth] consume_rate_token failed', rateErr);
  } else if (tokenAccepted === false) {
    return {
      error: `Rate limit exceeded (${RATE_LIMIT_MAX_PER_MIN} req/min)`,
      status: 429,
    };
  }

  // Atualiza last_used_at (assíncrono)
  supabaseAdmin
    .from('api_keys')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', apiKey.id)
    .then();

  return { organizacao_id: orgId, status: 200, supabaseAdmin };
}
