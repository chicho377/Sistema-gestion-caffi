-- Fixtures y fallo de auditoría aislados: la transacción completa se revierte.
-- No elimina datos, no altera migraciones ni conserva el trigger de prueba.
begin;
create function pg_temp.phase3a_fail_cancel() returns trigger language plpgsql as $$
begin
 if new.action='quote.cancelled' and new.reason='AUDIT-ROLLBACK-3A' then raise exception 'Fallo intermedio inducido' using errcode='PZ001'; end if;
 return new;
end $$;
create trigger phase3a_test_cancel_failure before insert on public.audit_log for each row execute function pg_temp.phase3a_fail_cancel();
insert into auth.users(id,email) values('41000000-0000-4000-8000-000000000001','audit3a-admin@example.test');
update public.profiles set role='admin' where id='41000000-0000-4000-8000-000000000001';
insert into storage.objects(bucket_id,name) values
('order-references','orders/44000000-0000-4000-8000-000000000001/45000000-0000-4000-8000-000000000001.webp'),
('order-references','orders/44000000-0000-4000-8000-000000000001/45000000-0000-4000-8000-000000000002.webp');
set local role authenticated;
select set_config('request.jwt.claim.sub','41000000-0000-4000-8000-000000000001',true);
insert into public.clients(id,name) values('42000000-0000-4000-8000-000000000001','Auditoría A'),('42000000-0000-4000-8000-000000000002','Auditoría B');
do $$
declare oid uuid:='44000000-0000-4000-8000-000000000001'; lineid uuid:='45000000-0000-4000-8000-000000000001';
 doc jsonb; bad jsonb; before_header jsonb; before_lines jsonb; logs bigint; day date:=(now() at time zone 'America/Costa_Rica')::date; product_count bigint;
begin
 doc:=jsonb_build_object('client_id','42000000-0000-4000-8000-000000000001','order_date',day,'requested_delivery_date',day+8,'discount_amount','0','notes','Inicial','items',jsonb_build_array(jsonb_build_object('id',lineid,'product_name_snapshot','Personalizada','quantity','2','unit_price','10.00','discount_amount','0','is_active',true)));
 select count(*) into product_count from public.products;
 -- Alta: primera línea válida, segunda falla; encabezado, línea y eventos se revierten.
 select count(*) into logs from public.audit_log;
 bad:=jsonb_set(doc,'{items}',(doc->'items')||jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'quantity','0')));
 begin perform public.save_quote(oid,0,bad); raise exception 'Alta inválida aceptada'; exception when invalid_parameter_value then null; end;
 if exists(select 1 from public.orders where id=oid) or exists(select 1 from public.order_items where order_id=oid) or (select count(*) from public.audit_log)<>logs then raise exception 'Alta parcialmente persistida'; end if;
 perform public.save_quote(oid,0,doc);
 if (select count(*) from public.products)<>product_count then raise exception 'Producto creado automáticamente'; end if;
 select to_jsonb(o) into before_header from public.orders o where id=oid;
 select jsonb_agg(to_jsonb(i) order by id) into before_lines from public.order_items i where order_id=oid;
 select count(*) into logs from public.audit_log;
 -- La línea se actualiza antes de que el descuento general falle al recalcular.
 foreach bad in array array[jsonb_set(doc,'{items,0,unit_price}','"11"'),jsonb_set(doc,'{items,0,is_active}','false')] loop
 begin perform public.save_quote(oid,1,bad||'{"discount_amount":"100"}'); raise exception 'Recálculo inválido aceptado'; exception when invalid_parameter_value then null; end;
 if (select to_jsonb(o) from public.orders o where id=oid)<>before_header or (select jsonb_agg(to_jsonb(i) order by id) from public.order_items i where order_id=oid)<>before_lines or (select count(*) from public.audit_log)<>logs then raise exception 'Edición/desactivación parcial'; end if;
 end loop;
 -- El trigger falla después del UPDATE de cancelación, al insertar su evento explícito.
 begin perform public.cancel_quote(oid,1,'AUDIT-ROLLBACK-3A'); raise exception 'No se indujo fallo'; exception when sqlstate 'PZ001' then null; end;
 if (select to_jsonb(o) from public.orders o where id=oid)<>before_header or (select count(*) from public.audit_log)<>logs then raise exception 'Cancelación parcial'; end if;
 -- Cambio de cliente, fecha, notas, precio, descuentos y línea nueva con auditoría exacta.
 doc:=jsonb_set(jsonb_set(doc,'{items,0,unit_price}','"12.50"'),'{items,0,discount_amount}','"0.10"')||jsonb_build_object('client_id','42000000-0000-4000-8000-000000000002','requested_delivery_date',day+9,'notes','Editada','discount_amount','1.00');
 doc:=jsonb_set(doc,'{items}',(doc->'items')||jsonb_build_array(jsonb_build_object('id','45000000-0000-4000-8000-000000000002','product_name_snapshot','Nueva','quantity','1','unit_price','2.00','discount_amount','0','is_active',true)));
 perform public.save_quote(oid,1,doc);
 if not exists(select 1 from public.audit_log where entity_id=oid and action='orders.insert') then raise exception 'Falta alta auditada'; end if;
 if not exists(select 1 from public.audit_log where entity_id=oid and action='orders.update' and metadata->'after'->>'client_id'='42000000-0000-4000-8000-000000000002' and metadata->'after'->>'requested_delivery_date'=(day+9)::text and metadata->'after'->>'notes'='Editada' and (metadata->'after'->>'discount_amount')::numeric=1 and (metadata->'after'->>'total')::numeric=25.90) then raise exception 'Falta auditoría de encabezado/recálculo'; end if;
 if not exists(select 1 from public.audit_log where entity_id=lineid and action='order_items.update' and (metadata->'before'->>'unit_price')::numeric=10 and (metadata->'after'->>'unit_price')::numeric=12.50 and (metadata->'after'->>'discount_amount')::numeric=0.10) then raise exception 'Falta auditoría precio/descuento'; end if;
 if not exists(select 1 from public.audit_log where entity_id='45000000-0000-4000-8000-000000000002' and action='order_items.insert') then raise exception 'Falta línea nueva auditada'; end if;
 perform public.save_quote(oid,2,jsonb_set(doc,'{items,0,is_active}','false'));
 if not exists(select 1 from public.audit_log where entity_id=lineid and action='order_items.update' and metadata->'before'->>'is_active'='true' and metadata->'after'->>'is_active'='false') then raise exception 'Falta desactivación auditada'; end if;
 if (select total from public.orders where id=oid)<>1 then raise exception 'Recálculo incorrecto'; end if;
