-- Auditoría 3D: todos los fixtures y el fallo inyectado se revierten.
begin;
insert into auth.users(id,email) values('98000000-0000-4000-8000-000000000001','audit3d-admin@example.test'),('98000000-0000-4000-8000-000000000002','audit3d-member@example.test');
update public.profiles set role='admin' where id='98000000-0000-4000-8000-000000000001';
create function pg_temp.audit3d_reject(statement text,expected text) returns void language plpgsql as $$begin begin execute statement;exception when others then if sqlstate<>expected then raise;end if;return;end;raise exception 'Operación indebida aceptada';end $$;
select set_config('request.jwt.claim.sub','98000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select public.save_expense_category('98000000-0000-4000-8000-000000000010',0,'{"name":"Auditoría final 3D","is_active":true}');
do $$declare p jsonb:='{"category_id":"98000000-0000-4000-8000-000000000010","amount":"0.01","currency":"USD","description":"Origen manual verificado","expense_date":"1801-01-01T12:00:00-06:00","historical_rate":"500.50000000000000001","rate_source":"BCCR via tipodecambio.paginasweb.cr","rate_reason":"Referencia transcrita manualmente para prueba"}';begin
 perform public.register_expense('98000000-0000-4000-8000-000000000020',p);
 if not exists(select 1 from public.expenses_read where id='98000000-0000-4000-8000-000000000020' and rate_origin='admin_historical' and rate_provided_by=auth.uid() and rate_provided_at is not null and rate_override_reason is not null and amount_crc='5.01') then raise exception 'Origen manual confundido con proveedor';end if;
 if not exists(select 1 from public.audit_log where entity_id='98000000-0000-4000-8000-000000000020' and user_id=auth.uid() and reason=p->>'rate_reason' and metadata->'after'->>'rate_provided_by'=auth.uid()::text) then raise exception 'Evidencia manual incompleta';end if;
 perform pg_temp.audit3d_reject(format('select public.register_expense(%L,%L)',gen_random_uuid(),p||'{"rate_origin":"provider"}'),'22023');
 perform pg_temp.audit3d_reject(format('select public.register_expense(%L,%L)',gen_random_uuid(),p||'{"rate_reason":""}'),'22023');
end $$;
select set_config('request.jwt.claim.sub','98000000-0000-4000-8000-000000000002',true);
select public.register_expense('98000000-0000-4000-8000-000000000021','{"category_id":"98000000-0000-4000-8000-000000000010","amount":"10.25","currency":"CRC","description":"Propio"}');
do $$declare k text;before_row jsonb;after_row jsonb;begin
 select to_jsonb(e) into before_row from public.expenses e where id='98000000-0000-4000-8000-000000000021';
 foreach k in array array['amount','currency','amount_crc','exchange_rate_applied','exchange_rate_date','exchange_rate_source','rate_origin','rate_provided_by','rate_provided_at','rate_override_reason','rate_is_fallback','category_id','expense_date','order_id','order_item_id','created_by','status','supplier','payment_method'] loop
  perform pg_temp.audit3d_reject(format('select public.edit_expense_notes(%L,1,%L)','98000000-0000-4000-8000-000000000021','{"description":"Ataque"}'::jsonb||jsonb_build_object(k,null)),'22023');
 end loop;
 select to_jsonb(e) into after_row from public.expenses e where id='98000000-0000-4000-8000-000000000021';
 if before_row is distinct from after_row then raise exception 'Mass assignment alteró datos';end if;
 if not exists(select 1 from public.expenses_read where id='98000000-0000-4000-8000-000000000021' and rate_origin='not_applicable' and amount_crc='10.25' and exchange_rate_applied is null) then raise exception 'CRC con evidencia falsa';end if;
 perform public.edit_expense_notes('98000000-0000-4000-8000-000000000021',1,'{"description":"Permitido","notes":"Solo notas"}');
end $$;
select set_config('request.jwt.claim.sub','98000000-0000-4000-8000-000000000001',true);
insert into public.clients(id,name) values('98000000-0000-4000-8000-000000000030','Cliente auditoría transaccional');
do $$declare day text:=(clock_timestamp() at time zone 'America/Costa_Rica')::date::text;p jsonb;before_expense jsonb;begin
 p:=jsonb_build_object('client_id','98000000-0000-4000-8000-000000000030','order_date',day,'requested_delivery_date',day,'discount_amount','0','items',jsonb_build_array(jsonb_build_object('id','98000000-0000-4000-8000-000000000032','product_name_snapshot','Línea de auditoría','quantity','1','unit_price','10','discount_amount','0','is_active',true)));
 perform public.save_quote('98000000-0000-4000-8000-000000000031',0,p);
 perform public.register_expense('98000000-0000-4000-8000-000000000033','{"category_id":"98000000-0000-4000-8000-000000000010","amount":"1","currency":"CRC","description":"Pedido sin línea","order_id":"98000000-0000-4000-8000-000000000031"}');
 perform public.register_expense('98000000-0000-4000-8000-000000000034','{"category_id":"98000000-0000-4000-8000-000000000010","amount":"1","currency":"CRC","description":"Línea histórica","order_id":"98000000-0000-4000-8000-000000000031","order_item_id":"98000000-0000-4000-8000-000000000032"}');
 select to_jsonb(e) into before_expense from public.expenses e where id='98000000-0000-4000-8000-000000000034';
 perform public.save_quote('98000000-0000-4000-8000-000000000031',1,jsonb_set(p,'{items,0,is_active}','false'));
 update public.clients set is_active=false where id='98000000-0000-4000-8000-000000000030';
 perform public.save_expense_category('98000000-0000-4000-8000-000000000010',1,'{"name":"Auditoría final 3D editada","is_active":false}');
 if (select to_jsonb(e) from public.expenses e where id='98000000-0000-4000-8000-000000000034') is distinct from before_expense then raise exception 'Cambios de padre alteran gasto';end if;
 if not exists(select 1 from public.audit_log where entity_type='expense_categories' and entity_id='98000000-0000-4000-8000-000000000010' and metadata->'before'->>'is_active'='true' and metadata->'after'->>'is_active'='false' and user_id=auth.uid()) then raise exception 'Auditoría categoría incompleta';end if;
end $$;
reset role;
insert into storage.objects(bucket_id,name) values('expense-receipts','expenses/98000000-0000-4000-8000-000000000021/98000000-0000-4000-8000-000000000040.webp'),('expense-receipts','expenses/98000000-0000-4000-8000-000000000021/98000000-0000-4000-8000-000000000041.webp');
select public.register_expense_file('98000000-0000-4000-8000-000000000002','98000000-0000-4000-8000-000000000021',2,'expenses/98000000-0000-4000-8000-000000000021/98000000-0000-4000-8000-000000000040.webp','Original conservado',100);
alter table public.audit_log add constraint audit3d_test_file_failure check(action<>'expense.file_registered') not valid;
do $$declare previous uuid;before_expense jsonb;before_file jsonb;begin
 select id,to_jsonb(f) into previous,before_file from public.expense_files f where expense_id='98000000-0000-4000-8000-000000000021';
 select to_jsonb(e) into before_expense from public.expenses e where id='98000000-0000-4000-8000-000000000021';
 perform pg_temp.audit3d_reject(format('select public.register_expense_file(%L,%L,3,%L,%L,100,%L)','98000000-0000-4000-8000-000000000002','98000000-0000-4000-8000-000000000021','expenses/98000000-0000-4000-8000-000000000021/98000000-0000-4000-8000-000000000041.webp','Reemplazo debe revertirse',previous),'23514');
 if (select to_jsonb(e) from public.expenses e where id='98000000-0000-4000-8000-000000000021') is distinct from before_expense or (select to_jsonb(f) from public.expense_files f where id=previous) is distinct from before_file or (select count(*) from public.expense_files where expense_id='98000000-0000-4000-8000-000000000021')<>1 then raise exception 'Asociación parcial tras fallo auditoría';end if;
end $$;
-- Reclasificación D-20: Admin, revisión y conservación integral.
reset role;
select set_config('request.jwt.claim.sub','98000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select public.save_expense_category('98000000-0000-4000-8000-000000000050',0,'{"name":"Destino reclasificación","is_active":true}');
do $$declare e public.expenses; after_row public.expenses; begin
 select * into e from public.expenses where id='98000000-0000-4000-8000-000000000020';
 perform pg_temp.audit3d_reject(format('select public.reclassify_expense(%L,%s,%L,%L)',e.id,e.revision,'98000000-0000-4000-8000-000000000050',''),'22023');
 perform pg_temp.audit3d_reject(format('select public.reclassify_expense(%L,%s,%L,%L)',e.id,e.revision,'98000000-0000-4000-8000-000000000050',repeat('x',1001)),'22023');
 perform pg_temp.audit3d_reject(format('select public.reclassify_expense(%L,%s,%L,%L)',e.id,e.revision,e.category_id,'Igual'),'22023');
 perform public.reclassify_expense(e.id,e.revision,'98000000-0000-4000-8000-000000000050','Clasificación corregida');
 select * into after_row from public.expenses where id=e.id;
 if (to_jsonb(e)-array['category_id','revision','updated_by','updated_at']) is distinct from (to_jsonb(after_row)-array['category_id','revision','updated_by','updated_at']) then raise exception 'Reclasificación alteró originales';end if;
 if not exists(select 1 from public.audit_log where action='expense.category_changed' and entity_id=e.id and user_id=auth.uid() and created_at is not null and reason='Clasificación corregida' and metadata->'before'->>'category_id'=e.category_id::text and metadata->'after'->>'category_id'=after_row.category_id::text) then raise exception 'Auditoría reclasificación incompleta';end if;
 perform pg_temp.audit3d_reject(format('select public.reclassify_expense(%L,%s,%L,%L)',e.id,e.revision,e.category_id,'Obsoleto'),'PT409');
 perform pg_temp.audit3d_reject(format('select public.reclassify_expense(%L,%s,%L,%L)',e.id,after_row.revision,e.category_id,'Inactiva'),'22023');
 perform pg_temp.audit3d_reject(format('update public.expenses set category_id=%L where id=%L',e.category_id,e.id),'42501');
 perform public.void_expense(e.id,after_row.revision,'Cierre prueba');
 perform pg_temp.audit3d_reject(format('select public.reclassify_expense(%L,%s,%L,%L)',e.id,after_row.revision+1,e.category_id,'Anulado'),'PT409');
end $$;
select set_config('request.jwt.claim.sub','98000000-0000-4000-8000-000000000002',true);
select pg_temp.audit3d_reject('select public.reclassify_expense(''98000000-0000-4000-8000-000000000021'',2,''98000000-0000-4000-8000-000000000050'',''No autorizado'')','42501');
reset role;
alter table public.audit_log add constraint audit3d_category_failure check(action<>'expense.category_changed') not valid;
select set_config('request.jwt.claim.sub','98000000-0000-4000-8000-000000000001',true);
set local role authenticated;
do $$declare previous jsonb;begin
 select to_jsonb(e) into previous from public.expenses e where id='98000000-0000-4000-8000-000000000021';
 perform pg_temp.audit3d_reject('select public.reclassify_expense(''98000000-0000-4000-8000-000000000021'',3,''98000000-0000-4000-8000-000000000050'',''Auditoría obligatoria'')','23514');
 if previous is distinct from (select to_jsonb(e) from public.expenses e where id='98000000-0000-4000-8000-000000000021') then raise exception 'Reclasificación parcial tras fallo de auditoría';end if;
end $$;
reset role;
update public.profiles set status='inactive' where id='98000000-0000-4000-8000-000000000001';
set local role authenticated;
select pg_temp.audit3d_reject('select public.reclassify_expense(''98000000-0000-4000-8000-000000000021'',3,''98000000-0000-4000-8000-000000000050'',''Admin inactivo'')','42501');
rollback;
select 'PASS auditoría 3D: origen no falseable, 19 campos rechazados, cambios de padre, auditoría y rollback de asociación' as result;
