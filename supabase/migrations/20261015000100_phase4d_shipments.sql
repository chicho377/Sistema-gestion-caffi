begin;

create table public.shipments (
 id uuid primary key, order_id uuid not null unique references public.orders(id),
 delivery_type text not null check(delivery_type in ('pickup','shipping','personal_delivery')),
 status text not null default 'pending' check(status in ('pending','preparing','shipped','delivered','cancelled')),
 delivery_address text check(length(delivery_address)<=3000), courier text check(length(courier)<=300),
 tracking_number text check(length(tracking_number)<=300), notes text check(length(notes)<=3000),
 shipped_at timestamptz check(isfinite(shipped_at)), delivered_at timestamptz check(isfinite(delivered_at)),
 cancelled_at timestamptz check(isfinite(cancelled_at)), cancel_reason text,
 revision bigint not null default 1 check(revision>0),
 created_by uuid not null references public.profiles(id), updated_by uuid not null references public.profiles(id),
 created_at timestamptz not null default clock_timestamp(), updated_at timestamptz not null default clock_timestamp(),
 check((status='delivered')=(delivered_at is not null)),
 check((status='cancelled')=(cancelled_at is not null)),
 check(status<>'cancelled' or (length(trim(cancel_reason)) between 1 and 1000) is true),
 check(delivery_type<>'pickup' or (status<>'shipped' and shipped_at is null)),
 check(status not in ('pending','preparing') or shipped_at is null),
 check(delivery_type='pickup' or status not in ('shipped','delivered') or shipped_at is not null),
 check(delivered_at is null or shipped_at is null or delivered_at>=shipped_at),
 check(shipped_at is null or (length(trim(delivery_address))>0) is true),
 check(delivery_type<>'shipping' or shipped_at is null or (length(trim(courier))>0) is true)
);
create index shipments_status on public.shipments(status,created_at);
create index shipments_creator on public.shipments(created_by);
create index shipments_editor on public.shipments(updated_by);
create table public.shipment_finances (
 shipment_id uuid primary key references public.shipments(id),
 paid_by text not null check(paid_by in ('business','customer_direct')),
 cost_crc public.quote_money, expense_id uuid unique references public.expenses(id),
 updated_by uuid not null references public.profiles(id), updated_at timestamptz not null default clock_timestamp(),
 check(paid_by='business' or expense_id is null)
);
create index shipment_finances_actor on public.shipment_finances(updated_by);
create table public.shipment_requests (
 id uuid primary key, actor_id uuid not null references public.profiles(id),
 shipment_id uuid not null references public.shipments(id), fingerprint text not null,
 operation text not null, resulting_revision bigint not null, created_at timestamptz not null default clock_timestamp()
);
create index shipment_requests_actor on public.shipment_requests(actor_id);
create index shipment_requests_shipment on public.shipment_requests(shipment_id);
alter table public.shipments enable row level security;
alter table public.shipment_finances enable row level security;
alter table public.shipment_requests enable row level security;
revoke all on public.shipments,public.shipment_finances,public.shipment_requests from public,anon,authenticated,service_role;
grant select on public.shipments,public.shipment_finances,public.shipment_requests to authenticated;
create policy shipments_read on public.shipments for select to authenticated using(private.is_active());
create policy shipment_finances_admin on public.shipment_finances for select to authenticated using(private.is_admin());
create policy shipment_requests_actor on public.shipment_requests for select to authenticated using(private.is_active() and (actor_id=(select auth.uid()) or private.is_admin()));
create view public.shipment_finances_read with(security_invoker=true) as
 select f.shipment_id,f.paid_by,f.cost_crc::text as cost_crc,f.expense_id,e.status as expense_status,e.amount_crc::text as expense_amount_crc
 from public.shipment_finances f left join public.expenses e on e.id=f.expense_id;
revoke all on public.shipment_finances_read from public,anon,authenticated,service_role;
grant select on public.shipment_finances_read to authenticated;

