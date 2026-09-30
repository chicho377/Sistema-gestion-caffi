import "server-only";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { businessDate } from "@/features/orders/domain";
import { parseExpenseRate, type ExpenseRate } from "./domain";

export async function resolveExpenseRate(day: string): Promise<ExpenseRate | null> {
  const actor = await requireProfile();
  const today = businessDate();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || day > today || (day < today && actor.role !== "admin")) throw Error("Fecha no autorizada.");
  const client = await createClient();
  // La referencia ya validada del día es suficiente; no altera datos históricos.
  const initial = await client.rpc("expense_rate", { day });
  if (initial.error) throw Error("No se pudo consultar la tasa guardada.");
  if (day !== today || (initial.data && !initial.data.fallback)) return initial.data as ExpenseRate | null;
  try {
    const response = await fetch("https://tipodecambio.paginasweb.cr/api", { cache: "no-store", signal: AbortSignal.timeout(6000) });
    if (!response.ok) throw Error("Fuente no disponible");
    const rate = parseExpenseRate(await response.text(), today);
    const current = await requireProfile();
    const saved = await createAdminClient().rpc("store_expense_exchange_rate", { actor: current.id, source_date: rate.date, sell: rate.rate });
    if (saved.error) throw Error("No se pudo conservar la tasa");
  } catch {
    // No fabricar fecha ni tasa. La BD elegirá la última referencia válida, o null.
  }
  const result = await client.rpc("expense_rate", { day });
  if (result.error) throw Error("No se pudo consultar la tasa guardada.");
  return result.data as ExpenseRate | null;
}
