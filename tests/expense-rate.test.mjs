import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseExpenseRate} from '../src/features/expenses/domain.ts';
import {readFile} from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';
test('tasa: lexema completo, fecha real, entradas inválidas sin asumir tasa',()=>{
 const day='2026-09-30';
 assert.equal(parseExpenseRate('{"venta":500.500000000000000000001,"fecha":"30/09/2026"}',day).rate,'500.500000000000000000001');
 for(const raw of ['{}','null','{"venta":0,"fecha":"30/09/2026"}','{"venta":-1,"fecha":"30/09/2026"}','{"venta":500,"fecha":"29/09/2026"}','{"venta":"500","fecha":"30/09/2026"}','{"venta":5e2,"fecha":"30/09/2026"}','{"venta":500,"venta":501,"fecha":"30/09/2026"}','{"nested":{"venta":100},"venta":5e2,"fecha":"30/09/2026"}'])assert.throws(()=>parseExpenseRate(raw,day));
});
test('resolver USD: caída o respuesta inválida conserva fallback; sin referencia bloquea; histórico no consulta proveedor',async()=>{
 const source=stripTypeScriptTypes((await readFile('src/features/expenses/rates.ts','utf8')).replace(/^import .*;\r?\n/gm,'').replace('export async function','async function'));
 const today='2026-09-30',fallback={rate:'500.50000000000000001',date:'2026-09-29',source:'BCCR via tipodecambio.paginasweb.cr',fallback:true};
 let stored=fallback,calls=0,writes=0,role='collaborator',answer;
 const resolve=new Function('requireProfile','businessDate','createClient','createAdminClient','parseExpenseRate','fetch',source+';return resolveExpenseRate;')(
  async()=>({id:'actor',role}),()=>today,
  async()=>({rpc:async()=>({data:stored,error:null})}),
  ()=>({rpc:async(_name,args)=>{writes++;stored={rate:args.sell,date:args.source_date,source:fallback.source,fallback:false};return {error:null};}}),
  parseExpenseRate,async()=>{calls++;if(answer instanceof Error)throw answer;return {ok:true,text:async()=>answer};}
 );
 for(const unavailable of [new Error('Network unavailable'),'{}','{"venta":500,"fecha":"29/09/2026"}']){answer=unavailable;assert.deepEqual(await resolve(today),fallback);assert.equal(writes,0);}
 stored=null;answer=new Error('Unavailable');assert.equal(await resolve(today),null);
 await assert.rejects(()=>resolve('2026-09-29'),/Fecha no autorizada/);
 role='admin';const before=calls;assert.equal(await resolve('2026-09-28'),null);assert.equal(calls,before);
 answer='{"venta":500.1234567890123456789,"fecha":"30/09/2026"}';assert.equal((await resolve(today)).rate,'500.1234567890123456789');assert.equal(writes,1);
 const after=calls;await resolve(today);assert.equal(calls,after,'Referencia vigente evita consulta innecesaria');
});
