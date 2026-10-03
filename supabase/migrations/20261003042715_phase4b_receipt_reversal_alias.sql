-- Corrección técnica 4B: alias distinto del record de materials. Misma firma y ACL.
begin;
create or replace function private.inventory_operation(target uuid,operation text,payload jsonb,expected_revisions jsonb,expected_orders jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare actor public.profiles;src public.inventory_movements;attr public.inventory_movement_attribution_corrections;
 m public.materials;b public.inventory_balances;o public.orders;oid uuid;ord uuid;item uuid;mat uuid;origin uuid;dest uuid;destitem uuid;
 mids uuid[];origins uuid[];orders uuid[];t timestamptz;q numeric;why text;amount numeric;crc numeric;rate numeric;rd date;rs text;ro text;rr text;manual boolean:=false;r jsonb;day date;today date:=(clock_timestamp() at time zone 'America/Costa_Rica')::date;
 qty numeric;position integer:=0;made uuid;ar bigint:=0;
begin
 select * into actor from public.profiles where id=auth.uid() and status='active' for share;
 if not found then raise exception 'Acceso no autorizado' using errcode='42501';end if;
 if operation is null or operation not in ('consumption','return','adjustment_positive','adjustment_negative','entry_reversal','receipt_reversal','quantity_correction','attribution_correction') then raise exception 'Operación inválida' using errcode='22023';end if;
 if operation not in ('consumption','return') and actor.role<>'admin' then raise exception 'Solo Administración puede realizar esta operación' using errcode='42501';end if;
 if target is null or jsonb_typeof(payload) is distinct from 'object' or payload-array['material_id','order_id','order_item_id','source_movement_id','receipt_id','quantity','replacement_quantity','effective_at','reason','attribution_revision','destination_order_id','destination_order_item_id','amount','currency','historical_rate','rate_reason','rate_source']<>'{}'::jsonb or jsonb_typeof(expected_revisions) is distinct from 'object' or jsonb_typeof(expected_orders) is distinct from 'object' then raise exception 'Datos inválidos' using errcode='22023';end if;
 if exists(select 1 from jsonb_each(payload) x where jsonb_typeof(x.value) not in ('string','null')) then raise exception 'Utiliza texto decimal y campos válidos' using errcode='22023';end if;
 if exists(select 1 from public.inventory_movements where request_id=target) or exists(select 1 from public.inventory_movement_attribution_corrections where id=target) then raise exception 'Solicitud ya registrada; consulta antes de reintentar' using errcode='PT409';end if;
 why:=nullif(trim(payload->>'reason'),'');if operation<>'consumption' then why:=private.order_reason(why);elsif length(why)>1000 then raise exception 'Motivo demasiado largo' using errcode='22023';end if;
 if actor.role<>'admin' and nullif(payload->>'effective_at','') is not null then raise exception 'Colaborador utiliza fecha del servidor' using errcode='42501';end if;
 if actor.role<>'admin' and (payload ?| array['amount','currency','historical_rate','rate_reason','rate_source']) then raise exception 'Datos financieros no autorizados' using errcode='42501';end if;
 t:=private.order_effective_at(payload->>'effective_at');
 mat:=nullif(payload->>'material_id','')::uuid;ord:=nullif(payload->>'order_id','')::uuid;item:=nullif(payload->>'order_item_id','')::uuid;
 origin:=nullif(payload->>'source_movement_id','')::uuid;
 if operation in ('return','entry_reversal','quantity_correction','attribution_correction') then
 select * into src from public.inventory_movements where id=origin;if not found then raise exception 'Movimiento origen inexistente' using errcode='22023';end if;
 if operation<>'entry_reversal' and src.movement_type<>'consumption' then raise exception 'Se requiere un consumo original' using errcode='22023';end if;
 select * into attr from public.inventory_movement_attribution_corrections where movement_id=origin order by revision desc limit 1;
 ar:=coalesce(attr.revision,0);ord:=coalesce(attr.corrected_order_id,src.order_id);item:=case when attr.id is null then src.order_item_id else attr.corrected_order_item_id end;mat:=src.material_id;
 if operation<>'entry_reversal' and (payload->>'attribution_revision' is null or payload->>'attribution_revision'!~'^\d+$' or (payload->>'attribution_revision')::bigint<>ar) then raise exception 'La atribución cambió; recarga el movimiento' using errcode='PT409';end if;
 origins:=array[origin];
 elsif operation='receipt_reversal' then
 select array_agg(mov.id order by mov.id),array_agg(distinct mov.material_id order by mov.material_id) into origins,mids from public.inventory_movements mov join public.inventory_receipt_items i on i.id=mov.receipt_item_id where i.receipt_id=nullif(payload->>'receipt_id','')::uuid;
 if origins is null then raise exception 'Recepción inexistente' using errcode='22023';end if;
 ord:=null;item:=null;
 elsif origin is not null then raise exception 'Origen reservado a operaciones vinculadas' using errcode='22023';end if;
 if operation='attribution_correction' then dest:=nullif(payload->>'destination_order_id','')::uuid;destitem:=nullif(payload->>'destination_order_item_id','')::uuid;if dest is null then raise exception 'Pedido destino requerido' using errcode='22023';end if;end if;
 if operation in ('adjustment_positive','adjustment_negative','receipt_reversal','entry_reversal') and (ord is not null or item is not null) then raise exception 'Esta operación no atribuye consumo a un pedido' using errcode='22023';end if;
 if operation in ('consumption','return','quantity_correction','attribution_correction') and ord is null then raise exception 'Pedido requerido' using errcode='22023';end if;
 select array_agg(distinct x order by x) into orders from unnest(array[ord,dest]) x where x is not null;
 foreach oid in array coalesce(orders,array[]::uuid[]) loop
 o:=private.lock_order(oid,(expected_orders->>oid::text)::integer);
 if o.confirmed_at is null then raise exception 'Pedido no confirmado' using errcode='22023';end if;
 if operation<>'attribution_correction' and t<o.confirmed_at then raise exception 'La fecha precede la confirmación' using errcode='22023';end if;
 if oid=ord and (operation='consumption' or (operation='return' and actor.role<>'admin')) and o.production_status not in ('in_production','ready') then raise exception 'El pedido no permite esta operación' using errcode='PT409';end if;
 end loop;
 if item is not null and operation='consumption' and not exists(select 1 from public.order_items where id=item and order_id=ord and is_active) then raise exception 'Línea ajena o inactiva' using errcode='22023';end if;
 if destitem is not null and not exists(select 1 from public.order_items where id=destitem and order_id=dest) then raise exception 'Línea destino ajena al pedido' using errcode='22023';end if;
 if mids is null then mids:=array[mat];end if;
 foreach mat in array mids loop
 select * into m from public.materials where id=mat for update;if not found then raise exception 'Material inexistente' using errcode='22023';end if;
 end loop;
 foreach mat in array mids loop
 if operation='adjustment_positive' then
 insert into public.inventory_balances(material_id) values(mat) on conflict do nothing;
 insert into public.inventory_valuations(material_id) values(mat) on conflict do nothing;
 end if;
 select * into b from public.inventory_balances where material_id=mat for update;
 if not found or expected_revisions->>mat::text is null or expected_revisions->>mat::text!~'^\d+$' or b.revision<>(expected_revisions->>mat::text)::bigint then raise exception 'Las existencias cambiaron; recarga antes de reintentar' using errcode='PT409';end if;
 perform 1 from public.inventory_valuations where material_id=mat for update;
 if operation<>'attribution_correction' and t<b.last_effective_at then raise exception 'La fecha precede historia consolidada' using errcode='22023';end if;
 -- La unidad queda fijada antes del primer ajuste, bajo el mismo lock del catálogo.
 if b.unit_locked is null and operation='adjustment_positive' then
 -- Se fija junto al primer movimiento, evitando un estado intermedio inválido.
 null;
 end if;
 end loop;
 foreach oid in array coalesce(origins,array[]::uuid[]) loop
 perform 1 from public.inventory_movements where id=oid for update;
 end loop;
 if origin is not null and operation<>'entry_reversal' then
 if coalesce((select max(revision) from public.inventory_movement_attribution_corrections where movement_id=origin),0)<>ar then raise exception 'La atribución cambió; recarga' using errcode='PT409';end if;
 end if;
 if operation='attribution_correction' then
 if ord=dest and item is not distinct from destitem then raise exception 'La atribución no cambia' using errcode='22023';end if;
 insert into public.inventory_movement_attribution_corrections(id,movement_id,previous_order_id,previous_order_item_id,corrected_order_id,corrected_order_item_id,created_by,reason,revision) values(target,origin,ord,item,dest,destitem,actor.id,why,ar+1);
 return target;
 end if;
 if operation in ('entry_reversal','receipt_reversal') then
 -- Validar TODAS antes de compensar: una línea con posteriores invalida el conjunto.
 foreach oid in array origins loop
 select * into src from public.inventory_movements where id=oid;
 if src.movement_type not in ('purchase_entry','opening_balance') or (select last_movement_id from public.inventory_balances where material_id=src.material_id)<>src.id then raise exception 'Existen movimientos posteriores; utiliza ajuste actual' using errcode='PT409';end if;
 end loop;
 foreach oid in array origins loop
 select * into src from public.inventory_movements where id=oid;position:=position+1;
 made:=private.inventory_write_4b(target,position,'entry_reversal',src.material_id,null,null,oid,src.quantity,t,why);
 end loop;return target;
 end if;
 mat:=mids[1];q:=private.inventory_decimal(payload->>'quantity',4);
 if operation='quantity_correction' then
 made:=private.inventory_write_4b(target,1,'return',mat,ord,item,origin,q,t,why);
 if nullif(payload->>'replacement_quantity','') is not null then
 qty:=private.inventory_decimal(payload->>'replacement_quantity',4);
 made:=private.inventory_write_4b(target,2,'consumption',mat,ord,item,origin,qty,t,why);
 end if;return target;
 end if;
 if operation='adjustment_positive' then
 select * into b from public.inventory_balances where material_id=mat;
 if b.quantity_on_hand>0 then
 if payload ?| array['amount','currency','historical_rate','rate_reason','rate_source'] then raise exception 'Con stock se utiliza valoración proporcional, sin costo nuevo' using errcode='22023';end if;
 else
 amount:=private.inventory_decimal(payload->>'amount',2);day:=(t at time zone 'America/Costa_Rica')::date;ro:='not_applicable';
 if payload->>'currency'='CRC' then
 if payload ?| array['historical_rate','rate_reason','rate_source'] then raise exception 'CRC no utiliza tasa' using errcode='22023';end if;crc:=amount;
 elsif payload->>'currency'='USD' then
 r:=private.expense_rate(day);
 if payload ?| array['historical_rate','rate_reason','rate_source'] then
 if day=today or r is not null then raise exception 'Tasa manual solo para histórico sin referencia' using errcode='22023';end if;
 rate:=private.inventory_decimal(payload->>'historical_rate',100);rr:=private.order_reason(payload->>'rate_reason');rs:=trim(payload->>'rate_source');
 if rs is null or length(rs) not between 1 and 300 then raise exception 'Procedencia requerida' using errcode='22023';end if;rd:=day;manual:=true;ro:='admin_historical';
 else
 if r is null then raise exception 'No existe referencia válida para esta fecha' using errcode='22023';end if;
 rate:=(r->>'rate')::numeric;rd:=(r->>'date')::date;rs:=r->>'source';ro:='provider';end if;
 crc:=round(amount*rate,2);
 else raise exception 'Moneda CRC/USD requerida' using errcode='22023';end if;
 end if;
 elsif payload ?| array['amount','currency','historical_rate','rate_reason','rate_source'] then raise exception 'No se admiten importes en esta operación' using errcode='22023';end if;
 made:=private.inventory_write_4b(target,1,operation,mat,ord,item,origin,q,t,why,crc);
 if crc is not null then insert into public.inventory_adjustment_cost_evidence(movement_id,amount_original,currency,amount_crc,exchange_rate_applied,exchange_rate_date,exchange_rate_source,rate_origin,rate_is_fallback,rate_provided_by,rate_provided_at,rate_override_reason)
 values(made,amount,payload->>'currency',crc,rate,rd,rs,ro,coalesce(rd<day,false),case when manual then actor.id end,case when manual then clock_timestamp() end,rr);end if;
 return target;
exception when unique_violation then raise exception 'Solicitud concurrente o ya registrada; consulta antes de reintentar' using errcode='PT409';
end $$;
commit;
