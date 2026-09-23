import { getActiveProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { uuid } from "@/features/catalog/schema";
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getActiveProfile())) return new Response(null, { status: 401 });
  const { id } = await params;
  if (!uuid.test(id)) return new Response(null, { status: 404 });
  const client = await createClient();
  const { data: file } = await client.from("order_files").select("path").eq("id", id).single();
  if (!file) return new Response(null, { status: 404 });
  const { data, error } = await client.storage.from("order-references").download(file.path);
  if (error || !data) return new Response(null, { status: 404 });
  return new Response(data, { headers: { "Content-Type": "image/webp", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}
