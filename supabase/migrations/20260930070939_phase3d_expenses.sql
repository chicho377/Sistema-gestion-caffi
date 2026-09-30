-- Solo 3D. Objetos nuevos; no modifica contratos aplicados ni datos históricos.
begin;
create table public.expense_categories(
 id uuid primary key default gen_random_uuid(),name text not null check(length(trim(name)) between 1 and 100),
 description text check(length(description)<=1000),is_active boolean not null default true,
 revision integer not null default 1 check(revision>0),created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp()
);
create unique index expense_categories_name_unique on public.expense_categories(lower(regexp_replace(trim(name),'\s+',' ','g')));
create table public.expenses(
 id uuid primary key,category_id uuid not null references public.expense_categories(id) on delete restrict,
 order_id uuid references public.orders(id) on delete restrict,order_item_id uuid,
 amount public.quote_money not null check(amount>0),currency text not null check(currency in ('CRC','USD')),
 expense_date timestamptz not null check(isfinite(expense_date)),
 exchange_rate_applied numeric,exchange_rate_date date,exchange_rate_source text,
 rate_override_reason text,rate_provided_by uuid references public.profiles(id) on delete restrict,rate_provided_at timestamptz,
 rate_is_fallback boolean not null default false,amount_crc public.quote_money not null check(amount_crc>0),
 description text not null check(length(trim(description)) between 1 and 3000),notes text check(length(notes)<=3000),
 payment_method text check(payment_method in ('cash','sinpe_movil','transfer','card','other')),supplier text check(length(supplier)<=300),
 status text not null default 'valid' check(status in ('valid','voided')),is_historical boolean not null,
 created_by uuid not null references public.profiles(id) on delete restrict,updated_by uuid not null references public.profiles(id) on delete restrict,
 voided_by uuid references public.profiles(id) on delete restrict,voided_at timestamptz,void_reason text,
 revision integer not null default 1 check(revision>0),created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 constraint expenses_line_parent check(order_item_id is null or order_id is not null),
 constraint expenses_order_line_fk foreign key(order_id,order_item_id) references public.order_items(order_id,id) on delete restrict,
 constraint expenses_money_evidence check((case when currency='CRC' then amount_crc=amount and exchange_rate_applied is null and exchange_rate_date is null and exchange_rate_source is null and not rate_is_fallback and rate_provided_by is null else exchange_rate_applied>0 and exchange_rate_applied<'Infinity'::numeric and exchange_rate_date is not null and isfinite(exchange_rate_date) and length(trim(exchange_rate_source)) between 1 and 300 and amount_crc=round(amount*exchange_rate_applied,2) and exchange_rate_date<=(expense_date at time zone 'America/Costa_Rica')::date and (rate_is_fallback=(exchange_rate_date<(expense_date at time zone 'America/Costa_Rica')::date)) and (not is_historical or not rate_is_fallback) end) is true),
 constraint expenses_rate_override check((case when rate_provided_by is null then rate_provided_at is null and rate_override_reason is null else currency='USD' and is_historical and rate_provided_at is not null and isfinite(rate_provided_at) and length(trim(rate_override_reason)) between 1 and 1000 and not rate_is_fallback end) is true),
 constraint expenses_chronology check(isfinite(created_at) and isfinite(updated_at) and expense_date<=created_at and updated_at>=created_at),
 constraint expenses_void_evidence check((case when status='valid' then voided_by is null and voided_at is null and void_reason is null else voided_by is not null and voided_at is not null and isfinite(voided_at) and voided_at>=created_at and length(trim(void_reason)) between 1 and 1000 end) is true)
);
create index expenses_creator_date_idx on public.expenses(created_by,expense_date desc,id);
create index expenses_date_status_idx on public.expenses(expense_date desc,status,id);
create index expenses_category_idx on public.expenses(category_id);
create index expenses_order_idx on public.expenses(order_id,order_item_id);
create index expenses_line_idx on public.expenses(order_item_id);
create index expenses_updater_idx on public.expenses(updated_by);
create index expenses_voider_idx on public.expenses(voided_by);
create index expenses_rate_actor_idx on public.expenses(rate_provided_by);
create table public.expense_files(
 id uuid primary key default gen_random_uuid(),expense_id uuid not null references public.expenses(id) on delete restrict,
 path text not null unique,caption text not null default '' check(length(caption)<=300),
 mime_type text not null default 'image/webp' check(mime_type='image/webp'),byte_size integer not null check(byte_size between 1 and 5242880),
 uploaded_by uuid not null references public.profiles(id) on delete restrict,is_active boolean not null default true,
 replaces_id uuid references public.expense_files(id) on delete restrict,
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 constraint expense_files_path check(path ~ ('^expenses/'||expense_id::text||'/[0-9a-f-]{36}\.webp$'))
);
create index expense_files_parent_idx on public.expense_files(expense_id,created_at,id);
create index expense_files_uploader_idx on public.expense_files(uploaded_by);
create unique index expense_files_replacement_unique on public.expense_files(replaces_id) where replaces_id is not null;
alter table public.expense_categories enable row level security;
alter table public.expenses enable row level security;
alter table public.expense_files enable row level security;
revoke all on public.expense_categories,public.expenses,public.expense_files from public,anon,authenticated,service_role;
grant select on public.expense_categories,public.expenses,public.expense_files to authenticated;
create policy expenses_read on public.expenses for select to authenticated using ((select private.is_active()) and ((select private.is_admin()) or created_by=(select auth.uid())));
create policy expense_categories_read on public.expense_categories for select to authenticated using ((select private.is_active()) and (is_active or (select private.is_admin()) or exists(select 1 from public.expenses e where e.category_id=expense_categories.id)));
create policy expense_files_read on public.expense_files for select to authenticated using ((select private.is_active()) and exists(select 1 from public.expenses e where e.id=expense_id));

