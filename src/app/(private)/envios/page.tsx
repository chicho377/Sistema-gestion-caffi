import Link from 'next/link';
import {requireProfile} from '@/lib/auth';
import {createClient} from '@/lib/supabase/server';
import {uuid} from '@/features/catalog/schema';
import {ShipmentPanel} from '@/components/shipment-panel';
import {shipmentStates,deliveryTypes,type Shipment,type ShippingFinance} from '@/features/shipping/types';
export default async function ShippingPage({searchParams}:{searchParams:Promise<{order?:string;page?:string}>}){
 const actor=await requireProfile(),client=await createClient(),params=await searchParams,admin=actor.role==='admin';
 const orderId=params.order&&uuid.test(params.order)?params.order:null;
 const page=Math.max(1,Number.parseInt(params.page??'1')||1);
 let content;
 if(orderId){
 const o=await client.from('quotes_read').select('id,order_number,production_status,confirmed_at').eq('id',orderId).single();if(o.error||!o.data.confirmed_at)throw Error('Pedido confirmado no disponible.');
 const r=await client.from('shipments').select('*').eq('order_id',orderId).maybeSingle();if(r.error)throw Error('No se pudo consultar el envío.');
 let finance:ShippingFinance|null=null;const expenses:{id:string;description:string;amount_crc:string}[]=[];
 if(admin&&r.data){const f=await client.from('shipment_finances_read').select('*').eq('shipment_id',r.data.id).maybeSingle();if(f.error)throw Error('No se pudo consultar el costo.');finance=f.data;
 for(let offset=0;;offset+=500){const e=await client.from('expenses_read').select('id,description,amount_crc').eq('order_id',orderId).eq('currency','CRC').eq('status','valid').order('id').range(offset,offset+499);if(e.error)throw Error('No se pudieron consultar gastos.');expenses.push(...e.data);if(e.data.length<500)break;}}
 content=<><Link className="text-link" href={`/pedidos/${orderId}`}>Volver al pedido {o.data.order_number}</Link><ShipmentPanel key={`${r.data?.id??orderId}-${r.data?.revision??0}`} order={o.data} shipment={r.data as Shipment|null} admin={admin} finance={finance} expenses={expenses}/></>;
 }else{
 const r=await client.from('shipments').select('*',{count:'exact'}).order('created_at',{ascending:false}).order('id').range((page-1)*25,page*25-1);if(r.error)throw Error('No se pudieron cargar los envíos.');
 content=<section className="panel"><h2>Envíos y retiros</h2><p>Para preparar una entrega abre un pedido confirmado desde <Link href="/pedidos">Pedidos</Link>.</p>{!r.data.length?<p className="message">Todavía no hay envíos en esta página.</p>:<div className="catalog-table-wrap"><table className="catalog-table"><thead><tr><th>Tipo</th><th>Estado</th><th>Destino</th><th>Acciones</th></tr></thead><tbody>{(r.data as Shipment[]).map(s=><tr key={s.id}><td data-label="Tipo">{deliveryTypes[s.delivery_type]}</td><td data-label="Estado">{shipmentStates[s.status]}</td><td data-label="Destino">{s.delivery_address??'Retiro'}</td><td><Link className="button secondary" href={`/envios?order=${s.order_id}`}>Abrir envío</Link></td></tr>)}</tbody></table></div>}<div className="order-actions">{page>1&&<Link className="button secondary" href={`/envios?page=${page-1}`}>Anterior</Link>}{page*25<(r.count??0)&&<Link className="button secondary" href={`/envios?page=${page+1}`}>Siguiente</Link>}</div></section>;
 }
 return <><div className="page-heading"><div><span className="eyebrow">HASTA SUS MANOS</span><h1>Envíos y entregas</h1><p>Organiza despacho, entrega personal y retiro conservando su historia.</p></div></div>{content}</>;
}
