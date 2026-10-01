"use server";
import { revalidatePath } from "next/cache";
import { requireAdmin, requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { uuid } from "@/features/catalog/schema";
import { cents, businessDate } from "@/features/orders/domain";
import { resolveExpenseRate } from "./rates";
import type { ExpensePayload } from "./domain";
export type ExpenseResult = { success?: boolean; error?: string };
const failure = (code?: string, message?: string) => ["22023","PT409","42501"].includes(code ?? "") ? message ?? "Operación rechazada." : "No se pudo guardar. Revisa los datos e intenta nuevamente.";
async function invoke(name: string, args: Record<string,unknown>): Promise<ExpenseResult> {
  try {
    const { error } = await (await createClient()).rpc(name,args);
    if (error) return { error: failure(error.code,error.message) };
    revalidatePath("/gastos", "layout"); revalidatePath("/categorias-gastos"); return { success: true };
  } catch { return { error: "No se pudo conectar. Tus datos se conservan; consulta el registro antes de reintentar." }; }
}
export async function previewExpenseRate(day: string) {
  await requireProfile();
  try { return { rate: await resolveExpenseRate(day) }; } catch { return { error: "No se pudo consultar la tasa para esa fecha." }; }
}
export async function registerExpense(id: string, payload: ExpensePayload): Promise<ExpenseResult> {
  await requireProfile();
  if (!uuid.test(id) || !payload || typeof payload !== "object") return { error: "Gasto inválido." };
  try { if (cents(payload.amount) <= BigInt(0)) throw Error("El monto debe ser mayor que cero."); } catch { return { error: "Usa un monto positivo con máximo dos decimales." }; }
  if (payload.currency === "USD") {
    try {
      const effective = payload.expense_date ? new Date(payload.expense_date) : new Date();
      if (!Number.isFinite(effective.getTime())) throw Error("Fecha inválida");
      await resolveExpenseRate(businessDate(effective));
    } catch { return { error: "No se pudo consultar la tasa. Revisa la fecha y la conexión." }; }
  }
  return invoke("register_expense",{ target:id,payload });
}
export async function editExpenseNotes(id: string, revision: number, description: string, notes: string) {
  await requireProfile(); if (!uuid.test(id)) return { error:"Gasto inválido." };
  return invoke("edit_expense_notes",{ target:id,expected_revision:revision,payload:{description,notes} });
}
export async function voidExpense(id: string, revision: number, reason: string) {
  await requireAdmin(); if (!uuid.test(id)) return { error:"Gasto inválido." };
  return invoke("void_expense",{ target:id,expected_revision:revision,reason });
}
export async function saveExpenseCategory(id: string, revision: number, payload: {name:string;description:string;is_active:boolean}) {
  await requireAdmin(); if (!uuid.test(id)) return { error:"Categoría inválida." };
  return invoke("save_expense_category",{ target:id,expected_revision:revision,payload });
}
export async function expenseOrderOptions(search: string) {
  await requireProfile();
  const client = await createClient();
  const q = String(search).slice(0,100).replace(/[%_,()\\"]/g, "").trim();
  let query = client.from("orders").select("id,order_number,order_date").order("created_at",{ascending:false}).order("id").limit(25);
  if (uuid.test(q)) query = query.eq("id",q);
  else if (q) query = query.ilike("order_number",`%${q}%`);
  const {data,error} = await query;
  return error ? {error:"No se pudieron consultar los pedidos."} : {orders:data ?? []};
}
export async function expenseLineOptions(order: string) {
  await requireProfile(); if (!uuid.test(order)) return {error:"Pedido inválido."};
  const client = await createClient();
  const rows: {id:string;product_name_snapshot:string}[] = [];
  for (let from=0;;from+=500) {
    const {data,error} = await client.from("order_items").select("id,product_name_snapshot").eq("order_id",order).order("id").range(from,from+499);
    if (error) return {error:"No se pudieron consultar las líneas."};
    rows.push(...(data ?? [])); if (!data || data.length<500) break;
  }
  return {lines:rows};
}

export async function reclassifyExpense(id: string, revision: number, category: string, reason: string) {
  await requireAdmin();
  if (!uuid.test(id) || !uuid.test(category) || !reason.trim() || reason.trim().length > 1000) return { error: "Selecciona categoría y motivo válidos." };
  return invoke("reclassify_expense", { target: id, expected_revision: revision, new_category: category, reason });
}
