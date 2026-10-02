import {devHarness} from './support/real-session.mjs';
import {writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
const h=await devHarness(),matrix=[],storage=[];let admin,member,inactive=false;
const tables=['orders','order_items','order_files','order_counters','payments','manual_income','expense_categories','expenses','expense_files'];
function rpcFor(table){const target=randomUUID();switch(table){
 case 'orders':case 'order_items':return ['save_quote',{target,expected_revision:0,payload:{}}];
 case 'payments':return ['register_payment',{target,expected_revision:1,payload:{}}];
 case 'manual_income':return ['register_manual_income',{target,payload:{}}];
 case 'expenses':return ['register_expense',{target,payload:{}}];
 case 'expense_categories':return ['save_expense_category',{target,expected_revision:0,payload:{}}];
 case 'order_files':return ['register_order_file',{actor:member.id,target,object_path:'invalid',caption_text:'',size_bytes:1}];
 case 'expense_files':return ['register_expense_file',{actor:member.id,target,expected_revision:1,object_path:'invalid',caption_text:'',size_bytes:1}];
 default:return null;
}}
try{
 admin=await h.login(process.env.SIGCA_TEST_ADMIN_EMAIL);member=await h.login(process.env.SIGCA_TEST_MEMBER_EMAIL);
 for(const [table,bucket,route] of [['product_images','catalog-images','catalog-image'],['order_files','order-references','order-file'],['expense_files','expense-receipts','expense-file']]){
  const record=(await admin.client.from(table).select('id,path').limit(1)).data?.[0];if(!record)throw Error('Falta evidencia '+table);
  const publicUrl=h.anon.storage.from(bucket).getPublicUrl(record.path).data.publicUrl;
  const response=await fetch(publicUrl,{cache:'no-store'});if(response.ok)throw Error('URL pública accesible '+bucket);
  const unknown=await member.context.request.get('http://localhost:3000/api/'+route+'/'+randomUUID());if(unknown.status()!==404)throw Error('Objeto no vinculado accesible '+bucket);
  storage.push({bucket,publicStatus:response.status,unknownStatus:unknown.status()});console.log('PASS Storage público y UUID desconocido '+bucket);
 }
 for(const role of ['Admin','Colaborador','Anónimo','Inactivo']){
  if(role==='Inactivo'){const r=await admin.client.from('profiles').update({status:'inactive'}).eq('id',member.id);if(r.error)throw Error('Inactivación rechazada');inactive=true;}
  const client=role==='Admin'?admin.client:role==='Anónimo'?h.anon:member.client;
  for(const table of tables){
   const column=table==='order_counters'?'year':'id',value=column==='year'?2026:randomUUID();
   const results=await Promise.all([client.from(table).select(column).limit(1),client.from(table).insert({[column]:value}),client.from(table).update({[column]:value}).eq(column,value).neq(column,value),client.from(table).delete().eq(column,value).neq(column,value)]);
   const readable=['Admin','Colaborador'].includes(role)&&table!=='order_counters'&&!(role==='Colaborador'&&table==='manual_income');
   if(readable?results[0].error:!results[0].error&&results[0].data.length)throw Error(role+' SELECT '+table);
   for(let i=1;i<4;i++)if(results[i].error?.code!=='42501')throw Error(role+' DML '+table+' '+i);
   const rpc=rpcFor(table);let result;
   if(rpc){result=await client.rpc(...rpc);const allowed=['Admin','Colaborador'].includes(role)&&!['order_files','expense_files'].includes(table)&&!(role==='Colaborador'&&['manual_income','expense_categories'].includes(table));
    if(!result.error||(!allowed&&result.error.code!=='42501')||(allowed&&![400,409].includes(result.status)))throw Error(role+' RPC '+table+' '+result.status);
   }
   matrix.push({table,role,SELECT:readable?'autorizado bajo RLS':'sin filas/acceso',INSERT:results[1].status,UPDATE:results[2].status,DELETE:results[3].status,RPC:rpc?{name:rpc[0],status:result.status,code:result.error.code}:'NO APLICA: contador interno sin RPC directa'});
   console.log('PASS '+role+' '+table+' SELECT/DML/RPC');
  }
 }
}finally{
 if(inactive){const r=await admin.client.from('profiles').update({status:'active'}).eq('id',member.id);if(r.error)throw Error('Restauración fallida');}
 await writeFile('test-results/phase3e-permissions-real.json',JSON.stringify({matrix,storage},null,2));await h.close();
}
