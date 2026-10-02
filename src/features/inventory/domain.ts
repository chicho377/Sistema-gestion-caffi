export type InventoryMaterial = {id:string;code:string;name:string;unit:string;stock:string;min_stock:string;revision:string;low_stock:boolean;is_active:boolean};
export type InventoryLine = {material_id:string;unit:string;quantity:string;amount:string;currency:'CRC'|'USD';historical_rate?:string;rate_reason?:string;rate_source?:string};
export type InventoryPayload = {kind:'purchase'|'opening_balance';effective_at:string;source_reference:string;reason:string;notes:string;expense_id:string;lines:InventoryLine[]};
export function positiveDecimal(value:string,scale:number){
 if(typeof value!=='string'||value.length>100||!new RegExp(`^\\d+(?:\\.\\d{1,${scale}})?$`).test(value)||!/[1-9]/.test(value))throw Error(`Usa un valor positivo con hasta ${scale} decimales.`);
 return value;
}
export function validateInventory(payload:InventoryPayload){
 if(!payload||!['purchase','opening_balance'].includes(payload.kind)||!payload.source_reference?.trim()||payload.source_reference.length>300||payload.notes.length>3000)throw Error('Revisa procedencia y notas.');
 if(payload.kind==='opening_balance'&&(!payload.reason.trim()||payload.reason.length>1000))throw Error('El saldo inicial requiere motivo de hasta 1000 caracteres.');
 if(!Array.isArray(payload.lines)||payload.lines.length<1||payload.lines.length>100)throw Error('Indica entre 1 y 100 líneas.');
 for(const line of payload.lines){if(!line.material_id||!line.unit||!['CRC','USD'].includes(line.currency))throw Error('Selecciona material y moneda.');positiveDecimal(line.quantity,4);positiveDecimal(line.amount,2);}
}
