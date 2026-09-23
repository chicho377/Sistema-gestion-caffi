-- Fase 3A solamente: cotizaciones; ningún consecutivo, confirmación o pago.
begin;
create domain public.quote_money as numeric check(value >= 0 and value < 'Infinity'::numeric and scale(value)<=2);
create table public.orders (
 id uuid primary key default gen_random_uuid(),
 client_id uuid not null references public.clients(id) on delete restrict,
 client_snapshot jsonb not null,
 order_date date not null, requested_delivery_date date not null check(requested_delivery_date>=order_date),
 production_status text not null default 'quote' check(production_status in ('quote','cancelled')),
 currency text not null default 'CRC' check(currency='CRC'),
 subtotal public.quote_money not null default 0, discount_amount public.quote_money not null default 0,
 total public.quote_money not null default 0, check(discount_amount<=subtotal and total=subtotal-discount_amount),
 order_number text check(order_number is null), confirmed_at timestamptz check(confirmed_at is null),
 delivered_at timestamptz check(delivered_at is null),
 zero_total_authorized_by uuid references public.profiles(id) on delete restrict check(zero_total_authorized_by is null),
 zero_total_authorized_at timestamptz check(zero_total_authorized_at is null),
 zero_total_reason text check(zero_total_reason is null),
 notes text not null default '' check(length(notes)<=3000),
 revision integer not null default 1 check(revision>0),
 created_by uuid not null references public.profiles(id) on delete restrict,
 updated_by uuid not null references public.profiles(id) on delete restrict,
 cancelled_by uuid references public.profiles(id) on delete restrict,
 cancelled_at timestamptz, cancel_reason text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check((production_status='quote' and cancelled_at is null and cancelled_by is null and cancel_reason is null)
 or (production_status='cancelled' and cancelled_at is not null and cancelled_by is not null and length(trim(cancel_reason)) between 1 and 1000))
);
create table public.order_items (
 id uuid primary key default gen_random_uuid(), order_id uuid not null references public.orders(id) on delete restrict,
 product_id uuid references public.products(id) on delete restrict,
 product_sku_snapshot text, product_name_snapshot text not null check(length(trim(product_name_snapshot)) between 1 and 120),
 description_snapshot text not null default '' check(length(description_snapshot)<=3000),
 quantity integer not null check(quantity>0), unit_price public.quote_money not null,
 discount_amount public.quote_money not null default 0, line_total public.quote_money not null,
 customization text not null default '' check(length(customization)<=3000), notes text not null default '' check(length(notes)<=3000),
 is_active boolean not null default true,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check(discount_amount<=quantity::numeric*unit_price and line_total=round(quantity::numeric*unit_price-discount_amount,2)),
 unique(order_id,id)
);
create table public.order_files (
 id uuid primary key default gen_random_uuid(), order_id uuid not null references public.orders(id) on delete restrict,
 path text not null unique, caption text not null default '' check(length(caption)<=300),
 mime_type text not null default 'image/webp' check(mime_type='image/webp'),
 byte_size integer not null check(byte_size between 1 and 5242880),
 uploaded_by uuid not null references public.profiles(id) on delete restrict,
 is_active boolean not null default true,
 replaces_id uuid references public.order_files(id) on delete restrict,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check(path ~ '^orders/[a-f0-9-]{36}/[a-f0-9-]{36}\.webp$')
);
create index orders_client_idx on public.orders(client_id);
create index orders_delivery_idx on public.orders(production_status,requested_delivery_date);
create index orders_created_idx on public.orders(created_at desc,id);
create index orders_creator_idx on public.orders(created_by);
create index orders_updater_idx on public.orders(updated_by);
create index orders_canceller_idx on public.orders(cancelled_by);
create index orders_zero_actor_idx on public.orders(zero_total_authorized_by);
create index order_items_product_idx on public.order_items(product_id);
create index order_files_order_idx on public.order_files(order_id);
create index order_files_actor_idx on public.order_files(uploaded_by);
create index order_files_replaces_idx on public.order_files(replaces_id);

