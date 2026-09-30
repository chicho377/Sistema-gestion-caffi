export const incomeTypes: Record<string, string> = { product_sale: "Venta independiente de productos", cards: "Tarjetas", stickers: "Stickers", other: "Otro" };
export const paymentMethods: Record<string, string> = { cash: "Efectivo", sinpe_movil: "SINPE Móvil", transfer: "Transferencia", card: "Tarjeta", other: "Otro" };
export type ManualIncome = {
  id: string; amount: string; currency: string; income_date: string; income_type: string | null;
  payment_method: string | null; description: string | null; is_historical: boolean;
  status: "valid" | "voided"; created_by: string; created_at: string; updated_at: string;
  voided_by: string | null; voided_at: string | null; void_reason: string | null;
};
export type IncomePayload = { amount: string; currency: string; income_date: string; income_type: string; payment_method: string; description: string };
export const incomeDate = (value: string) => new Intl.DateTimeFormat("es-CR", { timeZone: "America/Costa_Rica", dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
