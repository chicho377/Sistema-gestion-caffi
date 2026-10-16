begin;
create function private.phase5_fault() returns trigger language plpgsql set search_path='' as $$begin if new.action='order_item.estimate_captured' and current_setting('sigca.phase5_fault',true)='yes' then raise exception 'induced estimate audit failure';end if;return new;end $$;
create trigger phase5_fault before insert on public.audit_log for each row execute function private.phase5_fault();
do $$declare actor uuid;cid uuid;pid uuid;oid uuid:=gen_random_uuid();lid uuid:=gen_random_uuid();counter_before bigint;begin
 select id into actor from public.profiles where role='admin' and status='active' order by id limit 1;
 perform set_config('request.jwt.claim.sub',actor::text,true);
 insert into public.clients(name) values('VALIDACION-5-ROLLBACK') returning id into cid;
 insert into public.products(sku,name,base_price,estimated_minutes) values(oid::text,'VALIDACION-5-ROLLBACK',1,15) returning id into pid;
 perform public.save_quote(oid,0,jsonb_build_object('client_id',cid,'order_date','1990-01-01','requested_delivery_date','1990-02-01','discount_amount','0','items',jsonb_build_array(jsonb_build_object('id',lid,'product_id',pid,'quantity','1','unit_price','1','discount_amount','0','is_active',true))));
 select last_sequence into counter_before from public.order_counters where year=1990;
 perform set_config('sigca.phase5_fault','yes',true);
 begin
 perform public.confirm_order(oid,1,'{"confirmed_at":"1990-01-01T12:00:00Z","deposit_percentage":"0"}');
 raise exception 'Failure absent';
 exception when raise_exception then if sqlerrm<>'induced estimate audit failure' then raise;end if;end;
 if exists(select 1 from public.orders where id=oid and (production_status<>'quote' or order_number is not null)) or exists(select 1 from public.order_items where id=lid and estimate_captured_at is not null) or counter_before is distinct from (select last_sequence from public.order_counters where year=1990) then raise exception 'Partial confirmation';end if;
end $$;
rollback;
