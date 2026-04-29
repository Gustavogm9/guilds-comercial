/**
 * Helper puro de janela de horário com suporte a fuso. Sem deps de server.
 *
 * Usado em lib/push.ts pra decidir se push respeita janela de não-incomodar
 * do usuário. Função pura → testável (ver tests/unit/janela-horario.test.ts).
 */

/**
 * Verifica se a hora atual no fuso fornecido está dentro da janela [inicio, fim).
 * Suporta janela cruzando meia-noite (ex: 22:00 → 06:00).
 *
 * Em caso de fuso inválido, retorna true (fail-open) — melhor mandar push
 * a mais do que silenciar por bug de timezone.
 */
export function dentroJanela(
  janelaInicio: string,
  janelaFim: string,
  fusoHorario: string
): boolean {
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: fusoHorario,
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
    });
    const parts = formatter.formatToParts(new Date());
    const h = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
    const m = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
    const nowMinutes = h * 60 + m;

    const [hi, mi] = janelaInicio.split(":").map(Number);
    const [hf, mf] = janelaFim.split(":").map(Number);
    const ini = hi * 60 + mi;
    const fim = hf * 60 + mf;

    if (ini < fim) return nowMinutes >= ini && nowMinutes < fim;
    // Janela cruzando meia-noite (ex: 22:00 → 06:00)
    return nowMinutes >= ini || nowMinutes < fim;
  } catch {
    return true; // fuso inválido: fail-open
  }
}
