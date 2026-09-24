"use server";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeImage, MAX_IMAGE_BYTES } from "@/features/catalog/image-validation";
import { uuid } from "@/features/catalog/schema";
import type { QuoteResult } from "./actions";
export async function uploadQuoteFile(orderId: string, form: FormData): Promise<QuoteResult> {
  const actor = await requireProfile();
  const file = form.get("image"); const caption = String(form.get("caption") ?? "").trim();
  const replaces = String(form.get("replaces") ?? "") || null;
  if (!uuid.test(orderId) || (replaces && !uuid.test(replaces)) || caption.length > 300 || !(file instanceof File) || !file.size || file.size > MAX_IMAGE_BYTES)
    return { error: "Usa una imagen de hasta 5 MB y una descripción de hasta 300 caracteres." };
  try {
    const client = await createClient();
    const { data: order } = await client.from("orders").select("production_status").eq("id", orderId).single();
    if (!order || order.production_status === "cancelled") return { error: "Pedido no disponible para modificar archivos." };
    const bytes = await normalizeImage(Buffer.from(await file.arrayBuffer()), file.type);
    const admin = createAdminClient();
    const path = `orders/${orderId}/${randomUUID()}.webp`;
    const { error } = await admin.storage.from("order-references").upload(path, bytes, { contentType: "image/webp", upsert: false });
    if (error) return { error: "No se pudo subir la referencia. Intenta nuevamente." };
    const { error: metadataError } = await admin.rpc("register_order_file", { actor: actor.id, target: orderId, object_path: path, caption_text: caption, size_bytes: bytes.length, replaces });
    if (metadataError) return { error: "No se pudo asociar el archivo. El estado o acceso pudo cambiar; consulta al Administrador." };
    revalidatePath("/pedidos/" + orderId); return { success: true };
  } catch { return { error: "No se pudo cargar. Usa JPEG, PNG o WebP sin animación, hasta 5 MB y 25 megapíxeles, y comprueba la conexión." }; }
}
