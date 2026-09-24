"use server";
import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { uuid } from "@/features/catalog/schema";
import { totals, type QuotePayload } from "./domain";
export type QuoteResult = { error?: string; id?: string; success?: boolean };
function message(code?: string) {
  if (code === "PT409" || code === "23505") return "La cotización cambió. Recarga la página antes de volver a guardar.";
  if (code === "42501") return "No tienes acceso o la cotización ya fue cancelada.";
  return "No se pudo guardar. Revisa cliente, productos, fechas, cantidades y descuentos e intenta nuevamente.";
}
export async function saveQuote(id: string, revision: number, payload: QuotePayload): Promise<QuoteResult> {
  await requireProfile();
  if (!uuid.test(id) || !Number.isInteger(revision) || revision < 0) return { error: "Cotización inválida." };
  try { totals(payload.items, payload.discount_amount); } catch (e) { return { error: e instanceof Error ? e.message : "Datos inválidos." }; }
  try {
    const { data, error } = await (await createClient()).rpc("save_quote", { target: id, expected_revision: revision, payload });
    if (error) return { error: message(error.code) };
    revalidatePath("/pedidos", "layout");
    return { id: data };
  } catch { return { error: "No se pudo conectar. Conservamos tus datos en pantalla; comprueba el estado del pedido antes de reintentar." }; }
}
export async function cancelQuote(id: string, revision: number, reason: string): Promise<QuoteResult> {
  await requireProfile();
  if (!uuid.test(id) || !reason.trim() || reason.length > 1000) return { error: "Indica un motivo de hasta 1000 caracteres." };
  try {
    const { error } = await (await createClient()).rpc("cancel_quote", { target: id, expected_revision: revision, reason });
    if (error) return { error: message(error.code) };
    revalidatePath("/pedidos", "layout"); return { success: true };
  } catch { return { error: "No se pudo conectar. Comprueba el estado antes de reintentar." }; }
}

export type OrderOperation = "confirm_order" | "register_payment" | "void_payment" | "transition_order" | "correct_order_dates" | "amend_order";
export async function operateOrder(operation: OrderOperation, id: string, revision: number, payload: Record<string, unknown>): Promise<QuoteResult> {
  await requireProfile();
  if (!["confirm_order", "register_payment", "void_payment", "transition_order", "correct_order_dates", "amend_order"].includes(operation) || !uuid.test(id) || !Number.isInteger(revision) || revision < 1 || !payload || typeof payload !== "object") return { error: "Operación inválida." };
  try {
    const { error } = await (await createClient()).rpc(operation, { target: id, expected_revision: revision, payload });
    if (error) {
      if (["PT409", "22023", "42501"].includes(error.code)) return { error: error.message };
      return { error: "No se pudo guardar. Revisa los campos y la cronología e intenta nuevamente." };
    }
    revalidatePath("/pedidos", "layout");
    return { id, success: true };
  } catch { return { error: "No se pudo conectar. Tus cambios siguen en pantalla; verifica el pedido antes de reintentar." }; }
}
