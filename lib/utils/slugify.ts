/**
 * Converte um texto livre em slug seguro para URLs/identificadores.
 * - Remove acentos e diacríticos via NFD
 * - Mantém só [a-z0-9] separados por `-`
 * - Limita a 40 chars
 * - Fallback `org-<timestamp>` se input vazio (chamado raramente)
 */
export function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || `org-${Date.now()}`;
}
