import Link from 'next/link';
import {ArrowRight,PackagePlus,TriangleAlert} from 'lucide-react';
import {requireProfile} from '@/lib/auth';
import {createClient} from '@/lib/supabase/server';
import type {InventoryMaterial} from '@/features/inventory/domain';

export default async function InventoryPage({searchParams}:{searchParams:Promise<{q?:string;page?:string}>}){
 const actor=await requireProfile();const client=await createClient();const params=await searchParams;const page=Math.max(1,Math.min(100000,Math.trunc(Number(params.page))||1));const q=(params.q??'').slice(0,100).replace(/[%_,()\\"]/g,'').trim();
 let query=client.from('inventory_stock_read').select('*',{count:'exact'}).order('name').order('id').range((page-1)*25,page*25-1);if(q)query=query.or(`name.ilike.%${q}%,code.ilike.%${q}%`);
 const {data,error,count}=await query;const rows=(data??[]) as InventoryMaterial[];
 return <><header className="page-heading"><div><h1>Inventario</h1><p className="muted">Existencias y movimientos en la unidad base de cada material.</p></div>{actor.role==='admin'&&<Link href="/inventario/nueva" className="button primary"><PackagePlus size={18}/>Registrar entrada</Link>}</header>
  {actor.role==='admin'&&<Link className="button secondary" href="/inventario/recepciones">Compras y saldos iniciales</Link>}
  <form className="catalog-toolbar"><label>Buscar material<input name="q" defaultValue={q} placeholder="Nombre o código"/></label><button className="button secondary">Buscar</button></form>
  {error?<p role="alert" className="message error">No se pudo consultar el inventario. Intenta recargar.</p>:!rows.length?<section className="panel"><h2>Sin materiales para esta búsqueda</h2><p>El catálogo y las entradas registradas aparecerán aquí.</p></section>:<div className="catalog-table-wrap"><table className="catalog-table"><thead><tr><th>Material</th><th>Existencia</th><th>Mínimo</th><th>Estado</th><th>Detalle</th></tr></thead><tbody>{rows.map(m=><tr key={m.id}><td data-label="Material">{m.name}<small className="block muted">{m.code} · {m.is_active?'Activo':'Inactivo'}</small></td><td data-label="Existencia">{m.stock} {m.unit}</td><td data-label="Mínimo">{m.min_stock} {m.unit}</td><td data-label="Estado">{m.low_stock?<span className="status-badge"><TriangleAlert size={16}/>En mínimo o por debajo</span>:'Disponible'}</td><td><Link href={`/inventario/${m.id}`} className="button secondary">Ver historial<ArrowRight size={16}/></Link></td></tr>)}</tbody></table></div>}
  <nav className="catalog-pagination" aria-label="Paginación">{page>1&&<Link href={`?page=${page-1}&q=${encodeURIComponent(q)}`} className="button secondary">Anterior</Link>}<span>Página {page} · {count??0} materiales</span>{page*25<(count??0)&&<Link href={`?page=${page+1}&q=${encodeURIComponent(q)}`} className="button secondary">Siguiente</Link>}</nav>
 </>;
}
