-- Auditoría de 3B: códigos de validación y tipo de pago RF-PAG-01. Sin cambios de historia.
begin;
alter table public.payments add column payment_type text
 constraint payments_type_length check(payment_type is null or length(trim(payment_type)) between 1 and 100);
create or replace function private.lock_order(target uuid,expected_revision integer) returns public.orders
language plpgsql security invoker set search_path='' as $$
declare o public.orders; begin
 perform 1 from public.profiles where id=auth.uid() and status='active' for share;
 if not found then raise exception 'Acceso no autorizado' using errcode='42501'; end if;
 if target is null or expected_revision is null or expected_revision<1 then raise exception 'Identificador y revisión positiva requeridos' using errcode='22023';end if;
 select * into o from public.orders where id=target for update;
 if not found or o.revision is distinct from expected_revision then raise exception 'El pedido cambió. Recarga antes de reintentar.' using errcode='PT409'; end if;
 return o;
end $$;
create or replace function private.transition_order(target uuid,expected_revision integer,payload jsonb) returns void language plpgsql security definer set search_path='' as $$
declare o public.orders; dest text; reason text; t timestamptz; paid numeric; back boolean:=false;
begin
 o:=private.lock_order(target,expected_revision);
 if payload is null or jsonb_typeof(payload)<>'object' or payload-array['state','reason','delivered_at']<>'{}'::jsonb then raise exception 'Datos inválidos' using errcode='22023'; end if;
 dest:=payload->>'state';reason:=payload->>'reason';
 if dest is null or dest not in ('quote','confirmed','in_production','ready','delivered','cancelled') then raise exception 'Estado de destino inválido' using errcode='22023';end if;
 if o.production_status='cancelled' then raise exception 'Estado no disponible' using errcode='PT409'; end if;
 if dest='cancelled' then
 if o.production_status='delivered' or (o.production_status<>'quote' and not private.is_admin()) then raise exception 'Cancelación no autorizada' using errcode='42501'; end if;
 reason:=private.order_reason(reason);
 update public.orders set production_status=dest,cancelled_at=clock_timestamp(),cancelled_by=auth.uid(),cancel_reason=reason,revision=revision+1,updated_by=auth.uid(),updated_at=clock_timestamp() where id=target;
 perform private.order_event(target,'order.cancelled',reason,jsonb_build_object('from',o.production_status,'to',dest));return; end if;
 back:=(o.production_status='in_production' and dest='confirmed') or (o.production_status='ready' and dest='in_production') or (o.production_status='delivered' and dest='ready');
 if back then
 if not private.is_admin() then raise exception 'Retroceso exclusivo de Administración' using errcode='42501'; end if;reason:=private.order_reason(reason);
 elsif not ((o.production_status='confirmed' and dest='in_production') or (o.production_status='in_production' and dest='ready') or (o.production_status='ready' and dest='delivered')) then raise exception 'Transición no permitida' using errcode='42501'; end if;
 if o.production_status='confirmed' and dest='in_production' then
 select coalesce(sum(amount),0) into paid from public.payments where order_id=target and status='valid';
 if paid<least(o.deposit_required_amount,o.total) then
 if not private.is_admin() then raise exception 'Adelanto pendiente; requiere excepción administrativa' using errcode='42501'; end if;
 reason:=private.order_reason(reason);perform private.order_event(target,'order.production_override',reason,jsonb_build_object('paid',paid::text,'required',least(o.deposit_required_amount,o.total)::text));end if;end if;
 if dest='delivered' then t:=private.order_effective_at(payload->>'delivered_at',o.confirmed_at);end if;
 update public.orders set production_status=dest,delivered_at=t,revision=revision+1,updated_by=auth.uid(),updated_at=clock_timestamp() where id=target;
 perform private.order_event(target,case when back and o.production_status='delivered' then 'order.reopened' when back then 'order.reversed' when dest='delivered' then 'order.delivered' else 'order.transitioned' end,reason,jsonb_build_object('from',o.production_status,'to',dest,'previous_delivered_at',o.delivered_at,'delivered_at',t));