create function private.expense_actor() returns uuid language plpgsql security invoker set search_path='' as $$
begin
 perform 1 from public.profiles where id=auth.uid() and status='active' for share;
 if not found then raise exception 'Acceso no autorizado' using errcode='42501';end if;return auth.uid();
end $$;
create function private.lock_expense(target uuid,expected_revision integer) returns public.expenses language plpgsql security invoker set search_path='' as $$
declare e public.expenses;begin
 perform private.expense_actor();
 select * into e from public.expenses where id=target and (created_by=auth.uid() or private.is_admin()) for update;
 if not found then raise exception 'Gasto no disponible' using errcode='42501';end if;
 if expected_revision is null or expected_revision<1 then raise exception 'Revisión inválida' using errcode='22023';end if;
 if e.revision<>expected_revision or e.status<>'valid' then raise exception 'El gasto cambió o fue anulado. Recarga antes de continuar.' using errcode='PT409';end if;
 return e;
end $$;
create function private.guard_expense() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if tg_op='DELETE' then raise exception 'No se permite borrar gastos' using errcode='42501';end if;
 if not private.is_active() then raise exception 'Acceso no autorizado' using errcode='42501';end if;
 if tg_op='INSERT' then
  if new.created_by is distinct from auth.uid() or new.updated_by is distinct from auth.uid() or new.status<>'valid' or new.expense_date>clock_timestamp() then raise exception 'Gasto no autorizado' using errcode='42501';end if;
  new.created_at:=clock_timestamp();new.updated_at:=new.created_at;
  new.is_historical:=(new.expense_date at time zone 'America/Costa_Rica')::date<(new.created_at at time zone 'America/Costa_Rica')::date;
  if new.is_historical and not private.is_admin() then raise exception 'Históricos solo Administración' using errcode='42501';end if;
 else
  if old.status<>'valid' or (old.created_by<>auth.uid() and not private.is_admin()) or new.updated_by is distinct from auth.uid() or new.revision<>old.revision+1 or
   (to_jsonb(new)-array['description','notes','updated_by','updated_at','revision','status','voided_by','voided_at','void_reason']) is distinct from (to_jsonb(old)-array['description','notes','updated_by','updated_at','revision','status','voided_by','voided_at','void_reason']) then raise exception 'Datos originales inmutables' using errcode='42501';end if;
  if new.status='voided' then
   if not private.is_admin() or new.voided_by is distinct from auth.uid() or new.description is distinct from old.description or new.notes is distinct from old.notes then raise exception 'Anulación solo Administración, sin alterar original' using errcode='42501';end if;
   new.voided_at:=clock_timestamp();
  end if;
  new.updated_at:=clock_timestamp();
 end if;return new;
