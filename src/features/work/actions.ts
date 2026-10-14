"use server";
import {requireProfile} from '@/lib/auth';
import {createClient} from '@/lib/supabase/server';
import {revalidatePath} from 'next/cache';
import {uuid} from '@/features/catalog/schema';
import type {WorkRead,WorkOperation} from './types';
export async function readWork(order:string|null):Promise<{data?:WorkRead;error?:string}>{
 await requireProfile();if(order&&!uuid.test(order))return {error:'Pedido inválido.'};
 try{const client=await createClient();const {data,error}=await client.rpc('work_read',{target_order:order});if(error)return {error:'No se pudo consultar el tiempo. Reintenta al recuperar conexión.'};const result=data as WorkRead;
 if(!order&&result.sessions[0]){const r=await client.from('quotes_read').select('order_number').eq('id',result.sessions[0].order_id).single();if(r.error)return {error:'No se pudo identificar el pedido activo.'};result.active_order_number=r.data.order_number;}
 return {data:result};}catch{return {error:'Sin conexión. El cronómetro conserva su estado en servidor.'};}
}
export async function workLines(order:string){
 await requireProfile();if(!uuid.test(order))return {error:'Pedido inválido.'};
 const client=await createClient(),lines:{id:string;product_name_snapshot:string;is_active:boolean}[]=[];
 for(let offset=0;;offset+=500){const r=await client.from('quote_items_read').select('id,product_name_snapshot,is_active').eq('order_id',order).order('id').range(offset,offset+499);if(r.error)return {error:'No se pudieron cargar las líneas.'};lines.push(...r.data);if(r.data.length<500)break;}
 return {lines};
}
export async function operateWork(request:string,operation:WorkOperation,target:string,revision:number|null,payload:Record<string,unknown>){
 await requireProfile();if(!uuid.test(request)||!uuid.test(target))return {error:'Identificador inválido.'};
 try{const {error}=await(await createClient()).rpc('work_operate',{request_id:request,operation,target,expected_revision:revision,payload});
 if(error)return {error:['22023','PT409','42501'].includes(error.code)?error.message:'No se pudo guardar. Revisa los datos de la sesión.',conflict:error.code==='PT409'};
 revalidatePath('/tiempo');revalidatePath('/pedidos','layout');return {success:true};
 }catch{return {error:'Acción no confirmada por falta de conexión. Consulta el estado real antes de reintentar.'};}
}