end $$;
reset role;
-- Invocar con privilegio postgres permite inspeccionar el resultado; el ACL exclusivo
-- service_role del RPC se comprueba por separado en el inventario y API real.
do $$
declare oid uuid:='44000000-0000-4000-8000-000000000001'; actor uuid:='41000000-0000-4000-8000-000000000001'; old_id uuid; new_id uuid; prior jsonb; logs bigint;
begin
 old_id:=public.register_order_file(actor,oid,'orders/'||oid||'/45000000-0000-4000-8000-000000000001.webp','Original',100,null);
 select to_jsonb(f) into prior from public.order_files f where id=old_id;
 select count(*) into logs from public.audit_log;
 -- Marca anterior inactiva antes del INSERT; el CHECK de tamaño falla y revierte ambos.
 begin perform public.register_order_file(actor,oid,'orders/'||oid||'/45000000-0000-4000-8000-000000000002.webp','Reemplazo',5242881,old_id); raise exception 'Tamaño inválido aceptado'; exception when check_violation then null; end;
 if (select to_jsonb(f) from public.order_files f where id=old_id)<>prior or (select count(*) from public.order_files where order_id=oid)<>1 or (select count(*) from public.audit_log)<>logs then raise exception 'Asociación parcial'; end if;
 new_id:=public.register_order_file(actor,oid,'orders/'||oid||'/45000000-0000-4000-8000-000000000002.webp','Reemplazo',100,old_id);
 if not exists(select 1 from public.audit_log where entity_id=new_id and action='quote.file_registered' and user_id=actor and metadata->>'replaces_id'=old_id::text) then raise exception 'Falta auditoría archivo/actor'; end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub','41000000-0000-4000-8000-000000000001',true);
select public.cancel_quote('44000000-0000-4000-8000-000000000001',3,'Cancelación Admin auditada');
do $$ begin
 if not exists(select 1 from public.orders where id='44000000-0000-4000-8000-000000000001' and cancelled_by=auth.uid() and cancelled_at is not null and cancel_reason='Cancelación Admin auditada') or not exists(select 1 from public.audit_log where entity_id='44000000-0000-4000-8000-000000000001' and action='quote.cancelled' and user_id=auth.uid()) then raise exception 'Cancelación sin actor/fecha/evento'; end if;
end $$;
reset role;
rollback;
select 'PASS: alta, edición, desactivación, cancelación y asociación atómicas; eventos verificados; fixtures revertidos' as result,
not exists(select 1 from pg_trigger where tgname='phase3a_test_cancel_failure') as test_trigger_removed;
