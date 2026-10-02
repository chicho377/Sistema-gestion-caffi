-- Casos controlados: PostgreSQL real, referencias sintéticas visibles solo en esta
-- transacción. ROLLBACK restaura caché, fixtures y auditoría; nunca borrar tasas.
begin;
select set_config('request.jwt.claim.sub',(select id::text from public.profiles where role='admin' and status='active' order by id limit 1),true);
select set_config('sigca.audit_mat',gen_random_uuid()::text,true);
select set_config('sigca.audit_hist',gen_random_uuid()::text,true);
insert into public.materials(id,code,name,category,unit)
values(current_setting('sigca.audit_mat')::uuid,'AUDIT-RATE-'||current_setting('sigca.audit_mat'),'Fixture transaccional 4A','Prueba rollback','gramos'),
(current_setting('sigca.audit_hist')::uuid,'AUDIT-RATE-'||current_setting('sigca.audit_hist'),'Fixture transaccional histórico 4A','Prueba rollback','gramos');
insert into public.exchange_rates(source,rate_date,sell_rate)
values('BCCR via tipodecambio.paginasweb.cr',(clock_timestamp() at time zone 'America/Costa_Rica')::date,500.50000000000000001),
('BCCR via tipodecambio.paginasweb.cr','1905-01-01',501.2345)
on conflict(rate_date) do update set sell_rate=excluded.sell_rate;
set local role authenticated;
do $$declare m uuid:=current_setting('sigca.audit_mat')::uuid;hm uuid:=current_setting('sigca.audit_hist')::uuid;
 rid uuid:=gen_random_uuid();hrid uuid:=gen_random_uuid();p jsonb;begin
 p:=jsonb_build_object('kind','purchase','source_reference','AUDITORIA 4A ROLLBACK','lines',jsonb_build_array(jsonb_build_object('material_id',m,'unit','gramos','quantity','0.25','amount','0.01','currency','USD')));
 perform public.register_inventory_receipt(rid,p,jsonb_build_object(m::text,'0'));
 if not exists(select 1 from public.inventory_receipt_items where receipt_id=rid and exchange_rate_applied=500.50000000000000001 and exchange_rate_date=(clock_timestamp() at time zone 'America/Costa_Rica')::date and not rate_is_fallback and amount_crc=5.01 and rate_origin='provider' and rate_provided_by is null) then raise exception 'Tasa actual/snapshot/HALF UP incorrectos';end if;
 p:=p||jsonb_build_object('effective_at','1905-01-01T12:00:00-06:00','lines',jsonb_build_array(jsonb_build_object('material_id',hm,'unit','gramos','quantity','1','amount','1.25','currency','USD')));
 perform public.register_inventory_receipt(hrid,p,jsonb_build_object(hm::text,'0'));
 if not exists(select 1 from public.inventory_receipt_items where receipt_id=hrid and exchange_rate_date='1905-01-01' and exchange_rate_applied=501.2345 and not rate_is_fallback and amount_crc=626.54 and rate_origin='provider' and rate_provided_by is null) then raise exception 'Histórico no usa fecha exacta';end if;
 begin
  perform public.register_inventory_receipt(gen_random_uuid(),p||jsonb_build_object('effective_at','1905-01-02T12:00:00-06:00'),jsonb_build_object(hm::text,'1'));
  raise exception 'Aceptó tasa histórica de otra fecha';
 exception when sqlstate '22023' then null;end;
 begin update public.materials set unit='metros' where id=m;raise exception 'Unidad mutable';exception when sqlstate '22023' then null;end;
 begin update public.inventory_movements set quantity=2 where material_id=m;raise exception 'Movimiento editable';exception when insufficient_privilege then null;end;
 perform set_config('sigca.audit_receipt',rid::text,true);
 perform set_config('sigca.audit_original',(select to_jsonb(i)::text from public.inventory_receipt_items i where receipt_id=rid),true);
end $$;
reset role;
-- Simular actualización posterior sin hacer visible ninguna tasa artificial.
update public.exchange_rates set sell_rate=999.99 where rate_date=(clock_timestamp() at time zone 'America/Costa_Rica')::date;
do $$begin
 if (select to_jsonb(i)::text from public.inventory_receipt_items i where receipt_id=current_setting('sigca.audit_receipt')::uuid)<>current_setting('sigca.audit_original') then raise exception 'Actualización de caché reescribió snapshot';end if;
 begin perform (-1)::public.inventory_quantity;raise exception 'Stock negativo admisible';exception when check_violation then null;end;
 begin perform 0.00001::public.inventory_quantity;raise exception 'Escala de cantidad inválida admisible';exception when check_violation then null;end;
 begin perform 0.000000001::public.inventory_value;raise exception 'Escala costo inválida admisible';exception when check_violation then null;end;
 begin perform 'NaN'::numeric::public.inventory_value;raise exception 'NaN admisible';exception when check_violation then null;end;
 begin perform 'Infinity'::numeric::public.inventory_value;raise exception 'Infinity admisible';exception when check_violation then null;end;
 if exists(select 1 from information_schema.columns where table_schema='public' and table_name like 'inventory_%' and data_type in('real','double precision')) then raise exception 'Float en inventario';end if;
 if exists(select 1 from public.inventory_movements where movement_type not in('purchase_entry','opening_balance')) then raise exception 'Operaciones fuera de 4A';end if;
end $$;
set constraints all immediate;
rollback;
select 'PASS: tasa actual, fecha histórica exacta, snapshot inmutable, unidad/DML, numeric/domains, alcance; ROLLBACK completo' as result;