-- Both existing 4A paths already hold FOR SHARE on expenses. Keep that lock mode;
-- upgrading it could deadlock. The shared advisory serializes association checks.
create function private.shipment_expense_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare e public.expenses; oid uuid;
begin
 if new.expense_id is null then return new;end if;
 perform 1 from public.expenses where id=new.expense_id for share;
 perform pg_advisory_xact_lock(hashtextextended('shipment-expense:'||new.expense_id::text,0));
 if tg_table_name='inventory_receipt_expenses' then
  if exists(select 1 from public.shipment_finances where expense_id=new.expense_id) then raise exception 'Gasto ya asociado a un envío' using errcode='PT409';end if;
 else
  if tg_op='UPDATE' and old.expense_id is not distinct from new.expense_id then return new;end if;
  select * into e from public.expenses where id=new.expense_id;
  select order_id into oid from public.shipments where id=new.shipment_id;
  if e.id is null or e.currency<>'CRC' or e.order_id is distinct from oid or e.status<>'valid' then raise exception 'Se requiere un gasto válido CRC del mismo pedido' using errcode='22023';end if;
  if exists(select 1 from public.inventory_receipt_expenses where expense_id=new.expense_id)
  or exists(select 1 from public.shipment_finances where expense_id=new.expense_id and shipment_id<>new.shipment_id) then raise exception 'Gasto ya asociado a otra operación' using errcode='PT409';end if;
 end if;return new;
end $$;
create trigger shipment_expense_exclusive before insert or update of expense_id on public.shipment_finances for each row execute function private.shipment_expense_guard();
create trigger inventory_shipment_expense_exclusive before insert or update of expense_id on public.inventory_receipt_expenses for each row execute function private.shipment_expense_guard();

create function private.shipment_validate() returns trigger language plpgsql security definer set search_path='' as $$
declare confirmed timestamptz;
begin
 select confirmed_at into confirmed from public.orders where id=new.order_id;
 if confirmed is null or new.shipped_at<confirmed or new.delivered_at<confirmed
 or new.shipped_at>clock_timestamp() or new.delivered_at>clock_timestamp() or new.cancelled_at>clock_timestamp() then
 raise exception 'Cronología de envío incompatible con el pedido' using errcode='22023';end if;
 if tg_op='UPDATE' and (new.id<>old.id or new.order_id<>old.order_id or new.created_by<>old.created_by or new.created_at<>old.created_at) then
 raise exception 'Identidad del envío inmutable' using errcode='42501';end if;
 return new;
end $$;
create trigger shipment_validate before insert or update on public.shipments for each row execute function private.shipment_validate();
create function private.shipment_order_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.confirmed_at is distinct from old.confirmed_at and exists(select 1 from public.shipments where order_id=new.id and (shipped_at<new.confirmed_at or delivered_at<new.confirmed_at)) then
 raise exception 'La fecha invalidaría el historial de envío' using errcode='PT409';end if;return new;
end $$;
create trigger shipment_order_dates before update on public.orders for each row execute function private.shipment_order_guard();