end $$;
create or replace function private.void_payment(target uuid,expected_revision integer,payload jsonb) returns void language plpgsql security definer set search_path='' as $$
declare o public.orders; p public.payments; reason text;
begin
 o:=private.lock_order(target,expected_revision);
 if not private.is_admin() then raise exception 'Anulación exclusiva de Administración' using errcode='42501'; end if;
 if payload is null or jsonb_typeof(payload)<>'object' or payload-array['payment_id','reason']<>'{}'::jsonb then raise exception 'Datos inválidos' using errcode='22023'; end if;
 reason:=private.order_reason(payload->>'reason');
 if nullif(payload->>'payment_id','') is null then raise exception 'Identificador de pago requerido' using errcode='22023';end if;
 select * into p from public.payments where id=(payload->>'payment_id')::uuid and order_id=target for update;
 if not found then raise exception 'Pago no pertenece a este pedido' using errcode='22023';end if;
 if p.status<>'valid' then raise exception 'El pago cambió o ya fue anulado' using errcode='PT409'; end if;
 update public.payments set status='voided',voided_by=auth.uid(),voided_at=clock_timestamp(),void_reason=reason,updated_at=clock_timestamp() where id=p.id;
 update public.orders set revision=revision+1,updated_by=auth.uid(),updated_at=clock_timestamp() where id=target;
 perform private.order_event(target,'order.payment_voided',reason,jsonb_build_object('payment_id',p.id,'amount',p.amount::text));
