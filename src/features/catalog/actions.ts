"use server";
import { revalidatePath } from "next/cache";
import { requireProfile, requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  catalogs,
  isCatalog,
  validateFields,
  settingsFields,
  costFields,
  uuid,
} from "./schema";
import { exchangeRate } from "./exchange";
export type Result = { error?: string; id?: string; success?: boolean };
function dbError(code?: string) {
  if (code === "23505")
    return "Ya existe ese código, SKU, categoría o relación. Revisa también los registros inactivos.";
  if (code === "23503")
    return "La categoría, producto o material seleccionado no existe.";
  if (code === "42501")
    return "No tienes autorización para realizar esta operación.";
  return "No se pudo guardar. Revisa los datos y vuelve a intentar.";
}
export async function saveCatalog(
  kind: string,
  id: string | null,
  data: FormData,
): Promise<Result> {
  const actor = await requireProfile();
  if (!isCatalog(kind) || (id && !uuid.test(id)))
    return { error: "Registro inválido." };
  let values;
  try {
    values = validateFields(catalogs[kind].fields, data);
  } catch (e) {
    return { error: (e as Error).message };
  }
  const client = await createClient();
  if (kind === "materiales") {
    let costs;
    try {
      costs = actor.role === "admin" ? validateFields(costFields, data) : null;
    } catch (e) {
      return { error: (e as Error).message };
    }
    if (costs?.currency && !["CRC", "USD"].includes(String(costs.currency)))
      return { error: "Moneda inválida." };
    const { data: result, error } = await client.rpc("save_material", {
      target_id: id,
      material_code: values.code,
      material_name: values.name,
      material_category: values.category,
      material_unit: values.unit,
      minimum: values.min_stock,
      enabled: data.get("is_active") !== "false",
      cost: costs?.amount ?? null,
      cost_currency: costs?.currency ?? "CRC",
    });
    if (error) return { error: dbError(error.code) };
    revalidatePath("/materiales");
    return { id: result };
  }
  const query = id
    ? client.from(catalogs[kind].table).update(values).eq("id", id)
    : client.from(catalogs[kind].table).insert(values);
  const { data: result, error } = await query.select("id").single();
  if (error) return { error: dbError(error.code) };
  revalidatePath("/" + kind);
  return { id: result.id };
}
export async function changeActive(
  kind: string,
  id: string,
  enabled: boolean,
): Promise<Result> {
  await requireProfile();
  if (!isCatalog(kind) || !uuid.test(id) || typeof enabled !== "boolean")
    return { error: "Registro inválido." };
  const { error, data } = await (
    await createClient()
  )
    .from(catalogs[kind].table)
    .update({ is_active: enabled })
    .eq("id", id)
    .select("id")
    .single();
  if (error || !data) return { error: dbError(error?.code) };
  revalidatePath("/" + kind);
  return { success: true };
}
export async function saveSettings(data: FormData): Promise<Result> {
  await requireAdmin();
  let values;
  try {
    values = validateFields(settingsFields, data);
    if (Number(values.deposit_percentage) > 100)
      throw new Error("El adelanto no puede superar 100 %.");
  } catch (e) {
    return { error: (e as Error).message };
  }
  const { error } = await (
    await createClient()
  )
    .from("settings")
    .update(values)
    .eq("singleton", true)
    .select("id")
    .single();
  if (error) return { error: dbError(error.code) };
  revalidatePath("/configuracion");
  return { success: true };
}
export async function refreshExchange(): Promise<Result> {
  await requireAdmin();
  const rate = await exchangeRate(true);
  revalidatePath("/configuracion");
  revalidatePath("/materiales");
  return rate && !rate.cached
    ? { success: true }
    : {
        error: rate
          ? "La fuente no respondió con una tasa nueva. Se conserva la última obtenida."
          : "La fuente no está disponible y aún no hay una tasa guardada.",
      };
}
export async function duplicateProduct(
  source: string,
  data: FormData,
): Promise<Result> {
  await requireProfile();
  if (!uuid.test(source)) return { error: "Producto inválido." };
  let values;
  try {
    values = validateFields(catalogs.productos.fields.slice(0, 2), data);
  } catch (e) {
    return { error: (e as Error).message };
  }
  const { data: id, error } = await (
    await createClient()
  ).rpc("duplicate_product", {
    source_id: source,
    new_sku: values.sku,
    new_name: values.name,
  });
  if (error) return { error: dbError(error.code) };
  revalidatePath("/productos");
  return { id };
}
export async function saveRelation(
  productId: string,
  data: FormData,
): Promise<Result> {
  await requireProfile();
  if (!uuid.test(productId)) return { error: "Producto inválido." };
  let values;
  try {
    values = validateFields(
      [
        { name: "material_id", label: "Material", required: true },
        {
          name: "estimated_quantity",
          label: "Cantidad estimada",
          type: "number",
          required: true,
        },
        { name: "notes", label: "Notas", max: 1000 },
      ],
      data,
    );
    if (Number(values.estimated_quantity) <= 0)
      throw new Error("La cantidad estimada debe ser mayor a cero.");
  } catch (e) {
    return { error: (e as Error).message };
  }
  const id = data.get("id");
  if (id && (typeof id !== "string" || !uuid.test(id)))
    return { error: "Relación inválida." };
  const client = await createClient();
  const query = id
    ? client
        .from("product_materials")
        .update({ ...values, is_active: data.get("is_active") !== "false" })
        .eq("id", id)
        .eq("product_id", productId)
    : client
        .from("product_materials")
        .insert({ ...values, product_id: productId });
  const { error } = await query.select("id").single();
  if (error) return { error: dbError(error.code) };
  revalidatePath("/productos/" + productId);
  return { success: true };
}
