"use server";
import {requireProfile} from '@/lib/auth';
import {createClient} from '@/lib/supabase/server';
import {revalidatePath} from 'next/cache';
import {uuid} from '@/features/catalog/schema';
import type {ShippingOperation} from './types';
export async function operateShipment(request:string,operation:ShippingOperation,target:string,revision:number|null,payload:Record<string,unknown>){
 await requireProfile();if(!uuid.test(request)||!uuid.test(target))return {error:'Identificador inválido.'};
 try{const {error}=await(await createClient()).rpc('shipment_operate',{request_id:request,operation,target,expected_revision:revision,payload});
 if(error)return {error:['22023','PT409','42501'].includes(error.code)?error.message:'Revisa tipo, dirección, transportista, fechas y costo. No se guardó el envío.',conflict:error.code==='PT409'};
 revalidatePath('/envios');revalidatePath('/pedidos','layout');return {success:true};
 }catch{return {error:'Acción no confirmada por falta de conexión. Recarga el estado antes de reintentar.'};}
}
