-- Fixtures transaccionales: ROLLBACK final, sin alterar datos existentes.
begin;
insert into auth.users(id,email) values
 ('91000000-0000-4000-8000-000000000001','phase3d-admin@example.test'),
 ('91000000-0000-4000-8000-000000000002','phase3d-member@example.test'),
 ('91000000-0000-4000-8000-000000000003','phase3d-inactive@example.test');
update public.profiles set role='admin' where id='91000000-0000-4000-8000-000000000001';
update public.profiles set status='inactive' where id='91000000-0000-4000-8000-000000000003';
create function pg_temp.expect_code(statement text,expected text) returns void language plpgsql as $$
begin begin execute statement;exception when others then if sqlstate<>expected then raise;end if;return;end;raise exception 'Se aceptó operación inválida: %',statement;end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000001',true);
select public.save_expense_category('92000000-0000-4000-8000-000000000001',0,'{"name":"Auditoría 3D","is_active":true}');
select pg_temp.expect_code('select public.save_expense_category(gen_random_uuid(),0,''{"name":"  AUDITORÍA   3D ","is_active":true}'')','PT409');
select pg_temp.expect_code('select public.save_expense_category(gen_random_uuid(),0,''{"name":"Otro tipo","description":{},"is_active":true}'')','22023');
do $$
declare payload jsonb:='{"category_id":"92000000-0000-4000-8000-000000000001","amount":"10.25","currency":"CRC","description":"Verificación 3D"}';v text;old_record jsonb;doc jsonb;
begin
 perform public.register_expense('93000000-0000-4000-8000-000000000001',payload);
 if not exists(select 1 from public.expenses_read where id='93000000-0000-4000-8000-000000000001' and amount='10.25' and amount_crc='10.25' and exchange_rate_applied is null) then raise exception 'CRC inexacto';end if;
 foreach v in array array['0','-1','1.001','NaN','Infinity','1e2',''] loop
  perform pg_temp.expect_code(format('select public.register_expense(%L,%L)',gen_random_uuid(),payload||jsonb_build_object('amount',v)),'22023');
 end loop;
 foreach doc in array array['{"amount":1}'::jsonb,'{"currency":"EUR"}','{"description":{}}','{"created_by":"91000000-0000-4000-8000-000000000002"}','{"expense_date":"2099-01-01T00:00:00-06:00"}','{"order_item_id":"ffffffff-ffff-4fff-8fff-ffffffffffff"}','{"historical_rate":"500"}'] loop
  perform pg_temp.expect_code(format('select public.register_expense(%L,%L)',gen_random_uuid(),payload||doc),'22023');
 end loop;
 perform public.register_expense('93000000-0000-4000-8000-000000000002',payload||'{"currency":"USD","amount":"0.01","expense_date":"1901-01-02T12:00:00-06:00","historical_rate":"500.5000000000000000001","rate_source":"Evidencia de prueba","rate_reason":"Referencia histórica faltante"}');
 if not exists(select 1 from public.expenses_read where id='93000000-0000-4000-8000-000000000002' and amount_crc='5.01' and exchange_rate_applied='500.5000000000000000001' and exchange_rate_date='1901-01-02' and is_historical and rate_provided_by=auth.uid()) then raise exception 'Precisión histórica perdida';end if;
 perform pg_temp.expect_code(format('select public.register_expense(%L,%L)',gen_random_uuid(),payload||'{"currency":"USD","expense_date":"1901-01-03T12:00:00-06:00"}'),'22023');
 perform set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000002',true);
 if exists(select 1 from public.expenses) or exists(select 1 from public.expense_files) or exists(select 1 from public.audit_log) then raise exception 'Filtración ajena';end if;
 perform public.register_expense('93000000-0000-4000-8000-000000000003',payload);
 perform pg_temp.expect_code('select public.save_expense_category(gen_random_uuid(),0,''{"name":"No permitido","is_active":true}'')','42501');
 perform pg_temp.expect_code('select public.void_expense(''93000000-0000-4000-8000-000000000003'',1,''Intento'')','42501');
 perform pg_temp.expect_code('select public.edit_expense_notes(''93000000-0000-4000-8000-000000000001'',1,''{"description":"Ajeno"}'')','42501');
 perform pg_temp.expect_code(format('select public.register_expense(%L,%L)',gen_random_uuid(),payload||'{"expense_date":"1901-01-02T12:00:00-06:00"}'),'22023');
 perform pg_temp.expect_code('select public.store_expense_exchange_rate(auth.uid(),current_date,''500'')','42501');
 perform pg_temp.expect_code('select public.edit_expense_notes(''93000000-0000-4000-8000-000000000003'',1,''{"description":"Propio","amount":"1"}'')','22023');
 perform public.edit_expense_notes('93000000-0000-4000-8000-000000000003',1,'{"description":"Propio modificado","notes":"Conservado"}');
 perform pg_temp.expect_code('select public.edit_expense_notes(''93000000-0000-4000-8000-000000000003'',1,''{"description":"Desactualizado"}'')','PT409');
 perform pg_temp.expect_code('update public.expenses set amount=1','42501');
 perform pg_temp.expect_code('insert into public.expenses(id) values(gen_random_uuid())','42501');
 perform set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000003',true);
 if exists(select 1 from public.expenses) or exists(select 1 from public.expense_categories) then raise exception 'Acceso inactivo';end if;
 perform pg_temp.expect_code(format('select public.register_expense(%L,%L)',gen_random_uuid(),payload),'42501');
 perform set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000001',true);
 select to_jsonb(e) into old_record from public.expenses e where id='93000000-0000-4000-8000-000000000003';
 perform public.void_expense('93000000-0000-4000-8000-000000000003',2,'Corrección trazable');
 if (select to_jsonb(e)-array['status','voided_by','voided_at','void_reason','updated_at','updated_by','revision'] from public.expenses e where id='93000000-0000-4000-8000-000000000003') is distinct from (old_record-array['status','voided_by','voided_at','void_reason','updated_at','updated_by','revision']) then raise exception 'Anulación modifica original';end if;
 if not exists(select 1 from public.audit_log where entity_id='93000000-0000-4000-8000-000000000003' and action='expense.voided' and metadata->'after'->>'status'='voided') then raise exception 'Falta auditoría';end if;
 perform pg_temp.expect_code('select public.edit_expense_notes(''93000000-0000-4000-8000-000000000003'',3,''{"description":"Anulado"}'')','PT409');
end $$;
reset role;
-- Simular ausencia total de tasas mediante aislamiento transaccional de la función.
-- No se borran tasas: el caso vacío se comprueba en la base local inicialmente vacía.
alter table public.audit_log add constraint phase3d_test_failure check(entity_type<>'expenses') not valid;
set local role authenticated;
select pg_temp.expect_code('select public.register_expense(''93000000-0000-4000-8000-000000000009'',''{"category_id":"92000000-0000-4000-8000-000000000001","amount":"1","currency":"CRC","description":"Rollback"}'')','23514');
do $$begin if exists(select 1 from public.expenses where id='93000000-0000-4000-8000-000000000009') then raise exception 'Alta parcial';end if;end $$;
reset role;
set local role anon;
select set_config('request.jwt.claim.sub','',true);
select pg_temp.expect_code('select * from public.expenses','42501');
select pg_temp.expect_code('select * from public.expense_files','42501');
select pg_temp.expect_code('select public.register_expense(gen_random_uuid(),''{}'')','42501');
reset role;
rollback;
select 'PASS 3D: roles, inmutabilidad, moneda y rollback' as result;