create function private.shipment_operate(request_id uuid,operation text,target uuid,expected_revision bigint,payload jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare actor public.profiles;s public.shipments;prior public.shipments;o public.orders;f public.shipment_finances;
 req public.shipment_requests;ord uuid;finger text;why text;next_state text;t timestamptz;eid uuid;cost numeric;
 before_data jsonb;after_data jsonb;before_finance jsonb;
begin
 if request_id is null or target is null or operation is null or operation not in ('create','edit','advance','back','cancel','correct','finance','link')
 or payload is null or jsonb_typeof(payload)<>'object' then raise exception 'Solicitud inválida' using errcode='22023';end if;
 select * into actor from public.profiles where id=auth.uid() and status='active' for share;
 if not found then raise exception 'Acceso no autorizado' using errcode='42501';end if;
 if operation in ('back','cancel','correct','finance','link') and actor.role<>'admin' then raise exception 'Operación exclusiva de Administración' using errcode='42501';end if;
 if (operation='create' and payload-array['order_id','delivery_type','delivery_address','courier','tracking_number','notes']<>'{}')
 or (operation='edit' and payload-array['delivery_type','delivery_address','courier','tracking_number','notes']<>'{}')
 or (operation='correct' and payload-array['delivery_address','courier','tracking_number','notes','shipped_at','delivered_at','reason']<>'{}')
 or (operation='advance' and payload-array['effective_at','reason']<>'{}')
 or (operation in ('back','cancel') and payload-array['reason']<>'{}')
 or (operation='finance' and payload-array['paid_by','cost_crc','reason']<>'{}')
 or (operation='link' and payload-array['expense_id','reason']<>'{}') then raise exception 'Campos no permitidos' using errcode='22023';end if;
 why:=nullif(trim(payload->>'reason'),'');
 if operation in ('back','cancel','correct','finance','link') or payload?'effective_at' then why:=private.order_reason(why);end if;
 if payload?'effective_at' and actor.role<>'admin' then raise exception 'Fechas históricas exclusivas de Administración' using errcode='42501';end if;
 finger:=md5(jsonb_build_object('operation',operation,'target',target,'revision',expected_revision,'payload',payload)::text);
 perform pg_advisory_xact_lock(hashtextextended('shipment-request:'||request_id::text,0));
 select * into req from public.shipment_requests where id=request_id;
 if found then
  if req.actor_id<>actor.id or req.fingerprint<>finger then raise exception 'UUID utilizado para otra solicitud' using errcode='PT409';end if;return req.shipment_id;
 end if;
 if operation='create' then ord:=(payload->>'order_id')::uuid;
 else select * into prior from public.shipments where id=target;ord:=prior.order_id;end if;
 select * into o from public.orders where id=ord for update;
 if not found or o.confirmed_at is null then raise exception 'Pedido confirmado obligatorio' using errcode='22023';end if;
 if operation='create' then
  if o.production_status='cancelled' then raise exception 'Pedido cancelado' using errcode='PT409';end if;
  if exists(select 1 from public.shipments where order_id=ord or id=target) then raise exception 'Ya existe un envío para este pedido' using errcode='PT409';end if;
  insert into public.shipments(id,order_id,delivery_type,delivery_address,courier,tracking_number,notes,created_by,updated_by)
  values(target,ord,payload->>'delivery_type',case when payload?'delivery_address' then nullif(trim(payload->>'delivery_address'),'') else nullif(o.client_snapshot->>'address','') end,
  nullif(trim(payload->>'courier'),''),nullif(trim(payload->>'tracking_number'),''),nullif(trim(payload->>'notes'),''),actor.id,actor.id);
 else
  select * into s from public.shipments where id=target for update;
  if not found or s.revision is distinct from expected_revision then raise exception 'El envío cambió; recarga antes de continuar' using errcode='PT409';end if;
  before_data:=to_jsonb(s);
  if s.status='cancelled' then raise exception 'Envío cancelado terminal' using errcode='PT409';end if;
  if o.production_status='cancelled' and operation in ('edit','advance') then raise exception 'Pedido cancelado: sin operaciones ordinarias' using errcode='PT409';end if;
  if operation in ('edit','correct') then
   if operation='edit' and s.status not in ('pending','preparing') then raise exception 'Datos congelados tras despacho; requiere corrección Admin' using errcode='PT409';end if;
   if payload?'delivery_address' and s.status not in ('pending','preparing') then raise exception 'Retrocede explícitamente antes de corregir la dirección' using errcode='PT409';end if;
   update public.shipments set
    delivery_type=case when payload?'delivery_type' then payload->>'delivery_type' else delivery_type end,
    delivery_address=case when payload?'delivery_address' then nullif(trim(payload->>'delivery_address'),'') else delivery_address end,
    courier=case when payload?'courier' then nullif(trim(payload->>'courier'),'') else courier end,
    tracking_number=case when payload?'tracking_number' then nullif(trim(payload->>'tracking_number'),'') else tracking_number end,
    notes=case when payload?'notes' then nullif(trim(payload->>'notes'),'') else notes end,
    shipped_at=case when payload?'shipped_at' then (payload->>'shipped_at')::timestamptz else shipped_at end,
    delivered_at=case when payload?'delivered_at' then (payload->>'delivered_at')::timestamptz else delivered_at end where id=target;
  elsif operation='advance' then
   next_state:=case s.status when 'pending' then 'preparing' when 'preparing' then case when s.delivery_type='pickup' then 'delivered' else 'shipped' end when 'shipped' then 'delivered' end;
   if next_state is null then raise exception 'No hay transición disponible' using errcode='PT409';end if;
   if next_state='shipped' and o.production_status<>'ready' or next_state='delivered' and o.production_status not in ('ready','delivered') then raise exception 'El pedido no está listo para esta transición' using errcode='PT409';end if;
   t:=case when payload?'effective_at' then private.order_effective_at(payload->>'effective_at',o.confirmed_at) else clock_timestamp() end;
   update public.shipments set status=next_state,shipped_at=case when next_state='shipped' then t else shipped_at end,delivered_at=case when next_state='delivered' then t else delivered_at end where id=target;
  elsif operation='back' then
   next_state:=case s.status when 'delivered' then case when s.delivery_type='pickup' then 'preparing' else 'shipped' end when 'shipped' then 'preparing' when 'preparing' then 'pending' end;
   if next_state is null then raise exception 'No hay retroceso disponible' using errcode='PT409';end if;
   update public.shipments set status=next_state,delivered_at=null,shipped_at=case when s.status='shipped' then null else shipped_at end where id=target;
  elsif operation='cancel' then
   if s.status='delivered' then raise exception 'Retrocede explícitamente antes de cancelar' using errcode='PT409';end if;
   update public.shipments set status='cancelled',cancelled_at=clock_timestamp(),cancel_reason=why where id=target;
  elsif operation in ('finance','link') then
   select * into f from public.shipment_finances where shipment_id=target for update;before_finance:=to_jsonb(f);
   if operation='link' then
    eid:=(payload->>'expense_id')::uuid;
    if f.shipment_id is null then
     insert into public.shipment_finances(shipment_id,paid_by,expense_id,updated_by) values(target,'business',eid,actor.id);
    else
     if eid is not null and f.paid_by<>'business' then raise exception 'El pagador debe ser el negocio para vincular un gasto' using errcode='22023';end if;
     update public.shipment_finances set expense_id=eid,updated_by=actor.id,updated_at=clock_timestamp() where shipment_id=target;
    end if;
   else
    if payload?'cost_crc' and payload->>'cost_crc' is not null then
     if payload->>'cost_crc'!~'^[0-9]+([.][0-9]{1,2})?$' then raise exception 'Costo CRC inválido' using errcode='22023';end if;cost:=(payload->>'cost_crc')::numeric;
    else cost:=f.cost_crc;end if;
    if payload->>'paid_by'='business' and cost>0 and not exists(select 1 from public.expenses where id=f.expense_id and status='valid') then raise exception 'Vincula un gasto válido antes de registrar costo del negocio' using errcode='22023';end if;
    insert into public.shipment_finances(shipment_id,paid_by,cost_crc,expense_id,updated_by)
    values(target,coalesce(payload->>'paid_by',f.paid_by),cost,f.expense_id,actor.id)
    on conflict(shipment_id) do update set paid_by=excluded.paid_by,cost_crc=excluded.cost_crc,updated_by=excluded.updated_by,updated_at=clock_timestamp();
   end if;
  end if;
  update public.shipments set revision=revision+1,updated_by=actor.id,updated_at=clock_timestamp() where id=target;
 end if;
 select * into s from public.shipments where id=target;after_data:=to_jsonb(s);
 insert into public.shipment_requests(id,actor_id,shipment_id,fingerprint,operation,resulting_revision) values(request_id,actor.id,target,finger,operation,s.revision);
 insert into public.audit_log(user_id,action,entity_type,entity_id,reason,metadata)
 values(actor.id,'shipment.'||operation,'shipments',target,why,jsonb_build_object('before',before_data,'after',after_data)||
 case when operation in ('finance','link') then jsonb_build_object('financial_before',before_finance,'financial_after',(select to_jsonb(x) from public.shipment_finances x where shipment_id=target)) else '{}'::jsonb end);
 return target;
end $$;
create function public.shipment_operate(request_id uuid,operation text,target uuid,expected_revision bigint,payload jsonb)
returns uuid language sql security invoker set search_path='' as $$select private.shipment_operate(request_id,operation,target,expected_revision,payload)$$;
revoke all on function private.shipment_expense_guard(),private.shipment_validate(),private.shipment_order_guard() from public,anon,authenticated,service_role;
revoke all on function private.shipment_operate(uuid,text,uuid,bigint,jsonb),public.shipment_operate(uuid,text,uuid,bigint,jsonb) from public,anon,authenticated,service_role;
grant execute on function private.shipment_operate(uuid,text,uuid,bigint,jsonb),public.shipment_operate(uuid,text,uuid,bigint,jsonb) to authenticated;
commit;
