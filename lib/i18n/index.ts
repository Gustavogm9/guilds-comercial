/**
 * i18n caseiro do guilds-comercial — leve, sem deps externas.
 *
 * Estratégia:
 *   - Locale resolvido via cookie `NEXT_LOCALE` (default `pt-BR`)
 *   - 2 idiomas suportados: `pt-BR` (default) e `en-US`
 *   - Server: `getLocale()` lê cookie, `getMessages(locale)` carrega JSON,
 *     `getT(locale)` retorna função `t(key)` por dot-path.
 *   - Client: `useT()` hook lê cookie via document.cookie, faz dynamic import
 *     do JSON na primeira chamada.
 *
 * Sem URL prefix (mantém /hoje, /pipeline) — locale é estado de user.
 * Migração só onde faz sentido (sidebar, layouts principais). Resto fica em PT-BR
 * até alguém precisar.
 *
 * Helper t() é tolerante: se a chave não existe, retorna a própria chave.
 * Não quebra hot-reload.
 */
import ptBR from "./messages/pt-BR.json";
import enUS from "./messages/en-US.json";

export type Locale = "pt-BR" | "en-US";
export const LOCALES: Locale[] = ["pt-BR", "en-US"];
export const DEFAULT_LOCALE: Locale = "pt-BR";
export const LOCALE_COOKIE = "NEXT_LOCALE";

const MESSAGES: Record<Locale, Record<string, any>> = {
  "pt-BR": ptBR as any,
  "en-US": enUS as any,
};

export function isLocale(s: string | undefined | null): s is Locale {
  return s === "pt-BR" || s === "en-US";
}

/**
 * Resolve mensagem por dot-path. Ex: t("sidebar.hoje") → "Hoje".
 * Se não encontrar, retorna o próprio path (visível no UI = fácil de detectar).
 */
function lookupPath(messages: Record<string, any>, path: string): string {
  const parts = path.split(".");
  let cur: any = messages;
  for (const p of parts) {
    if (cur === undefined || cur === null) return path;
    cur = cur[p];
  }
  return typeof cur === "string" ? cur : path;
}

/**
 * Retorna função t() para um locale específico. Server-side.
 *
 * Uso:
 *   const t = getT(locale);
 *   t("sidebar.hoje")  // "Hoje" ou "Today"
 */
export function getT(locale: Locale) {
  const messages = MESSAGES[locale] ?? MESSAGES[DEFAULT_LOCALE];
  return function t(key: string): string {
    return lookupPath(messages, key);
  };
}

/**
 * Server-side: lê locale do cookie via next/headers.
 * Default `pt-BR` se cookie ausente ou inválido.
 *
 * Importar dinamicamente next/headers para ser compatível com client/edge:
 * essa função é só chamada em RSC.
 */
export async function getServerLocale(): Promise<Locale> {
  // Lazy import — next/headers só funciona em RSC/route handler
  const { cookies } = await import("next/headers");
  const c = cookies().get(LOCALE_COOKIE)?.value;
  return isLocale(c) ? c : DEFAULT_LOCALE;
}

/**
 * Client-side: lê locale do cookie via document.
 */
export function getClientLocale(): Locale {
  if (typeof document === "undefined") return DEFAULT_LOCALE;
  const m = document.cookie.match(/NEXT_LOCALE=([^;]+)/);
  const v = m?.[1];
  return isLocale(v) ? v : DEFAULT_LOCALE;
}

/**
 * Setter client-side: salva cookie + reload pra propagar.
 */
export function setClientLocale(locale: Locale, reload = true) {
  if (typeof document === "undefined") return;
  // 1 ano
  const exp = new Date(Date.now() + 365 * 86400_000).toUTCString();
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; expires=${exp}; SameSite=Lax`;
  if (reload && typeof window !== "undefined") window.location.reload();
}

/**
 * Helper para formatadores Intl com locale correto.
 */
export function formatNumber(n: number, locale: Locale, opts?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(locale, opts).format(n);
}

export function formatDate(d: Date | string, locale: Locale, opts?: Intl.DateTimeFormatOptions): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat(locale, opts).format(date);
}

export function formatCurrency(n: number, locale: Locale, currency = "BRL"): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(n);
}