end $$;
create trigger expense_guard before insert or update or delete on public.expenses for each row execute function private.guard_expense();
create function private.audit_expense() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.audit_log(user_id,action,entity_type,entity_id,reason,metadata) values(auth.uid(),case when tg_op='INSERT' then 'expense.created' when new.status='voided' then 'expense.voided' else 'expense.updated' end,'expenses',new.id,coalesce(new.void_reason,new.rate_override_reason),jsonb_build_object('before',case when tg_op='UPDATE' then to_jsonb(old) else null end,'after',to_jsonb(new)));
 return new;
end $$;
create trigger expense_audit after insert or update on public.expenses for each row execute function private.audit_expense();
create trigger expense_category_audit after insert or update on public.expense_categories for each row execute function private.audit_catalog();

create function private.save_expense_category(target uuid,expected_revision integer,payload jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare c public.expense_categories;begin
 perform private.expense_actor();if not private.is_admin() then raise exception 'Solo Administración' using errcode='42501';end if;
 if target is null or expected_revision is null or expected_revision<0 or payload is null or jsonb_typeof(payload)<>'object' or payload-array['name','description','is_active']<>'{}'::jsonb or jsonb_typeof(payload->'name') is distinct from 'string' or jsonb_typeof(payload->'is_active') is distinct from 'boolean' or length(trim(payload->>'name')) not between 1 and 100 or length(payload->>'description')>1000 then raise exception 'Categoría inválida' using errcode='22023';end if;
 if payload?'description' and jsonb_typeof(payload->'description') not in ('string','null') then raise exception 'Descripción inválida' using errcode='22023';end if;
 select * into c from public.expense_categories where id=target for update;
 if found then
  if c.revision<>expected_revision then raise exception 'La categoría cambió. Recarga.' using errcode='PT409';end if;
  update public.expense_categories set name=trim(payload->>'name'),description=nullif(trim(payload->>'description'),''),is_active=(payload->>'is_active')::boolean,revision=revision+1,updated_at=clock_timestamp() where id=target;
 else
  if expected_revision<>0 then raise exception 'Categoría no disponible' using errcode='PT409';end if;
  insert into public.expense_categories(id,name,description,is_active) values(target,trim(payload->>'name'),nullif(trim(payload->>'description'),''),(payload->>'is_active')::boolean);
 end if;return target;
exception when unique_violation then raise exception 'Ya existe una categoría con ese nombre o registro. Consulta las categorías existentes.' using errcode='PT409';
end $$;

-- Proyección operativa acotada: no concede acceso a toda exchange_rates.
create function private.expense_rate(day date) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.exchange_rates;today date:=(clock_timestamp() at time zone 'America/Costa_Rica')::date;begin
 perform private.expense_actor();
 if day is null or not isfinite(day) or day>today or (day<today and not private.is_admin()) then raise exception 'Fecha no autorizada' using errcode='22023';end if;
 select * into r from public.exchange_rates where rate_date=day and sell_rate>0 and sell_rate<'Infinity'::numeric;
 if not found and day=today then select * into r from public.exchange_rates where rate_date<=today and sell_rate>0 and sell_rate<'Infinity'::numeric order by rate_date desc limit 1;end if;
 if r.id is null then return null;end if;
 return jsonb_build_object('rate',r.sell_rate::text,'date',r.rate_date,'source',r.source,'fallback',r.rate_date<day);
end $$;
-- Infraestructura de servidor: únicamente respuesta validada del proveedor aprobado, nunca campos del formulario.
create function private.store_expense_exchange_rate(actor uuid,source_date date,sell text) returns void language plpgsql security definer set search_path='' as $$
declare v numeric;begin
 perform 1 from public.profiles where id=actor and status='active' for share;if not found then raise exception 'Acceso no autorizado' using errcode='42501';end if;
 if source_date is null or not isfinite(source_date) or source_date<>(clock_timestamp() at time zone 'America/Costa_Rica')::date or sell is null or length(sell)>100 or sell !~ '^\d+(\.\d+)?$' then raise exception 'Tasa del proveedor inválida' using errcode='22023';end if;
 v:=sell::numeric;if v<=0 then raise exception 'Tasa positiva requerida' using errcode='22023';end if;
 perform set_config('request.jwt.claim.sub',actor::text,true);
 insert into public.exchange_rates(source,rate_date,sell_rate,fetched_at) values('BCCR via tipodecambio.paginasweb.cr',source_date,v,clock_timestamp()) on conflict(rate_date) do update set sell_rate=excluded.sell_rate,fetched_at=excluded.fetched_at;
end $$;
create function private.register_expense(target uuid,payload jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid;t timestamptz;day date;today date:=(clock_timestamp() at time zone 'America/Costa_Rica')::date;v numeric;crc numeric;r jsonb;rate numeric;rd date;src text;why text;category uuid;oid uuid;line uuid;manual boolean:=false;begin
 actor:=private.expense_actor();
 if target is null or payload is null or jsonb_typeof(payload)<>'object' or payload-array['category_id','order_id','order_item_id','amount','currency','expense_date','description','notes','payment_method','supplier','historical_rate','rate_source','rate_reason']<>'{}'::jsonb or exists(select 1 from jsonb_each(payload) e where jsonb_typeof(e.value) not in ('string','null')) then raise exception 'Datos de gasto inválidos' using errcode='22023';end if;
 v:=private.quote_input_money(payload->>'amount');if v<=0 or coalesce(payload->>'currency','') not in ('CRC','USD') then raise exception 'Monto positivo CRC/USD requerido' using errcode='22023';end if;
 t:=private.order_effective_at(payload->>'expense_date');day:=(t at time zone 'America/Costa_Rica')::date;
 category:=(payload->>'category_id')::uuid;oid:=nullif(payload->>'order_id','')::uuid;line:=nullif(payload->>'order_item_id','')::uuid;
 perform 1 from public.expense_categories where id=category and is_active for share;if not found then raise exception 'Selecciona una categoría activa' using errcode='22023';end if;
 if oid is not null then perform 1 from public.orders where id=oid for share;if not found then raise exception 'Pedido inválido' using errcode='22023';end if;end if;
 if line is not null and (oid is null or not exists(select 1 from public.order_items where id=line and order_id=oid)) then raise exception 'La línea debe pertenecer al pedido' using errcode='22023';end if;
 if payload->>'description' is null or length(trim(payload->>'description')) not between 1 and 3000 or length(payload->>'notes')>3000 or length(payload->>'supplier')>300 or (nullif(payload->>'payment_method','') is not null and payload->>'payment_method' not in ('cash','sinpe_movil','transfer','card','other')) then raise exception 'Revisa descripción, notas, proveedor y método' using errcode='22023';end if;
 if payload->>'currency'='CRC' then
  if nullif(payload->>'historical_rate','') is not null or nullif(payload->>'rate_reason','') is not null or nullif(payload->>'rate_source','') is not null then raise exception 'CRC no utiliza tasa' using errcode='22023';end if;crc:=v;
 else
  r:=private.expense_rate(day);
  if nullif(payload->>'historical_rate','') is not null or nullif(payload->>'rate_source','') is not null or nullif(payload->>'rate_reason','') is not null then
   if not private.is_admin() then raise exception 'No puedes aportar ni modificar tasas' using errcode='42501';end if;
   if day=today or r is not null then raise exception 'Usa la tasa determinada por el sistema; aporte solo histórico sin referencia' using errcode='22023';end if;
   if payload->>'historical_rate' is null or length(payload->>'historical_rate')>100 or payload->>'historical_rate' !~ '^\d+(\.\d+)?$' then raise exception 'Tasa histórica inválida' using errcode='22023';end if;
   rate:=(payload->>'historical_rate')::numeric;why:=private.order_reason(payload->>'rate_reason');src:=trim(payload->>'rate_source');
   if rate<=0 or src is null or length(src) not between 1 and 300 then raise exception 'Tasa y procedencia obligatorias' using errcode='22023';end if;rd:=day;manual:=true;
  else
   if r is null then raise exception 'No hay tasa válida para registrar este gasto USD. Los históricos sin referencia requieren aporte Admin.' using errcode='22023';end if;
   rate:=(r->>'rate')::numeric;rd:=(r->>'date')::date;src:=r->>'source';
  end if;crc:=round(v*rate,2);if crc<=0 then raise exception 'El equivalente CRC debe ser mayor que cero' using errcode='22023';end if;
 end if;
 insert into public.expenses(id,category_id,order_id,order_item_id,amount,currency,expense_date,exchange_rate_applied,exchange_rate_date,exchange_rate_source,amount_crc,rate_override_reason,rate_provided_by,rate_provided_at,rate_is_fallback,description,notes,payment_method,supplier,created_by,updated_by,is_historical)
 values(target,category,oid,line,v,payload->>'currency',t,rate,rd,src,crc,why,case when manual then actor end,case when manual then clock_timestamp() end,coalesce(rd<day,false),trim(payload->>'description'),nullif(trim(payload->>'notes'),''),nullif(payload->>'payment_method',''),nullif(trim(payload->>'supplier'),''),actor,actor,day<today);
 return target;
exception when unique_violation then raise exception 'El gasto ya fue registrado. Consulta antes de reintentar.' using errcode='PT409';
end $$;
create function private.edit_expense_notes(target uuid,expected_revision integer,payload jsonb) returns void language plpgsql security definer set search_path='' as $$
begin
 perform private.lock_expense(target,expected_revision);
 if payload is null or jsonb_typeof(payload)<>'object' or payload-array['description','notes']<>'{}'::jsonb or jsonb_typeof(payload->'description') is distinct from 'string' or length(trim(payload->>'description')) not between 1 and 3000 or length(payload->>'notes')>3000 or (payload?'notes' and jsonb_typeof(payload->'notes') not in ('string','null')) then raise exception 'Solo descripción y notas válidas' using errcode='22023';end if;
 update public.expenses set description=trim(payload->>'description'),notes=nullif(trim(payload->>'notes'),''),updated_by=auth.uid(),revision=revision+1 where id=target;
end $$;
create function private.void_expense(target uuid,expected_revision integer,reason text) returns void language plpgsql security definer set search_path='' as $$
declare why text;begin
 perform private.expense_actor();if not private.is_admin() then raise exception 'Solo Administración anula gastos' using errcode='42501';end if;
 perform private.lock_expense(target,expected_revision);why:=private.order_reason(reason);
 update public.expenses set status='voided',voided_by=auth.uid(),voided_at=clock_timestamp(),void_reason=why,updated_by=auth.uid(),revision=revision+1 where id=target;
end $$;
create function private.register_expense_file(actor uuid,target uuid,expected_revision integer,object_path text,caption_text text,size_bytes integer,replaces uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare e public.expenses;result uuid;previous jsonb;begin
 perform set_config('request.jwt.claim.sub',actor::text,true);e:=private.lock_expense(target,expected_revision);
 if object_path is null or object_path !~ ('^expenses/'||target::text||'/[0-9a-f-]{36}\.webp$') or not exists(select 1 from storage.objects where bucket_id='expense-receipts' and name=object_path) or size_bytes not between 1 and 5242880 or caption_text is null or length(caption_text)>300 then raise exception 'Comprobante inválido' using errcode='22023';end if;
 if replaces is not null then
  select to_jsonb(f) into previous from public.expense_files f where id=replaces and expense_id=target and is_active for update;
  update public.expense_files set is_active=false,updated_at=clock_timestamp() where id=replaces and expense_id=target and is_active;
  if not found then raise exception 'La versión cambió. Recarga antes de reemplazar.' using errcode='PT409';end if;
 end if;
 insert into public.expense_files(expense_id,path,caption,byte_size,uploaded_by,replaces_id) values(target,object_path,caption_text,size_bytes,actor,replaces) returning id into result;
 update public.expenses set updated_by=actor,revision=revision+1 where id=target;
 insert into public.audit_log(user_id,action,entity_type,entity_id,metadata) values(actor,'expense.file_registered','expense_files',result,jsonb_build_object('expense_id',target,'replaces_id',replaces,'before',previous,'after',(select to_jsonb(f) from public.expense_files f where id=result)));
 return result;
end $$;
create function public.save_expense_category(target uuid,expected_revision integer,payload jsonb) returns uuid language sql security invoker set search_path='' as $$select private.save_expense_category(target,expected_revision,payload)$$;
create function public.expense_rate(day date) returns jsonb language sql security invoker set search_path='' as $$select private.expense_rate(day)$$;
create function public.register_expense(target uuid,payload jsonb) returns uuid language sql security invoker set search_path='' as $$select private.register_expense(target,payload)$$;
create function public.edit_expense_notes(target uuid,expected_revision integer,payload jsonb) returns void language sql security invoker set search_path='' as $$select private.edit_expense_notes(target,expected_revision,payload)$$;
create function public.void_expense(target uuid,expected_revision integer,reason text) returns void language sql security invoker set search_path='' as $$select private.void_expense(target,expected_revision,reason)$$;
create function public.store_expense_exchange_rate(actor uuid,source_date date,sell text) returns void language sql security invoker set search_path='' as $$select private.store_expense_exchange_rate(actor,source_date,sell)$$;
create function public.register_expense_file(actor uuid,target uuid,expected_revision integer,object_path text,caption_text text,size_bytes integer,replaces uuid default null) returns uuid language sql security invoker set search_path='' as $$select private.register_expense_file(actor,target,expected_revision,object_path,caption_text,size_bytes,replaces)$$;
revoke all on function private.expense_actor(),private.lock_expense(uuid,integer),private.guard_expense(),private.audit_expense(),private.save_expense_category(uuid,integer,jsonb),public.save_expense_category(uuid,integer,jsonb),private.expense_rate(date),public.expense_rate(date),private.register_expense(uuid,jsonb),public.register_expense(uuid,jsonb),private.edit_expense_notes(uuid,integer,jsonb),public.edit_expense_notes(uuid,integer,jsonb),private.void_expense(uuid,integer,text),public.void_expense(uuid,integer,text),private.store_expense_exchange_rate(uuid,date,text),public.store_expense_exchange_rate(uuid,date,text),private.register_expense_file(uuid,uuid,integer,text,text,integer,uuid),public.register_expense_file(uuid,uuid,integer,text,text,integer,uuid) from public,anon,authenticated,service_role;
grant execute on function private.save_expense_category(uuid,integer,jsonb),public.save_expense_category(uuid,integer,jsonb),private.expense_rate(date),public.expense_rate(date),private.register_expense(uuid,jsonb),public.register_expense(uuid,jsonb),private.edit_expense_notes(uuid,integer,jsonb),public.edit_expense_notes(uuid,integer,jsonb),private.void_expense(uuid,integer,text),public.void_expense(uuid,integer,text) to authenticated;
grant execute on function private.store_expense_exchange_rate(uuid,date,text),public.store_expense_exchange_rate(uuid,date,text),private.register_expense_file(uuid,uuid,integer,text,text,integer,uuid),public.register_expense_file(uuid,uuid,integer,text,text,integer,uuid) to service_role;
create view public.expenses_read with(security_invoker=true) as select id,category_id,order_id,order_item_id,amount::text,currency,expense_date,exchange_rate_applied::text,exchange_rate_date,exchange_rate_source,amount_crc::text,rate_override_reason,rate_provided_by,rate_provided_at,rate_is_fallback,description,notes,payment_method,supplier,status,is_historical,created_by,updated_by,voided_by,voided_at,void_reason,revision,created_at,updated_at from public.expenses;
revoke all on public.expenses_read from public,anon,authenticated,service_role;
grant select on public.expenses_read to authenticated;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('expense-receipts','expense-receipts',false,5242880,array['image/webp']);
create policy expense_receipts_read on storage.objects for select to authenticated using(bucket_id='expense-receipts' and (select private.is_active()) and exists(select 1 from public.expense_files f where f.path=name));
-- Categorías iniciales documentadas; evento explícito de configuración sin atribuirlo a un usuario ficticio.
insert into public.expense_categories(name) values('Materiales'),('Empaques'),('Impresiones'),('Envíos'),('Herramientas'),('Publicidad'),('Comisiones bancarias'),('Otros');
commit;
