/**
 * Render simples de templates `{{variavel}}`.
 *
 * - Chaves não preenchidas viram string vazia (não dão erro — UX preferível
 *   a quebrar a chamada de IA por uma var faltando).
 * - Objetos viram JSON.stringify (útil para passar listas/structs ao LLM).
 * - Aceita espaços ao redor da chave: `{{ nome }}` é equivalente a `{{nome}}`.
 *
 * Usado pelo dispatcher de IA para resolver `ai_prompts.user_template`
 * antes de despachar para o adapter do provider.
 */
export function renderTemplate(tpl: string, vars: Record<string, unknown>): string {
  return tpl.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k: string) => {
    const v = vars[k];
    if (v === undefined || v === null) return "";
    if (typeof v === "object") return JSON.stringify(v);
    return String(v);
  });
}