end $$;
create or replace function private.amend_order(target uuid, expected_revision integer, payload jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare o public.orders; c public.clients; p public.products; old_line public.order_items;
 item jsonb; lid uuid; pid uuid; qty integer; price numeric; disc numeric; line_sum numeric; sub numeric:=0;
 general numeric; seen uuid[]:='{}'; day date:=(now() at time zone 'America/Costa_Rica')::date;
 od date; rd date; name_text text; sku_text text; description_text text; fresh boolean; before_lines jsonb; after_lines jsonb; paid numeric; changed boolean; zr text; new_commercial bigint;
begin
 if not private.is_active() then raise exception 'Forbidden' using errcode='42501'; end if;
 -- Bloqueo de perfil evita que una inactivación simultánea pase inadvertida durante escritura.
 perform 1 from public.profiles where id=auth.uid() and status='active' for share;
 if not found then raise exception 'Forbidden' using errcode='42501'; end if;
 if target is null or expected_revision is null or expected_revision<1 or jsonb_typeof(payload)<>'object' or
 (payload-array['client_id','order_date','requested_delivery_date','discount_amount','notes','items','reason','zero_reason'])<>'{}'::jsonb
 or jsonb_typeof(payload->'items') is distinct from 'array' then raise exception 'Datos inválidos' using errcode='22023'; end if;
 select * into o from public.orders where id=target for update;
 fresh:=not found;
 if fresh then raise exception 'Pedido inexistente' using errcode='42501'; end if;
 select jsonb_agg(to_jsonb(i)-array['created_at','updated_at'] order by id) into before_lines from public.order_items i where order_id=target;
 if (fresh and expected_revision<>0) or (not fresh and (o.revision<>expected_revision or o.production_status not in ('confirmed','in_production','ready','delivered'))) then
 raise exception 'La cotización cambió o ya fue cancelada. Recarga antes de guardar.' using errcode='PT409'; end if;
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
 select coalesce(sum(amount),0) into paid from public.payments where order_id=target and status='valid';
 if c.id<>o.client_id then
 if not private.is_admin() then raise exception 'Cambio de cliente exclusivo de Administración' using errcode='42501'; end if;
 perform private.order_reason(payload->>'reason');
 if paid>0 then raise exception 'No se cambia cliente con pagos válidos' using errcode='42501'; end if;
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
 select jsonb_agg(to_jsonb(i)-array['created_at','updated_at'] order by id) into after_lines from public.order_items i where order_id=target;
 changed:=before_lines is distinct from after_lines or general<>o.discount_amount;
 if changed and o.production_status='delivered' then raise exception 'Reabre el pedido antes de modificar sus importes' using errcode='42501'; end if;
 if sub-general<paid then raise exception 'El total quedaría por debajo de pagos válidos; recarga y verifica' using errcode='PT409'; end if;
 new_commercial:=o.commercial_revision+case when changed then 1 else 0 end;
 if sub-general=0 and changed then
 if not private.is_admin() then raise exception 'Total cero requiere nueva autorización administrativa' using errcode='42501'; end if;
 zr:=private.order_reason(payload->>'zero_reason');
 end if;
 update public.orders set commercial_revision=new_commercial,
 zero_total_authorized_revision=case when sub-general=0 then new_commercial end,
 zero_total_authorized_by=case when sub-general=0 then case when changed then auth.uid() else o.zero_total_authorized_by end end,
 zero_total_authorized_at=case when sub-general=0 then case when changed then clock_timestamp() else o.zero_total_authorized_at end end,
 zero_total_reason=case when sub-general=0 then case when changed then zr else o.zero_total_reason end end,
 client_id=c.id,client_snapshot=case when fresh or c.id is distinct from o.client_id then
 jsonb_build_object('name',c.name,'phone',c.phone,'email',c.email) else o.client_snapshot end,
 order_date=od,requested_delivery_date=rd,notes=coalesce(payload->>'notes',''),subtotal=sub,discount_amount=general,total=round(sub-general,2),
 revision=case when fresh then 1 else o.revision+1 end,updated_by=auth.uid(),updated_at=now() where id=target;
 if changed then perform private.order_event(target,'order.financial_changed',payload->>'reason',jsonb_build_object('before_total',o.total::text,'total',round(sub-general,2)::text,'commercial_revision',new_commercial));end if;
 if zr is not null then perform private.order_event(target,'order.zero_authorized',zr,jsonb_build_object('commercial_revision',new_commercial));end if;
 if c.id<>o.client_id then perform private.order_event(target,'order.client_changed',payload->>'reason',jsonb_build_object('before_client_id',o.client_id,'client_id',c.id));end if;
 return target;
end $$;
create or replace function private.register_payment(target uuid,expected_revision integer,payload jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare o public.orders; amount_value numeric; paid numeric; t timestamptz; result uuid;
begin
 o:=private.lock_order(target,expected_revision);
 if o.production_status not in ('confirmed','in_production','ready','delivered') then raise exception 'Estado no admite pagos' using errcode='42501'; end if;
 if payload is null or jsonb_typeof(payload)<>'object' or payload-array['amount','payment_date','payment_method','reference','notes','payment_type']<>'{}'::jsonb then raise exception 'Datos de pago inválidos' using errcode='22023'; end if;
 amount_value:=private.quote_input_money(payload->>'amount');
 if amount_value<=0 then raise exception 'El monto debe ser mayor que cero' using errcode='22023'; end if;
 t:=private.order_effective_at(payload->>'payment_date',o.confirmed_at);
 select coalesce(sum(amount),0) into paid from public.payments where order_id=target and status='valid';
 if amount_value>o.total-paid then raise exception 'El pago supera el saldo vigente. Recarga y verifica los pagos.' using errcode='PT409'; end if;
 insert into public.payments(order_id,client_id,amount,payment_date,payment_method,reference,notes,created_by,payment_type) values(target,o.client_id,amount_value,t,payload->>'payment_method',coalesce(payload->>'reference',''),coalesce(payload->>'notes',''),auth.uid(),nullif(trim(payload->>'payment_type'),'')) returning id into result;
 update public.orders set revision=revision+1,updated_by=auth.uid(),updated_at=clock_timestamp() where id=target;
 perform private.order_event(target,'order.payment_recorded',null,jsonb_build_object('payment_id',result,'amount',amount_value::text,'payment_date',t));
 return result;
end $$;
create or replace view public.payments_read with (security_invoker=true) as
 select id,order_id,client_id,amount::text,currency,payment_date,payment_method,reference,notes,status,
 created_by,voided_by,voided_at,void_reason,created_at,updated_at,payment_type from public.payments;
commit;
