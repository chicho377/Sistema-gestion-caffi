-- Fase 3B exclusivamente. Operaciones atómicas, sin DML directo ni estados financieros mutables.
begin;
create table public.order_counters(year integer primary key check(year between 1 and 9999),last_sequence bigint not null check(last_sequence>0));
alter table public.order_counters enable row level security;
revoke all on public.order_counters from public,anon,authenticated,service_role;
create table public.payments(
 id uuid primary key default gen_random_uuid(),order_id uuid not null references public.orders(id) on delete restrict,
 client_id uuid not null references public.clients(id) on delete restrict,
 amount public.quote_money not null check(amount>0),currency text not null default 'CRC' check(currency='CRC'),
 payment_date timestamptz not null,payment_method text not null check(payment_method in ('cash','sinpe_movil','transfer','card','other')),
 reference text not null default '' check(length(reference)<=300),notes text not null default '' check(length(notes)<=3000),
 status text not null default 'valid' check(status in ('valid','voided')),
 created_by uuid not null references public.profiles(id) on delete restrict,
 voided_by uuid references public.profiles(id) on delete restrict,voided_at timestamptz,void_reason text,
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 constraint payments_void_evidence check((case when status='valid' then voided_by is null and voided_at is null and void_reason is null else voided_by is not null and voided_at is not null and void_reason is not null and length(trim(void_reason)) between 1 and 1000 end) is true)
);
create index payments_order_status_idx on public.payments(order_id,status);
create index payments_client_idx on public.payments(client_id);
create index payments_creator_idx on public.payments(created_by);
create index payments_voider_idx on public.payments(voided_by);
create index payments_date_idx on public.payments(payment_date);
alter table public.payments enable row level security;
revoke all on public.payments from public,anon,authenticated,service_role;
grant select on public.payments to authenticated;
create policy payments_operational_read on public.payments for select to authenticated using ((select private.is_active()) and exists(select 1 from public.orders o where o.id=order_id));
create trigger payment_audit after insert or update on public.payments for each row execute function private.audit_catalog();
alter table public.settings add constraint settings_deposit_scale_3b check(scale(deposit_percentage)<=2) not valid;
alter table public.settings validate constraint settings_deposit_scale_3b;

create function private.lock_order(target uuid,expected_revision integer) returns public.orders
language plpgsql security invoker set search_path='' as $$
declare o public.orders; begin
 perform 1 from public.profiles where id=auth.uid() and status='active' for share;
 if not found then raise exception 'Acceso no autorizado' using errcode='42501'; end if;
 select * into o from public.orders where id=target for update;
 if not found or o.revision is distinct from expected_revision then raise exception 'El pedido cambió. Recarga antes de reintentar.' using errcode='PT409'; end if;
 return o;
end $$;
create function private.order_reason(v text) returns text language plpgsql immutable set search_path='' as $$
begin if v is null or length(trim(v)) not between 1 and 1000 then raise exception 'Motivo obligatorio (hasta 1000 caracteres)' using errcode='22023'; end if; return trim(v); end $$;
create function private.order_effective_at(v text,minimum timestamptz default null) returns timestamptz
language plpgsql security invoker set search_path='' as $$
declare t timestamptz; begin
 if nullif(v,'') is null then t:=clock_timestamp(); else
 if v !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?(Z|[+-]\d{2}:\d{2})$' then raise exception 'Fecha/hora con zona requerida' using errcode='22023'; end if;
 t:=v::timestamptz; end if;
 if not isfinite(t) or t>clock_timestamp() or (minimum is not null and t<minimum) or ((t at time zone 'America/Costa_Rica')::date<(clock_timestamp() at time zone 'America/Costa_Rica')::date and not private.is_admin()) then raise exception 'Fecha efectiva no autorizada' using errcode='22023'; end if;
 return t;
end $$;
create function private.order_event(target uuid,event text,reason text,details jsonb) returns void language sql security invoker set search_path='' as $$
 insert into public.audit_log(user_id,action,entity_type,entity_id,reason,metadata) values(auth.uid(),event,'orders',target,nullif(trim(reason),''),details)
$$;
create function private.guard_payment() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if (to_jsonb(new)-array['status','voided_by','voided_at','void_reason','updated_at']) is distinct from (to_jsonb(old)-array['status','voided_by','voided_at','void_reason','updated_at']) or old.status<>'valid' or new.status<>'voided' or not private.is_admin() or new.voided_by is distinct from auth.uid() then raise exception 'Pago inmutable; corregir mediante anulación administrativa' using errcode='42501'; end if;
 return new;
