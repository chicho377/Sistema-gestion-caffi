import Link from 'next/link';
import {requireProfile} from '@/lib/auth';
import {createClient} from '@/lib/supabase/server';
import {uuid} from '@/features/catalog/schema';
import {WorkPanel} from '@/components/work-timer';
import type {WorkRead} from '@/features/work/types';
export default async function TimePage({searchParams}:{searchParams:Promise<{order?:string;line?:string}>}){
 const actor=await requireProfile(),client=await createClient(),params=await searchParams,admin=actor.role==='admin';
 const orderId=params.order&&uuid.test(params.order)?params.order:null;
 const orders:{id:string;order_number:string|null;production_status:string}[]=[];
 for(let offset=0;;offset+=500){const r=await client.from('quotes_read').select('id,order_number,production_status').not('confirmed_at','is',null).order('id').range(offset,offset+499);if(r.error)throw Error('No se pudieron consultar los pedidos.');orders.push(...r.data);if(r.data.length<500)break;}
 const order=orders.find(o=>o.id===orderId)??null;
 const lines:{id:string;product_name_snapshot:string;is_active:boolean}[]=[];
 if(order)for(let offset=0;;offset+=500){const r=await client.from('quote_items_read').select('id,product_name_snapshot,is_active').eq('order_id',order.id).order('id').range(offset,offset+499);if(r.error)throw Error('No se pudieron consultar las líneas.');lines.push(...r.data);if(r.data.length<500)break;}
 const {data,error}=await client.rpc('work_read',{target_order:order?.id??null});if(error)throw Error('No se pudo cargar el control de horas.');
 const rates:Record<string,string>={},workers:{id:string;full_name:string;status:string}[]=[],open:{id:string;order_id:string;user_id:string}[]=[];
 if(admin){for(let offset=0;;offset+=500){const r=await client.from('profiles').select('id,full_name,status').order('id').range(offset,offset+499);if(r.error)throw Error('No se pudieron cargar trabajadores.');workers.push(...r.data);if(r.data.length<500)break;}
 for(const s of (data as WorkRead).sessions){const r=await client.from('work_session_rates_read').select('hourly_rate_applied').eq('work_session_id',s.id).single();if(r.error)throw Error('No se pudo consultar la tarifa histórica.');rates[s.id]=String(r.data.hourly_rate_applied);}
 for(let offset=0;;offset+=500){const r=await client.from('work_sessions').select('id,order_id,user_id').neq('status','finished').order('id').range(offset,offset+499);if(r.error)throw Error('No se pudieron consultar sesiones abiertas.');open.push(...r.data);if(r.data.length<500)break;}}
 return <><div className="page-heading"><div><span className="eyebrow">CADA PUNTADA CUENTA</span><h1>Control de horas</h1><p>El trabajo se conserva aunque cierres el navegador.</p></div></div>{order&&<Link className="text-link" href={`/pedidos/${order.id}`}>Volver al pedido</Link>}{admin&&open.length>0&&<section className="panel"><h2>Sesiones abiertas del equipo</h2><div className="order-actions">{open.map(s=><Link className="button secondary" key={s.id} href={`/tiempo?order=${s.order_id}`}>{workers.find(w=>w.id===s.user_id)?.full_name??'Trabajador'} · {orders.find(o=>o.id===s.order_id)?.order_number??'Pedido'}</Link>)}</div></section>}<WorkPanel key={order?.id??'own'} initial={data as WorkRead} order={order} orders={orders} lines={lines} userId={actor.id} admin={admin} workers={workers} rates={rates} initialLine={params.line}/></>;
}
