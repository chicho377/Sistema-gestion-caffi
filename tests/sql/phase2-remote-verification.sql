-- Pruebas RLS reales en transacción: datos temporales, sin borrar registros existentes.
begin;
insert into auth.users(id,email,raw_user_meta_data) values
('20000000-0000-4000-8000-000000000001','phase2-admin@example.test','{}'),
('20000000-0000-4000-8000-000000000002','phase2-member@example.test','{}');
update public.profiles set role='admin' where id='20000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000002',true);
insert into public.clients(id,name,phone) values('21000000-0000-4000-8000-000000000001','Prueba transaccional','83639663');
insert into public.product_categories(id,name) values('22000000-0000-4000-8000-000000000001','Prueba SQL Fase2');
insert into public.materials(id,code,name,category,unit,min_stock) values('23000000-0000-4000-8000-000000000001','SQL-P2','Prueba','Hilos','g',1.5);
insert into public.products(id,sku,name,category_id,base_price,estimated_minutes) values('24000000-0000-4000-8000-000000000001','SQL-P2','Prueba','22000000-0000-4000-8000-000000000001',1000,60);
insert into public.product_materials(product_id,material_id,estimated_quantity) values('24000000-0000-4000-8000-000000000001','23000000-0000-4000-8000-000000000001',2.5);
do $$
begin
 if (select count(*) from public.material_costs)<>0 or (select count(*) from public.settings)<>0 or (select count(*) from public.audit_log)<>0 then raise exception 'Financial leak'; end if;
 if exists(select 1 from information_schema.columns where table_schema='public' and table_name='materials' and column_name in ('amount','currency','unit_cost','cost')) then raise exception 'Cost column exposed'; end if;
 begin
  insert into public.material_costs(material_id,amount,currency) values('23000000-0000-4000-8000-000000000001',12,'USD');
  raise exception 'Cost write allowed';
 exception when insufficient_privilege then null; end;
 begin
  perform public.save_material(null,'bad','bad','x','g',0,true,2,'USD');
  raise exception 'Cost RPC allowed';
 exception when insufficient_privilege then null; end;
 begin
  insert into public.products(sku,name,base_price) values('sql-p2 ','Duplicate',0);
  raise exception 'Duplicate SKU allowed';
 exception when unique_violation then null; end;
 begin
  insert into public.product_categories(name) values(' prueba   sql fase2 ');
  raise exception 'Duplicate category allowed';
 exception when unique_violation then null; end;
 begin
  insert into public.product_materials(product_id,material_id,estimated_quantity) values('24000000-0000-4000-8000-000000000001',gen_random_uuid(),1);
  raise exception 'Invalid FK allowed';
 exception when foreign_key_violation then null; end;
 begin
  update public.product_materials set estimated_quantity=0 where product_id='24000000-0000-4000-8000-000000000001';
  raise exception 'Zero quantity allowed';
 exception when check_violation then null; end;
 begin
  update public.materials set min_stock='NaN'::numeric;
  raise exception 'NaN allowed';
 exception when check_violation then null; end;
 begin
  insert into public.product_images(product_id,path) values('24000000-0000-4000-8000-000000000001','products/a/b.webp');
  raise exception 'Unvalidated image registration allowed';
 exception when insufficient_privilege then null; end;
 update public.settings set hourly_rate=999;
 if found then raise exception 'Settings write allowed'; end if;
 update public.clients set notes='Edición conservada',is_active=false where id='21000000-0000-4000-8000-000000000001';
 if not found then raise exception 'Client edit denied'; end if;
 perform public.duplicate_product('24000000-0000-4000-8000-000000000001','SQL-P2-COPY','Copia');
 if not exists(select 1 from public.product_materials pm join public.products p on p.id=pm.product_id where p.sku='SQL-P2-COPY') then raise exception 'Clone missing relations'; end if;
end; $$;
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000001',true);
insert into public.material_costs(material_id,amount,currency) values('23000000-0000-4000-8000-000000000001',10.25,'USD');
update public.settings set hourly_rate=2000;
do $$begin
 if not exists(select 1 from public.material_costs where amount=10.25) then raise exception 'Admin cost denied'; end if;
 if not exists(select 1 from public.audit_log where entity_type='clients' and user_id='20000000-0000-4000-8000-000000000002') then raise exception 'Missing attributed audit'; end if;
end; $$;
update public.profiles set status='inactive' where id='20000000-0000-4000-8000-000000000002';
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000002',true);
do $$begin
 if exists(select 1 from public.clients) or exists(select 1 from public.products) or exists(select 1 from public.materials) or exists(select 1 from public.material_costs) then raise exception 'Inactive read allowed'; end if;
 begin
  insert into public.clients(name) values('Forbidden');
  raise exception 'Inactive write allowed';
 exception when insufficient_privilege then null; end;
end; $$;
reset role;
select private.store_exchange_rate('20000000-0000-4000-8000-000000000001',current_date,450);
do $$begin
 if not exists(select 1 from public.audit_log where entity_type='exchange_rates' and user_id='20000000-0000-4000-8000-000000000001') then raise exception 'Rate audit missing actor'; end if;
 if has_function_privilege('authenticated','public.store_exchange_rate(uuid,date,numeric)','EXECUTE') then raise exception 'Rate RPC exposed'; end if;
 begin
  perform private.store_exchange_rate('20000000-0000-4000-8000-000000000002',current_date,450);
  raise exception 'Inactive rate actor accepted';
 exception when insufficient_privilege then null; end;
end; $$;
do $$declare t text; begin
 foreach t in array array['settings','clients','product_categories','materials','material_costs','products','product_materials','product_images','exchange_rates'] loop
 if has_table_privilege('authenticated','public.'||t,'DELETE') or has_table_privilege('anon','public.'||t,'SELECT') then raise exception 'Unsafe grant %',t; end if;
 if not (select relrowsecurity from pg_class where oid=('public.'||t)::regclass) then raise exception 'Missing RLS %',t; end if;
 end loop;
 if exists(select 1 from storage.buckets where id='catalog-images' and public) then raise exception 'Public bucket'; end if;
end; $$;
rollback;
