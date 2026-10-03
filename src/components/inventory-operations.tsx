"use client";
import {useState,useTransition} from 'react';
import {useRouter} from 'next/navigation';
import {Save,RefreshCw} from 'lucide-react';
import {toast} from 'sonner';
import {operateInventory} from '@/features/inventory/operations';
import {inventoryRate} from '@/features/inventory/actions';
import {businessDate} from '@/features/orders/domain';
import {movementLabels,type StockOption,type OrderOption,type ItemOption,type MovementOption} from '@/features/inventory/operation-types';

export function InventoryOperations({admin,materials,orders,items,movements,initialMaterial,initialOrder,initialRequestId}:{initialRequestId:string;admin:boolean;materials:StockOption[];orders:OrderOption[];items:ItemOption[];movements:MovementOption[];initialMaterial:string;initialOrder:string}){
 const router=useRouter();const [id,setId]=useState(initialRequestId);const [pending,start]=useTransition();const [error,setError]=useState('');
 const [kind,setKind]=useState('consumption'),[material,setMaterial]=useState(initialMaterial),[order,setOrder]=useState(initialOrder),[source,setSource]=useState(''),[destination,setDestination]=useState('');
 const [currency,setCurrency]=useState('CRC'),[date,setDate]=useState(''),[rate,setRate]=useState('');
 const current=materials.find(m=>m.id===material);const original=movements.find(m=>m.id===source);
 const linked=['return','entry_reversal','quantity_correction','attribution_correction'].includes(kind),attribution=kind==='attribution_correction',whole=kind==='receipt_reversal';
 const explicit=kind==='adjustment_positive'&&Number(current?.stock??0)===0;
 return <form className="panel quote-form" aria-busy={pending} onSubmit={async event=>{
  event.preventDefault();setError('');const data=new FormData(event.currentTarget);const text=(key:string)=>String(data.get(key)??'').trim();
  const payload:Record<string,string>={reason:text('reason')};if(!whole)payload.material_id=material;
  if(kind==='consumption'){payload.order_id=order;if(text('order_item_id'))payload.order_item_id=text('order_item_id');}
  if(linked){payload.source_movement_id=source;payload.attribution_revision=original?.attribution_revision??'0';}
  if(whole)payload.receipt_id=text('receipt_id');
  if(!['entry_reversal','receipt_reversal','attribution_correction'].includes(kind))payload.quantity=text('quantity');
  if(kind==='quantity_correction'&&text('replacement_quantity'))payload.replacement_quantity=text('replacement_quantity');
  if(attribution){payload.destination_order_id=destination;if(text('destination_order_item_id'))payload.destination_order_item_id=text('destination_order_item_id');}
  if(admin&&date)payload.effective_at=date+'-06:00';
  if(explicit){payload.amount=text('amount');payload.currency=currency;for(const field of ['historical_rate','rate_reason','rate_source'])if(text(field))payload[field]=text(field);}
  const Swal=(await import('sweetalert2')).default;const confirm=await Swal.fire({title:movementLabels[kind],text:'Se conservará el historial. La operación y su auditoría se registrarán juntas.',showCancelButton:true,confirmButtonText:'Confirmar',cancelButtonText:'Revisar',confirmButtonColor:'#DD0675'});if(!confirm.isConfirmed)return;
  start(async()=>{try{const r=await operateInventory(id,kind,payload,Object.fromEntries(materials.map(m=>[m.id,m.revision])),Object.fromEntries(orders.map(o=>[o.id,o.revision])));if(r.error){setError(r.error);return;}toast.success('Operación de inventario registrada');setId(crypto.randomUUID());setSource('');router.refresh();}catch{setError('Conexión interrumpida. Consulta el historial antes de reintentar.');}});
 }}>
  {error&&<p role="alert" className="message error">{error}</p>}
  <fieldset disabled={pending} className="quote-fields">
   <label>Operación<select aria-label="Operación" value={kind} onChange={e=>{setKind(e.target.value);setSource('');setError('');}}>{['consumption','return',...(admin?['adjustment_positive','adjustment_negative','entry_reversal','receipt_reversal','quantity_correction','attribution_correction']:[])].map(k=><option key={k} value={k}>{movementLabels[k]}</option>)}</select></label>
   {!whole&&<label>Material<select aria-label="Material" required value={material} onChange={e=>{setMaterial(e.target.value);setSource('');}}><option value="">Seleccionar</option>{materials.map(m=><option value={m.id} key={m.id}>{m.code} · {m.name} — {m.stock} {m.unit}{m.is_active?'':' (inactivo)'}</option>)}</select></label>}
   {current&&!whole&&<p className="message quote-wide">Disponible: {current.stock} {current.unit}. El servidor volverá a verificar las existencias al confirmar.</p>}
   {whole&&<label className="quote-wide">Referencia de recepción<input name="receipt_id" required placeholder="UUID de la recepción"/><small>Todas las líneas deben poder revertirse. Consulta su referencia en Recepciones.</small></label>}
   {kind==='consumption'&&<><label>Pedido<select aria-label="Pedido" required value={order} onChange={e=>setOrder(e.target.value)}><option value="">Seleccionar</option>{orders.filter(o=>['in_production','ready'].includes(o.production_status)).map(o=><option key={o.id} value={o.id}>{o.order_number??o.id}</option>)}</select></label><label>Línea opcional<select name="order_item_id" key={order}><option value="">Pedido completo</option>{items.filter(i=>i.order_id===order&&i.is_active).map(i=><option key={i.id} value={i.id}>{i.product_name_snapshot}</option>)}</select></label></>}
   {linked&&<label className="quote-wide">Movimiento original<select aria-label="Movimiento original" required value={source} onChange={e=>setSource(e.target.value)}><option value="">Seleccionar</option>{movements.filter(m=>m.material_id===material&&(kind==='entry_reversal'?['purchase_entry','opening_balance'].includes(m.movement_type):m.movement_type==='consumption')).map(m=><option value={m.id} key={m.id}>{new Date(m.effective_at).toLocaleString('es-CR',{timeZone:'America/Costa_Rica'})} · {movementLabels[m.movement_type]} {m.quantity}{m.returnable_quantity!==null?` · retornable ${m.returnable_quantity}`:''}</option>)}</select></label>}
   {!['entry_reversal','receipt_reversal','attribution_correction'].includes(kind)&&<label>Cantidad {current?.unit}<input name="quantity" required inputMode="decimal" pattern="[0-9]+([.][0-9]{1,4})?" maxLength={100}/></label>}
   {kind==='quantity_correction'&&<label>Nueva cantidad de consumo (opcional)<input name="replacement_quantity" inputMode="decimal" pattern="[0-9]+([.][0-9]{1,4})?" maxLength={100}/><small>Vacía: solo compensar la cantidad indicada.</small></label>}
   {attribution&&<><label>Pedido corregido<select aria-label="Pedido corregido" required value={destination} onChange={e=>setDestination(e.target.value)}><option value="">Seleccionar</option>{orders.filter(o=>o.order_number).map(o=><option key={o.id} value={o.id}>{o.order_number}</option>)}</select></label><label>Línea corregida<select name="destination_order_item_id" key={destination}><option value="">Pedido completo</option>{items.filter(i=>i.order_id===destination).map(i=><option value={i.id} key={i.id}>{i.product_name_snapshot}{i.is_active?'':' (histórica)'}</option>)}</select></label><p className="message quote-wide">Esta corrección conserva cantidades y valoración; solo cambia la atribución vigente.</p></>}
   {admin&&!attribution&&<label>Fecha efectiva Costa Rica (opcional)<input type="datetime-local" value={date} onChange={e=>setDate(e.target.value)}/><small>Vacía: hora actual. No puede preceder historia consolidada.</small></label>}
   <label className="quote-wide">Motivo {kind==='consumption'?'(opcional)':''}<textarea name="reason" required={kind!=='consumption'} maxLength={1000}/></label>
   {admin&&explicit&&<><label>Importe total explícito<input name="amount" required inputMode="decimal" pattern="[0-9]+([.][0-9]{1,2})?" maxLength={100}/></label><label>Moneda<select value={currency} onChange={e=>setCurrency(e.target.value)}><option value="CRC">CRC</option><option value="USD">USD</option></select></label>{currency==='USD'&&<><div className="message quote-wide"><p>{rate||'Consulta la referencia aplicable. No se inventará una tasa.'}</p><button type="button" className="button secondary" onClick={()=>start(async()=>{const r=await inventoryRate(date?date.slice(0,10):businessDate());setRate(r.error??(r.rate?`${r.rate.fallback?'Advertencia: tasa anterior por indisponibilidad de referencia actual. ':''}${r.rate.rate} · ${r.rate.date} · ${r.rate.source}`:'No existe referencia; histórico requiere aporte motivado.'));})}>Consultar referencia</button></div>{date&&date.slice(0,10)<businessDate()&&<details className="quote-wide"><summary>Referencia histórica faltante</summary><label>Tasa<input name="historical_rate" inputMode="decimal"/></label><label>Procedencia<input name="rate_source" maxLength={300}/></label><label>Motivo de tasa<input name="rate_reason" maxLength={1000}/></label></details>}</>}</>}
  </fieldset>
  <p className="muted">Referencia de esta solicitud: {id}. Ante una interrupción, consulta el historial antes de reintentar.</p>
  <div className="form-actions"><button className="button primary" disabled={pending}><Save size={18}/>{pending?'Registrando…':'Registrar operación'}</button><button type="button" className="button secondary" disabled={pending} onClick={()=>start(()=>router.refresh())}><RefreshCw size={18}/>Recargar existencias y revisiones</button></div>
 </form>;
}