-- Solo RPC puede escribir. Auditoría before/after incluye cambios de líneas y totales.
do $$ declare t text; begin
 foreach t in array array['orders','order_items','order_files'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated,service_role',t);
 execute format('grant select on public.%I to authenticated',t);
 execute format('create policy %I on public.%I for select to authenticated using ((select private.is_active()))',t||'_read',t);
 execute format('create trigger quote_audit after insert or update on public.%I for each row execute function private.audit_catalog()',t);
 end loop;
end $$;

-- Vistas de lectura conservan valores exactos como texto en JSON/JavaScript.
create view public.quotes_read with (security_invoker=true) as
 select id,client_id,client_snapshot,order_date,requested_delivery_date,production_status,currency,
 subtotal::text,discount_amount::text,total::text,order_number,confirmed_at,delivered_at,notes,revision,
 created_by,updated_by,cancelled_by,cancelled_at,cancel_reason,created_at,updated_at from public.orders;
create view public.quote_items_read with (security_invoker=true) as
 select id,order_id,product_id,product_sku_snapshot,product_name_snapshot,description_snapshot,quantity,
 unit_price::text,discount_amount::text,line_total::text,customization,notes,is_active,created_at,updated_at from public.order_items;
create view public.quote_products_read with (security_invoker=true) as
 select id,sku,name,description,base_price::text,is_active from public.products;
revoke all on public.quotes_read,public.quote_items_read,public.quote_products_read from public,anon,authenticated,service_role;
grant select on public.quotes_read,public.quote_items_read,public.quote_products_read to authenticated;

create function private.quote_input_money(v text) returns numeric
language plpgsql immutable security invoker set search_path='' as $$
begin
 if v is null or length(v)>100 or v !~ '^[0-9]+(\.[0-9]{1,2})?$' then
 raise exception 'Importe inválido: máximo dos decimales' using errcode='22023'; end if;
 return v::numeric;
end $$;

create function private.save_quote(target uuid, expected_revision integer, payload jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare o public.orders; c public.clients; p public.products; old_line public.order_items;
 item jsonb; lid uuid; pid uuid; qty integer; price numeric; disc numeric; line_sum numeric; sub numeric:=0;
 general numeric; seen uuid[]:='{}'; day date:=(now() at time zone 'America/Costa_Rica')::date;
 od date; rd date; name_text text; sku_text text; description_text text; fresh boolean;
begin
 if not private.is_active() then raise exception 'Forbidden' using errcode='42501'; end if;
 -- Bloqueo de perfil evita que una inactivación simultánea pase inadvertida durante escritura.
 perform 1 from public.profiles where id=auth.uid() and status='active' for share;
 if not found then raise exception 'Forbidden' using errcode='42501'; end if;
 if target is null or expected_revision is null or jsonb_typeof(payload)<>'object' or
 (payload-array['client_id','order_date','requested_delivery_date','discount_amount','notes','items'])<>'{}'::jsonb
 or jsonb_typeof(payload->'items') is distinct from 'array' then raise exception 'Datos inválidos' using errcode='22023'; end if;
 select * into o from public.orders where id=target for update;
 fresh:=not found;
 if (fresh and expected_revision<>0) or (not fresh and (o.revision<>expected_revision or o.production_status<>'quote')) then
 raise exception 'La cotización cambió o ya fue cancelada. Recarga antes de guardar.' using errcode='40001'; end if;
 if payload->>'order_date' !~ '^\d{4}-\d{2}-\d{2}$' or payload->>'requested_delivery_date' !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Fecha inválida' using errcode='22023'; end if;
 od:=(payload->>'order_date')::date; rd:=(payload->>'requested_delivery_date')::date;
 if od is null or rd is null or od>day or rd<od or
 ((fresh or od is distinct from o.order_date) and od<day and not private.is_admin()) then
 raise exception 'Fecha no autorizada' using errcode='22023'; end if;
 general:=private.quote_input_money(payload->>'discount_amount');
 select * into c from public.clients where id=(payload->>'client_id')::uuid for share;
 if not found or ((fresh or c.id is distinct from o.client_id) and not c.is_active and not(private.is_admin() and od<day)) then
 raise exception 'Cliente no disponible' using errcode='22023'; end if;
 if fresh then
 insert into public.orders(id,client_id,client_snapshot,order_date,requested_delivery_date,created_by,updated_by,notes)
 values(target,c.id,jsonb_build_object('name',c.name,'phone',c.phone,'email',c.email),od,rd,auth.uid(),auth.uid(),coalesce(payload->>'notes',''));
 end if;
 for item in select value from jsonb_array_elements(payload->'items') loop
 if jsonb_typeof(item)<>'object' or (item-array['id','product_id','product_name_snapshot','description_snapshot','quantity','unit_price','discount_amount','customization','notes','is_active'])<>'{}'::jsonb then
 raise exception 'Línea inválida' using errcode='22023'; end if;
 lid:=coalesce(nullif(item->>'id','')::uuid,gen_random_uuid());
 if lid=any(seen) then raise exception 'Línea repetida' using errcode='22023'; end if;
 seen:=array_append(seen,lid);
 select * into old_line from public.order_items where id=lid;
 if found and old_line.order_id<>target then raise exception 'Línea de otro pedido' using errcode='42501'; end if;
 if item->>'quantity' is null or item->>'quantity' !~ '^[1-9][0-9]*$' or length(item->>'quantity')>10 then raise exception 'Cantidad entera positiva requerida' using errcode='22023'; end if;
 qty:=(item->>'quantity')::integer;
 price:=private.quote_input_money(item->>'unit_price'); disc:=private.quote_input_money(item->>'discount_amount');
 if disc>qty::numeric*price then raise exception 'Descuento superior a la línea' using errcode='22023'; end if;
 if jsonb_typeof(item->'is_active') is distinct from 'boolean' then raise exception 'Estado de línea inválido' using errcode='22023'; end if;
 pid:=nullif(item->>'product_id','')::uuid;
 if pid is not null then
 if old_line.id is null or old_line.product_id is distinct from pid then
 select * into p from public.products where id=pid for share;
 if not found or (not p.is_active and not(private.is_admin() and od<day)) then raise exception 'Producto no disponible' using errcode='22023'; end if;
 name_text:=p.name; sku_text:=p.sku; description_text:=coalesce(p.description,'');
 else name_text:=old_line.product_name_snapshot; sku_text:=old_line.product_sku_snapshot; description_text:=old_line.description_snapshot;
 end if;
 else name_text:=trim(item->>'product_name_snapshot'); sku_text:=null; description_text:=coalesce(item->>'description_snapshot',''); end if;
 line_sum:=round(qty::numeric*price-disc,2);
 insert into public.order_items(id,order_id,product_id,product_sku_snapshot,product_name_snapshot,description_snapshot,quantity,unit_price,discount_amount,line_total,customization,notes,is_active)
 values(lid,target,pid,sku_text,name_text,description_text,qty,price,disc,line_sum,coalesce(item->>'customization',''),coalesce(item->>'notes',''),(item->>'is_active')::boolean)
 on conflict(id) do update set product_id=excluded.product_id,product_sku_snapshot=excluded.product_sku_snapshot,
 product_name_snapshot=excluded.product_name_snapshot,description_snapshot=excluded.description_snapshot,quantity=excluded.quantity,
 unit_price=excluded.unit_price,discount_amount=excluded.discount_amount,line_total=excluded.line_total,
 customization=excluded.customization,notes=excluded.notes,is_active=excluded.is_active,updated_at=now()
 where public.order_items.order_id=target;
 if not found then raise exception 'Línea de otro pedido' using errcode='42501'; end if;
 if (item->>'is_active')::boolean then sub:=sub+line_sum; end if;
 end loop;
 -- Omitir una fila histórica no equivale a borrarla: se exige desactivación explícita.
 if exists(select 1 from public.order_items where order_id=target and not(id=any(seen))) then raise exception 'Conserva todas las líneas; desactiva las que no apliquen' using errcode='22023'; end if;
 if general>sub then raise exception 'Descuento superior al subtotal' using errcode='22023'; end if;
 update public.orders set client_id=c.id,client_snapshot=case when fresh or c.id is distinct from o.client_id then
 jsonb_build_object('name',c.name,'phone',c.phone,'email',c.email) else o.client_snapshot end,
 order_date=od,requested_delivery_date=rd,notes=coalesce(payload->>'notes',''),subtotal=sub,discount_amount=general,total=round(sub-general,2),
 revision=case when fresh then 1 else o.revision+1 end,updated_by=auth.uid(),updated_at=now() where id=target;
 return target;
end $$;
create function public.save_quote(target uuid,expected_revision integer,payload jsonb) returns uuid
language sql security invoker set search_path='' as $$ select private.save_quote(target,expected_revision,payload) $$;

create function private.cancel_quote(target uuid,expected_revision integer,reason text) returns void
language plpgsql security definer set search_path='' as $$
declare o public.orders;
begin
 if not private.is_active() then raise exception 'Forbidden' using errcode='42501'; end if;
 perform 1 from public.profiles where id=auth.uid() and status='active' for share;
 if not found then raise exception 'Forbidden' using errcode='42501'; end if;
 if reason is null or length(trim(reason)) not between 1 and 1000 then raise exception 'Motivo obligatorio' using errcode='22023'; end if;
 select * into o from public.orders where id=target for update;
 if not found or o.production_status<>'quote' or o.revision is distinct from expected_revision then raise exception 'La cotización cambió. Recarga.' using errcode='40001'; end if;
 update public.orders set production_status='cancelled',cancel_reason=trim(reason),cancelled_by=auth.uid(),cancelled_at=now(),updated_by=auth.uid(),updated_at=now(),revision=revision+1 where id=target;
 insert into public.audit_log(user_id,action,entity_type,entity_id,reason,metadata) values(auth.uid(),'quote.cancelled','orders',target,trim(reason),jsonb_build_object('before',o.production_status,'after','cancelled'));
end $$;
create function public.cancel_quote(target uuid,expected_revision integer,reason text) returns void
language sql security invoker set search_path='' as $$ select private.cancel_quote(target,expected_revision,reason) $$;

-- Registro exclusivo servidor tras validar y recodificar bytes; nunca acceso administrativo en frontend.
create function private.register_order_file(actor uuid,target uuid,object_path text,caption_text text,size_bytes integer,replaces uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare result uuid; o public.orders;
begin
 perform 1 from public.profiles where id=actor and status='active' for share;
 if not found then raise exception 'Forbidden' using errcode='42501'; end if;
 select * into o from public.orders where id=target for update;
 if not found or o.production_status<>'quote' then raise exception 'Cotización no disponible' using errcode='42501'; end if;
 if split_part(object_path,'/',2)<>target::text or not exists(select 1 from storage.objects where bucket_id='order-references' and name=object_path) then raise exception 'Archivo inválido'; end if;
 if replaces is not null and not exists(select 1 from public.order_files where id=replaces and order_id=target and is_active) then raise exception 'Versión inválida'; end if;
 if replaces is not null then update public.order_files set is_active=false,updated_at=now() where id=replaces; end if;
 insert into public.order_files(order_id,path,caption,byte_size,uploaded_by,replaces_id) values(target,object_path,caption_text,size_bytes,actor,replaces) returning id into result;
 insert into public.audit_log(user_id,action,entity_type,entity_id,metadata) values(actor,'quote.file_registered','order_files',result,jsonb_build_object('order_id',target,'replaces_id',replaces));
 return result;
end $$;
create function public.register_order_file(actor uuid,target uuid,object_path text,caption_text text,size_bytes integer,replaces uuid default null) returns uuid
language sql security invoker set search_path='' as $$ select private.register_order_file(actor,target,object_path,caption_text,size_bytes,replaces) $$;
revoke all on function private.quote_input_money(text),private.save_quote(uuid,integer,jsonb),public.save_quote(uuid,integer,jsonb),private.cancel_quote(uuid,integer,text),public.cancel_quote(uuid,integer,text),private.register_order_file(uuid,uuid,text,text,integer,uuid),public.register_order_file(uuid,uuid,text,text,integer,uuid) from public,anon,authenticated,service_role;
grant execute on function private.save_quote(uuid,integer,jsonb),public.save_quote(uuid,integer,jsonb),private.cancel_quote(uuid,integer,text),public.cancel_quote(uuid,integer,text) to authenticated;
grant usage on schema private to service_role;
grant execute on function private.register_order_file(uuid,uuid,text,text,integer,uuid),public.register_order_file(uuid,uuid,text,text,integer,uuid) to service_role;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('order-references','order-references',false,5242880,array['image/webp']);
create policy order_references_read on storage.objects for select to authenticated using (
 bucket_id='order-references' and (select private.is_active()) and exists(select 1 from public.order_files f where f.path=name)
);
-- Sin políticas de upload/update/delete de cliente. Versiones previas se conservan y siguen consultables.
commit;
