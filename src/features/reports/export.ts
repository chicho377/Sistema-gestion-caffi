import 'server-only';
import writeExcelFile from 'write-excel-file/node';
import PDFDocument from 'pdfkit';
import {columns,display,label,reports,exportSummary,type Report} from './model';
export async function exportReport(r:Report,format:'pdf'|'xlsx',filters:string){
 const title=reports[r.kind],generated=new Intl.DateTimeFormat('es-CR',{timeZone:'America/Costa_Rica',dateStyle:'short',timeStyle:'medium'}).format(new Date(r.generated_at));
 const header=[title,`${r.from} — ${r.to}`,`Generado ${generated} · America/Costa_Rica`,'Moneda: CRC; original USD identificado cuando corresponda',`Filtros: ${filters}`];
 const keys=columns(r),summary=exportSummary(r);
 if(format==='xlsx'){
  const data=[...header.map(v=>[v]),[],keys.map(label),...r.rows.map(row=>keys.map(k=>display(row[k])))];
  const sheets=[{sheet:'Reporte',data},{sheet:'Totales',data:[['Indicador','Valor'],...summary.map(([k,v])=>[label(k),display(v)])]}];
  if(r.kind==='profit')for(const field of ['lines','sources']){const rows:Record<string,unknown>[]=r.rows.flatMap(r=>((r[field]??[]) as Record<string,unknown>[]).map(l=>({pedido:r.number??r.order_id,...l})));const fields=[...new Set(rows.flatMap(Object.keys))];sheets.push({sheet:field==='lines'?'Detalle por línea':'Fuentes',data:[fields.map(label),...rows.map(r=>fields.map(k=>display(r[k])))]});}
  return Buffer.from(await writeExcelFile(sheets).toBuffer());
 }
 const doc=new PDFDocument({size:'A4',margin:40,info:{Title:title,Author:'SIGCA'}}),chunks:Buffer[]=[];
 const done=new Promise<Buffer>((resolve,reject)=>{doc.on('data',(b:Buffer)=>chunks.push(b));doc.on('end',()=>resolve(Buffer.concat(chunks)));doc.on('error',reject);});
 doc.fontSize(18).fillColor('#A70459').text(title);doc.fillColor('#342B31').fontSize(9);for(const line of header.slice(1))doc.text(line);doc.moveDown();
 doc.fontSize(13).text('Totales del conjunto filtrado');doc.fontSize(9);for(const [k,v] of summary)doc.text(`${label(k)}: ${display(v)}`);
 for(const row of r.rows){if(doc.y>680)doc.addPage();doc.moveDown().fontSize(11).fillColor('#A70459').text(String(row.pedido??row.number??row.id??'Registro'));doc.fillColor('#342B31').fontSize(9);for(const k of keys)doc.text(`${label(k)}: ${display(row[k])}`);if(r.kind==='profit'){doc.text('Detalle por línea:');for(const line of (row.lines??[]) as Record<string,unknown>[]){doc.moveDown();for(const [k,v] of Object.entries(line).filter(([k])=>k!=='id'))doc.text(`${label(k)}: ${display(v)}`);}}}
 doc.end();return done;
}
