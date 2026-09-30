-- Fixtures y fallo de auditoría aislados; todo termina en ROLLBACK, también en DEV.
begin;
insert into auth.users(id,email) values
 ('81000000-0000-4000-8000-000000000001','phase3c-admin@example.test'),
 ('81000000-0000-4000-8000-000000000002','phase3c-member@example.test'),
 ('81000000-0000-4000-8000-000000000003','phase3c-inactive@example.test');
update public.profiles set role='admin' where id in ('81000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000003');
update public.profiles set status='inactive' where id='81000000-0000-4000-8000-000000000003';
create function pg_temp.expect_code(statement text,expected text) returns void language plpgsql as $$
begin begin execute statement;exception when others then if sqlstate<>expected then raise;end if;return;end;raise exception 'Se aceptó operación inválida: %',statement;end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub','81000000-0000-4000-8000-000000000001',true);
do $$
declare record_id uuid:='82000000-0000-4000-8000-000000000001';original jsonb;v text;doc jsonb;actor text;
begin
 perform public.register_manual_income(record_id,'{"amount":"10.25","currency":"CRC","income_date":"2020-01-02T23:50:00-06:00","income_type":"cards","payment_method":"cash","description":"Prueba 3C"}');
 if not exists(select 1 from public.manual_income where manual_income.id=record_id and amount=10.25 and currency='CRC' and created_by=auth.uid() and is_historical and created_at>income_date and created_at>=transaction_timestamp()) then raise exception 'Alta histórica incompleta';end if;
 if not exists(select 1 from public.manual_income_read where manual_income_read.id=record_id and amount='10.25') then raise exception 'Transporte decimal inexacto';end if;
 select to_jsonb(m) into original from public.manual_income m where m.id=record_id;
 perform pg_temp.expect_code(format('select public.register_manual_income(%L,%L)',record_id,'{"amount":"1"}'),'PT409');
 foreach v in array array['0','-1','1.001','NaN','Infinity','-Infinity','1e2',''] loop
  perform pg_temp.expect_code(format('select public.register_manual_income(%L,%L)',gen_random_uuid(),jsonb_build_object('amount',v)),'22023');
 end loop;
 foreach doc in array array['{"amount":1}'::jsonb,'{"amount":"1","currency":"USD"}','{"amount":"1","income_date":"2099-01-01T00:00:00-06:00"}','{"amount":"1","income_date":"Infinity"}','{"amount":"1","income_type":"adelanto"}','{"amount":"1","payment_method":"invalid"}','{"amount":"1","created_by":"81000000-0000-4000-8000-000000000002"}','{"amount":"1","order_id":null}','{"amount":"1","payment_id":null}','{"amount":"1","created_at":"2000-01-01"}','{"amount":"1","description":{}}'] loop
  perform pg_temp.expect_code(format('select public.register_manual_income(%L,%L)',gen_random_uuid(),doc),'22023');
 end loop;
 perform pg_temp.expect_code(format('select public.void_manual_income(%L,%L)',record_id,' '),'22023');
 foreach actor in array array['81000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000002','81000000-0000-4000-8000-000000000003'] loop
  perform set_config('request.jwt.claim.sub',actor,true);
  perform pg_temp.expect_code('insert into public.manual_income(id) values(gen_random_uuid())','42501');
  perform pg_temp.expect_code(format('update public.manual_income set amount=1 where id=%L',record_id),'42501');
  perform pg_temp.expect_code('delete from public.manual_income where id=''ffffffff-ffff-4fff-8fff-ffffffffffff''','42501');
  if actor<>'81000000-0000-4000-8000-000000000001' then
   if exists(select 1 from public.manual_income) or exists(select 1 from public.manual_income_read) or exists(select 1 from public.audit_log) then raise exception 'Filtración de lectura';end if;
   perform pg_temp.expect_code(format('select public.register_manual_income(%L,%L)',gen_random_uuid(),'{"amount":"1"}'),'42501');
   perform pg_temp.expect_code(format('select public.void_manual_income(%L,%L)',record_id,'Intento'),'42501');
  end if;
 end loop;
 perform set_config('request.jwt.claim.sub','81000000-0000-4000-8000-000000000001',true);
 perform public.void_manual_income(record_id,'Corrección documentada');
 if (select to_jsonb(m)-array['status','voided_at','voided_by','void_reason','updated_at'] from public.manual_income m where m.id=record_id) <> (original-array['status','voided_at','voided_by','void_reason','updated_at']) then raise exception 'Original alterado';end if;
 if not exists(select 1 from public.manual_income where manual_income.id=record_id and status='voided' and voided_by=auth.uid() and void_reason='Corrección documentada' and voided_at>=created_at) then raise exception 'Evidencia incompleta';end if;
 if (select count(*) from public.audit_log where entity_type='manual_income' and entity_id=record_id)<>2 then raise exception 'Auditoría incompleta';end if;
 if not exists(select 1 from public.audit_log where entity_id=record_id and action='manual_income.voided' and metadata->'before'->>'amount'='10.25' and metadata->'after'->>'status'='voided' and reason='Corrección documentada') then raise exception 'Before/after incorrecto';end if;
 if (select coalesce(sum(amount),0) from public.manual_income where manual_income.id=record_id and status='valid')<>0 then raise exception 'Anulado en suma válida';end if;
 perform pg_temp.expect_code(format('select public.void_manual_income(%L,%L)',record_id,'Segunda'),'PT409');
end $$;
reset role;
-- Probar defensa del trigger incluso fuera de grants de aplicación.
select pg_temp.expect_code('update public.manual_income set description=''Cambio no autorizado'' where id=''82000000-0000-4000-8000-000000000001''','42501');
-- Error de escritura de auditoría causa rollback de alta y de anulación.
set local role authenticated;
select public.register_manual_income('82000000-0000-4000-8000-000000000002','{"amount":"2"}');
reset role;
alter table public.audit_log add constraint phase3c_test_failure check(entity_type<>'manual_income') not valid;
set local role authenticated;
select pg_temp.expect_code('select public.register_manual_income(''82000000-0000-4000-8000-000000000003'',''{"amount":"3"}'')','23514');
select pg_temp.expect_code('select public.void_manual_income(''82000000-0000-4000-8000-000000000002'',''Fallo deliberado de auditoría'')','23514');
do $$begin
 if exists(select 1 from public.manual_income where id='82000000-0000-4000-8000-000000000003') or not exists(select 1 from public.manual_income where id='82000000-0000-4000-8000-000000000002' and status='valid' and voided_at is null) then raise exception 'Rollback incompleto';end if;
end $$;
reset role;
set local role anon;
select set_config('request.jwt.claim.sub','',true);
select pg_temp.expect_code('select * from public.manual_income','42501');
select pg_temp.expect_code('select * from public.manual_income_read','42501');
select pg_temp.expect_code('select public.register_manual_income(gen_random_uuid(),''{"amount":"1"}'')','42501');
select pg_temp.expect_code('select public.void_manual_income(gen_random_uuid(),''Intento'')','42501');
reset role;
rollback;
select 'PASS 3C: integridad, roles, inmutabilidad, auditoría y rollback' as result;
