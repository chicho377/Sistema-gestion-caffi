import { randomUUID } from "node:crypto";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { uuid } from "@/features/catalog/schema";
import { QuoteForm, CancelQuoteButton, QuoteFiles } from "@/components/quote-form";
import { businessDate, type Quote, type QuoteLine, type ClientOption, type ProductOption, type QuoteFile } from "@/features/orders/domain";
import { QuoteAlert } from "@/features/orders/alert";
export default async function QuotePage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireProfile(); const { id } = await params; const fresh = id === "nuevo";
  if (!fresh && !uuid.test(id)) notFound();
  const client = await createClient(); const today = businessDate();
  let order: Quote = { id: randomUUID(), client_id: "", client_snapshot: { name: "" }, order_date: today, requested_delivery_date: today, production_status: "quote", subtotal: "0", discount_amount: "0", total: "0", notes: "", revision: 0, created_at: "", cancel_reason: null };
  let lines: QuoteLine[] = []; let files: QuoteFile[] = [];
  async function children<T extends object>(table: string, columns: string, descending = false) {
    const result: T[] = [];
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await client.from(table).select(columns).eq("order_id", id)
        .order("created_at", { ascending: !descending }).order("id").range(offset, offset + 499);
      if (error) throw Error("No se pudo cargar el detalle completo del pedido.");
      result.push(...(data ?? []) as unknown as T[]);
      if (!data || data.length < 500) return result;
    }
  }
  if (!fresh) {
    const [header, items, images] = await Promise.all([
      client.from("quotes_read").select("*").eq("id", id).maybeSingle(),
      children<QuoteLine>("quote_items_read", "*"),
      children<QuoteFile>("order_files", "id,caption,is_active,created_at,replaces_id", true)]);
    if (header.error) throw Error("No se pudo cargar el pedido.");
    if (!header.data) notFound(); order = header.data as Quote;
    lines = items.map((line) => ({ ...line, quantity: String(line.quantity) })) as QuoteLine[];
    files = images;
  }
  // Lectura comercial paginada: nunca cargar costos de materiales ni truncar silenciosamente opciones.
  async function options<T>(table: string, columns: string) {
    const result: T[] = [];
    for (let offset=0;;offset+=500) {
      const { data, error } = await client.from(table).select(columns).order("name").order("id").range(offset,offset+499);
      if (error) throw Error("No se pudieron cargar los clientes o productos.");
      result.push(...(data ?? []) as T[]); if (!data || data.length<500) return result;
    }
  }
  const [clients, products] = await Promise.all([options<ClientOption>("clients","id,name,is_active"),options<ProductOption>("quote_products_read","id,name,sku,description,base_price,is_active")]);
  return <><Link className="text-link" href="/pedidos">Volver a pedidos</Link><div className="page-heading"><div><span className="eyebrow">TU PRÓXIMA CREACIÓN</span><h1>{fresh ? "Nueva cotización" : order.production_status === "cancelled" ? "Cotización cancelada" : "Cotización"}</h1>{!fresh && <p className="muted">Referencia interna: {order.id}</p>}</div>{!fresh && order.production_status === "quote" && <CancelQuoteButton id={id} revision={order.revision}/>}</div>
    <QuoteAlert date={order.requested_delivery_date} status={order.production_status} today={today}/>
    {order.cancel_reason && <p className="message">Cancelada: {order.cancel_reason}. El historial se conserva; no se permite reactivarla.</p>}
    <QuoteForm key={`${order.id}-${order.revision}`} order={order} initialLines={lines} clients={clients} products={products} admin={actor.role === "admin"} today={today}/>
    {!fresh && <QuoteFiles id={id} files={files} editable={order.production_status === "quote"}/>}</>;
}
