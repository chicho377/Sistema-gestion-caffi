-- Fallos controlados 3E; fixtures y trigger desaparecen por ROLLBACK.
begin;
insert into auth.users(id,email) values('e3000000-0000-4000-8000-000000000001','phase3e-atomicity@example.test');
update public.profiles set role='admin' where id='e3000000-0000-4000-8000-000000000001';
create function pg_temp.phase3e_fault() returns trigger language plpgsql as $$
begin
 if new.action=current_setting('sigca.test_fail_action',true) and new.user_id='e3000000-0000-4000-8000-000000000001' then raise exception 'Fallo de auditoría 3E' using errcode='PZ003';end if;
 return new;
end $$;
create trigger phase3e_fault before insert on public.audit_log for each row execute function pg_temp.phase3e_fault();
select set_config('request.jwt.claim.sub','e3000000-0000-4000-8000-000000000001',true);
set local role authenticated;
insert into public.clients(id,name) values('e3000000-0000-4000-8000-000000000002','3E transaccional');
select public.save_expense_category('e3000000-0000-4000-8000-000000000003',0,'{"name":"3E transaccional","is_active":true}');
do $$
declare o uuid:='e3000000-0000-4000-8000-000000000004';p uuid;e uuid:='e3000000-0000-4000-8000-000000000005'; i uuid; a jsonb;b jsonb;count_a bigint;
begin
 perform public.save_quote(o,0,jsonb_build_object('client_id','e3000000-0000-4000-8000-000000000002','order_date','2024-12-31','requested_delivery_date','2025-01-01','discount_amount','0','items',jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'product_name_snapshot','3E','quantity','1','unit_price','10','discount_amount','0','is_active',true))));
 perform public.confirm_order(o,1,'{"confirmed_at":"2025-01-01T05:59:59Z"}');
 if not exists(select 1 from public.orders where id=o and number_year=2024) then raise exception 'Año empresarial incorrecto';end if;
 select to_jsonb(x) into a from public.orders x where id=o;
 update public.settings set deposit_percentage=case when deposit_percentage=75 then 50 else 75 end;
 if a is distinct from(select to_jsonb(x) from public.orders x where id=o) then raise exception 'Configuración reescribió adelanto histórico';end if;
 select count(*) into count_a from public.audit_log;
 perform set_config('sigca.test_fail_action','order.payment_recorded',true);
 begin perform public.register_payment(o,2,'{"amount":"1","payment_method":"cash","payment_date":"2025-01-01T06:00:00Z"}');raise exception 'Fallo no activado';exception when sqlstate 'PZ003' then null;end;
 if a is distinct from(select to_jsonb(x) from public.orders x where id=o) or exists(select 1 from public.payments where order_id=o) or count_a<>(select count(*) from public.audit_log) then raise exception 'Pago parcialmente persistido';end if;
 perform set_config('sigca.test_fail_action','',true);
 p:=public.register_payment(o,2,'{"amount":"1","payment_method":"cash","payment_date":"2025-01-01T06:00:00Z"}');
 select to_jsonb(x) into a from public.orders x where id=o;select to_jsonb(x) into b from public.payments x where id=p;select count(*) into count_a from public.audit_log;
 perform set_config('sigca.test_fail_action','order.payment_voided',true);
 begin perform public.void_payment(o,3,jsonb_build_object('payment_id',p,'reason','Fallo controlado'));raise exception 'Fallo no activado';exception when sqlstate 'PZ003' then null;end;
 if a is distinct from(select to_jsonb(x) from public.orders x where id=o) or b is distinct from(select to_jsonb(x) from public.payments x where id=p) or count_a<>(select count(*) from public.audit_log) then raise exception 'Anulación parcial';end if;
 perform set_config('sigca.test_fail_action','',true);
 -- El instante UTC cambia de día/año a las 06:00:00 para Costa Rica.
 i:=public.register_manual_income(gen_random_uuid(),'{"amount":"1","income_date":"2025-01-01T05:59:59Z"}');
 if not exists(select 1 from public.manual_income where id=i and (income_date at time zone 'America/Costa_Rica')::date='2024-12-31' and is_historical and created_at>income_date) then raise exception 'Cronología ingreso';end if;
 perform public.register_expense(e,'{"category_id":"e3000000-0000-4000-8000-000000000003","amount":"0.01","currency":"USD","description":"3E histórico","expense_date":"2025-01-01T06:00:00Z","historical_rate":"500.5","rate_source":"Fixture 3E","rate_reason":"Verificación de límite empresarial"}');
 if not exists(select 1 from public.expenses where id=e and (expense_date at time zone 'America/Costa_Rica')::date='2025-01-01' and exchange_rate_date='2025-01-01' and amount_crc=5.01 and created_at>expense_date) then raise exception 'Cronología gasto/tasa';end if;
end $$;
rollback;
select 'PASS 3E: rollback de pago/anulación/auditoría y medianoche/año Costa Rica' as result;
