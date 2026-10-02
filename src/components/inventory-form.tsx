"use client";
import Link from 'next/link';
import {useEffect,useRef,useState,useTransition} from 'react';
import {useRouter} from 'next/navigation';
import {Plus,Save,Trash2} from 'lucide-react';
import {toast} from 'sonner';
import {inventoryRate,registerInventory,linkInventoryExpense} from '@/features/inventory/actions';
import {type InventoryMaterial,type InventoryLine,validateInventory} from '@/features/inventory/domain';
import {businessDate} from '@/features/orders/domain';

export function InventoryForm({id:initialId,materials}:{id:string;materials:InventoryMaterial[]}){
 const [id]=useState(initialId);
 const router=useRouter();const [pending,start]=useTransition();const [error,setError]=useState('');const ref=useRef<HTMLParagraphElement>(null);
 const [lines,setLines]=useState<InventoryLine[]>([{material_id:'',unit:'',quantity:'',amount:'',currency:'CRC'}]);
 const [date,setDate]=useState('');const [rateText,setRateText]=useState('');const [kind,setKind]=useState<'purchase'|'opening_balance'>('purchase');
 useEffect(()=>{if(error)ref.current?.focus();},[error]);
 function update(index:number,patch:Partial<InventoryLine>){setLines(rows=>rows.map((r,i)=>i===index?{...r,...patch}:r));}
 const usd=lines.some(l=>l.currency==='USD');
 return <form className="panel quote-form" aria-busy={pending} onSubmit={async event=>{
  event.preventDefault();setError('');const data=new FormData(event.currentTarget);const value=(key:string)=>String(data.get(key)??'');
  const payload={kind,effective_at:date?`${date}-06:00`:'',source_reference:value('source_reference'),reason:value('reason'),notes:value('notes'),expense_id:value('expense_id'),lines};
  try{validateInventory(payload);}catch(e){setError((e as Error).message);return;}
  const Swal=(await import('sweetalert2')).default;const result=await Swal.fire({title:'Registrar entrada de inventario',text:'Se conservarán cantidades y valoración histórica. Todas las líneas se registrarán juntas.',showCancelButton:true,confirmButtonText:'Registrar',cancelButtonText:'Revisar',confirmButtonColor:'#DD0675'});if(!result.isConfirmed)return;
  const revisions=Object.fromEntries(lines.map(l=>[l.material_id,materials.find(m=>m.id===l.material_id)?.revision??'0']));
  start(async()=>{try{const response=await registerInventory(id,payload,revisions);if(response.error){setError(response.error);return;}toast.success('Recepción registrada');router.replace(`/inventario/recepciones/${id}`);router.refresh();}catch{setError('Conexión interrumpida. Consulta la recepción antes de reintentar.');}});
 }}>
  {error&&<p className="message error" role="alert" tabIndex={-1} ref={ref}>{error}</p>}
  <fieldset disabled={pending} className="quote-fields">
   <label>Tipo<select value={kind} onChange={e=>setKind(e.target.value as typeof kind)}><option value="purchase">Compra / entrada</option><option value="opening_balance">Saldo inicial</option></select></label>
   <label>Fecha efectiva (Costa Rica)<input type="datetime-local" value={date} onChange={e=>setDate(e.target.value)}/><small>Vacía: hora actual. Históricos sin alterar movimientos anteriores.</small></label>
   <label>Procedencia / factura<input name="source_reference" required maxLength={300}/></label>
   <label>Motivo {kind==='opening_balance'?'obligatorio':'opcional'}<input name="reason" required={kind==='opening_balance'} maxLength={1000}/></label>
   <label className="quote-wide">Gasto existente (UUID opcional)<input name="expense_id" placeholder="Identificador del gasto"/><small>También puedes vincularlo después. Esta recepción no crea un gasto.</small></label>
   <label className="quote-wide">Notas<textarea name="notes" maxLength={3000}/></label>
  </fieldset>
  {lines.map((line,i)=><fieldset className="panel quote-fields" key={i} disabled={pending}>
   <legend>Material {i+1}</legend>
   <label className="quote-wide">Material<select required value={line.material_id} onChange={e=>{const m=materials.find(m=>m.id===e.target.value);update(i,{material_id:m?.id??'',unit:m?.unit??''});}}><option value="">Seleccionar material</option>{materials.filter(m=>m.is_active).map(m=><option value={m.id} key={m.id}>{m.code} · {m.name} ({m.unit}) — existencia {m.stock}</option>)}</select></label>
   <label>Cantidad en {line.unit||'unidad base'}<input required inputMode="decimal" value={line.quantity} onChange={e=>update(i,{quantity:e.target.value})} pattern="[0-9]+([.][0-9]{1,4})?" maxLength={100}/></label>
   <label>Importe total de esta línea<input required inputMode="decimal" value={line.amount} onChange={e=>update(i,{amount:e.target.value})} pattern="[0-9]+([.][0-9]{1,2})?" maxLength={100}/></label>
   <label>Moneda<select value={line.currency} onChange={e=>update(i,{currency:e.target.value as 'CRC'|'USD',historical_rate:'',rate_reason:'',rate_source:''})}><option value="CRC">Colones (CRC)</option><option value="USD">Dólares (USD)</option></select></label>
   {line.currency==='USD'&&date&&date.slice(0,10)<businessDate()&&<details className="quote-wide"><summary>Aportar tasa histórica solo si falta referencia</summary><div className="quote-fields"><label>Tasa histórica<input inputMode="decimal" value={line.historical_rate??''} onChange={e=>update(i,{historical_rate:e.target.value})}/></label><label>Procedencia inequívoca<input maxLength={300} value={line.rate_source??''} onChange={e=>update(i,{rate_source:e.target.value})}/></label><label>Motivo<input maxLength={1000} value={line.rate_reason??''} onChange={e=>update(i,{rate_reason:e.target.value})}/></label></div></details>}
   {lines.length>1&&<button type="button" className="button secondary" onClick={()=>setLines(rows=>rows.filter((_,j)=>j!==i))}><Trash2 size={18}/>Quitar línea sin guardar</button>}
  </fieldset>)}
  {usd&&<div className="message"><p>{rateText||'Consulta la referencia antes de registrar. El servidor valida y conserva la tasa aplicada.'}</p><button type="button" className="button secondary" disabled={pending} onClick={()=>start(async()=>{const r=await inventoryRate(date?date.slice(0,10):businessDate());setRateText(r.error??(r.rate?`${r.rate.fallback?'Advertencia: fuente sin referencia actual; se utiliza una tasa anterior. ':''}Venta ${r.rate.rate} · fecha real ${r.rate.date} · ${r.rate.source}`:'Sin referencia. Solo Administración puede aportar una tasa histórica motivada; no una tasa actual inventada.'));})}>Consultar referencia cambiaria</button></div>}
  <div className="form-actions"><button type="button" className="button secondary" disabled={pending||lines.length>=100} onClick={()=>setLines(rows=>[...rows,{material_id:'',unit:'',quantity:'',amount:'',currency:'CRC'}])}><Plus size={18}/>Otro material</button><button className="button primary" disabled={pending}><Save size={18}/>{pending?'Registrando…':'Registrar recepción'}</button></div>
  {error&&<div className="form-actions"><Link className="button secondary" href={`/inventario/recepciones/${id}`}>Consultar si se guardó</Link><button type="button" className="button secondary" onClick={()=>router.refresh()}>Recargar existencias y revisión</button></div>}
 </form>;
}
export function InventoryExpenseLink({id}:{id:string}){
 const [pending,start]=useTransition();const [error,setError]=useState('');const router=useRouter();const ref=useRef<HTMLParagraphElement>(null);
 useEffect(()=>{if(error)ref.current?.focus();},[error]);
 return <form className="panel" onSubmit={e=>{e.preventDefault();setError('');const expense=String(new FormData(e.currentTarget).get('expense')??'');start(async()=>{try{const result=await linkInventoryExpense(id,expense);if(result.error)setError(result.error);else{toast.success('Gasto vinculado');router.refresh();}}catch{setError('Conexión interrumpida. Consulta el vínculo antes de reintentar.');}});}}><label>Vincular gasto existente (UUID)<input name="expense" required disabled={pending}/></label><button className="button secondary" disabled={pending}>Vincular sin modificar el gasto</button>{error&&<p role="alert" className="message error" tabIndex={-1} ref={ref}>{error}</p>}</form>;
}
