"use server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { uuid } from "@/features/catalog/schema";
import { cents } from "@/features/orders/domain";
import type { IncomePayload } from "./domain";
type Result = { error?: string; success?: boolean };
const failure = (code?: string, message?: string) => ["22023", "PT409", "42501"].includes(code ?? "") ? message ?? "Operación rechazada." : "No se pudo guardar. Revisa los campos y vuelve a intentarlo.";
export async function registerIncome(id: string, payload: IncomePayload): Promise<Result> {
  await requireAdmin();
  if (!uuid.test(id) || !payload || typeof payload !== "object") return { error: "Ingreso inválido." };
  try { if (cents(payload.amount) <= BigInt(0)) throw Error("El monto debe ser mayor que cero."); } catch (e) { return { error: (e as Error).message }; }
  try {
    const { error } = await (await createClient()).rpc("register_manual_income", { target: id, payload });
    if (error) return { error: failure(error.code, error.message) };
    revalidatePath("/ingresos-manuales", "layout"); return { success: true };
  } catch { return { error: "No se pudo conectar. Conservamos los datos; consulta el registro antes de reintentar." }; }
}
export async function voidIncome(id: string, reason: string): Promise<Result> {
  await requireAdmin();
  if (!uuid.test(id) || typeof reason !== "string" || !reason.trim() || reason.length > 1000) return { error: "Indica un motivo de hasta 1000 caracteres." };
  try {
    const { error } = await (await createClient()).rpc("void_manual_income", { target: id, reason });
    if (error) return { error: failure(error.code, error.message) };
    revalidatePath("/ingresos-manuales", "layout"); return { success: true };
  } catch { return { error: "No se pudo conectar. Consulta el estado antes de reintentar." }; }
}
