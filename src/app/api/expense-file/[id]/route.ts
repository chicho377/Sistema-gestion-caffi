import { getActiveProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { uuid } from "@/features/catalog/schema";
import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getActiveProfile())) return new Response(null,{status:401});
  const {id} = await params;
  if (!uuid.test(id)) return new Response(null,{status:404});
  const client = await createClient();
  const {data:file} = await client.from("expense_files").select("path").eq("id",id).single();
  if (!file) return new Response(null,{status:404});
  // La decisión comercial siempre usa JWT/RLS. Los bytes son infraestructura:
  // no se entrega una URL de Storage ni un token reutilizable al navegador.
  const {data,error} = await createAdminClient().storage.from("expense-receipts").download(file.path,{cacheNonce:randomUUID()},{cache:"no-store"});
  if (error || !data) return new Response(null,{status:404});
  return new Response(data,{headers:{"Content-Type":"image/webp","Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});
}
