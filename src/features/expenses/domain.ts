export type ExpenseRate = { rate: string; date: string; source: string; fallback: boolean };
export type ExpenseCategory = { id: string; name: string; description: string | null; is_active: boolean; revision: number };
export type Expense = {
  id: string; category_id: string; order_id: string | null; order_item_id: string | null;
  amount: string; currency: "CRC" | "USD"; amount_crc: string; expense_date: string;
  exchange_rate_applied: string | null; exchange_rate_date: string | null; exchange_rate_source: string | null;
  rate_is_fallback: boolean; rate_override_reason: string | null; rate_provided_by: string | null; rate_provided_at: string | null;
  description: string; notes: string | null; supplier: string | null; payment_method: string | null;
  status: "valid" | "voided"; is_historical: boolean; created_by: string; updated_by: string;
  voided_by: string | null; voided_at: string | null; void_reason: string | null;
  revision: number; created_at: string; updated_at: string;
};
export type ExpensePayload = Record<string,string>;
export type ExpenseFile = { id: string; caption: string; is_active: boolean; replaces_id: string | null; created_at: string };
export const fallbackWarning = "La fuente no dispone de una tasa válida de hoy. Se utiliza automáticamente la última tasa válida guardada, con su fecha real.";

// Conserva el lexema decimal del JSON, sin convertir el importe a IEEE-754.
export function parseExpenseRate(raw: string, today: string): ExpenseRate {
  if (raw.length > 10000) throw Error("Respuesta inválida");
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") throw Error("Respuesta inválida");
  const data = parsed as Record<string,unknown>;
  if (Object.values(data).some(value => value !== null && typeof value === "object") || [...raw.matchAll(/"venta"\s*:/g)].length !== 1) throw Error("Respuesta ambigua");
  const candidates = [...raw.matchAll(/"venta"\s*:\s*(\d+(?:\.\d+)?)\s*(?=[,}])/g)];
  if (candidates.length !== 1 || typeof data.venta !== "number" || !Number.isFinite(data.venta) || data.venta <= 0 || typeof data.fecha !== "string") throw Error("Tasa inválida");
  const value = candidates[0][1];
  if (value.length > 100 || !/[1-9]/.test(value) || Number(value) !== data.venta) throw Error("Tasa inválida");
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(data.fecha);
  if (!match || `${match[3]}-${match[2]}-${match[1]}` !== today) throw Error("La tasa no corresponde a hoy");
  return { rate: value, date: today, source: "BCCR via tipodecambio.paginasweb.cr", fallback: false };
}
