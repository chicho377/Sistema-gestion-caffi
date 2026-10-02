import {requireAdmin} from '@/lib/auth';
import {createClient} from '@/lib/supabase/server';
import {InventoryForm} from '@/components/inventory-form';
import type {InventoryMaterial} from '@/features/inventory/domain';
export default async function NewInventory(){
 await requireAdmin();const client=await createClient();const materials:InventoryMaterial[]=[];
 for(let from=0;;from+=500){const {data,error}=await client.from('inventory_stock_read').select('*').eq('is_active',true).order('id').range(from,from+499);if(error)return <p role="alert" className="message error">No se pudieron cargar los materiales. Recarga antes de registrar.</p>;materials.push(...data);if(data.length<500)break;}
 return <><h1>Compra o saldo inicial</h1><p className="muted">Cantidades en unidad base y valoración histórica. No genera un gasto automáticamente.</p>{materials.length?<InventoryForm id={crypto.randomUUID()} materials={materials}/>:<p className="message">Primero registra un material activo en el catálogo.</p>}</>;
}
