"use server";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeImage, MAX_IMAGE_BYTES } from "./image-validation";
import { uuid } from "./schema";
import type { Result } from "./actions";
export async function uploadImage(
  productId: string | null,
  data: FormData,
): Promise<Result> {
  const actor = await requireProfile();
  if (!productId && actor.role !== "admin")
    return { error: "Acceso no autorizado." };
  if (productId && !uuid.test(productId))
    return { error: "Producto inválido." };
  const f = data.get("image");
  if (!(f instanceof File) || !f.size || f.size > MAX_IMAGE_BYTES)
    return { error: "Selecciona una imagen de hasta 5 MB." };
  const caption = String(data.get("caption") ?? "").trim();
  if (caption.length > 300) return { error: "Descripción demasiado larga." };
  let buffer: Buffer;
  try {
    buffer = await normalizeImage(Buffer.from(await f.arrayBuffer()), f.type);
  } catch {
    return {
      error:
        "Imagen inválida. Usa JPEG, PNG o WebP sin animación, hasta 5 MB y 25 megapíxeles.",
    };
  }
  if (productId) {
    const { data: product } = await (
      await createClient()
    )
      .from("products")
      .select("id")
      .eq("id", productId)
      .single();
    if (!product) return { error: "Producto no disponible." };
  }
  await requireProfile();
  const admin = createAdminClient();
  const path = productId
    ? "products/" + productId + "/" + randomUUID() + ".webp"
    : "branding/" + randomUUID() + ".webp";
  const { error } = await admin.storage
    .from("catalog-images")
    .upload(path, buffer, { contentType: "image/webp", upsert: false });
  if (error) return { error: "No se pudo subir la imagen. Vuelve a intentar." };
  const { error: metadataError } = await admin.rpc("register_catalog_image", {
    actor: actor.id,
    product: productId,
    object_path: path,
    caption_text: caption,
    is_logo: !productId,
  });
  if (metadataError)
    return {
      error:
        "No se pudo asociar la imagen. El acceso pudo cambiar; consulta al Administrador.",
    };
  revalidatePath(productId ? "/productos/" + productId : "/configuracion");
  return { success: true };
}
export async function imageAction(
  id: string,
  action: "main" | "deactivate",
): Promise<Result> {
  await requireProfile();
  if (!uuid.test(id)) return { error: "Imagen inválida." };
  const client = await createClient();
  const result =
    action === "main"
      ? await client.rpc("set_main_image", { image_id: id })
      : action === "deactivate"
        ? await client
            .from("product_images")
            .update({ is_active: false, is_main: false })
            .eq("id", id)
            .select("id")
            .single()
        : { error: true };
  if (result.error) return { error: "No se pudo actualizar la imagen." };
  revalidatePath("/productos", "layout");
  return { success: true };
}
