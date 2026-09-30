import Link from "next/link";
import { Plus, Search, Receipt, ArrowRight } from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { money } from "@/features/orders/domain";
import { incomeDate } from "@/features/manual-income/domain";
import type { Expense } from "@/features/expenses/domain";
import { uuid } from "@/features/catalog/schema";
export default async function ExpensesPage({searchParams}:{searchParams:Promise<{q?:string;status?:string;page?:string;order?:string}>}) {
  const actor=await requireProfile(); const params=await searchParams;
  const q=(params.q??"").slice(0,120).replace(/[%_,()\\"]/g,"").trim();
  const status=["valid","voided"].includes(params.status??"")?params.status!:"all";
  const page=Math.max(1,Math.min(100000,parseInt(params.page??"1")||1));
  const order=params.order&&uuid.test(params.order)?params.order:"";
  let query=(await createClient()).from("expenses_read").select("*",{count:"exact"});
  if(q)query=query.ilike("description",`%${q}%`);
  if(status!=="all")query=query.eq("status",status);
  if(order)query=query.eq("order_id",order);
  const {data,count,error}=await query.order("expense_date",{ascending:false}).order("id").range((page-1)*25,page*25-1);
  if(error)throw Error("No se pudieron cargar los gastos. Intenta nuevamente.");
  const rows=(data??[]) as Expense[]; const href=(n:number)=>"?"+new URLSearchParams({q,status,order,page:String(n)});
  return <><div className="page-heading"><div><span className="eyebrow">{actor.role==="admin"?"ADMINISTRACIÓN":"MI ACTIVIDAD"}</span><h1>{actor.role==="admin"?"Gastos":"Mis gastos"}</h1></div><Link className="button primary" href="/gastos/nuevo"><Plus size={18}/>Registrar gasto</Link></div>
    {actor.role==="admin"&&<Link className="button secondary" href="/categorias-gastos">Administrar categorías de gasto</Link>}
    {order&&<p className="message">Mostrando los gastos autorizados del <Link href={`/pedidos/${order}`}>pedido seleccionado</Link>. <Link href="/gastos">Quitar filtro</Link></p>}
    <form className="catalog-search panel"><input type="hidden" name="order" value={order}/><label>Buscar descripción<input name="q" defaultValue={q} maxLength={120}/></label><label>Estado<select name="status" defaultValue={status}><option value="all">Todos</option><option value="valid">Válido</option><option value="voided">Anulado</option></select></label><button className="button secondary"><Search size={18}/>Buscar</button></form>
    {!rows.length?<section className="panel empty-catalog"><Receipt size={36}/><h2>{q||status!=="all"?"Sin coincidencias":"Todavía no hay gastos"}</h2><p className="muted">Aquí aparecerán los gastos que puedes consultar.</p></section>:<div className="catalog-table-wrap"><table className="catalog-table"><thead><tr><th>Fecha efectiva</th><th>Descripción</th><th>Original</th><th>Equivalente CRC</th><th>Estado</th><th>Acción</th></tr></thead><tbody>{rows.map(row=><tr key={row.id}><td data-label="Fecha">{incomeDate(row.expense_date)}</td><td data-label="Descripción"><strong>{row.description}</strong>{row.rate_is_fallback&&<small>Tasa anterior: {row.exchange_rate_date}</small>}</td><td data-label="Original">{money(row.amount).slice(1)} {row.currency}</td><td data-label="Equivalente">{money(row.amount_crc)}</td><td data-label="Estado"><span className="status-pill expense-status" data-status={row.status}>{row.status==="valid"?"Válido":"Anulado"}</span></td><td><Link className="button secondary" href={`/gastos/${row.id}`}>Ver detalle<ArrowRight size={16}/></Link></td></tr>)}</tbody></table></div>}
    <nav className="catalog-pagination" aria-label="Paginación">{page>1&&<Link className="button secondary" href={href(page-1)}>Anterior</Link>}<span>Página {page} · {count??0} registros</span>{page*25<(count??0)&&<Link className="button secondary" href={href(page+1)}>Siguiente</Link>}</nav>
  </>;
}