end $$;
create trigger payment_immutable before update on public.payments for each row execute function private.guard_payment();

create function private.confirm_order(target uuid,expected_revision integer,payload jsonb) returns void language plpgsql security definer set search_path='' as $$
declare o public.orders; t timestamptz; pct numeric; sub numeric; n integer; y integer; seq bigint; zero_reason text; special boolean;
begin
 o:=private.lock_order(target,expected_revision);
 if o.production_status<>'quote' then raise exception 'Solo se confirma una cotización vigente' using errcode='PT409'; end if;
 if payload is null or jsonb_typeof(payload)<>'object' or payload-array['confirmed_at','deposit_percentage','zero_reason']<>'{}'::jsonb then raise exception 'Datos de confirmación inválidos' using errcode='22023'; end if;
 t:=private.order_effective_at(payload->>'confirmed_at');
 if (t at time zone 'America/Costa_Rica')::date<o.order_date then raise exception 'Confirmación anterior al pedido' using errcode='22023'; end if;
 perform 1 from public.clients where id=o.client_id for share;
 if not found then raise exception 'Cliente inválido' using errcode='22023'; end if;
 select count(*),coalesce(sum(round(quantity::numeric*unit_price-discount_amount,2)),0) into n,sub from public.order_items where order_id=target and is_active;
 if n<1 or sub<>o.subtotal or round(sub-o.discount_amount,2)<>o.total then raise exception 'Revisa las líneas y los importes del pedido' using errcode='22023'; end if;
 special:=nullif(payload->>'deposit_percentage','') is not null;
 if special then
 if not private.is_admin() then raise exception 'Porcentaje especial solo Administración' using errcode='42501'; end if;
 pct:=private.quote_input_money(payload->>'deposit_percentage');
 else select deposit_percentage into pct from public.settings where singleton for share; end if;
 if pct is null or pct<0 or pct>100 or scale(pct)>2 then raise exception 'Porcentaje entre 0 y 100 con máximo dos decimales' using errcode='22023'; end if;
 if o.total=0 then
 if not private.is_admin() then raise exception 'Total cero requiere Administración' using errcode='42501'; end if;
 zero_reason:=private.order_reason(payload->>'zero_reason'); end if;
 y:=extract(year from t at time zone 'America/Costa_Rica');
 insert into public.order_counters(year,last_sequence) values(y,1) on conflict(year) do update set last_sequence=public.order_counters.last_sequence+1 returning last_sequence into seq;
 update public.orders set confirmed_at=t,number_year=y,number_sequence=seq,order_number='PED-'||y::text||'-'||lpad(seq::text,greatest(5,length(seq::text)),'0'),
 deposit_percentage_override=case when special then pct end,deposit_percentage_applied=pct,deposit_required_amount=round(total*pct/100,2),production_status='confirmed',
 zero_total_authorized_by=case when total=0 then auth.uid() end,zero_total_authorized_at=case when total=0 then clock_timestamp() end,zero_total_reason=zero_reason,zero_total_authorized_revision=case when total=0 then commercial_revision end,
 revision=revision+1,updated_by=auth.uid(),updated_at=clock_timestamp() where id=target;
 perform private.order_event(target,'order.confirmed',zero_reason,jsonb_build_object('number_year',y,'number_sequence',seq,'confirmed_at',t,'deposit_percentage_applied',pct::text,'deposit_required_amount',round(o.total*pct/100,2)::text,'from','quote','to','confirmed'));
 if special then perform private.order_event(target,'order.deposit_override',null,jsonb_build_object('percentage',pct::text)); end if;
 if o.total=0 then perform private.order_event(target,'order.zero_authorized',zero_reason,jsonb_build_object('commercial_revision',o.commercial_revision)); end if;
end $$;

