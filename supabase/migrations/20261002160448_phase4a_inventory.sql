-- D-22/P4A: solo entradas positivas. Sin consumos, ajustes, devoluciones ni borrados.
begin;
create domain public.inventory_quantity as numeric check(value>=0 and value<'Infinity'::numeric and scale(value)<=4);
create domain public.inventory_value as numeric check(value>=0 and value<'Infinity'::numeric and scale(value)<=8);
create table public.inventory_receipts(
 id uuid primary key,receipt_kind text not null check(receipt_kind in ('purchase','opening_balance')),
 effective_at timestamptz not null check(isfinite(effective_at)),source_reference text not null check(length(trim(source_reference)) between 1 and 300),
 reason text,notes text check(length(notes)<=3000),created_by uuid not null references public.profiles(id) on delete restrict,
 created_at timestamptz not null default clock_timestamp(),
 check(effective_at<=created_at),check(receipt_kind<>'opening_balance' or (reason is not null and length(trim(reason)) between 1 and 1000))
);
create table public.inventory_receipt_items(
 id uuid primary key default gen_random_uuid(),receipt_id uuid not null references public.inventory_receipts(id) on delete restrict,
 position integer not null check(position>0),material_id uuid not null references public.materials(id) on delete restrict,
 material_code_snapshot text not null,material_name_snapshot text not null,unit_snapshot text not null,
 quantity public.inventory_quantity not null check(quantity>0),amount_original public.quote_money not null check(amount_original>0),
 currency text not null check(currency in ('CRC','USD')),amount_crc public.quote_money not null check(amount_crc>0),
 unit_cost_crc public.inventory_value not null check(unit_cost_crc>0 and unit_cost_crc=round(amount_crc/quantity,8)),
 exchange_rate_applied numeric,exchange_rate_date date,exchange_rate_source text,rate_origin text not null,
 rate_is_fallback boolean not null default false,rate_provided_by uuid references public.profiles(id) on delete restrict,
 rate_provided_at timestamptz,rate_override_reason text,
 unique(receipt_id,position),unique(id,material_id),
 check((case when currency='CRC' then amount_crc=amount_original and exchange_rate_applied is null and exchange_rate_date is null and exchange_rate_source is null and rate_origin='not_applicable' and not rate_is_fallback and rate_provided_by is null
 else exchange_rate_applied>0 and exchange_rate_applied<'Infinity'::numeric and exchange_rate_date is not null and isfinite(exchange_rate_date) and length(trim(exchange_rate_source)) between 1 and 300 and rate_origin in ('provider','admin_historical') and amount_crc=round(amount_original*exchange_rate_applied,2) end) is true),
 check((case when rate_origin='admin_historical' then rate_provided_by is not null and rate_provided_at is not null and isfinite(rate_provided_at) and length(trim(rate_override_reason)) between 1 and 1000 and not rate_is_fallback else rate_provided_by is null and rate_provided_at is null and rate_override_reason is null end) is true)
);
create table public.inventory_receipt_expenses(
 receipt_id uuid primary key references public.inventory_receipts(id) on delete restrict,
 expense_id uuid not null references public.expenses(id) on delete restrict,
 linked_by uuid not null references public.profiles(id) on delete restrict,linked_at timestamptz not null default clock_timestamp()
);
create table public.inventory_movements(
 id uuid primary key default gen_random_uuid(),material_id uuid not null references public.materials(id) on delete restrict,
 material_sequence bigint not null check(material_sequence>0),movement_type text not null check(movement_type in ('purchase_entry','opening_balance')),
 receipt_item_id uuid not null unique,quantity public.inventory_quantity not null check(quantity>0),unit_snapshot text not null,
 effective_at timestamptz not null check(isfinite(effective_at)),created_by uuid not null references public.profiles(id) on delete restrict,
 created_at timestamptz not null default clock_timestamp(),stock_before public.inventory_quantity not null,stock_after public.inventory_quantity not null,
 unique(material_id,material_sequence),unique(id,material_id),
 foreign key(receipt_item_id,material_id) references public.inventory_receipt_items(id,material_id) on delete restrict,
 check(stock_after=stock_before+quantity),check(effective_at<=created_at)
);
create unique index inventory_opening_once on public.inventory_movements(material_id) where movement_type='opening_balance';
create table public.inventory_movement_costs(
 movement_id uuid primary key references public.inventory_movements(id) on delete restrict,
 unit_cost_applied_crc public.inventory_value not null check(unit_cost_applied_crc>0),
 movement_amount_crc public.quote_money not null check(movement_amount_crc>0),
 value_before_crc public.inventory_value not null,value_after_crc public.inventory_value not null,
 average_cost_before_crc public.inventory_value,average_cost_after_crc public.inventory_value not null check(average_cost_after_crc>0),
 rounding_delta_crc numeric not null check(rounding_delta_crc>'-Infinity'::numeric and rounding_delta_crc<'Infinity'::numeric and scale(rounding_delta_crc)<=12),
 valuation_version text not null default 'moving_average_value_v1' check(valuation_version='moving_average_value_v1'),
 check(value_after_crc=value_before_crc+movement_amount_crc)
);
create table public.inventory_balances(
 material_id uuid primary key references public.materials(id) on delete restrict,quantity_on_hand public.inventory_quantity not null default 0,
 revision bigint not null default 0 check(revision>=0),last_movement_id uuid,last_effective_at timestamptz,unit_locked text,
 updated_at timestamptz not null default clock_timestamp(),
 foreign key(last_movement_id,material_id) references public.inventory_movements(id,material_id) on delete restrict,
 check((revision=0 and last_movement_id is null and last_effective_at is null and unit_locked is null and quantity_on_hand=0) or
 (revision>0 and last_movement_id is not null and last_effective_at is not null and unit_locked is not null and quantity_on_hand>0))
);
create table public.inventory_valuations(
 material_id uuid primary key references public.inventory_balances(material_id) on delete restrict,value_crc public.inventory_value not null default 0,
 average_unit_cost_crc public.inventory_value,revision bigint not null default 0 check(revision>=0),last_movement_id uuid,
 updated_at timestamptz not null default clock_timestamp(),
 foreign key(last_movement_id,material_id) references public.inventory_movements(id,material_id) on delete restrict,
 check((revision=0 and value_crc=0 and average_unit_cost_crc is null and last_movement_id is null) or
 (revision>0 and value_crc>0 and average_unit_cost_crc>0 and last_movement_id is not null))
);
create index inventory_receipts_date on public.inventory_receipts(effective_at desc,id);
create index inventory_receipts_actor on public.inventory_receipts(created_by);
create index inventory_items_material on public.inventory_receipt_items(material_id);
create index inventory_items_rate_actor on public.inventory_receipt_items(rate_provided_by);
create index inventory_expenses_parent on public.inventory_receipt_expenses(expense_id);
create index inventory_expenses_actor on public.inventory_receipt_expenses(linked_by);
create index inventory_movements_date on public.inventory_movements(material_id,effective_at,material_sequence);
create index inventory_movements_actor on public.inventory_movements(created_by);
create index inventory_balances_last on public.inventory_balances(last_movement_id);
create index inventory_valuations_last on public.inventory_valuations(last_movement_id);

