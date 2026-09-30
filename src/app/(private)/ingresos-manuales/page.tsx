import Link from "next/link";
import { Plus, Search, Wallet, ArrowRight } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { money } from "@/features/orders/domain";
import { incomeTypes, incomeDate, type ManualIncome } from "@/features/manual-income/domain";
export default async function IncomePage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; type?: string; page?: string }> }) {
  await requireAdmin(); const params = await searchParams;
  const q = (params.q ?? "").slice(0,120).replace(/[%_,()\\"]/g, "").trim();
  const status = ["valid","voided"].includes(params.status ?? "") ? params.status! : "all";
  const type = Object.hasOwn(incomeTypes, params.type ?? "") ? params.type! : "all";
  const page = Math.max(1,Math.min(100000,parseInt(params.page ?? "1") || 1));
  let query = (await createClient()).from("manual_income_read").select("*", { count: "exact" });
  if (q) query = query.ilike("description", `%${q}%`);
  if (status !== "all") query = query.eq("status",status);
  if (type !== "all") query = query.eq("income_type",type);
  const { data, count, error } = await query.order("income_date",{ascending:false}).order("id").range((page-1)*25,page*25-1);
  if (error) throw Error("No se pudieron cargar los ingresos. Intenta nuevamente.");
  const rows = (data ?? []) as ManualIncome[];
  const href = (n: number) => "?"+new URLSearchParams({q,status,type,page:String(n)});
  return <><div className="page-heading"><div><span className="eyebrow">ADMINISTRACIÓN</span><h1>Ingresos manuales</h1></div><Link className="button primary" href="/ingresos-manuales/nuevo"><Plus size={18}/>Registrar ingreso</Link></div>
    <p className="message">Ingresos manuales son únicamente ingresos que no provienen de pedidos. Para cobrar un encargo, ve a <Link href="/pedidos">Pedidos y sus pagos</Link>.</p>
    <form className="catalog-search panel"><label>Buscar descripción<input name="q" defaultValue={q} maxLength={120}/></label><label>Estado<select name="status" defaultValue={status}><option value="all">Todos</option><option value="valid">Válido</option><option value="voided">Anulado</option></select></label><label>Clasificación<select name="type" defaultValue={type}><option value="all">Todas</option>{Object.entries(incomeTypes).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label><button className="button secondary"><Search size={18}/>Buscar</button></form>
    {!rows.length ? <section className="panel empty-catalog"><Wallet size={36}/><h2>{q || status!=="all" || type!=="all" ? "Sin coincidencias" : "Todavía no hay ingresos manuales"}</h2><p className="muted">Aquí aparecerán los ingresos independientes que registres.</p></section> : <div className="catalog-table-wrap"><table className="catalog-table"><thead><tr><th>Fecha efectiva</th><th>Descripción / clasificación</th><th>Monto CRC</th><th>Estado</th><th>Acción</th></tr></thead><tbody>{rows.map(row=><tr key={row.id}><td data-label="Fecha">{incomeDate(row.income_date)}</td><td data-label="Descripción"><strong>{row.description ?? "Sin descripción"}</strong><small>{incomeTypes[row.income_type ?? ""] ?? "Sin clasificación"}</small></td><td data-label="Monto">{money(row.amount)}</td><td data-label="Estado"><span className="status-pill">{row.status==="valid" ? "Válido" : "Anulado"}</span></td><td><Link className="button secondary" href={`/ingresos-manuales/${row.id}`}>Ver detalle<ArrowRight size={16}/></Link></td></tr>)}</tbody></table></div>}
    <nav className="catalog-pagination" aria-label="Paginación">{page>1 && <Link className="button secondary" href={href(page-1)}>Anterior</Link>}<span>Página {page} · {count ?? 0} registros</span>{page*25<(count??0) && <Link className="button secondary" href={href(page+1)}>Siguiente</Link>}</nav>
  </>;
}
