import "server-only";
import { createClient } from "@/lib/supabase/server";
import { catalogs, type Catalog } from "./schema";
export function columns(kind: Catalog) {
  return [
    "id",
    ...catalogs[kind].fields.map((f) => f.name),
    "is_active",
    "created_at",
    "updated_at",
  ].join(",");
}
export async function allOptions(table: "product_categories" | "materials") {
  const client = await createClient();
  const rows: { id: string; name: string }[] = [];
  for (let start = 0; ; start += 1000) {
    const { data, error } = await client
      .from(table)
      .select("id,name,is_active")
      .order("name")
      .order("id")
      .range(start, start + 999);
    if (error) throw new Error("No se pudieron cargar las opciones.");
    rows.push(
      ...(data ?? []).map((r) => ({
        id: r.id,
        name: r.name + (r.is_active ? "" : " (inactivo)"),
      })),
    );
    if (!data || data.length < 1000) break;
  }
  return rows;
}
