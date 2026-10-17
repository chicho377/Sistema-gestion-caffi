import {getActiveProfile} from '@/lib/auth';
import {createClient} from '@/lib/supabase/server';
import {exportReport} from '@/features/reports/export';
import {operational,request,type Report} from '@/features/reports/model';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(req:Request){
 const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
 const actor=await getActiveProfile();if(!actor)return Response.json({error:'Sesión no disponible'},{status:401,headers});
 const params=Object.fromEntries(new URL(req.url).searchParams),format=params.format;if(format!=='pdf'&&format!=='xlsx')return Response.json({error:'Formato inválido'},{status:400,headers});
 let args;try{args=request(params);}catch{return Response.json({error:'Filtros inválidos'},{status:400,headers});}
 if(actor.role!=='admin'&&!operational.includes(args.kind))return Response.json({error:'Acceso denegado'},{status:403,headers});
 const client=await createClient(),{data,error}=await client.rpc('report_query',{...args,page_no:1,page_size:5000});
 if(error)return Response.json({error:'No se pudo consultar el reporte'},{status:error.code==='42501'?403:400,headers});
 const report=data as Report;if(report.count>5000)return Response.json({error:'El reporte excede 5000 registros. Acota el rango o los filtros; no se ha generado un archivo parcial.'},{status:422,headers});
 // Verify again after reading, immediately before producing a downloadable document.
 const current=await getActiveProfile();if(!current||current.id!==actor.id||current.role!==actor.role)return Response.json({error:'Acceso actualizado; vuelve a iniciar la consulta'},{status:403,headers});
 const file=await exportReport(report,format,JSON.stringify(args.filters));
 return new Response(new Uint8Array(file),{headers:{...headers,'Content-Type':format==='pdf'?'application/pdf':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Content-Disposition':`attachment; filename="sigca-${args.kind}-${report.from}.${format}"`}});
}