create function private.inventory_actor() returns uuid language plpgsql security invoker set search_path='' as $$
begin
 perform 1 from public.profiles where id=auth.uid() and role='admin' and status='active' for share;
 if not found then raise exception 'Solo Administración activa puede registrar inventario' using errcode='42501';end if;
 return auth.uid();
end $$;
create function private.inventory_decimal(input text,max_scale integer) returns numeric language plpgsql immutable security invoker set search_path='' as $$
declare n numeric;begin
 if input is null or length(input)>100 or input!~'^\d+(\.\d+)?$' then raise exception 'Cantidad o importe decimal inválido' using errcode='22023';end if;
 n:=input::numeric;if n<=0 or scale(n)>max_scale then raise exception 'Cantidad/importe positivo con precisión válida requerido' using errcode='22023';end if;return n;
end $$;
create function private.inventory_immutable() returns trigger language plpgsql security invoker set search_path='' as $$
begin raise exception 'Registro de inventario inmutable; correcciones fuera de 4A' using errcode='42501';end $$;
create function private.inventory_unit_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.unit is distinct from old.unit and exists(select 1 from public.inventory_movements where material_id=old.id) then
 raise exception 'La unidad está congelada porque el material tiene movimientos' using errcode='22023';end if;return new;
end $$;
create trigger inventory_unit_guard before update of unit on public.materials for each row execute function private.inventory_unit_guard();
create function private.inventory_audit() returns trigger language plpgsql security definer set search_path='' as $$
declare record_id uuid;begin
 record_id:=coalesce((to_jsonb(new)->>'id')::uuid,(to_jsonb(new)->>'movement_id')::uuid,(to_jsonb(new)->>'receipt_id')::uuid,(to_jsonb(new)->>'material_id')::uuid);
 insert into public.audit_log(user_id,action,entity_type,entity_id,reason,metadata) values(auth.uid(),'inventory.'||tg_table_name||case when tg_op='INSERT' then '.registered' else '.updated' end,tg_table_name,record_id,to_jsonb(new)->>'reason',jsonb_build_object('before',case when tg_op='UPDATE' then to_jsonb(old) else null end,'after',to_jsonb(new)));
 return new;
