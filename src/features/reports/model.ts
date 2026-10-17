export const reports = {orders:'Ventas y pedidos',payments:'Pagos del período',balances:'Saldos actuales por pedido',cash:'Ingresos y gastos',profit:'Rentabilidad',inventory:'Inventario actual',movements:'Movimientos de inventario',hours:'Productividad y horas',shipments:'Envíos',audit:'Auditoría',operation:'Pedidos activos'};
export type Kind=keyof typeof reports;
export const operational:Kind[]=['inventory','movements','hours','shipments','operation'];
export type Row=Record<string,unknown>;
export type Report={kind:Kind;from:string;to:string;generated_at:string;count:number;page:number;page_size:number;rows:Row[];summary:Row};
export type Params=Record<string,string|undefined>;
const date=(s:string)=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(s)||!Number.isFinite(Date.parse(s))||new Date(s).toISOString().slice(0,10)!==s)throw Error('Fecha inválida.');return s;};
export function period(p:Params,now=new Date()){
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Costa_Rica',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
 const d=new Date(today+'T12:00:00Z'),y=d.getUTCFullYear(),m=d.getUTCMonth();
 const iso=(v:Date)=>v.toISOString().slice(0,10);let from=today,to=today;
 switch(p.period??'month'){
 case 'today':break;
 case 'week':d.setUTCDate(d.getUTCDate()-(d.getUTCDay()+6)%7);from=iso(d);d.setUTCDate(d.getUTCDate()+6);to=iso(d);break;
 case 'month':from=iso(new Date(Date.UTC(y,m,1)));to=iso(new Date(Date.UTC(y,m+1,0)));break;
 case 'previous':from=iso(new Date(Date.UTC(y,m-1,1)));to=iso(new Date(Date.UTC(y,m,0)));break;
 case 'year':from=`${y}-01-01`;to=`${y}-12-31`;break;
 case 'custom':from=date(p.from??'');to=date(p.to??'');break;
 default:throw Error('Período inválido.');
 }if(from>to)throw Error('La fecha inicial debe preceder la final.');return {from,to};
}
export function request(p:Params){const range=period(p),kind=p.kind??'orders';if(!(kind in reports))throw Error('Reporte inválido.');const page=Number(p.page??1);if(!Number.isInteger(page)||page<1||page>1000000)throw Error('Página inválida.');const filters=Object.fromEntries(['q','state','source','record','entity','user'].filter(k=>p[k]).map(k=>[k,p[k]]));if((p.q?.length??0)>200)throw Error('Búsqueda demasiado larga.');return {kind:kind as Kind,first_day:range.from,last_day:range.to,filters,page_no:page,page_size:25};}
export const label=(key:string)=>({worked_seconds:'Segundos trabajados',profit_per_hour:'Ganancia por hora CRC',commercial_total:'Total comercial CRC',production_status:'Estado productivo',unallocated_order_cost:'Costo no asignado CRC',shared_cost:'Costo compartido CRC',estimated_minutes:'Estimación histórica en minutos',estimate_captured_at:'Estimación capturada',name:'Nombre',active:'Activo',global_profit:'Utilidad global CRC',global_margin:'Margen global %',segundos_periodo:'Segundos trabajados en el período',importe_crc:'Importe CRC',movimiento_neto_crc:'Movimiento financiero neto CRC',payments_crc:'Pagos recibidos CRC',manual_income_crc:'Ingresos manuales CRC',expenses_crc:'Gastos CRC',revenue:'Ingreso comercial CRC',profit:'Utilidad CRC',margin_percent:'Margen %',material_cost:'Materiales CRC',labor_cost:'Mano de obra CRC',expense_cost:'Gastos CRC',total_cost:'Costo total CRC',number:'Pedido',client:'Cliente',state:'Clasificación',complete:'Información completa',warnings:'Causas',lines:'Detalle por línea',sources:'Fuentes históricas'} as Record<string,string>)[key]??key.replaceAll('_',' ');
export function display(v:unknown):string {if(v===null||v===undefined)return 'No disponible';if(typeof v==='boolean')return v?'Sí':'No';if(typeof v==='object')return JSON.stringify(v,null,2);return String(v);}
export function columns(r:Report){if(r.kind==='profit')return ['number','client','production_status','state','revenue','material_cost','labor_cost','expense_cost','total_cost','profit','margin_percent','complete','warnings'];return [...new Set(r.rows.flatMap(row=>Object.keys(row)))].filter(k=>!['id','order_id','lines','sources'].includes(k));}
export function exportSummary(r:Report){const keys=r.kind==='profit'?['estado_costos','global_profit','global_margin','pedidos_completos','pedidos_incompletos','ingreso_completo_crc','costo_completo_crc','utilidad_completos_crc','margen_completos','ingreso_incompleto_crc','materiales_crc','mano_obra_crc','otros_gastos_crc','causas']:r.kind==='cash'?['payments_crc','manual_income_crc','expenses_crc','movimiento_neto_crc']:r.kind==='hours'?['segundos_periodo','segundos_provisionales','importe_crc']:['orders','payments','balances','inventory'].includes(r.kind)?['importe_crc']:[];return Object.entries(r.summary).filter(([k])=>['registros','estados',...keys].includes(k));}
