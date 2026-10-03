"use server";
import {revalidatePath} from 'next/cache';
import {requireProfile} from '@/lib/auth';
import {createClient} from '@/lib/supabase/server';
import {uuid} from '@/features/catalog/schema';
import {resolveExpenseRate} from '@/features/expenses/rates';
import {businessDate} from '@/features/orders/domain';

export async function operateInventory(target:string,operation:string,payload:Record<string,string>,revisions:Record<string,string>,orders:Record<string,number>){
 const actor=await requireProfile();
 if(!uuid.test(target)||!['consumption','return','adjustment_positive','adjustment_negative','entry_reversal','receipt_reversal','quantity_correction','attribution_correction'].includes(operation))return {error:'Operación inválida.'};
 if(actor.role!=='admin'&&!['consumption','return'].includes(operation))return {error:'Solo Administración puede realizar esta operación.'};
 for(const field of ['quantity','replacement_quantity'])if(payload[field]&&(!/^\d+(\.\d{1,4})?$/.test(payload[field])||!/[1-9]/.test(payload[field])||payload[field].length>100))return {error:'Cantidad positiva con máximo cuatro decimales requerida.'};
 if(operation!=='consumption'&&(!payload.reason?.trim()||payload.reason.trim().length>1000))return {error:'Indica un motivo de 1 a 1000 caracteres.'};
 try{
  if(operation==='adjustment_positive'&&payload.currency==='USD'){
   if(actor.role!=='admin')return {error:'Acceso no autorizado.'};
   await resolveExpenseRate(businessDate(payload.effective_at?new Date(payload.effective_at):new Date()));
  }
  const {error}=await(await createClient()).rpc('inventory_operation',{target,operation,payload,expected_revisions:revisions,expected_orders:orders});
  if(error)return {error:['22023','PT409','42501'].includes(error.code)?error.message:'No se pudo registrar. Verifica los datos e inténtalo nuevamente.',conflict:error.code==='PT409'};
  revalidatePath('/inventario','layout');revalidatePath('/pedidos','layout');return {success:true};
 }catch{return {error:'Conexión interrumpida. Consulta el historial antes de reintentar con la misma referencia.'};}
}
