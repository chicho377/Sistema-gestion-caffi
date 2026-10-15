begin;
-- Copy the address when creating the delivery; the order commercial snapshot has no address.
create or replace function private.shipment_operate(request_id uuid,operation text,target uuid,expected_revision bigint,payload jsonb)
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
  values(target,ord,payload->>'delivery_type',case when payload?'delivery_address' then nullif(trim(payload->>'delivery_address'),'') else (select nullif(c.address,'') from public.clients c where c.id=o.client_id) end,
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
commit;
