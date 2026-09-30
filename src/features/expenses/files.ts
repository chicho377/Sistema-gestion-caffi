"use server";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeImage, MAX_IMAGE_BYTES } from "@/features/catalog/image-validation";
import { uuid } from "@/features/catalog/schema";
import type { ExpenseResult } from "./actions";
export async function uploadExpenseFile(id: string, revision: number, form: FormData): Promise<ExpenseResult> {
  const actor = await requireProfile();
  const file = form.get("image"); const caption = String(form.get("caption") ?? "").trim();
  const replaces = String(form.get("replaces") ?? "") || null;
  if (!uuid.test(id) || !Number.isInteger(revision) || revision < 1 || (replaces && !uuid.test(replaces)) || caption.length > 300 || !(file instanceof File) || !file.size || file.size > MAX_IMAGE_BYTES) return { error:"Usa JPEG, PNG o WebP hasta 5 MiB y una descripción de hasta 300 caracteres." };
  try {
    const client = await createClient();
    const { data: expense } = await client.from("expenses").select("status,revision").eq("id",id).single();
    if (!expense || expense.status !== "valid" || expense.revision !== revision) return { error:"El gasto cambió o no está disponible. Recarga antes de continuar." };
    const bytes = await normalizeImage(Buffer.from(await file.arrayBuffer()),file.type);
    const admin = createAdminClient(); const path = `expenses/${id}/${randomUUID()}.webp`;
    const { error } = await admin.storage.from("expense-receipts").upload(path,bytes,{contentType:"image/webp",cacheControl:"0",upsert:false});
    if (error) return { error:"No se pudo cargar el comprobante. Intenta nuevamente." };
    const saved = await admin.rpc("register_expense_file",{actor:actor.id,target:id,expected_revision:revision,object_path:path,caption_text:caption,size_bytes:bytes.length,replaces});
    if (saved.error) return { error:"No se pudo asociar el comprobante; el acceso o el gasto pudo cambiar. Recarga antes de reintentar." };
    revalidatePath("/gastos/"+id); return {success:true};
  } catch { return {error:"Comprueba la conexión y usa una imagen real JPEG, PNG o WebP sin animación, hasta 5 MiB y 25 megapíxeles."}; }
}
