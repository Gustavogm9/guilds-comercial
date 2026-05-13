import crypto from "crypto";

const COOKIE_TTL_SECONDS = 60 * 60;

function getSigningSecret() {
  return process.env.IMPERSONATION_SECRET
    ?? process.env.SUPABASE_SERVICE_ROLE_KEY
    ?? process.env.CRON_SECRET
    ?? "";
}

function sign(payload: string) {
  const secret = getSigningSecret();
  if (!secret) throw new Error("IMPERSONATION_SECRET ou secret server-side nao configurado");

  return crypto.createHmac("sha256", secret).update(payload).digest("base64url");
}

export function createImpersonationCookieValue(input: {
  adminId: string;
  targetUserId: string;
  ttlSeconds?: number;
}) {
  const expiresAt = Math.floor(Date.now() / 1000) + (input.ttlSeconds ?? COOKIE_TTL_SECONDS);
  const payload = `${input.adminId}.${input.targetUserId}.${expiresAt}`;
  return `${payload}.${sign(payload)}`;
}

export function parseImpersonationCookieValue(value?: string | null) {
  if (!value) return null;

  const parts = value.split(".");
  if (parts.length !== 4) return null;

  const [adminId, targetUserId, expiresAtRaw, signature] = parts;
  const expiresAt = Number(expiresAtRaw);
  if (!adminId || !targetUserId || !Number.isFinite(expiresAt)) return null;
  if (expiresAt <= Math.floor(Date.now() / 1000)) return null;

  const payload = `${adminId}.${targetUserId}.${expiresAtRaw}`;
  const expected = sign(payload);
  const receivedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);

  if (receivedBuffer.length !== expectedBuffer.length) return null;
  if (!crypto.timingSafeEqual(receivedBuffer, expectedBuffer)) return null;

  return { adminId, targetUserId, expiresAt };
}

export const IMPERSONATION_COOKIE_MAX_AGE = COOKIE_TTL_SECONDS;
