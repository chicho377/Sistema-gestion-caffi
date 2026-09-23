-- Prueba transaccional, apta para PostgreSQL local y DEV. ROLLBACK no borra datos existentes.
begin;
insert into auth.users(id,email) values('31000000-0000-4000-8000-000000000001','phase3a-admin@example.test'),('31000000-0000-4000-8000-000000000002','phase3a-member@example.test');
update public.profiles set role='admin' where id='31000000-0000-4000-8000-000000000001';
insert into storage.objects(bucket_id,name) values('order-references','orders/34000000-0000-4000-8000-000000000099/35000000-0000-4000-8000-000000000099.webp');
set local role authenticated;
select set_config('request.jwt.claim.sub','31000000-0000-4000-8000-000000000002',true);
insert into public.clients(id,name) values('32000000-0000-4000-8000-000000000001','Prueba F3A');
insert into public.products(id,sku,name,description,base_price) values('33000000-0000-4000-8000-000000000001','SQL-F3A','Original','Descripción original',12.50);
do $$
declare doc jsonb; oid uuid:='34000000-0000-4000-8000-000000000001'; other_id uuid:='34000000-0000-4000-8000-000000000002'; v text; n integer; d date:=(now() at time zone 'America/Costa_Rica')::date;
begin
 doc:=jsonb_build_object('client_id','32000000-0000-4000-8000-000000000001','order_date',d,'requested_delivery_date',d,'notes','Prueba','discount_amount','1.00','items',jsonb_build_array(
 jsonb_build_object('id','35000000-0000-4000-8000-000000000001','product_id','33000000-0000-4000-8000-000000000001','quantity','2','unit_price','12.50','discount_amount','0.10','is_active',true),
 jsonb_build_object('id','35000000-0000-4000-8000-000000000002','product_name_snapshot','Personalizado','quantity','1','unit_price','0.10','discount_amount','0','is_active',true)));
 perform public.save_quote(oid,0,doc);
 if (select total from public.orders where id=oid)<>24 or (select count(*) from public.order_items where order_id=oid)<>2 then raise exception 'Cálculo o alta incorrectos'; end if;
 if exists(select 1 from public.orders where id=oid and (order_number is not null or confirmed_at is not null or delivered_at is not null or production_status<>'quote')) then raise exception 'Alcance 3B'; end if;
 if round(0.125::numeric,2)<>0.13 or round(0.125::numeric,2)+round(0.125::numeric,2)<>0.26 then raise exception 'HALF UP inválido'; end if;
 if (select count(*) from public.audit_log)<>0 then raise exception 'Auditoría visible para Colaborador'; end if;
 begin perform public.save_quote(oid,1,doc||'{"total":"0"}'); raise exception 'Total cliente aceptado'; exception when invalid_parameter_value then null; end;
 foreach v in array array['1.001','NaN','Infinity','-1'] loop
 begin perform public.save_quote(oid,1,jsonb_set(doc,'{items,0,unit_price}',to_jsonb(v))); raise exception 'Precio inválido aceptado'; exception when invalid_parameter_value then null; end;
 end loop;
 foreach v in array array['0','-1','1.5','NaN','Infinity'] loop
 begin perform public.save_quote(oid,1,jsonb_set(doc,'{items,0,quantity}',to_jsonb(v))); raise exception 'Cantidad inválida aceptada'; exception when invalid_parameter_value then null; end;
 end loop;
 -- Falla en segunda línea debe revertir la primera y toda auditoría de la operación.
 begin perform public.save_quote(oid,1,jsonb_set(jsonb_set(doc,'{items,0,unit_price}','"13"'),'{items,1,quantity}','"0"')); raise exception 'Falta rollback'; exception when invalid_parameter_value then null; end;
 if (select unit_price from public.order_items where id='35000000-0000-4000-8000-000000000001')<>12.50 or (select revision from public.orders where id=oid)<>1 then raise exception 'Operación parcial'; end if;
 begin perform public.save_quote(oid,0,doc); raise exception 'Versión obsoleta aceptada'; exception when sqlstate 'PT409' then null; end;
 begin update public.orders set total=0 where id=oid; raise exception 'DML permitido'; exception when insufficient_privilege then null; end;
 begin delete from public.order_items where order_id=oid; raise exception 'DELETE permitido'; exception when insufficient_privilege then null; end;
 begin perform public.save_quote(other_id,0,doc); raise exception 'Línea ajena permitida'; exception when insufficient_privilege then null; end;
 if exists(select 1 from public.orders where id=other_id) then raise exception 'Alta parcial'; end if;
 begin perform public.save_quote(oid,1,jsonb_set(doc,'{order_date}',to_jsonb((d-1)::text))); raise exception 'Histórico Colaborador'; exception when invalid_parameter_value then null; end;
 begin perform public.save_quote(oid,1,jsonb_set(doc,'{order_date}',to_jsonb((d+1)::text))); raise exception 'Futuro permitido'; exception when invalid_parameter_value then null; end;
 begin perform public.save_quote(oid,1,jsonb_set(doc,'{requested_delivery_date}',to_jsonb((d-1)::text))); raise exception 'Entrega anterior'; exception when invalid_parameter_value then null; end;
 update public.products set name='Nuevo',description='Cambiada',is_active=false where id='33000000-0000-4000-8000-000000000001';
 update public.clients set is_active=false where id='32000000-0000-4000-8000-000000000001';
 perform public.save_quote(oid,1,doc);
 if (select product_name_snapshot from public.order_items where id='35000000-0000-4000-8000-000000000001')<>'Original' then raise exception 'Snapshot alterado'; end if;
 begin perform public.save_quote(other_id,0,doc||'{"items":[],"discount_amount":"0"}'); raise exception 'Cliente inactivo nuevo'; exception when invalid_parameter_value then null; end;
 update public.clients set is_active=true where id='32000000-0000-4000-8000-000000000001';
 begin perform public.save_quote(other_id,0,jsonb_set(doc,'{items,0,id}','"35000000-0000-4000-8000-000000000003"')); raise exception 'Producto inactivo nuevo'; exception when invalid_parameter_value then null; end;
 perform public.save_quote(oid,2,jsonb_set(doc,'{items,0,is_active}','false')||'{"discount_amount":"0"}');
 if (select total from public.orders where id=oid)<>0.10 then raise exception 'Inactivo suma'; end if;
 perform public.save_quote(other_id,0,doc||'{"items":[],"discount_amount":"0"}');
 if (select total from public.orders where id=other_id)<>0 then raise exception 'Cotización vacía'; end if;
 begin perform public.cancel_quote(oid,3,' '); raise exception 'Sin motivo'; exception when invalid_parameter_value then null; end;
 perform public.cancel_quote(oid,3,'Cancelación prueba');
 begin perform public.save_quote(oid,4,doc); raise exception 'Cancelado editado'; exception when sqlstate 'PT409' then null; end;
 begin perform public.cancel_quote(oid,4,'Otra'); raise exception 'Cancelado repetido'; exception when sqlstate 'PT409' then null; end;
 begin insert into storage.objects(bucket_id,name) values('order-references','orders/falso.webp'); raise exception 'Upload directo'; exception when insufficient_privilege then null; end;
 select count(*) into n from storage.objects where bucket_id='order-references' and not exists(select 1 from public.order_files f where f.path=storage.objects.name); if n<>0 then raise exception 'Objeto sin metadato visible'; end if;
