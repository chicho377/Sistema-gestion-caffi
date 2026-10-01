import { randomUUID } from "node:crypto";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { uuid } from "@/features/catalog/schema";
import { money } from "@/features/orders/domain";
import { incomeDate,paymentMethods } from "@/features/manual-income/domain";
import { type Expense,type ExpenseCategory,type ExpenseFile,fallbackWarning } from "@/features/expenses/domain";
import { ExpenseForm } from "@/components/expense-form";
export default async function ExpenseDetail({params}:{params:Promise<{id:string}>}) {
  const actor=await requireProfile(); const {id}=await params;const admin=actor.role==="admin";const client=await createClient();
  const back=<Link className="button secondary" href="/gastos">Volver a {admin?"gastos":"mis gastos"}</Link>;
  if(id==="nuevo") {
    const categories:ExpenseCategory[]=[];
    for(let from=0;;from+=500){const {data,error}=await client.from("expense_categories").select("id,name,description,is_active,revision").eq("is_active",true).order("name").order("id").range(from,from+499);if(error)throw Error("No se pudieron cargar las categorías.");categories.push(...(data??[]));if(!data||data.length<500)break;}
    return <>{back}<h1>Nuevo gasto</h1>{!categories.length?<p className="message">Administración debe activar o crear una categoría antes de registrar gastos.</p>:<ExpenseForm id={randomUUID()} admin={admin} categories={categories}/>}</>;
  }
  if(!uuid.test(id))notFound();
  const {data,error}=await client.from("expenses_read").select("*").eq("id",id).maybeSingle();
  if(error)throw Error("No se pudo cargar el gasto.");if(!data)notFound();const row=data as Expense;
  const {data:category,error:categoryError}=await client.from("expense_categories").select("name").eq("id",row.category_id).single();
  if(categoryError)throw Error("No se pudo consultar la categoría histórica.");
  const categories:ExpenseCategory[]=[];
  if(admin&&row.status==='valid')for(let from=0;;from+=500){const {data,error}=await client.from('expense_categories').select('id,name,description,is_active,revision').eq('is_active',true).order('name').order('id').range(from,from+499);if(error)throw Error('No se pudieron cargar categorías de reclasificación.');categories.push(...(data??[]));if(!data||data.length<500)break;}
  const files:ExpenseFile[]=[];
  for(let from=0;;from+=500){const {data,error}=await client.from("expense_files").select("id,caption,is_active,replaces_id,created_at").eq("expense_id",id).order("created_at").order("id").range(from,from+499);if(error)throw Error("No se pudieron consultar los comprobantes.");files.push(...(data??[]));if(!data||data.length<500)break;}
  const actorIds=[...new Set([row.created_by,row.voided_by,row.rate_provided_by].filter((value):value is string=>!!value))];
  const {data:people,error:peopleError}=await client.from("profiles").select("id,full_name").in("id",actorIds);
  if(peopleError)throw Error("No se pudieron consultar los responsables.");
  const person=(key:string|null)=>people?.find(p=>p.id===key)?.full_name??"Administración";
  let lineName="";
  if(row.order_item_id){const result=await client.from("order_items").select("product_name_snapshot").eq("id",row.order_item_id).single();if(result.error)throw Error("No se pudo consultar la línea vinculada.");lineName=result.data.product_name_snapshot;}
  return <>{back}<div className="page-heading"><h1>Detalle de gasto</h1><span className="status-pill expense-status" data-status={row.status}>{row.status==="valid"?"Válido":"Anulado"}</span></div>
    <section className="panel"><dl className="order-amounts"><div><dt>Original</dt><dd>{money(row.amount).slice(1)} {row.currency}</dd></div><div><dt>Equivalente CRC</dt><dd>{money(row.amount_crc)}</dd></div><div><dt>Fecha efectiva · Costa Rica</dt><dd>{incomeDate(row.expense_date)}</dd></div><div><dt>Categoría</dt><dd>{category.name}</dd></div><div><dt>Proveedor</dt><dd>{row.supplier||"Sin especificar"}</dd></div><div><dt>Método</dt><dd>{paymentMethods[row.payment_method??""]??"Sin especificar"}</dd></div><div><dt>Registro en SIGCA</dt><dd>{incomeDate(row.created_at)}{row.is_historical?" · Histórico":""}</dd></div><div><dt>Autor</dt><dd>{person(row.created_by)}</dd></div></dl>
    {row.currency==="USD"&&<><h2>Referencia histórica aplicada</h2><p><strong>Origen: {row.rate_origin==="admin_historical"?"Aporte histórico manual de Administración":"Proveedor automático"}</strong></p><p className="break-word">{row.exchange_rate_applied} CRC/USD · Fecha real: {row.exchange_rate_date} · {row.rate_origin==="admin_historical"?"Referencia declarada por Admin: ":"Fuente: "}{row.exchange_rate_source}</p>{row.rate_is_fallback&&<p className="message">{fallbackWarning}</p>}{row.rate_override_reason&&<p className="message break-word">Aporte histórico autorizado: {row.rate_override_reason}. Actor: {person(row.rate_provided_by)}. Registrado: {incomeDate(row.rate_provided_at!)}.</p>}</>}
    <h2>Descripción</h2><p className="break-word">{row.description}</p><p className="break-word">{row.notes||"Sin notas adicionales"}</p>
    {row.order_id&&<p><Link href={`/pedidos/${row.order_id}`}>Consultar pedido vinculado</Link>{row.order_item_id&&<span className="break-word"> · Línea: {lineName}</span>}</p>}
    {row.status==="voided"&&<p className="message break-word">Anulado por {person(row.voided_by)} el {incomeDate(row.voided_at!)}. Motivo: {row.void_reason}. El original y sus comprobantes se conservan.</p>}
    </section>
    <section className="panel quote-form"><h2>Comprobantes e historial de versiones</h2>{!files.length?<p className="muted">Este gasto todavía no tiene comprobantes.</p>:<div className="image-grid">{files.map(file=><article className="image-card" key={file.id}><a href={`/api/expense-file/${file.id}`} target="_blank" rel="noreferrer"><Image unoptimized src={`/api/expense-file/${file.id}`} alt={file.caption||"Comprobante de gasto"} width={240} height={180}/></a><p>{file.caption||"Sin descripción"}</p><small>{file.is_active?"Versión vigente":"Versión anterior conservada"} · {incomeDate(file.created_at)}</small></article>)}</div>}</section>
    <ExpenseForm key={row.revision} id={id} admin={admin} expense={row} files={files} categories={categories}/>
  </>;
}
