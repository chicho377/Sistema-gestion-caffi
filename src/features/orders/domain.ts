// Dinero transportado como texto; aritmética decimal exacta mediante bigint.
export function cents(value: string): bigint {
  if (typeof value !== "string" || value.length > 100 || !/^\d+(\.\d{1,2})?$/.test(value))
    throw new Error("Importe inválido: usa como máximo dos decimales.");
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * BigInt(100) + BigInt(fraction.padEnd(2, "0"));
}
export function decimal(value: bigint): string {
  return `${value / BigInt(100)}.${(value % BigInt(100)).toString().padStart(2, "0")}`;
}
export function halfUp(value: string): string {
  if (!/^\d+(\.\d+)?$/.test(value)) throw new Error("Decimal inválido");
  const [whole, fraction = ""] = value.split(".");
  const result = BigInt(whole) * BigInt(100) + BigInt(fraction.slice(0, 2).padEnd(2, "0"));
  return decimal(result + (fraction.length > 2 && fraction[2] >= "5" ? BigInt(1) : BigInt(0)));
}
export function quantity(value: string): number {
  if (!/^[1-9]\d{0,9}$/.test(value) || BigInt(value) > BigInt(2147483647))
    throw new Error("La cantidad debe ser un entero positivo válido.");
  return Number(value);
}
export function money(value: string): string {
  // El total calculado puede tener más dígitos que cada importe de entrada.
  if (!/^\d+(\.\d{1,2})?$/.test(value)) throw new Error("Importe calculado inválido");
  const [whole, fraction = ""] = value.split(".");
  return `₡${BigInt(whole).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${fraction.padEnd(2, "0")}`;
}
export function businessDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Costa_Rica", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  return ["year", "month", "day"].map((key) => parts.find((p) => p.type === key)!.value).join("-");
}
export function validDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value;
}
export function validateDates(order: string, delivery: string, admin: boolean, original?: string, now = new Date()) {
  const today = businessDate(now);
  if (!validDate(order) || !validDate(delivery) || order > today || delivery < order || (order !== original && order < today && !admin))
    throw new Error("Revisa las fechas. Solo Administración registra fechas históricas.");
}
export function deliveryAlert(date: string, status: string, today = businessDate()) {
  if (["cancelled", "delivered"].includes(status)) return null;
  const days = Math.round((Date.parse(date) - Date.parse(today)) / 86400000);
  if (days < 0) return { tone: "danger", text: `Atrasado ${-days} días` };
  if (days <= 5) return { tone: "danger", text: `Entrega próxima · ${days} días` };
  if (days <= 7) return { tone: "warning", text: `Próximo a entregar · ${days} días` };
  return null;
}
export type QuoteLine = {
  id: string; product_id: string | null; product_name_snapshot: string;
  product_sku_snapshot?: string | null; description_snapshot: string;
  quantity: string; unit_price: string; discount_amount: string;
  customization: string; notes: string; is_active: boolean;
};
export type Quote = {
  id: string; client_id: string; client_snapshot: { name: string; phone?: string; email?: string };
  order_date: string; requested_delivery_date: string; production_status: "quote" | "confirmed" | "in_production" | "ready" | "delivered" | "cancelled";
  order_number?: string | null; confirmed_at?: string | null; delivered_at?: string | null; deposit_required_amount?: string | null; deposit_percentage_applied?: string | null;
  subtotal: string; discount_amount: string; total: string; notes: string;
  revision: number; created_at: string; cancel_reason: string | null;
};
export type QuoteFile = { id: string; caption: string; is_active: boolean; created_at: string; replaces_id: string | null };
export type ClientOption = { id: string; name: string; is_active: boolean };
export type ProductOption = { id: string; name: string; sku: string; description: string | null; base_price: string; is_active: boolean };
export type QuotePayload = { client_id: string; order_date: string; requested_delivery_date: string; discount_amount: string; notes: string; items: QuoteLine[] };
export function totals(items: QuoteLine[], discount: string) {
  let subtotal = BigInt(0);
  const lines = items.map((item) => {
    const base = BigInt(quantity(item.quantity)) * cents(item.unit_price);
    const reduction = cents(item.discount_amount);
    if (reduction > base) throw new Error("El descuento de una línea supera su importe.");
    const result = base - reduction;
    if (item.is_active) subtotal += result;
    return decimal(result);
  });
  const general = cents(discount);
  if (general > subtotal) throw new Error("El descuento general supera el subtotal.");
  return { subtotal: decimal(subtotal), total: decimal(subtotal - general), lines };
}

export const orderStates = { quote: "Cotización", confirmed: "Confirmado", in_production: "En producción", ready: "Listo", delivered: "Entregado", cancelled: "Cancelado" } as const;
export type PaymentSummary = { total: string; paid: string; balance: string; financial_status: "no_deposit" | "partially_paid" | "paid"; deposit_required_amount: string | null; operational_deposit_required: string | null; deposit_covered: boolean };
export type Payment = { id: string; amount: string; payment_date: string; payment_method: string; reference: string; notes: string; status: "valid" | "voided"; void_reason: string | null };
export type OrderEvent = { event_id: string; happened_at: string; action: string; actor: string; reason: string | null; from_state: string | null; to_state: string | null };
