-- Prueba DEV aislada por transacción. Desplaza temporalmente cache fuera del rango operativo; ROLLBACK restaura todo.
begin;
insert into auth.users(id,email) values ('94000000-0000-4000-8000-000000000001','rates-admin@example.test'),('94000000-0000-4000-8000-000000000002','rates-member@example.test');
update public.profiles set role='admin' where id='94000000-0000-4000-8000-000000000001';
select set_config('request.jwt.claim.sub','94000000-0000-4000-8000-000000000001',true);
do $$declare today date:=(clock_timestamp() at time zone 'America/Costa_Rica')::date;offset_days integer;begin
 if exists(select 1 from public.exchange_rates where not isfinite(rate_date) or rate_date>today) then raise exception 'Precondición no cumplida: no modificar referencias futuras';end if;
 select today+1-min(rate_date) into offset_days from public.exchange_rates;
 if offset_days is not null then update public.exchange_rates set rate_date=rate_date+offset_days;end if;
end $$;
select set_config('request.jwt.claim.sub','94000000-0000-4000-8000-000000000002',true);
set local role authenticated;
do $$declare payload jsonb;today date:=(clock_timestamp() at time zone 'America/Costa_Rica')::date;begin
 payload:=jsonb_build_object('category_id',(select id from public.expense_categories limit 1),'amount','1','currency','USD','description','Sin referencia');
 if public.expense_rate(today) is not null then raise exception 'La prueba necesita cache vacío';end if;
 begin perform public.register_expense(gen_random_uuid(),payload);raise exception 'Aceptó USD sin tasa';exception when sqlstate '22023' then null;end;
end $$;
reset role;
insert into public.exchange_rates(source,rate_date,sell_rate,fetched_at) values('BCCR via tipodecambio.paginasweb.cr',(clock_timestamp() at time zone 'America/Costa_Rica')::date-1,500.50000000000000001,clock_timestamp());
set local role authenticated;
do $$declare payload jsonb;today date:=(clock_timestamp() at time zone 'America/Costa_Rica')::date;begin
 payload:=jsonb_build_object('category_id',(select id from public.expense_categories limit 1),'amount','0.01','currency','USD','description','Fallback operativo');
 if not (public.expense_rate(today)->>'fallback')::boolean or (public.expense_rate(today)->>'date')::date<>today-1 then raise exception 'Fallback pierde fecha real';end if;
 perform public.register_expense('95000000-0000-4000-8000-000000000001',payload);
 if not exists(select 1 from public.expenses_read where id='95000000-0000-4000-8000-000000000001' and amount_crc='5.01' and exchange_rate_applied='500.50000000000000001' and rate_is_fallback and exchange_rate_date=today-1) then raise exception 'Evidencia fallback inexacta';end if;
 begin perform public.register_expense(gen_random_uuid(),payload||'{"historical_rate":"1","rate_source":"No permitido","rate_reason":"No permitido"}');raise exception 'Permitió tasa al colaborador';exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claim.sub','94000000-0000-4000-8000-000000000001',true);
 if public.expense_rate(today-2) is not null then raise exception 'Fallback histórico indebido';end if;
 perform public.register_expense('95000000-0000-4000-8000-000000000002',payload||jsonb_build_object('expense_date',(today-1)::text||'T12:00:00-06:00'));
 if not exists(select 1 from public.expenses where id='95000000-0000-4000-8000-000000000002' and is_historical and not rate_is_fallback and rate_provided_by is null and exchange_rate_applied=500.50000000000000001) then raise exception 'No usó referencia por fecha';end if;
end $$;
reset role;
update public.exchange_rates set sell_rate=600 where rate_date<=(clock_timestamp() at time zone 'America/Costa_Rica')::date;
do $$begin if exists(select 1 from public.expenses where id in ('95000000-0000-4000-8000-000000000001','95000000-0000-4000-8000-000000000002') and exchange_rate_applied<>500.50000000000000001) then raise exception 'Actualización de cache alteró evidencia histórica';end if;end $$;
insert into storage.objects(bucket_id,name) values
 ('expense-receipts','expenses/95000000-0000-4000-8000-000000000001/96000000-0000-4000-8000-000000000001.webp'),
 ('expense-receipts','expenses/95000000-0000-4000-8000-000000000001/96000000-0000-4000-8000-000000000002.webp');
set local role service_role;
select public.register_expense_file('94000000-0000-4000-8000-000000000002','95000000-0000-4000-8000-000000000001',1,'expenses/95000000-0000-4000-8000-000000000001/96000000-0000-4000-8000-000000000001.webp','Original',100);
reset role;
do $$declare previous uuid;begin
 select id into previous from public.expense_files where expense_id='95000000-0000-4000-8000-000000000001' and caption='Original';
 perform public.register_expense_file('94000000-0000-4000-8000-000000000002','95000000-0000-4000-8000-000000000001',2,'expenses/95000000-0000-4000-8000-000000000001/96000000-0000-4000-8000-000000000002.webp','Reemplazo',101,previous);
 if (select count(*) from public.expense_files where expense_id='95000000-0000-4000-8000-000000000001')<>2 or not exists(select 1 from public.expense_files where id=previous and not is_active and caption='Original' and byte_size=100) then raise exception 'Versión perdida';end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub','94000000-0000-4000-8000-000000000002',true);
do $$begin
 if exists(select 1 from storage.objects where bucket_id='expense-receipts') then raise exception 'Storage directo debe quedar aislado';end if; if (select count(*) from public.expense_files where expense_id='95000000-0000-4000-8000-000000000001')<>2 then raise exception 'Autor no puede consultar historial de metadatos';end if;
 begin perform public.register_expense_file(auth.uid(),'95000000-0000-4000-8000-000000000001',3,'x','x',1);raise exception 'Acceso infra concedido';exception when insufficient_privilege then null;end;
end $$;
reset role;
update public.profiles set status='inactive' where id='94000000-0000-4000-8000-000000000002';
set local role authenticated;
do $$begin if exists(select 1 from public.expenses) or exists(select 1 from public.expense_files) or exists(select 1 from storage.objects where bucket_id='expense-receipts') then raise exception 'Inactivo accede a archivos';end if;end $$;
reset role;
rollback;

select 'PASS DEV: sin referencia, fallback, histórico exacto, cache independiente, versiones y RLS' as result;
