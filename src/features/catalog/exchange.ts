import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth";
import { freshOrPrevious } from "./exchange-parser";
export async function exchangeRate(force = false) {
  await requireAdmin();
  const client = await createClient();
  const { data: previous, error } = await client
    .from("exchange_rates")
    .select("rate_date,sell_rate,source,fetched_at")
    .order("rate_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error)
    throw new Error("No se pudo consultar el tipo de cambio guardado.");
  if (
    !force &&
    previous &&
    Date.now() - new Date(previous.fetched_at).getTime() < 3600000
  )
    return { ...previous, cached: true };
  const candidate = await freshOrPrevious(previous, async () => {
    const response = await fetch("https://tipodecambio.paginasweb.cr/api", {
      cache: "no-store",
      signal: AbortSignal.timeout(6000),
    });
    if (!response.ok) throw new Error("Fuente no disponible.");
    return response.json();
  });
  if (!candidate || candidate.cached) return candidate;
  // Revalidar inmediatamente antes de la única escritura privilegiada de cotizaciones.
  const actor = await requireAdmin();
  try {
    const { error: writeError } = await createAdminClient().rpc(
      "store_exchange_rate",
      {
        actor: actor.id,
        source_date: candidate.rate_date,
        sell: candidate.sell_rate,
      },
    );
    if (writeError) throw new Error("No se pudo conservar la tasa.");
    return candidate;
  } catch {
    return previous ? { ...previous, cached: true } : null;
  }
}