end $$;
select set_config('request.jwt.claim.sub','31000000-0000-4000-8000-000000000001',true);
do $$ declare d date:=(now() at time zone 'America/Costa_Rica')::date; begin
 if not exists(select 1 from public.audit_log where action='quote.cancelled' and reason='Cancelación prueba') then raise exception 'Falta auditoría'; end if;
 perform public.save_quote('34000000-0000-4000-8000-000000000003',0,jsonb_build_object('client_id','32000000-0000-4000-8000-000000000001','order_date',d-3,'requested_delivery_date',d-2,'discount_amount','0','items','[]'::jsonb));
 update public.profiles set status='inactive' where id='31000000-0000-4000-8000-000000000002';
end $$;
select set_config('request.jwt.claim.sub','31000000-0000-4000-8000-000000000002',true);
do $$ begin
 if exists(select 1 from public.orders) or exists(select 1 from public.order_items) or exists(select 1 from public.order_files) then raise exception 'Inactivo con acceso'; end if;
 begin perform public.cancel_quote('34000000-0000-4000-8000-000000000002',1,'Intento'); raise exception 'Inactivo escribe'; exception when insufficient_privilege then null; end;
end $$;
set local role anon;
do $$ begin
 begin perform 1 from public.orders; raise exception 'Anónimo lee'; exception when insufficient_privilege then null; end;
 begin perform public.save_quote(gen_random_uuid(),0,'{}'); raise exception 'Anónimo escribe'; exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
