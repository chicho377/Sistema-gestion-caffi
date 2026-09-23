import Link from "next/link";
import { Plus, Search, ClipboardList, ArrowRight } from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { businessDate, money, type Quote } from "@/features/orders/domain";
import { QuoteAlert } from "@/features/orders/alert";
export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ q?: string; state?: string; page?: string }> }) {
  await requireProfile(); const params = await searchParams;
  const q = (params.q ?? "").slice(0,120).replace(/[%_,()\\"]/g, "").trim();
  const state = ["quote", "cancelled"].includes(params.state ?? "") ? params.state! : "all";
  const page = Math.max(1, Math.min(100000, parseInt(params.page ?? "1") || 1));
  let query = (await createClient()).from("quotes_read").select("*", { count: "exact" });
  if (q) query = query.or(`client_snapshot->>name.ilike.%${q}%,notes.ilike.%${q}%`);
  if (state !== "all") query = query.eq("production_status", state);
  const { data, count, error } = await query.order("created_at", { ascending: false }).order("id").range((page-1)*25,page*25-1);
  if (error) throw Error("No se pudieron cargar las cotizaciones. Intenta nuevamente.");
  const rows = (data ?? []) as Quote[];
  const href = (n: number) => "?" + new URLSearchParams({ q, state, page: String(n) });
  return <><div className="page-heading"><div><span className="eyebrow">DEL HILO A LA IDEA</span><h1>Pedidos y cotizaciones</h1><p className="muted">Prepara cada encargo a tu ritmo.</p></div><Link className="button primary" href="/pedidos/nuevo"><Plus size={18}/>Nueva cotización</Link></div>
    <p className="message">Cotizaciones sin consecutivo. La confirmación y los pagos estarán disponibles más adelante.</p>
    <form className="catalog-search panel"><label>Buscar<input name="q" defaultValue={q} placeholder="Cliente u observaciones"/></label><label>Estado<select name="state" defaultValue={state}><option value="all">Todos</option><option value="quote">Cotización</option><option value="cancelled">Cancelado</option></select></label><button className="button secondary"><Search size={18}/>Buscar</button></form>
    {!rows.length ? <section className="panel empty-catalog"><ClipboardList size={36}/><h2>{q || state !== "all" ? "Sin coincidencias" : "Cada creación comienza con una idea"}</h2><p className="muted">Aquí aparecerán tus cotizaciones, sin datos inventados.</p><Link className="button secondary" href="/pedidos/nuevo">Crear cotización</Link></section> :
      <div className="catalog-table-wrap"><table className="catalog-table"><thead><tr><th>Cliente / referencia</th><th>Entrega solicitada</th><th>Total CRC</th><th>Estado</th><th>Acción</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td data-label="Cliente"><strong>{row.client_snapshot.name}</strong><small>Ref. {row.id.slice(0,8)}</small></td><td data-label="Entrega">{row.requested_delivery_date}<br/><QuoteAlert date={row.requested_delivery_date} status={row.production_status} today={businessDate()}/></td><td data-label="Total">{money(row.total)}</td><td data-label="Estado"><span className="status-pill">{row.production_status === "quote" ? "Cotización" : "Cancelado"}</span></td><td><Link className="button secondary" href={`/pedidos/${row.id}`}>Ver / editar<ArrowRight size={16}/></Link></td></tr>)}</tbody></table></div>}
    <nav className="catalog-pagination" aria-label="Paginación">{page>1 && <Link className="button secondary" href={href(page-1)}>Anterior</Link>}<span>Página {page} · {count ?? 0} registros</span>{page*25<(count??0) && <Link className="button secondary" href={href(page+1)}>Siguiente</Link>}</nav>
  </>;
}
