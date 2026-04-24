import { headers } from 'next/headers';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

// Limitador de Rate em memória (MVP)
// Estrutura: { [orgId]: { count: number, resetTime: number } }
const rateLimitCache = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_WINDOW_MS = 60000; // 1 minuto
const RATE_LIMIT_MAX = 1000; // 1000 req/min (Plano Business)

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

  // Rate Limiting Básico in-memory
  const now = Date.now();
  let rateInfo = rateLimitCache.get(orgId);

  if (!rateInfo || rateInfo.resetTime < now) {
    rateInfo = { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS };
  } else {
    rateInfo.count += 1;
  }

  rateLimitCache.set(orgId, rateInfo);

  if (rateInfo.count > RATE_LIMIT_MAX) {
    return { error: 'Rate limit exceeded (1000 req/min)', status: 429 };
  }

  // Atualiza last_used_at (assíncrono)
  supabaseAdmin
    .from('api_keys')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', apiKey.id)
    .then();

  return { organizacao_id: orgId, status: 200, supabaseAdmin };
}
