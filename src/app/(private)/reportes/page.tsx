import {redirect} from 'next/navigation';
import {requireProfile} from '@/lib/auth';
import {createClient} from '@/lib/supabase/server';
import {operational,request,reports,type Params,type Report} from '@/features/reports/model';
import {Filters,ProfitSummary,ReportActions,ReportRows,Values} from '@/components/reporting';
export default async function Reports({searchParams}:{searchParams:Promise<Params>}){
 const actor=await requireProfile(),p=await searchParams,admin=actor.role==='admin';if(!p.kind)p.kind=admin?'orders':'inventory';
 let args;try{args=request(p);}catch{return <><h1>Reportes</h1><p role="alert">Filtros inválidos. Revisa las fechas y la página.</p><Filters params={p} admin={admin}/></>;}
 if(!admin&&!operational.includes(args.kind))redirect('/dashboard?notice=forbidden');
 const client=await createClient(),{data,error}=await client.rpc('report_query',args);if(error)throw Error('No se pudo consultar el reporte.');const r=data as Report;
 let summary={};if(args.kind==='cash')summary={payments_crc:r.summary.payments_crc,manual_income_crc:r.summary.manual_income_crc,expenses_crc:r.summary.expenses_crc,movimiento_neto_crc:r.summary.movimiento_neto_crc};
 else if(args.kind==='hours')summary={segundos_periodo:r.summary.segundos_periodo,segundos_provisionales:r.summary.segundos_provisionales,...(admin?{costo_periodo_crc:r.summary.importe_crc}:{})};
 else if(admin&&['orders','payments','balances','inventory'].includes(args.kind))summary={importe_crc:r.summary.importe_crc};
 return <><div className="page-heading"><div><span className="eyebrow">INFORMACIÓN CON ORIGEN</span><h1>{reports[args.kind]}</h1><p>{r.from} — {r.to} · America/Costa_Rica</p></div></div><Filters params={p} admin={admin}/>{['inventory','operation','balances'].includes(args.kind)&&<p className="message">Situación actual / al momento de la consulta. No es un cierre histórico del rango.</p>}{args.kind==='payments'&&<p>Totales y saldos por pedido son actuales y no deben sumarse por cada pago. El total del reporte suma únicamente pagos válidos del rango.</p>}{args.kind==='hours'&&<p>Tiempo repartido dentro del rango. Estimación y desviación son de la línea completa, no se suman por trabajador/sesión. La tarifa sin configurar no altera sesiones históricas.</p>}{args.kind==='shipments'&&<p>Una fila por evento vigente del envío. El costo operativo no se suma por evento; el gasto vinculado conserva su procedencia.</p>}{args.kind==='profit'?<ProfitSummary data={r.summary}/>:<section className="panel"><h2>Totales del conjunto filtrado</h2><Values data={summary}/></section>}<ReportActions params={p} report={r}/><ReportRows report={r}/></>;
}
