begin;
create function private.phase4d_fault() returns trigger language plpgsql set search_path='' as $$
begin if current_setting('sigca.test_fault',true)=tg_table_name then raise exception '4D induced failure';end if;return new;end $$;
create trigger phase4d_fault before insert on public.shipments for each row execute function private.phase4d_fault();
create trigger phase4d_fault before insert on public.shipment_requests for each row execute function private.phase4d_fault();
create trigger phase4d_fault before insert on public.shipment_finances for each row execute function private.phase4d_fault();
create trigger phase4d_fault before insert on public.audit_log for each row execute function private.phase4d_fault();
do $$
declare actor uuid;cid uuid;oid uuid:=gen_random_uuid();sid uuid;step text;before_counts jsonb;after_counts jsonb;
begin
 select id into actor from public.profiles where role='admin' and status='active' order by id limit 1;
 perform set_config('request.jwt.claim.sub',actor::text,true);
 insert into public.clients(name) values('VALIDACION-4D-ROLLBACK') returning id into cid;
 perform public.save_quote(oid,0,jsonb_build_object('client_id',cid,'order_date','2025-01-01','requested_delivery_date','2025-01-02','discount_amount','0','items',jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'product_name_snapshot','ROLLBACK','quantity','1','unit_price','1','discount_amount','0','is_active',true))));
 perform public.confirm_order(oid,1,'{"confirmed_at":"2025-01-01T12:00:00Z","deposit_percentage":"0"}'::jsonb);
 foreach step in array array['shipments','shipment_requests','audit_log'] loop
  select jsonb_build_array((select count(*) from public.shipments),(select count(*) from public.shipment_requests),(select count(*) from public.audit_log)) into before_counts;
  perform set_config('sigca.test_fault',step,true);sid:=gen_random_uuid();
  begin
   perform public.shipment_operate(gen_random_uuid(),'create',sid,null,jsonb_build_object('order_id',oid,'delivery_type','pickup'));
   raise exception 'Expected induced failure absent';
  exception when raise_exception then if sqlerrm<>'4D induced failure' then raise;end if;end;
  select jsonb_build_array((select count(*) from public.shipments),(select count(*) from public.shipment_requests),(select count(*) from public.audit_log)) into after_counts;
  if before_counts<>after_counts then raise exception 'Partial mutation at %',step;end if;
  raise notice 'PASS rollback %',step;
 end loop;
 perform set_config('sigca.test_fault','',true);sid:=gen_random_uuid();
 perform public.shipment_operate(gen_random_uuid(),'create',sid,null,jsonb_build_object('order_id',oid,'delivery_type','pickup'));
 foreach step in array array['shipment_finances','shipment_requests','audit_log'] loop
  select jsonb_build_array((select count(*) from public.shipment_finances),(select count(*) from public.shipment_requests),(select count(*) from public.audit_log),(select revision from public.shipments where id=sid)) into before_counts;
  perform set_config('sigca.test_fault',step,true);
  begin
   perform public.shipment_operate(gen_random_uuid(),'finance',sid,1,'{"paid_by":"customer_direct","cost_crc":"12.34","reason":"Fallo controlado"}'::jsonb);
   raise exception 'Expected induced failure absent';
  exception when raise_exception then if sqlerrm<>'4D induced failure' then raise;end if;end;
  select jsonb_build_array((select count(*) from public.shipment_finances),(select count(*) from public.shipment_requests),(select count(*) from public.audit_log),(select revision from public.shipments where id=sid)) into after_counts;
  if before_counts<>after_counts then raise exception 'Partial financial mutation at %',step;end if;
  raise notice 'PASS finance rollback %',step;
 end loop;
end $$;
rollback;