end $$;
do $$declare t text;begin
 foreach t in array array['inventory_receipts','inventory_receipt_items','inventory_receipt_expenses','inventory_movements','inventory_movement_costs','inventory_balances','inventory_valuations'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated,service_role',t);
 execute format('grant select on public.%I to authenticated',t);
 execute format('create policy %I on public.%I for select to authenticated using ((select private.%I()))',t||'_read',t,case when t in ('inventory_movements','inventory_balances') then 'is_active' else 'is_admin' end);
 execute format('create trigger %I after insert or update on public.%I for each row execute function private.inventory_audit()',t||'_audit',t);
 if t not in ('inventory_balances','inventory_valuations') then execute format('create trigger %I before update or delete on public.%I for each row execute function private.inventory_immutable()',t||'_immutable',t);end if;
 end loop;
end $$;

create function private.register_inventory_receipt(target uuid,payload jsonb,expected_revisions jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.inventory_actor();t timestamptz;day date;today date:=(clock_timestamp() at time zone 'America/Costa_Rica')::date;
 kind text;line jsonb;m public.materials;b public.inventory_balances;v public.inventory_valuations;mid uuid;eid uuid;
 q numeric;amount numeric;crc numeric;cost numeric;newq numeric;newv numeric;avg numeric;pos integer:=0;iid uuid;movement uuid;
 rate numeric;rd date;src text;why text;r jsonb;manual boolean;currency text;reason text;
begin
 if target is null or payload is null or jsonb_typeof(payload)<>'object' or payload-array['kind','effective_at','source_reference','reason','notes','expense_id','lines']<>'{}'::jsonb or expected_revisions is null or jsonb_typeof(expected_revisions)<>'object' then raise exception 'Recepción inválida' using errcode='22023';end if;
 if exists(select 1 from jsonb_each(payload) x where x.key<>'lines' and jsonb_typeof(x.value) not in ('string','null')) then raise exception 'Campos de recepción inválidos' using errcode='22023';end if;
 if exists(select 1 from public.inventory_receipts where id=target) then raise exception 'Recepción ya registrada. Consulta el registro antes de reintentar.' using errcode='PT409';end if;
 kind:=payload->>'kind';if kind is null or kind not in ('purchase','opening_balance') then raise exception 'Tipo de recepción inválido' using errcode='22023';end if;
 t:=private.order_effective_at(payload->>'effective_at');day:=(t at time zone 'America/Costa_Rica')::date;
 if payload->>'source_reference' is null or length(trim(payload->>'source_reference')) not between 1 and 300 or length(payload->>'notes')>3000 then raise exception 'Procedencia requerida y notas válidas' using errcode='22023';end if;
 reason:=nullif(trim(payload->>'reason'),'');if kind='opening_balance' then reason:=private.order_reason(reason);end if;
 if length(reason)>1000 then raise exception 'Motivo demasiado extenso' using errcode='22023';end if;
 if jsonb_typeof(payload->'lines') is distinct from 'array' or jsonb_array_length(payload->'lines') not between 1 and 100 then raise exception 'Indica entre 1 y 100 líneas' using errcode='22023';end if;
 -- Every affected material uses the same row lock, including the first entry.
 for mid in select distinct (x->>'material_id')::uuid from jsonb_array_elements(payload->'lines') x order by 1 loop
  select * into m from public.materials where id=mid for update;
  if not found or not m.is_active then raise exception 'Material inexistente o inactivo' using errcode='22023';end if;
  insert into public.inventory_balances(material_id) values(mid) on conflict do nothing;
  insert into public.inventory_valuations(material_id) values(mid) on conflict do nothing;
  select * into b from public.inventory_balances where material_id=mid for update;
  perform 1 from public.inventory_valuations where material_id=mid for update;
  if expected_revisions->>mid::text is null or (expected_revisions->>mid::text)!~'^\d+$' then raise exception 'Revisión requerida por material' using errcode='22023';end if;
  if b.revision<>(expected_revisions->>mid::text)::bigint then raise exception 'El inventario cambió. Recarga sus existencias antes de registrar.' using errcode='PT409';end if;
  if b.last_effective_at is not null and t<b.last_effective_at then raise exception 'La fecha no puede preceder movimientos ya valorados' using errcode='22023';end if;
  if kind='opening_balance' and b.revision<>0 then raise exception 'El saldo inicial exige material sin movimientos previos' using errcode='PT409';end if;
 end loop;
 eid:=nullif(payload->>'expense_id','')::uuid;
 if eid is not null then perform 1 from public.expenses where id=eid for share;if not found then raise exception 'Gasto no disponible' using errcode='22023';end if;end if;
 insert into public.inventory_receipts(id,receipt_kind,effective_at,source_reference,reason,notes,created_by) values(target,kind,t,trim(payload->>'source_reference'),reason,nullif(trim(payload->>'notes'),''),actor);
 for line in select value from jsonb_array_elements(payload->'lines') loop
  if jsonb_typeof(line)<>'object' or line-array['material_id','unit','quantity','amount','currency','historical_rate','rate_reason','rate_source']<>'{}'::jsonb then raise exception 'Línea inválida' using errcode='22023';end if;
  if exists(select 1 from jsonb_each(line) x where jsonb_typeof(x.value) not in ('string','null')) then raise exception 'Importes y cantidades deben transportarse como texto decimal' using errcode='22023';end if;
  pos:=pos+1;mid:=(line->>'material_id')::uuid;select * into m from public.materials where id=mid;
  select * into b from public.inventory_balances where material_id=mid;select * into v from public.inventory_valuations where material_id=mid;
  if kind='opening_balance' and b.revision<>0 then raise exception 'Una sola línea inicial por material sin movimientos' using errcode='PT409';end if;
  if line->>'unit' is distinct from m.unit or (b.unit_locked is not null and b.unit_locked<>m.unit) then raise exception 'La unidad del material cambió. Recarga antes de registrar.' using errcode='PT409';end if;
  q:=private.inventory_decimal(line->>'quantity',4);amount:=private.inventory_decimal(line->>'amount',2);currency:=line->>'currency';
  rate:=null;rd:=null;src:=null;why:=null;manual:=false;
  if currency='CRC' then
   if nullif(line->>'historical_rate','') is not null or nullif(line->>'rate_reason','') is not null or nullif(line->>'rate_source','') is not null then raise exception 'CRC no utiliza tasa' using errcode='22023';end if;crc:=amount;
  elsif currency='USD' then
   r:=private.expense_rate(day);
   if nullif(line->>'historical_rate','') is not null or nullif(line->>'rate_reason','') is not null or nullif(line->>'rate_source','') is not null then
    if day=today or r is not null then raise exception 'Aporte de tasa solo para fecha histórica sin referencia' using errcode='22023';end if;
    rate:=private.inventory_decimal(line->>'historical_rate',100);why:=private.order_reason(line->>'rate_reason');src:=trim(line->>'rate_source');
    if src is null or length(src) not between 1 and 300 then raise exception 'Procedencia de tasa requerida' using errcode='22023';end if;rd:=day;manual:=true;
   else
    if r is null then raise exception 'No existe referencia válida para esta fecha. Histórico requiere aporte Admin motivado.' using errcode='22023';end if;
    rate:=(r->>'rate')::numeric;rd:=(r->>'date')::date;src:=r->>'source';
   end if;crc:=round(amount*rate,2);
  else raise exception 'Moneda CRC/USD requerida' using errcode='22023';end if;
  if crc<=0 then raise exception 'El equivalente CRC debe ser positivo' using errcode='22023';end if;
  cost:=round(crc/q,8);newq:=b.quantity_on_hand+q;newv:=v.value_crc+crc;avg:=round(newv/newq,8);
  if cost<=0 or avg<=0 then raise exception 'Cantidad/importe exceden la precisión admitida por V1: costo colapsaría a cero' using errcode='22023';end if;
  iid:=gen_random_uuid();movement:=gen_random_uuid();
  insert into public.inventory_receipt_items(id,receipt_id,position,material_id,material_code_snapshot,material_name_snapshot,unit_snapshot,quantity,amount_original,currency,amount_crc,unit_cost_crc,exchange_rate_applied,exchange_rate_date,exchange_rate_source,rate_origin,rate_is_fallback,rate_provided_by,rate_provided_at,rate_override_reason)
  values(iid,target,pos,mid,m.code,m.name,m.unit,q,amount,currency,crc,cost,rate,rd,src,case when currency='CRC' then 'not_applicable' when manual then 'admin_historical' else 'provider' end,coalesce(rd<day,false),case when manual then actor end,case when manual then clock_timestamp() end,why);
  insert into public.inventory_movements(id,material_id,material_sequence,movement_type,receipt_item_id,quantity,unit_snapshot,effective_at,created_by,stock_before,stock_after)
  values(movement,mid,b.revision+1,case when kind='purchase' then 'purchase_entry' else 'opening_balance' end,iid,q,m.unit,t,actor,b.quantity_on_hand,newq);
  insert into public.inventory_movement_costs(movement_id,unit_cost_applied_crc,movement_amount_crc,value_before_crc,value_after_crc,average_cost_before_crc,average_cost_after_crc,rounding_delta_crc)
  values(movement,cost,crc,v.value_crc,newv,v.average_unit_cost_crc,avg,crc-q*cost);
  update public.inventory_balances set quantity_on_hand=newq,revision=b.revision+1,last_movement_id=movement,last_effective_at=t,unit_locked=m.unit,updated_at=clock_timestamp() where material_id=mid;
  update public.inventory_valuations set value_crc=newv,average_unit_cost_crc=avg,revision=b.revision+1,last_movement_id=movement,updated_at=clock_timestamp() where material_id=mid;
 end loop;
 if eid is not null then insert into public.inventory_receipt_expenses(receipt_id,expense_id,linked_by) values(target,eid,actor);end if;
 return target;
exception when unique_violation then raise exception 'Operación ya registrada o concurrente. Consulta antes de reintentar.' using errcode='PT409';
end $$;
create function private.link_inventory_expense(target uuid,expense uuid) returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.inventory_actor();begin
 perform 1 from public.inventory_receipts where id=target for update;if not found then raise exception 'Recepción inexistente' using errcode='22023';end if;
 perform 1 from public.expenses where id=expense for share;if not found then raise exception 'Gasto inexistente' using errcode='22023';end if;
 insert into public.inventory_receipt_expenses(receipt_id,expense_id,linked_by) values(target,expense,actor);
exception when unique_violation then raise exception 'La recepción ya tiene un gasto vinculado' using errcode='PT409';
end $$;
create function private.inventory_receipt_complete() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.inventory_receipt_items where receipt_id=new.id) or exists(
  select 1 from public.inventory_receipt_items i left join public.inventory_movements m on m.receipt_item_id=i.id
  left join public.inventory_movement_costs c on c.movement_id=m.id
  where i.receipt_id=new.id and (m.id is null or c.movement_id is null or m.quantity<>i.quantity or m.unit_snapshot<>i.unit_snapshot or m.effective_at<>new.effective_at or m.created_by<>new.created_by or
  c.unit_cost_applied_crc<>i.unit_cost_crc or c.movement_amount_crc<>i.amount_crc or c.rounding_delta_crc<>i.amount_crc-i.quantity*i.unit_cost_crc or
  c.average_cost_after_crc<>round(c.value_after_crc/m.stock_after,8) or
  (m.material_sequence=1 and (m.stock_before<>0 or c.value_before_crc<>0 or c.average_cost_before_crc is not null)) or
  (m.material_sequence>1 and not exists(select 1 from public.inventory_movements prev join public.inventory_movement_costs pc on pc.movement_id=prev.id where prev.material_id=m.material_id and prev.material_sequence=m.material_sequence-1 and prev.stock_after=m.stock_before and pc.value_after_crc=c.value_before_crc and pc.average_cost_after_crc=c.average_cost_before_crc and prev.effective_at<=m.effective_at)) or
  (i.currency='USD' and (i.exchange_rate_date>(new.effective_at at time zone 'America/Costa_Rica')::date or i.rate_is_fallback<>(i.exchange_rate_date<(new.effective_at at time zone 'America/Costa_Rica')::date) or ((new.effective_at at time zone 'America/Costa_Rica')::date<(new.created_at at time zone 'America/Costa_Rica')::date and i.rate_is_fallback))))
 ) then raise exception 'Recepción incompleta o evidencia de valoración inconsistente' using errcode='23514';end if;
 if exists(select 1 from public.inventory_receipt_items i join public.inventory_balances b on b.material_id=i.material_id join public.inventory_valuations v on v.material_id=b.material_id
  join public.inventory_movements m on m.id=b.last_movement_id join public.inventory_movement_costs c on c.movement_id=m.id
  where i.receipt_id=new.id and (b.revision<>m.material_sequence or v.revision<>b.revision or v.last_movement_id<>b.last_movement_id or b.quantity_on_hand<>m.stock_after or v.value_crc<>c.value_after_crc or v.average_unit_cost_crc<>c.average_cost_after_crc))
 then raise exception 'Proyección de inventario inconsistente' using errcode='23514';end if;
 return null;
end $$;
create constraint trigger inventory_receipt_complete after insert on public.inventory_receipts deferrable initially deferred for each row execute function private.inventory_receipt_complete();
revoke all on function private.inventory_receipt_complete() from public,anon,authenticated,service_role;
create function public.register_inventory_receipt(target uuid,payload jsonb,expected_revisions jsonb) returns uuid language sql security invoker set search_path='' as $$select private.register_inventory_receipt(target,payload,expected_revisions)$$;
create function public.link_inventory_expense(target uuid,expense uuid) returns void language sql security invoker set search_path='' as $$select private.link_inventory_expense(target,expense)$$;
revoke all on function private.inventory_actor(),private.inventory_decimal(text,integer),private.inventory_immutable(),private.inventory_unit_guard(),private.inventory_audit(),private.register_inventory_receipt(uuid,jsonb,jsonb),private.link_inventory_expense(uuid,uuid),public.register_inventory_receipt(uuid,jsonb,jsonb),public.link_inventory_expense(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function private.register_inventory_receipt(uuid,jsonb,jsonb),private.link_inventory_expense(uuid,uuid),public.register_inventory_receipt(uuid,jsonb,jsonb),public.link_inventory_expense(uuid,uuid) to authenticated;

create view public.inventory_stock_read with(security_invoker=true) as
 select m.id,m.code,m.name,m.unit,m.min_stock::text,m.is_active,coalesce(b.quantity_on_hand,0)::text as stock,
 coalesce(b.revision,0)::text as revision,coalesce(b.quantity_on_hand,0)<=m.min_stock as low_stock
 from public.materials m left join public.inventory_balances b on b.material_id=m.id;
create view public.inventory_movements_read with(security_invoker=true) as
 select id,material_id,material_sequence::text,movement_type,quantity::text,unit_snapshot,effective_at,created_by,created_at,stock_before::text,stock_after::text from public.inventory_movements;
create view public.inventory_valuations_read with(security_invoker=true) as
 select material_id,value_crc::text,average_unit_cost_crc::text,revision::text,last_movement_id from public.inventory_valuations;
create view public.inventory_receipt_items_read with(security_invoker=true) as
 select id,receipt_id,position,material_id,material_code_snapshot,material_name_snapshot,unit_snapshot,quantity::text,amount_original::text,currency,amount_crc::text,unit_cost_crc::text,exchange_rate_applied::text,exchange_rate_date,exchange_rate_source,rate_origin,rate_is_fallback,rate_provided_by,rate_provided_at,rate_override_reason from public.inventory_receipt_items;
create view public.inventory_movement_costs_read with(security_invoker=true) as
 select movement_id,unit_cost_applied_crc::text,movement_amount_crc::text,value_before_crc::text,value_after_crc::text,average_cost_before_crc::text,average_cost_after_crc::text,rounding_delta_crc::text,valuation_version from public.inventory_movement_costs;
revoke all on public.inventory_stock_read,public.inventory_movements_read,public.inventory_valuations_read,public.inventory_receipt_items_read,public.inventory_movement_costs_read from public,anon,authenticated,service_role;
grant select on public.inventory_stock_read,public.inventory_movements_read,public.inventory_valuations_read,public.inventory_receipt_items_read,public.inventory_movement_costs_read to authenticated;
commit;
