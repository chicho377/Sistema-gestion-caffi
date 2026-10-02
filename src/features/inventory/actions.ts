"use server";
import {revalidatePath} from 'next/cache';
import {requireAdmin} from '@/lib/auth';
import {createClient} from '@/lib/supabase/server';
import {uuid} from '@/features/catalog/schema';
import {businessDate} from '@/features/orders/domain';
import {resolveExpenseRate} from '@/features/expenses/rates';
import {validateInventory,type InventoryPayload} from './domain';

export async function inventoryRate(day:string){await requireAdmin();try{return {rate:await resolveExpenseRate(day)};}catch{return {error:'No se pudo consultar la referencia cambiaria.'};}}
export async function registerInventory(id:string,payload:InventoryPayload,revisions:Record<string,string>){
 await requireAdmin();
 try{if(!uuid.test(id))throw Error('Recepción inválida.');validateInventory(payload);
  if(payload.expense_id&&!uuid.test(payload.expense_id))throw Error('El identificador de gasto debe ser un UUID válido.');
  if(payload.lines.some(l=>l.currency==='USD'))await resolveExpenseRate(businessDate(payload.effective_at?new Date(payload.effective_at):new Date()));
 }catch(e){return {error:e instanceof Error?e.message:'Datos inválidos.'};}
 try{const {error}=await(await createClient()).rpc('register_inventory_receipt',{target:id,payload,expected_revisions:revisions});
  if(error)return {error:['22023','PT409','42501'].includes(error.code)?error.message:'No se pudo registrar. Revisa los datos.',conflict:error.code==='PT409'};
  revalidatePath('/inventario','layout');revalidatePath('/materiales','layout');return {success:true};
 }catch{return {error:'Conexión interrumpida. Conservamos tus datos: consulta esta recepción antes de reintentar.'};}
}
export async function linkInventoryExpense(id:string,expense:string){
 await requireAdmin();if(!uuid.test(id)||!uuid.test(expense))return {error:'Identificadores inválidos.'};
 try{const {error}=await(await createClient()).rpc('link_inventory_expense',{target:id,expense});if(error)return {error:['22023','PT409','42501'].includes(error.code)?error.message:'No se pudo vincular el gasto.'};revalidatePath(`/inventario/recepciones/${id}`);return {success:true};}catch{return {error:'Sin conexión. Consulta el vínculo antes de reintentar.'};}
}