create function private.register_payment(target uuid,expected_revision integer,payload jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare o public.orders; amount_value numeric; paid numeric; t timestamptz; result uuid;
begin
 o:=private.lock_order(target,expected_revision);
 if o.production_status not in ('confirmed','in_production','ready','delivered') then raise exception 'Estado no admite pagos' using errcode='42501'; end if;
 if payload is null or jsonb_typeof(payload)<>'object' or payload-array['amount','payment_date','payment_method','reference','notes']<>'{}'::jsonb then raise exception 'Datos de pago inválidos' using errcode='22023'; end if;
 amount_value:=private.quote_input_money(payload->>'amount');
 if amount_value<=0 then raise exception 'El monto debe ser mayor que cero' using errcode='22023'; end if;
 t:=private.order_effective_at(payload->>'payment_date',o.confirmed_at);
 select coalesce(sum(amount),0) into paid from public.payments where order_id=target and status='valid';
 if amount_value>o.total-paid then raise exception 'El pago supera el saldo vigente. Recarga y verifica los pagos.' using errcode='PT409'; end if;
 insert into public.payments(order_id,client_id,amount,payment_date,payment_method,reference,notes,created_by) values(target,o.client_id,amount_value,t,payload->>'payment_method',coalesce(payload->>'reference',''),coalesce(payload->>'notes',''),auth.uid()) returning id into result;
 update public.orders set revision=revision+1,updated_by=auth.uid(),updated_at=clock_timestamp() where id=target;
 perform private.order_event(target,'order.payment_recorded',null,jsonb_build_object('payment_id',result,'amount',amount_value::text,'payment_date',t));
 return result;
end $$;
create function private.void_payment(target uuid,expected_revision integer,payload jsonb) returns void language plpgsql security definer set search_path='' as $$
declare o public.orders; p public.payments; reason text;
begin
 o:=private.lock_order(target,expected_revision);
 if not private.is_admin() then raise exception 'Anulación exclusiva de Administración' using errcode='42501'; end if;
 if payload is null or jsonb_typeof(payload)<>'object' or payload-array['payment_id','reason']<>'{}'::jsonb then raise exception 'Datos inválidos' using errcode='22023'; end if;
 reason:=private.order_reason(payload->>'reason');
 select * into p from public.payments where id=(payload->>'payment_id')::uuid and order_id=target for update;
 if not found or p.status<>'valid' then raise exception 'El pago cambió o ya fue anulado' using errcode='PT409'; end if;
 update public.payments set status='voided',voided_by=auth.uid(),voided_at=clock_timestamp(),void_reason=reason,updated_at=clock_timestamp() where id=p.id;
 update public.orders set revision=revision+1,updated_by=auth.uid(),updated_at=clock_timestamp() where id=target;
 perform private.order_event(target,'order.payment_voided',reason,jsonb_build_object('payment_id',p.id,'amount',p.amount::text));
end $$;

create function private.transition_order(target uuid,expected_revision integer,payload jsonb) returns void language plpgsql security definer set search_path='' as $$
declare o public.orders; dest text; reason text; t timestamptz; paid numeric; back boolean:=false;
begin
 o:=private.lock_order(target,expected_revision);
 if payload is null or jsonb_typeof(payload)<>'object' or payload-array['state','reason','delivered_at']<>'{}'::jsonb then raise exception 'Datos inválidos' using errcode='22023'; end if;
 dest:=payload->>'state';reason:=payload->>'reason';
 if o.production_status='cancelled' or dest is null then raise exception 'Estado no disponible' using errcode='PT409'; end if;
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

create function private.correct_order_dates(target uuid,expected_revision integer,payload jsonb) returns void language plpgsql security definer set search_path='' as $$
declare o public.orders;t timestamptz;d timestamptz;reason text;
begin
 o:=private.lock_order(target,expected_revision);
 if not private.is_admin() or o.confirmed_at is null or o.production_status='cancelled' then raise exception 'Corrección no autorizada' using errcode='42501'; end if;
 if payload is null or jsonb_typeof(payload)<>'object' or payload-array['confirmed_at','delivered_at','reason']<>'{}'::jsonb then raise exception 'Datos inválidos' using errcode='22023'; end if;
 reason:=private.order_reason(payload->>'reason');
 t:=case when nullif(payload->>'confirmed_at','') is null then o.confirmed_at else private.order_effective_at(payload->>'confirmed_at') end;
 d:=case when nullif(payload->>'delivered_at','') is null then o.delivered_at else private.order_effective_at(payload->>'delivered_at',t) end;
 if extract(year from t at time zone 'America/Costa_Rica')<>o.number_year or (t at time zone 'America/Costa_Rica')::date<o.order_date or (d is not null and (o.production_status<>'delivered' or d<t)) or exists(select 1 from public.payments where order_id=target and status='valid' and payment_date<t) then raise exception 'Cronología incompatible; no se renumera el pedido' using errcode='22023'; end if;
 update public.orders set confirmed_at=t,delivered_at=d,revision=revision+1,updated_by=auth.uid(),updated_at=clock_timestamp() where id=target;
 perform private.order_event(target,'order.dates_corrected',reason,jsonb_build_object('before_confirmed_at',o.confirmed_at,'confirmed_at',t,'previous_delivered_at',o.delivered_at,'delivered_at',d));
end $$;

create function private.amend_order(target uuid, expected_revision integer, payload jsonb) returns uuid
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
 if target is null or expected_revision is null or jsonb_typeof(payload)<>'object' or
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

create function public.confirm_order(target uuid,expected_revision integer,payload jsonb) returns void language sql security invoker set search_path='' as $$select private.confirm_order(target,expected_revision,payload)$$;
revoke all on function private.confirm_order(uuid,integer,jsonb),public.confirm_order(uuid,integer,jsonb) from public,anon,authenticated,service_role;
grant execute on function private.confirm_order(uuid,integer,jsonb),public.confirm_order(uuid,integer,jsonb) to authenticated;

create function public.register_payment(target uuid,expected_revision integer,payload jsonb) returns uuid language sql security invoker set search_path='' as $$select private.register_payment(target,expected_revision,payload)$$;
revoke all on function private.register_payment(uuid,integer,jsonb),public.register_payment(uuid,integer,jsonb) from public,anon,authenticated,service_role;
grant execute on function private.register_payment(uuid,integer,jsonb),public.register_payment(uuid,integer,jsonb) to authenticated;

create function public.void_payment(target uuid,expected_revision integer,payload jsonb) returns void language sql security invoker set search_path='' as $$select private.void_payment(target,expected_revision,payload)$$;
revoke all on function private.void_payment(uuid,integer,jsonb),public.void_payment(uuid,integer,jsonb) from public,anon,authenticated,service_role;
grant execute on function private.void_payment(uuid,integer,jsonb),public.void_payment(uuid,integer,jsonb) to authenticated;

create function public.transition_order(target uuid,expected_revision integer,payload jsonb) returns void language sql security invoker set search_path='' as $$select private.transition_order(target,expected_revision,payload)$$;
revoke all on function private.transition_order(uuid,integer,jsonb),public.transition_order(uuid,integer,jsonb) from public,anon,authenticated,service_role;
grant execute on function private.transition_order(uuid,integer,jsonb),public.transition_order(uuid,integer,jsonb) to authenticated;

create function public.correct_order_dates(target uuid,expected_revision integer,payload jsonb) returns void language sql security invoker set search_path='' as $$select private.correct_order_dates(target,expected_revision,payload)$$;
revoke all on function private.correct_order_dates(uuid,integer,jsonb),public.correct_order_dates(uuid,integer,jsonb) from public,anon,authenticated,service_role;
grant execute on function private.correct_order_dates(uuid,integer,jsonb),public.correct_order_dates(uuid,integer,jsonb) to authenticated;

create function public.amend_order(target uuid,expected_revision integer,payload jsonb) returns uuid language sql security invoker set search_path='' as $$select private.amend_order(target,expected_revision,payload)$$;
revoke all on function private.amend_order(uuid,integer,jsonb),public.amend_order(uuid,integer,jsonb) from public,anon,authenticated,service_role;
grant execute on function private.amend_order(uuid,integer,jsonb),public.amend_order(uuid,integer,jsonb) to authenticated;

create function private.order_deposit_default() returns text language plpgsql stable security definer set search_path='' as $$
begin if not private.is_active() then raise exception 'Forbidden' using errcode='42501';end if;return (select deposit_percentage::text from public.settings where singleton);end $$;
create function public.order_deposit_default() returns text language sql security invoker set search_path='' as $$select private.order_deposit_default()$$;
revoke all on function private.order_deposit_default(),public.order_deposit_default() from public,anon,authenticated,service_role;
grant execute on function private.order_deposit_default(),public.order_deposit_default() to authenticated;
create function private.order_history(target uuid) returns table(event_id uuid,happened_at timestamptz,action text,actor text,reason text,from_state text,to_state text) language plpgsql stable security definer set search_path='' as $$
begin
 if not private.is_active() or not exists(select 1 from public.orders where id=target) then raise exception 'Forbidden' using errcode='42501';end if;
 return query select a.id,a.created_at,a.action,p.full_name,a.reason,a.metadata->>'from',a.metadata->>'to' from public.audit_log a left join public.profiles p on p.id=a.user_id where a.entity_type='orders' and a.entity_id=target and a.action in ('order.confirmed','order.deposit_override','order.zero_authorized','order.payment_recorded','order.payment_voided','order.production_override','order.transitioned','order.reversed','order.reopened','order.delivered','order.cancelled','order.client_changed','order.financial_changed','order.dates_corrected','quote.cancelled') order by a.created_at desc,a.id;
end $$;
create function public.order_history(target uuid) returns table(event_id uuid,happened_at timestamptz,action text,actor text,reason text,from_state text,to_state text) language sql security invoker set search_path='' as $$select * from private.order_history(target)$$;
revoke all on function private.order_history(uuid),public.order_history(uuid) from public,anon,authenticated,service_role;
grant execute on function private.order_history(uuid),public.order_history(uuid) to authenticated;
revoke all on function private.lock_order(uuid,integer),private.order_reason(text),private.order_effective_at(text,timestamptz),private.order_event(uuid,text,text,jsonb),private.guard_payment() from public,anon,authenticated,service_role;

create or replace view public.quotes_read with (security_invoker=true) as
 select id,client_id,client_snapshot,order_date,requested_delivery_date,production_status,currency,
 subtotal::text,discount_amount::text,total::text,order_number,confirmed_at,delivered_at,notes,revision,
 created_by,updated_by,cancelled_by,cancelled_at,cancel_reason,created_at,updated_at,
 number_year,number_sequence,deposit_percentage_applied::text,deposit_required_amount::text,commercial_revision,zero_total_reason
 from public.orders;
create view public.payments_read with (security_invoker=true) as select id,order_id,client_id,amount::text,currency,payment_date,payment_method,reference,notes,status,created_by,voided_by,voided_at,void_reason,created_at,updated_at from public.payments;
create view public.order_payment_summary with (security_invoker=true) as
 select o.id as order_id,o.total::text,coalesce(p.paid,0)::text as paid,(o.total-coalesce(p.paid,0))::text as balance,
 case when o.total=0 or coalesce(p.paid,0)>=o.total then 'paid' when coalesce(p.paid,0)=0 then 'no_deposit' else 'partially_paid' end as financial_status,
 o.deposit_required_amount::text,least(o.deposit_required_amount,o.total)::text as operational_deposit_required,
 coalesce(p.paid,0)>=least(o.deposit_required_amount,o.total) as deposit_covered
 from public.orders o left join lateral (select sum(amount) as paid from public.payments where order_id=o.id and status='valid') p on true;
revoke all on public.payments_read,public.order_payment_summary from public,anon,authenticated,service_role;
grant select on public.payments_read,public.order_payment_summary to authenticated;
create or replace function private.register_order_file(actor uuid,target uuid,object_path text,caption_text text,size_bytes integer,replaces uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare result uuid; o public.orders;
begin
 perform 1 from public.profiles where id=actor and status='active' for share;
 if not found then raise exception 'Forbidden' using errcode='42501'; end if;
 select * into o from public.orders where id=target for update;
 if not found or o.production_status='cancelled' then raise exception 'Cotización no disponible' using errcode='42501'; end if;
 if split_part(object_path,'/',2)<>target::text or not exists(select 1 from storage.objects where bucket_id='order-references' and name=object_path) then raise exception 'Archivo inválido'; end if;
 if replaces is not null and not exists(select 1 from public.order_files where id=replaces and order_id=target and is_active) then raise exception 'Versión inválida'; end if;
 if replaces is not null then update public.order_files set is_active=false,updated_at=now() where id=replaces; end if;
 insert into public.order_files(order_id,path,caption,byte_size,uploaded_by,replaces_id) values(target,object_path,caption_text,size_bytes,actor,replaces) returning id into result;
 insert into public.audit_log(user_id,action,entity_type,entity_id,metadata) values(actor,'quote.file_registered','order_files',result,jsonb_build_object('order_id',target,'replaces_id',replaces));
 return result;
end $$;
commit;
