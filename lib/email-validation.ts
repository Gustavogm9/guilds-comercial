/**
 * Email validation lib.
 *
 * Pipeline:
 *   1. Cache hit em email_validacao? Retorna direto.
 *   2. Syntax (regex) → invalid_syntax se falhar
 *   3. Domínio em email_dominio_disposable → role_disposable
 *   4. DNS MX lookup → no_mx se vazio
 *   5. Senão → valid
 *
 * Cache TTL: 30 dias pra valid, 7 dias pra MX falha (DNS temporário).
 * Bounce perm nunca expira.
 */
import "server-only";
import { promises as dns } from "dns";
import { createClient } from "@supabase/supabase-js";

export type EmailStatus =
  | "valid"
  | "invalid_syntax"
  | "no_mx"
  | "bounce_temp"
  | "bounce_perm"
  | "role_based"
  | "role_disposable";

interface ValidacaoResult {
  email: string;
  status: EmailStatus;
  motivo?: string;
  cache_hit: boolean;
}

const EMAIL_REGEX = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i;

// Role-based usernames (não bloqueia, mas alerta)
const ROLE_USERNAMES = new Set([
  "contato", "contact", "info", "vendas", "sales", "admin",
  "support", "suporte", "noreply", "no-reply", "marketing",
  "atendimento", "comercial", "hello", "ola",
]);

const CACHE_TTL_DAYS_VALID = 30;
const CACHE_TTL_DAYS_NO_MX = 7;

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function validarEmail(emailRaw: string): Promise<ValidacaoResult> {
  const email = emailRaw.trim().toLowerCase();

  // 1. Syntax fail rápido
  if (!email || !EMAIL_REGEX.test(email)) {
    return { email, status: "invalid_syntax", motivo: "Formato inválido.", cache_hit: false };
  }

  const supa = admin();

  // 2. Cache hit?
  const { data: cached } = await supa
    .from("email_validacao")
    .select("status, motivo, ultimo_check")
    .eq("email", email)
    .maybeSingle();

  if (cached) {
    const idadeDias = (Date.now() - new Date(cached.ultimo_check).getTime()) / (1000 * 60 * 60 * 24);
    const ttl = cached.status === "no_mx" ? CACHE_TTL_DAYS_NO_MX : CACHE_TTL_DAYS_VALID;
    // Bounce permanente nunca expira
    if (cached.status === "bounce_perm" || idadeDias < ttl) {
      return { email, status: cached.status as EmailStatus, motivo: cached.motivo ?? undefined, cache_hit: true };
    }
  }

  // 3. Disposable check
  const dominio = email.split("@")[1];
  const username = email.split("@")[0];

  const { data: disposable } = await supa
    .from("email_dominio_disposable")
    .select("dominio")
    .eq("dominio", dominio)
    .maybeSingle();

  if (disposable) {
    await registrarStatus(email, "role_disposable", "Domínio disposable conhecido.");
    return { email, status: "role_disposable", motivo: "Domínio disposable.", cache_hit: false };
  }

  // 4. MX lookup
  let mxOk = false;
  try {
    const records = await dns.resolveMx(dominio);
    mxOk = records.length > 0;
  } catch {
    mxOk = false;
  }

  if (!mxOk) {
    await registrarStatus(email, "no_mx", "Domínio sem MX record.");
    return { email, status: "no_mx", motivo: "Domínio sem registro MX.", cache_hit: false };
  }

  // 5. Role-based (não bloqueia, mas marca)
  if (ROLE_USERNAMES.has(username)) {
    await registrarStatus(email, "role_based", "Email genérico (role-based).");
    return { email, status: "role_based", motivo: "Email genérico (não é pessoal).", cache_hit: false };
  }

  // 6. Tudo ok
  await registrarStatus(email, "valid");
  return { email, status: "valid", cache_hit: false };
}

async function registrarStatus(email: string, status: EmailStatus, motivo?: string) {
  const supa = admin();
  await supa
    .from("email_validacao")
    .upsert(
      {
        email,
        status,
        motivo: motivo ?? null,
        ultimo_check: new Date().toISOString(),
      },
      { onConflict: "email" },
    );
}

/**
 * Valida lote (até N emails). Otimizado pra reuso de cache.
 */
export async function validarEmailsLote(emails: string[]): Promise<Map<string, ValidacaoResult>> {
  const result = new Map<string, ValidacaoResult>();
  // TODO: paralelizar com cache lookup em batch (1 query pra todos)
  for (const email of emails) {
    if (result.has(email)) continue;
    const r = await validarEmail(email);
    result.set(email, r);
  }
  return result;
}

/**
 * Verifica se um email pode ser usado pra envio (NÃO bloqueia role_based,
 * apenas avisos vão pro UI).
 */
export function emailEnviavel(status: EmailStatus): boolean {
  return status === "valid" || status === "role_based";
}
