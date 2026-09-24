begin;
insert into auth.users(id,email) values('61000000-0000-4000-8000-000000000001','phase3b-admin@example.test'),('61000000-0000-4000-8000-000000000002','phase3b-member@example.test');
update public.profiles set role='admin' where id='61000000-0000-4000-8000-000000000001';
select set_config('sigca.test_counters_before',(select coalesce(jsonb_object_agg(year,last_sequence),'{}'::jsonb)::text from public.order_counters where year in (2024,2025)),true);
set local role authenticated;
select set_config('request.jwt.claim.sub','61000000-0000-4000-8000-000000000001',true);
insert into public.clients(id,name) values('62000000-0000-4000-8000-000000000001','3B Cliente'),('62000000-0000-4000-8000-000000000002','3B Otro');
update public.settings set deposit_percentage=50;

do $$
declare o uuid; doc jsonb; dt date; yr integer; before_count bigint; after_count bigint; p uuid; n text; rev integer;
begin
 for yr in 2024..2025 loop
  dt:=make_date(yr,1,1); o:=gen_random_uuid();
  doc:=jsonb_build_object('client_id','62000000-0000-4000-8000-000000000001','order_date',dt,'requested_delivery_date',dt+1,'discount_amount','0','items',jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'product_name_snapshot','Histórico','quantity','1','unit_price','10','discount_amount','0','is_active',true)));
  perform public.save_quote(o,0,doc);
  perform set_config('request.jwt.claim.sub','61000000-0000-4000-8000-000000000002',true);
  begin perform public.confirm_order(o,1,jsonb_build_object('confirmed_at',dt::text||'T00:00:00-06:00'));raise exception 'Histórico colaborador';exception when invalid_parameter_value then null;end;
  perform set_config('request.jwt.claim.sub','61000000-0000-4000-8000-000000000001',true);
  perform public.confirm_order(o,1,jsonb_build_object('confirmed_at',dt::text||'T00:00:00-06:00'));
  select order_number into n from public.orders where id=o;
  if n<>'PED-'||yr::text||'-'||lpad((coalesce((current_setting('sigca.test_counters_before')::jsonb->>yr::text)::bigint,0)+1)::text,5,'0') then raise exception 'Año o primer consecutivo erróneo';end if;
  if (select created_at from public.orders where id=o)<now()-interval '1 minute' then raise exception 'Created_at falsificado';end if;
  begin perform public.correct_order_dates(o,2,jsonb_build_object('confirmed_at',(dt+interval '1 year')::date::text||'T00:00:00-06:00','reason','Otro año'));raise exception 'Año modificado';exception when invalid_parameter_value then null;end;
  begin perform public.register_payment(o,2,jsonb_build_object('amount','1','payment_method','cash','payment_date',(dt-1)::text||'T00:00:00-06:00'));raise exception 'Pago anterior';exception when invalid_parameter_value then null;end;
  p:=public.register_payment(o,2,jsonb_build_object('amount','1','payment_method','cash','payment_date',dt::text||'T12:00:00-06:00'));
  begin perform public.correct_order_dates(o,3,jsonb_build_object('confirmed_at',(dt+1)::text||'T00:00:00-06:00','reason','Posterior al pago'));raise exception 'Cronología pago';exception when invalid_parameter_value then null;end;
  perform public.correct_order_dates(o,3,jsonb_build_object('confirmed_at',dt::text||'T01:00:00-06:00','reason','Hora correcta'));
  if (select order_number from public.orders where id=o)<>n then raise exception 'Renumera';end if;
  perform public.void_payment(o,4,jsonb_build_object('payment_id',p,'reason','Corrección'));
  perform public.amend_order(o,5,doc||'{"client_id":"62000000-0000-4000-8000-000000000002","reason":"Cambio sin pagos válidos"}');
  if (select client_id from public.payments where id=p)<>'62000000-0000-4000-8000-000000000001' then raise exception 'Cliente histórico alterado';end if;
  begin perform public.transition_order(o,6,'{"state":"in_production"}');raise exception 'Override sin motivo';exception when invalid_parameter_value then null;end;
  perform public.transition_order(o,6,'{"state":"in_production","reason":"Excepción aprobada"}');
  perform public.transition_order(o,7,'{"state":"ready"}');
  begin perform public.transition_order(o,8,'{"state":"confirmed","reason":"Salto"}');raise exception 'Retroceso múltiple';exception when insufficient_privilege then null;end;
  begin perform public.transition_order(o,8,'{"state":"delivered","delivered_at":"2099-01-01T12:00:00-06:00"}');raise exception 'Entrega futura';exception when invalid_parameter_value then null;end;
  perform public.transition_order(o,8,jsonb_build_object('state','delivered','delivered_at',dt::text||'T16:00:00-06:00'));
  perform public.correct_order_dates(o,9,jsonb_build_object('delivered_at',dt::text||'T17:00:00-06:00','reason','Hora de entrega correcta'));
 end loop;
 -- UTC ya cambió de año; el día empresarial de Costa Rica aún pertenece a 2024.
 o:=gen_random_uuid();doc:=jsonb_set(jsonb_set(doc,'{order_date}','"2024-12-31"'),'{requested_delivery_date}','"2025-01-01"');doc:=jsonb_set(doc,'{items,0,id}',to_jsonb(gen_random_uuid()::text));
 perform public.save_quote(o,0,doc);perform public.confirm_order(o,1,'{"confirmed_at":"2025-01-01T01:00:00Z"}');
 if (select number_year from public.orders where id=o)<>2024 then raise exception 'Año UTC en lugar de Costa Rica';end if;
end $$;
reset role;
-- Fallo en el último evento de confirmación: revierte también contador, número y auditoría intermedia.
alter table public.audit_log add constraint phase3b_injected_fault check(not(action='order.confirmed' and entity_id='64000000-0000-4000-8000-000000000099')) not valid;
do $$
declare doc jsonb; n bigint; h text;
begin
 select coalesce(last_sequence,0) into n from public.order_counters where year=2023; n:=coalesce(n,0);
 doc:=jsonb_build_object('client_id','62000000-0000-4000-8000-000000000001','order_date','2023-01-01','requested_delivery_date','2023-01-02','discount_amount','0','items',jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'product_name_snapshot','Rollback','quantity','1','unit_price','1','discount_amount','0','is_active',true)));
 perform public.save_quote('64000000-0000-4000-8000-000000000099',0,doc);
 select md5(coalesce(jsonb_agg(to_jsonb(a))::text,'')) into h from public.audit_log a where entity_id='64000000-0000-4000-8000-000000000099';
 begin perform public.confirm_order('64000000-0000-4000-8000-000000000099',1,'{"confirmed_at":"2023-01-01T00:00:00-06:00"}');raise exception 'Fallo no activado';exception when check_violation then null;end;
 if (select order_number from public.orders where id='64000000-0000-4000-8000-000000000099') is not null or coalesce((select last_sequence from public.order_counters where year=2023),0)<>n then raise exception 'Rollback incompleto';end if;
 if h<>(select md5(coalesce(jsonb_agg(to_jsonb(a))::text,'')) from public.audit_log a where entity_id='64000000-0000-4000-8000-000000000099') then raise exception 'Auditoría parcial';end if;
end $$;
rollback;
select 'PASS 3B: históricos, cronología, overrides, snapshots y rollback de contador' as result;
