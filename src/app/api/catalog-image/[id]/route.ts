import { getActiveProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { uuid } from "@/features/catalog/schema";
import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await getActiveProfile())) return new Response(null, { status: 401 });
  const { id } = await params;
  const client = await createClient();
  let path: string | null = null;
  if (id === "logo") {
    const { data } = await client.rpc("business_brand");
    path = data?.logo_path ?? null;
  } else if (uuid.test(id)) {
    const { data } = await client
      .from("product_images")
      .select("path")
      .eq("id", id)
      .eq("is_active", true)
      .maybeSingle();
    path = data?.path ?? null;
  }
  if (!path) return new Response(null, { status: 404 });
  // El JWT/RLS autoriza metadatos; los bytes privados solo atraviesan este servidor.
  const { data, error } = await createAdminClient().storage
    .from("catalog-images")
    .download(path, { cacheNonce: randomUUID() }, { cache: "no-store" });
  if (error || !data) return new Response(null, { status: 404 });
  return new Response(data, {
    headers: {
      "Content-Type": "image/webp",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
