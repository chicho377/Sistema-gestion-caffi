import {randomUUID} from "node:crypto";
import Link from "next/link";
import {requireAdmin} from "@/lib/auth";
import {createClient} from "@/lib/supabase/server";
import {uuid} from "@/features/catalog/schema";
import {ExpenseCategoryForm} from "@/components/expense-category-form";
import type {ExpenseCategory} from "@/features/expenses/domain";
export default async function ExpenseCategories({searchParams}:{searchParams:Promise<{edit?:string;q?:string;page?:string}>}){
  await requireAdmin();const params=await searchParams;const client=await createClient();
  const q=(params.q??"").slice(0,100).replace(/[%_,()\\"]/g,"").trim();const page=Math.max(1,Math.min(100000,parseInt(params.page??"1")||1));
  let query=client.from("expense_categories").select("*",{count:"exact"});if(q)query=query.ilike("name",`%${q}%`);
  const {data,count,error}=await query.order("name").order("id").range((page-1)*25,page*25-1);if(error)throw Error("No se pudieron cargar las categorías.");
  let selected:ExpenseCategory|undefined;
  if(params.edit&&uuid.test(params.edit)){const result=await client.from("expense_categories").select("*").eq("id",params.edit).single();if(result.error)throw Error("Categoría no disponible.");selected=result.data;}
  return <><Link href="/gastos" className="button secondary">Volver a gastos</Link><h1>Categorías de gasto</h1><form className="catalog-search panel"><label>Buscar categoría<input name="q" defaultValue={q} maxLength={100}/></label><button className="button secondary">Buscar</button></form><div className="catalog-table-wrap"><table className="catalog-table"><thead><tr><th>Nombre</th><th>Descripción</th><th>Estado</th><th>Acción</th></tr></thead><tbody>{(data??[]).map(row=><tr key={row.id}><td data-label="Nombre">{row.name}</td><td data-label="Descripción">{row.description||"Sin descripción"}</td><td data-label="Estado">{row.is_active?"Activa":"Inactiva"}</td><td><Link className="button secondary" href={`?edit=${row.id}`}>Editar</Link></td></tr>)}</tbody></table></div>{!data?.length&&<p className="message">No hay categorías que coincidan con la búsqueda.</p>}<nav className="catalog-pagination" aria-label="Paginación">{page>1&&<Link href={`?${new URLSearchParams({q,page:String(page-1)})}`}>Anterior</Link>}<span>Página {page} · {count??0} categorías</span>{page*25<(count??0)&&<Link href={`?${new URLSearchParams({q,page:String(page+1)})}`}>Siguiente</Link>}</nav>{selected&&<Link className="button secondary" href="/categorias-gastos">Crear otra categoría</Link>}<ExpenseCategoryForm key={selected?`${selected.id}:${selected.revision}`:"new"} id={selected?.id??randomUUID()} category={selected}/></>;
}
