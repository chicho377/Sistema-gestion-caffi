import {test} from 'node:test';
import assert from 'node:assert/strict';
import {period,request} from '../src/features/reports/model.ts';
test('6: períodos Costa Rica, lunes, año y fechas inválidas',()=>{
 const now=new Date('2026-03-01T05:59:59Z');
 assert.deepEqual(period({period:'today'},now),{from:'2026-02-28',to:'2026-02-28'});
 assert.deepEqual(period({period:'month'},now),{from:'2026-02-01',to:'2026-02-28'});
 assert.deepEqual(period({period:'previous'},now),{from:'2026-01-01',to:'2026-01-31'});
 assert.deepEqual(period({period:'week'},now),{from:'2026-02-23',to:'2026-03-01'});
 assert.deepEqual(period({period:'year'},now),{from:'2026-01-01',to:'2026-12-31'});
 assert.deepEqual(period({period:'custom',from:'2024-02-29',to:'2024-03-01'},now),{from:'2024-02-29',to:'2024-03-01'});
 assert.throws(()=>period({period:'custom',from:'2026-02-29',to:'2026-03-01'}));
 assert.throws(()=>period({period:'custom',from:'2026-03-01',to:'2026-02-01'}));
 assert.throws(()=>request({kind:'orders',page:'-1'}));
});
