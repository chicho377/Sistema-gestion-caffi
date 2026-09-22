export const rateSource = "BCCR via tipodecambio.paginasweb.cr";
export type StoredRate = {
  source: string;
  rate_date: string;
  sell_rate: number;
  fetched_at: string;
};
// Solo captura fallos de la fuente, nunca redirecciones ni errores de autorización.
export async function freshOrPrevious(
  previous: StoredRate | null,
  load: () => Promise<unknown>,
) {
  try {
    const rate = parseRate(await load());
    if (previous && rate.rate_date < previous.rate_date)
      throw new Error("Dato anterior");
    return { ...rate, fetched_at: new Date().toISOString(), cached: false };
  } catch {
    return previous ? { ...previous, cached: true } : null;
  }
}
export function parseRate(value: unknown, now = new Date()) {
  if (!value || typeof value !== "object")
    throw new Error("Respuesta de cambio inválida.");
  const { venta, fecha } = value as Record<string, unknown>;
  if (
    typeof venta !== "number" ||
    !Number.isFinite(venta) ||
    venta <= 0 ||
    typeof fecha !== "string"
  )
    throw new Error("Tasa inválida.");
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(fecha);
  if (!m) throw new Error("Fecha inválida.");
  const date = m[3] + "-" + m[2] + "-" + m[1];
  const parsed = new Date(date + "T00:00:00Z");
  if (
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== date ||
    parsed.getTime() > now.getTime() + 86400000
  )
    throw new Error("Fecha inválida.");
  return { source: rateSource, rate_date: date, sell_rate: venta };
}
