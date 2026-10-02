import Link from 'next/link';
import {notFound} from 'next/navigation';
import {requireProfile} from '@/lib/auth';
import {createClient} from '@/lib/supabase/server';
import {uuid} from '@/features/catalog/schema';
export default async function MaterialHistory({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{page?:string}>}){
 const actor=await requireProfile();const {id}=await params;if(!uuid.test(id))notFound();const client=await createClient();const page=Math.max(1,Math.min(100000,Math.trunc(Number((await searchParams).page))||1));
 const material=await client.from('inventory_stock_read').select('*').eq('id',id).maybeSingle();if(material.error)return <p role="alert">No se pudo consultar el material.</p>;if(!material.data)notFound();const m=material.data;
 const movements=await client.from('inventory_movements_read').select('*',{count:'exact'}).eq('material_id',id).order('effective_at',{ascending:false}).order('created_at',{ascending:false}).order('id').range((page-1)*25,page*25-1);
 const valuation=actor.role==='admin'?await client.from('inventory_valuations_read').select('*').eq('material_id',id).maybeSingle():null;
 return <><Link href="/inventario" className="button secondary">Volver al inventario</Link><h1>{m.name}</h1><section className="panel"><p>Existencia: {m.stock} {m.unit} · mínimo {m.min_stock}</p><p>{m.low_stock?'Alerta: en mínimo o por debajo':'Disponible'} · {m.is_active?'Activo':'Inactivo'}</p>{valuation?.error?<p role="alert">No se pudo consultar la valoración.</p>:valuation?.data&&<><p>Valor interno CRC: {valuation.data.value_crc}</p><p>Promedio CRC por {m.unit}: {valuation.data.average_unit_cost_crc}</p></>}</section>
 <h2>Movimientos</h2>{movements.error?<p role="alert" className="message error">No se pudo consultar el historial.</p>:!movements.data?.length?<p className="message">Sin movimientos registrados. No existe saldo inicial supuesto.</p>:<div className="catalog-table-wrap"><table className="catalog-table"><thead><tr><th>Fecha Costa Rica</th><th>Tipo</th><th>Cantidad</th><th>Antes / después</th></tr></thead><tbody>{movements.data.map(row=><tr key={row.id}><td data-label="Fecha">{new Date(row.effective_at).toLocaleString('es-CR',{timeZone:'America/Costa_Rica'})}</td><td data-label="Tipo">{row.movement_type==='opening_balance'?'Saldo inicial':'Compra / entrada'}</td><td data-label="Cantidad">+{row.quantity} {row.unit_snapshot}</td><td data-label="Existencias">{row.stock_before} → {row.stock_after}</td></tr>)}</tbody></table></div>}
 <nav className="catalog-pagination">{page>1&&<Link href={`?page=${page-1}`}>Anterior</Link>}<span>Página {page}</span>{page*25<(movements.count??0)&&<Link href={`?page=${page+1}`}>Siguiente</Link>}</nav></>;
}
