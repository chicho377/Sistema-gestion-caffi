-- Fase 2 / D-18. Catálogos sin movimientos, pedidos ni valoración de inventario.
begin;
create table public.settings (
 id uuid primary key default gen_random_uuid(),
 singleton boolean not null default true unique check(singleton),
 business_name text not null check(length(trim(business_name)) between 1 and 120),
 phone text not null check(phone ~ '^\+?[0-9 ()-]{8,25}$'),
 email text not null check(email ~ '^[^ @]+@[^ @]+\.[^ @]+$' and length(email)<=254),
 currency text not null default 'CRC' check(currency='CRC'),
 deposit_percentage numeric not null default 50 check(deposit_percentage between 0 and 100),
 hourly_rate numeric check(hourly_rate>=0 and hourly_rate<'Infinity'::numeric),
 order_number_format text not null default 'PED-AAAA-00001' check(order_number_format='PED-AAAA-00001'),
 logo_path text check(logo_path ~ '^branding/[a-f0-9-]+\.webp$'),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.clients (
 id uuid primary key default gen_random_uuid(),
 name text not null check(length(trim(name)) between 1 and 120),
 phone text check(phone ~ '^\+?[0-9 ()-]{8,25}$'),
 email text check(email ~ '^[^ @]+@[^ @]+\.[^ @]+$' and length(email)<=254),
 address text check(length(address)<=1000), location text check(length(location)<=300),
 notes text check(length(notes)<=3000),
 is_active boolean not null default true,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index clients_name_idx on public.clients(lower(name));
create index clients_active_idx on public.clients(is_active, name);
create table public.product_categories (
 id uuid primary key default gen_random_uuid(),
 name text not null check(length(trim(name)) between 1 and 100),
 description text check(length(description)<=1000),
 is_active boolean not null default true,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index product_categories_name_unique on public.product_categories(lower(regexp_replace(trim(name),'\s+',' ','g')));
create table public.materials (
 id uuid primary key default gen_random_uuid(),
 code text not null check(length(trim(code)) between 1 and 60),
 name text not null check(length(trim(name)) between 1 and 120),
 category text not null check(length(trim(category)) between 1 and 100),
 unit text not null check(length(trim(unit)) between 1 and 40),
 min_stock numeric not null default 0 check(min_stock>=0 and min_stock<'Infinity'::numeric),
 is_active boolean not null default true,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index materials_code_unique on public.materials(lower(trim(code)));
create index materials_active_name_idx on public.materials(is_active,name);
create table public.material_costs (
 id uuid primary key default gen_random_uuid(),
 material_id uuid not null unique references public.materials(id) on delete restrict,
 amount numeric not null check(amount>=0 and amount<'Infinity'::numeric),
 currency text not null check(currency in ('CRC','USD')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.products (
 id uuid primary key default gen_random_uuid(),
 sku text not null check(length(trim(sku)) between 1 and 60),
 name text not null check(length(trim(name)) between 1 and 120),
 category_id uuid references public.product_categories(id) on delete restrict,
 description text check(length(description)<=3000),
 base_price numeric not null check(base_price>=0 and base_price<'Infinity'::numeric),
 estimated_minutes integer check(estimated_minutes>=0),
 is_customizable boolean not null default false,
 customization_notes text check(length(customization_notes)<=3000),
 is_active boolean not null default true,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index products_sku_unique on public.products(lower(trim(sku)));
create index products_category_idx on public.products(category_id);
create index products_active_name_idx on public.products(is_active,name);
create table public.product_materials (
 id uuid primary key default gen_random_uuid(),
 product_id uuid not null references public.products(id) on delete restrict,
 material_id uuid not null references public.materials(id) on delete restrict,
 estimated_quantity numeric not null check(estimated_quantity>0 and estimated_quantity<'Infinity'::numeric),
 notes text check(length(notes)<=1000),
 is_active boolean not null default true,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(product_id,material_id)
);
create index product_materials_material_idx on public.product_materials(material_id);
create table public.product_images (
 id uuid primary key default gen_random_uuid(),
 product_id uuid not null references public.products(id) on delete restrict,
 path text not null check(path ~ '^products/[a-f0-9-]+/[a-f0-9-]+\.webp$'),
 caption text not null default '' check(length(caption)<=300),
 is_main boolean not null default false, is_active boolean not null default true,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index product_images_product_idx on public.product_images(product_id);
create index product_images_path_idx on public.product_images(path);
create unique index product_images_main_unique on public.product_images(product_id) where is_main and is_active;
create table public.exchange_rates (
 id uuid primary key default gen_random_uuid(),
 source text not null check(source='BCCR via tipodecambio.paginasweb.cr'),
 rate_date date not null unique, sell_rate numeric not null check(sell_rate>0 and sell_rate<'Infinity'::numeric),
 fetched_at timestamptz not null default now(),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index exchange_rates_latest_idx on public.exchange_rates(rate_date desc);

create function private.catalog_stamp() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if TG_OP='UPDATE' then
   if new.id<>old.id or new.created_at<>old.created_at then raise exception 'Immutable identity'; end if;
 end if;
 new.updated_at:=now();
 return new;
end; $$;
create function private.audit_catalog() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 insert into public.audit_log(user_id,action,entity_type,entity_id,metadata)
 values(auth.uid(),TG_TABLE_NAME||'.'||lower(TG_OP),TG_TABLE_NAME,new.id,
   jsonb_build_object('before',case when TG_OP='UPDATE' then to_jsonb(old) else null end,'after',to_jsonb(new)));
 return new;
end; $$;
revoke all on function private.catalog_stamp(),private.audit_catalog() from public,anon,authenticated;

do $$
declare t text; guard text;
begin
 foreach t in array array['settings','clients','product_categories','materials','material_costs','products','product_materials','product_images','exchange_rates'] loop
   execute format('alter table public.%I enable row level security',t);
   execute format('revoke all on public.%I from public,anon,authenticated',t);
   guard:=case when t in ('settings','material_costs','exchange_rates') then 'private.is_admin()' else 'private.is_active()' end;
   execute format('grant select on public.%I to authenticated',t);
   execute format('create policy %I on public.%I for select to authenticated using ((select %s))',t||'_read',t,guard);
   if t<>'exchange_rates' then
     execute format('grant insert,update on public.%I to authenticated',t);
     execute format('create policy %I on public.%I for insert to authenticated with check ((select %s))',t||'_insert',t,guard);
     execute format('create policy %I on public.%I for update to authenticated using ((select %s)) with check ((select %s))',t||'_update',t,guard,guard);
   end if;
   execute format('create trigger catalog_stamp before update on public.%I for each row execute function private.catalog_stamp()',t);
   execute format('create trigger catalog_audit after insert or update on public.%I for each row execute function private.audit_catalog()',t);
 end loop;
end; $$;
-- Solo el servicio del servidor puede guardar cotizaciones verificadas.
grant select,insert,update on public.exchange_rates to service_role;
-- Las imágenes se registran exclusivamente tras validar bytes en servidor.
revoke insert on public.product_images from authenticated;
revoke update on public.product_images from authenticated;
grant update(caption,is_main,is_active) on public.product_images to authenticated;
grant select,insert on public.product_images to service_role;
-- Logo solo servidor; el resto de settings mantiene RLS Admin.
revoke update on public.settings from authenticated;
grant update(business_name,phone,email,deposit_percentage,hourly_rate) on public.settings to authenticated;
grant select,update(logo_path) on public.settings to service_role;

create function public.save_material(
 target_id uuid, material_code text, material_name text, material_category text,
 material_unit text, minimum numeric, enabled boolean, cost numeric default null, cost_currency text default 'CRC'
) returns uuid language plpgsql security invoker set search_path='' as $$
declare result uuid;
begin
 if not private.is_active() then raise exception 'Forbidden' using errcode='42501'; end if;
 if cost is not null and not private.is_admin() then raise exception 'Forbidden' using errcode='42501'; end if;
 if target_id is null then
  insert into public.materials(code,name,category,unit,min_stock,is_active)
    values(material_code,material_name,material_category,material_unit,minimum,enabled) returning id into result;
 else
  update public.materials set code=material_code,name=material_name,category=material_category,
    unit=material_unit,min_stock=minimum,is_active=enabled where id=target_id returning id into result;
 end if;
 if result is null then raise exception 'Material unavailable'; end if;
 if cost is not null then
  insert into public.material_costs(material_id,amount,currency) values(result,cost,cost_currency)
    on conflict(material_id) do update set amount=excluded.amount,currency=excluded.currency;
 end if;
 return result;
end; $$;
create function public.duplicate_product(source_id uuid,new_sku text,new_name text)
returns uuid language plpgsql security invoker set search_path='' as $$
declare result uuid;
begin
 if not private.is_active() then raise exception 'Forbidden' using errcode='42501'; end if;
 insert into public.products(sku,name,category_id,description,base_price,estimated_minutes,is_customizable,customization_notes)
 select new_sku,new_name,category_id,description,base_price,estimated_minutes,is_customizable,customization_notes
 from public.products where id=source_id returning id into result;
 if result is null then raise exception 'Product unavailable'; end if;
 insert into public.product_materials(product_id,material_id,estimated_quantity,notes)
 select result,material_id,estimated_quantity,notes from public.product_materials where product_id=source_id and is_active;
 -- Las fotos se mantienen como referencias al mismo archivo privado, sin copiar ni borrar bytes.
 perform private.copy_product_images(source_id,result);
 return result;
end; $$;
create function private.copy_product_images(source_id uuid,target_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not private.is_active() then raise exception 'Forbidden' using errcode='42501'; end if;
 insert into public.product_images(product_id,path,caption,is_main)
 select target_id,path,caption,is_main from public.product_images where product_id=source_id and is_active;
end; $$;
create function private.business_brand() returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('business_name',business_name,'logo_path',logo_path)
 from public.settings where private.is_active();
$$;
create function public.business_brand() returns jsonb
language sql stable security invoker set search_path='' as $$ select private.business_brand(); $$;
revoke all on function public.save_material(uuid,text,text,text,text,numeric,boolean,numeric,text),
 public.duplicate_product(uuid,text,text),private.copy_product_images(uuid,uuid),
 private.business_brand(),public.business_brand() from public,anon,authenticated;
grant execute on function public.save_material(uuid,text,text,text,text,numeric,boolean,numeric,text),
 public.duplicate_product(uuid,text,text),private.copy_product_images(uuid,uuid),
 private.business_brand(),public.business_brand() to authenticated;

insert into public.settings(business_name,phone,email) values('caffi crochet','83639663','carolinaserranorodriguez@gmail.com');
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('catalog-images','catalog-images',false,5242880,array['image/webp']);
-- Uploads vía servidor validan imagen real; sin políticas cliente de escritura/borrado.
create policy catalog_images_read on storage.objects for select to authenticated
 using(bucket_id='catalog-images' and (select private.is_active()) and (
 exists(select 1 from public.product_images i where i.path=name and i.is_active)
 or name=(select public.business_brand()->>'logo_path')
 ));
-- Registro de archivos validado por servidor, con actor real en auditoría.
grant usage on schema private to service_role;
create function private.register_catalog_image(actor uuid,product uuid,object_path text,caption_text text,is_logo boolean)
returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid; actor_role text;
begin
 select role into actor_role from public.profiles where id=actor and status='active';
 if actor_role is null or (is_logo and actor_role<>'admin') then raise exception 'Forbidden' using errcode='42501'; end if;
 perform set_config('request.jwt.claim.sub',actor::text,true);
 if is_logo then
  update public.settings set logo_path=object_path returning id into result;
 else
  insert into public.product_images(product_id,path,caption,is_main)
   values(product,object_path,caption_text,false) returning id into result;
 end if;
 return result;
end; $$;
create function public.register_catalog_image(actor uuid,product uuid,object_path text,caption_text text,is_logo boolean)
returns uuid language sql security invoker set search_path='' as $$
 select private.register_catalog_image(actor,product,object_path,caption_text,is_logo);
$$;
revoke all on function private.register_catalog_image(uuid,uuid,text,text,boolean),
 public.register_catalog_image(uuid,uuid,text,text,boolean) from public,anon,authenticated;
grant execute on function private.register_catalog_image(uuid,uuid,text,text,boolean),
 public.register_catalog_image(uuid,uuid,text,text,boolean) to service_role;
create function public.set_main_image(image_id uuid) returns void
language plpgsql security invoker set search_path='' as $$
declare target uuid;
begin
 if not private.is_active() then raise exception 'Forbidden' using errcode='42501'; end if;
 select product_id into target from public.product_images where id=image_id and is_active;
 if target is null then raise exception 'Image unavailable'; end if;
 perform 1 from public.products where id=target for update;
 update public.product_images set is_main=false where product_id=target and is_main;
 update public.product_images set is_main=true where id=image_id and is_active;
end; $$;
revoke all on function public.set_main_image(uuid) from public,anon,authenticated;
grant execute on function public.set_main_image(uuid) to authenticated;
commit;
