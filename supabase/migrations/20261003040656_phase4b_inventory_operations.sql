-- D-23. Excepciones limitadas autorizadas; sin cambios de historia.
begin;
lock table public.inventory_movements,public.inventory_movement_costs,public.inventory_balances,public.inventory_valuations in access exclusive mode;
do $$declare ident oid;begin select oid into ident from pg_constraint where conrelid='public.inventory_balances'::regclass and conname='inventory_balances_check';if ident is null or pg_get_constraintdef(ident,true)<>'CHECK (revision = 0 AND last_movement_id IS NULL AND last_effective_at IS NULL AND unit_locked IS NULL AND quantity_on_hand::numeric = 0::numeric OR revision > 0 AND last_movement_id IS NOT NULL AND last_effective_at IS NOT NULL AND unit_locked IS NOT NULL AND quantity_on_hand::numeric > 0::numeric)' or exists(select 1 from pg_depend where refclassid='pg_constraint'::regclass and refobjid=ident) then raise exception 'Preflight difiere: inventory_balances_check';end if;end $$;
do $$declare ident oid;begin select oid into ident from pg_constraint where conrelid='public.inventory_movement_costs'::regclass and conname='inventory_movement_costs_check';if ident is null or pg_get_constraintdef(ident,true)<>'CHECK (value_after_crc::numeric = (value_before_crc::numeric + movement_amount_crc::numeric))' or exists(select 1 from pg_depend where refclassid='pg_constraint'::regclass and refobjid=ident) then raise exception 'Preflight difiere: inventory_movement_costs_check';end if;end $$;
do $$declare ident oid;begin select oid into ident from pg_constraint where conrelid='public.inventory_movement_costs'::regclass and conname='inventory_movement_costs_valuation_version_check';if ident is null or pg_get_constraintdef(ident,true)<>'CHECK (valuation_version = ''moving_average_value_v1''::text)' or exists(select 1 from pg_depend where refclassid='pg_constraint'::regclass and refobjid=ident) then raise exception 'Preflight difiere: inventory_movement_costs_valuation_version_check';end if;end $$;
do $$declare ident oid;begin select oid into ident from pg_constraint where conrelid='public.inventory_movements'::regclass and conname='inventory_movements_check';if ident is null or pg_get_constraintdef(ident,true)<>'CHECK (stock_after::numeric = (stock_before::numeric + quantity::numeric))' or exists(select 1 from pg_depend where refclassid='pg_constraint'::regclass and refobjid=ident) then raise exception 'Preflight difiere: inventory_movements_check';end if;end $$;
do $$declare ident oid;begin select oid into ident from pg_constraint where conrelid='public.inventory_movements'::regclass and conname='inventory_movements_movement_type_check';if ident is null or pg_get_constraintdef(ident,true)<>'CHECK (movement_type = ANY (ARRAY[''purchase_entry''::text, ''opening_balance''::text]))' or exists(select 1 from pg_depend where refclassid='pg_constraint'::regclass and refobjid=ident) then raise exception 'Preflight difiere: inventory_movements_movement_type_check';end if;end $$;
do $$declare ident oid;begin select oid into ident from pg_constraint where conrelid='public.inventory_valuations'::regclass and conname='inventory_valuations_check';if ident is null or pg_get_constraintdef(ident,true)<>'CHECK (revision = 0 AND value_crc::numeric = 0::numeric AND average_unit_cost_crc IS NULL AND last_movement_id IS NULL OR revision > 0 AND value_crc::numeric > 0::numeric AND average_unit_cost_crc::numeric > 0::numeric AND last_movement_id IS NOT NULL)' or exists(select 1 from pg_depend where refclassid='pg_constraint'::regclass and refobjid=ident) then raise exception 'Preflight difiere: inventory_valuations_check';end if;end $$;
do $$begin if (select count(*) from pg_attribute where attrelid='public.inventory_movements'::regclass and attname='receipt_item_id' and attnotnull)<>1 or (select count(*) from pg_attribute where attrelid='public.inventory_movement_costs'::regclass and attname in ('movement_amount_crc','average_cost_after_crc') and attnotnull)<>2 then raise exception 'Preflight NOT NULL difiere';end if;end $$;
alter table public.inventory_movement_costs add column internal_amount_crc public.inventory_value;
alter table public.inventory_balances drop constraint inventory_balances_check restrict, add constraint inventory_balances_4b_state_check CHECK (((revision=0 AND last_movement_id IS NULL AND last_effective_at IS NULL AND unit_locked IS NULL AND quantity_on_hand=0) OR (revision>0 AND last_movement_id IS NOT NULL AND last_effective_at IS NOT NULL AND unit_locked IS NOT NULL AND quantity_on_hand>=0)) IS TRUE) not valid;
alter table public.inventory_balances validate constraint inventory_balances_4b_state_check;
alter table public.inventory_movement_costs drop constraint inventory_movement_costs_check restrict, add constraint inventory_movement_costs_4b_value_check CHECK ((CASE WHEN valuation_version='moving_average_value_v1' THEN value_after_crc=value_before_crc+movement_amount_crc ELSE abs(value_after_crc-value_before_crc)=internal_amount_crc END) IS TRUE) not valid;
alter table public.inventory_movement_costs validate constraint inventory_movement_costs_4b_value_check;
alter table public.inventory_movement_costs drop constraint inventory_movement_costs_valuation_version_check restrict, add constraint inventory_movement_costs_4b_version_check CHECK (valuation_version IN ('moving_average_value_v1','proportional_value_v2')) not valid;
alter table public.inventory_movement_costs validate constraint inventory_movement_costs_4b_version_check;
alter table public.inventory_movements drop constraint inventory_movements_check restrict, add constraint inventory_movements_4b_stock_check CHECK (stock_after = stock_before + CASE WHEN movement_type IN ('purchase_entry','opening_balance','return','adjustment_positive') THEN quantity ELSE -quantity END) not valid;
alter table public.inventory_movements validate constraint inventory_movements_4b_stock_check;
alter table public.inventory_movements drop constraint inventory_movements_movement_type_check restrict, add constraint inventory_movements_4b_type_check CHECK (movement_type IN ('purchase_entry','opening_balance','consumption','return','adjustment_positive','adjustment_negative','entry_reversal')) not valid;
alter table public.inventory_movements validate constraint inventory_movements_4b_type_check;
alter table public.inventory_valuations drop constraint inventory_valuations_check restrict, add constraint inventory_valuations_4b_state_check CHECK (((revision=0 AND value_crc=0 AND average_unit_cost_crc IS NULL AND last_movement_id IS NULL) OR (revision>0 AND last_movement_id IS NOT NULL AND ((value_crc=0 AND average_unit_cost_crc IS NULL) OR (value_crc>0 AND average_unit_cost_crc>0)))) IS TRUE) not valid;
alter table public.inventory_valuations validate constraint inventory_valuations_4b_state_check;
alter table public.inventory_movements alter column receipt_item_id drop not null, add constraint inventory_movements_4b_receipt_check CHECK ((CASE WHEN movement_type IN ('purchase_entry','opening_balance') THEN receipt_item_id IS NOT NULL ELSE receipt_item_id IS NULL END) IS TRUE);
alter table public.inventory_movement_costs alter column movement_amount_crc drop not null, alter column average_cost_after_crc drop not null,
 add constraint inventory_movement_costs_4b_amount_check CHECK ((CASE WHEN valuation_version='moving_average_value_v1' THEN movement_amount_crc IS NOT NULL AND movement_amount_crc>0 AND internal_amount_crc IS NULL ELSE movement_amount_crc IS NULL AND internal_amount_crc IS NOT NULL AND internal_amount_crc>0 END) IS TRUE),
 add constraint inventory_movement_costs_4b_average_check CHECK (((value_after_crc=0 AND average_cost_after_crc IS NULL) OR (value_after_crc>0 AND average_cost_after_crc>0)) IS TRUE);
create or replace function private.inventory_receipt_complete() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.inventory_receipt_items where receipt_id=new.id) or exists(
  select 1 from public.inventory_receipt_items i left join public.inventory_movements m on m.receipt_item_id=i.id
  left join public.inventory_movement_costs c on c.movement_id=m.id
  where i.receipt_id=new.id and (m.id is null or c.movement_id is null or m.quantity<>i.quantity or m.unit_snapshot<>i.unit_snapshot or m.effective_at<>new.effective_at or m.created_by<>new.created_by or
  c.unit_cost_applied_crc<>i.unit_cost_crc or c.movement_amount_crc<>i.amount_crc or c.rounding_delta_crc<>i.amount_crc-i.quantity*i.unit_cost_crc or
  c.average_cost_after_crc<>round(c.value_after_crc/m.stock_after,8) or
  (m.material_sequence=1 and (m.stock_before<>0 or c.value_before_crc<>0 or c.average_cost_before_crc is not null)) or
  (m.material_sequence>1 and not exists(select 1 from public.inventory_movements prev join public.inventory_movement_costs pc on pc.movement_id=prev.id where prev.material_id=m.material_id and prev.material_sequence=m.material_sequence-1 and prev.stock_after=m.stock_before and pc.value_after_crc=c.value_before_crc and pc.average_cost_after_crc is not distinct from c.average_cost_before_crc and prev.effective_at<=m.effective_at)) or
  (i.currency='USD' and (i.exchange_rate_date>(new.effective_at at time zone 'America/Costa_Rica')::date or i.rate_is_fallback<>(i.exchange_rate_date<(new.effective_at at time zone 'America/Costa_Rica')::date) or ((new.effective_at at time zone 'America/Costa_Rica')::date<(new.created_at at time zone 'America/Costa_Rica')::date and i.rate_is_fallback))))
 ) then raise exception 'Recepción incompleta o evidencia de valoración inconsistente' using errcode='23514';end if;
 if exists(select 1 from public.inventory_receipt_items i join public.inventory_balances b on b.material_id=i.material_id join public.inventory_valuations v on v.material_id=b.material_id
  join public.inventory_movements m on m.id=b.last_movement_id join public.inventory_movement_costs c on c.movement_id=m.id
  where i.receipt_id=new.id and (b.revision<>m.material_sequence or v.revision<>b.revision or v.last_movement_id<>b.last_movement_id or b.quantity_on_hand<>m.stock_after or v.value_crc<>c.value_after_crc or v.average_unit_cost_crc is distinct from c.average_cost_after_crc))
 then raise exception 'Proyección de inventario inconsistente' using errcode='23514';end if;
 return null;
end $$;
alter table public.inventory_movements
 add column order_id uuid references public.orders(id) on delete restrict,
 add column order_item_id uuid,
 add column source_movement_id uuid,
 add column reason text check(reason is null or length(trim(reason)) between 1 and 1000),
 add column request_id uuid,
 add column request_position integer,
 add foreign key(order_id,order_item_id) references public.order_items(order_id,id) on delete restrict,
 add foreign key(source_movement_id,material_id) references public.inventory_movements(id,material_id) on delete restrict,
 add unique(request_id,request_position),
 add constraint inventory_4b_metadata check((case when movement_type in ('purchase_entry','opening_balance') then order_id is null and order_item_id is null and source_movement_id is null and request_id is null and request_position is null
 else request_id is not null and request_position>0 and (order_item_id is null or order_id is not null)
 and (movement_type not in ('consumption','return') or order_id is not null)
 and (movement_type not in ('return','entry_reversal') or source_movement_id is not null)
 and (movement_type='consumption' or (reason is not null and length(trim(reason)) between 1 and 1000)) end) is true);
create index inventory_4b_order on public.inventory_movements(order_id,order_item_id);
create index inventory_4b_line on public.inventory_movements(order_item_id);
create index inventory_4b_source on public.inventory_movements(source_movement_id,material_id,material_sequence);
create unique index inventory_4b_reversal_once on public.inventory_movements(source_movement_id) where movement_type='entry_reversal';
create table public.inventory_movement_attribution_corrections(
 id uuid primary key,movement_id uuid not null references public.inventory_movements(id) on delete restrict,
 previous_order_id uuid not null references public.orders(id) on delete restrict,previous_order_item_id uuid,
 corrected_order_id uuid not null references public.orders(id) on delete restrict,corrected_order_item_id uuid,
 created_by uuid not null references public.profiles(id) on delete restrict,
 reason text not null check(length(trim(reason)) between 1 and 1000),created_at timestamptz not null default clock_timestamp(),
 revision bigint not null check(revision>0),unique(movement_id,revision),
 foreign key(previous_order_id,previous_order_item_id) references public.order_items(order_id,id) on delete restrict,
 foreign key(corrected_order_id,corrected_order_item_id) references public.order_items(order_id,id) on delete restrict
);
create index inventory_attribution_previous on public.inventory_movement_attribution_corrections(previous_order_id,previous_order_item_id);
create index inventory_attribution_previous_line on public.inventory_movement_attribution_corrections(previous_order_item_id);
create index inventory_attribution_corrected on public.inventory_movement_attribution_corrections(corrected_order_id,corrected_order_item_id);
create index inventory_attribution_corrected_line on public.inventory_movement_attribution_corrections(corrected_order_item_id);
create index inventory_attribution_actor on public.inventory_movement_attribution_corrections(created_by);
create table public.inventory_adjustment_cost_evidence(
 movement_id uuid primary key references public.inventory_movements(id) on delete restrict,
 amount_original public.quote_money not null check(amount_original>0),currency text not null check(currency in ('CRC','USD')),
 amount_crc public.quote_money not null check(amount_crc>0),exchange_rate_applied numeric,exchange_rate_date date,exchange_rate_source text,
 rate_origin text not null,rate_is_fallback boolean not null,rate_provided_by uuid references public.profiles(id) on delete restrict,
 rate_provided_at timestamptz,rate_override_reason text,
 check((case when currency='CRC' then amount_crc=amount_original and exchange_rate_applied is null and exchange_rate_date is null and exchange_rate_source is null and rate_origin='not_applicable' and not rate_is_fallback
 else exchange_rate_applied>0 and exchange_rate_applied<'Infinity'::numeric and isfinite(exchange_rate_date) and length(trim(exchange_rate_source)) between 1 and 300 and rate_origin in ('provider','admin_historical') and amount_crc=round(amount_original*exchange_rate_applied,2) end) is true),
 check((case when rate_origin='admin_historical' then rate_provided_by is not null and isfinite(rate_provided_at) and length(trim(rate_override_reason)) between 1 and 1000 and not rate_is_fallback else rate_provided_by is null and rate_provided_at is null and rate_override_reason is null end) is true)
);
create index inventory_adjustment_actor on public.inventory_adjustment_cost_evidence(rate_provided_by);
do $$declare t text;begin
 foreach t in array array['inventory_movement_attribution_corrections','inventory_adjustment_cost_evidence'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated,service_role',t);
 execute format('grant select on public.%I to authenticated',t);
 execute format('create policy %I on public.%I for select to authenticated using ((select private.%I()))',t||'_read',t,case when t='inventory_movement_attribution_corrections' then 'is_active' else 'is_admin' end);
 execute format('create trigger %I before update or delete on public.%I for each row execute function private.inventory_immutable()',t||'_immutable',t);
 execute format('create trigger %I after insert on public.%I for each row execute function private.inventory_audit()',t||'_audit',t);
 end loop;
end $$;
-- No costos en esta proyección operativa, tampoco en las atribuciones corregidas.
create view public.inventory_operations_read with(security_invoker=true) as
 select m.id,m.material_id,m.material_sequence::text,m.movement_type,m.quantity::text,m.unit_snapshot,m.effective_at,m.created_at,m.created_by,m.stock_before::text,m.stock_after::text,
 m.source_movement_id,m.reason,m.request_id,coalesce(a.corrected_order_id,m.order_id) as order_id,
 case when a.id is null then m.order_item_id else a.corrected_order_item_id end as order_item_id,
 coalesce(a.revision,0)::text as attribution_revision,
 case when m.movement_type='consumption' then (m.quantity-coalesce((select sum(r.quantity) from public.inventory_movements r where r.source_movement_id=m.id and r.movement_type='return'),0))::text else null end as returnable_quantity
 from public.inventory_movements m left join lateral(select * from public.inventory_movement_attribution_corrections a where a.movement_id=m.id order by revision desc limit 1) a on true;
create view public.inventory_operation_costs_read with(security_invoker=true) as
 select movement_id,unit_cost_applied_crc::text,coalesce(internal_amount_crc,movement_amount_crc)::text as assigned_value_crc,value_before_crc::text,value_after_crc::text,average_cost_before_crc::text,average_cost_after_crc::text,rounding_delta_crc::text,valuation_version from public.inventory_movement_costs;
revoke all on public.inventory_operations_read,public.inventory_operation_costs_read from public,anon,authenticated,service_role;
grant select on public.inventory_operations_read,public.inventory_operation_costs_read to authenticated;

-- Helper interno, nunca invocable por clientes; el despachador adquiere todos los locks antes.
create function private.inventory_write_4b(rid uuid,pos integer,kind text,mat uuid,ord uuid,item uuid,origin uuid,q numeric,t timestamptz,why text,explicit_value numeric default null) returns uuid
language plpgsql security invoker set search_path='' as $$
declare b public.inventory_balances;v public.inventory_valuations;src public.inventory_movements;sc public.inventory_movement_costs;
 mid uuid:=case when pos=1 then rid else gen_random_uuid() end;d numeric;c numeric;nq numeric;nv numeric;na numeric;qr numeric;vr numeric;base_unit text;
begin
 select * into strict b from public.inventory_balances where material_id=mat;select * into strict v from public.inventory_valuations where material_id=mat;
 c:=v.average_unit_cost_crc;base_unit:=coalesce(b.unit_locked,(select unit from public.materials where id=mat));
 if q<=0 or scale(q)>4 or q>='Infinity'::numeric then raise exception 'Cantidad inválida' using errcode='22023';end if;
 if t<b.last_effective_at then raise exception 'La fecha precede historia consolidada' using errcode='22023';end if;
 if origin is not null then
 select * into strict src from public.inventory_movements where id=origin;select * into strict sc from public.inventory_movement_costs where movement_id=origin;
 if src.material_id<>mat or t<src.effective_at then raise exception 'Origen o cronología inválida' using errcode='22023';end if;
 end if;
 if kind in ('consumption','adjustment_negative') then
 if q>b.quantity_on_hand then raise exception 'Stock insuficiente. Recarga las existencias.' using errcode='PT409';end if;
 d:=case when q=b.quantity_on_hand then v.value_crc else round(v.value_crc*q/b.quantity_on_hand,8) end;
 if d<=0 or (q<b.quantity_on_hand and d>=v.value_crc) then raise exception 'Precisión insuficiente para esta salida' using errcode='22023';end if;
 nq:=b.quantity_on_hand-q;nv:=v.value_crc-d;
 elsif kind='return' then
 if src.movement_type<>'consumption' then raise exception 'Devolución requiere consumo original' using errcode='22023';end if;
 select coalesce(sum(m.quantity),0),coalesce(sum(mc.internal_amount_crc),0) into qr,vr from public.inventory_movements m join public.inventory_movement_costs mc on mc.movement_id=m.id where m.source_movement_id=origin and m.movement_type='return';
 if q>src.quantity-qr then raise exception 'Cantidad superior al remanente retornable' using errcode='PT409';end if;
 d:=case when q=src.quantity-qr then sc.internal_amount_crc-vr else round((sc.internal_amount_crc-vr)*q/(src.quantity-qr),8) end;
 if d<=0 or (q<src.quantity-qr and d>=sc.internal_amount_crc-vr) then raise exception 'Precisión insuficiente para esta devolución parcial; devuelve el remanente completo' using errcode='22023';end if;
 c:=sc.unit_cost_applied_crc;nq:=b.quantity_on_hand+q;nv:=v.value_crc+d;
 elsif kind='adjustment_positive' then
 d:=case when b.quantity_on_hand>0 then round(v.value_crc*q/b.quantity_on_hand,8) else explicit_value end;
 c:=case when b.quantity_on_hand>0 then v.average_unit_cost_crc else round(d/q,8) end;
 nq:=b.quantity_on_hand+q;nv:=v.value_crc+d;
 elsif kind='entry_reversal' then
 if src.movement_type not in ('purchase_entry','opening_balance') or b.last_movement_id<>origin or q<>src.quantity then raise exception 'La línea tiene movimientos posteriores; utiliza un ajuste actual' using errcode='PT409';end if;
 d:=sc.movement_amount_crc;c:=sc.unit_cost_applied_crc;nq:=src.stock_before;nv:=sc.value_before_crc;
 else raise exception 'Operación inválida' using errcode='22023';end if;
 na:=case when nq=0 then null else round(nv/nq,8) end;
 if kind='entry_reversal' then na:=sc.average_cost_before_crc;end if;
 if d is null or d<=0 or scale(d)>8 or c is null or c<=0 or (nq>0 and (nv<=0 or na is null or na<=0)) or (nq=0 and nv<>0) then raise exception 'Precisión o valoración insuficiente' using errcode='22023';end if;
 insert into public.inventory_movements(id,material_id,material_sequence,movement_type,quantity,unit_snapshot,effective_at,created_by,stock_before,stock_after,order_id,order_item_id,source_movement_id,reason,request_id,request_position)
 values(mid,mat,b.revision+1,kind,q,base_unit,t,auth.uid(),b.quantity_on_hand,nq,ord,item,origin,why,rid,pos);
 insert into public.inventory_movement_costs(movement_id,unit_cost_applied_crc,movement_amount_crc,internal_amount_crc,value_before_crc,value_after_crc,average_cost_before_crc,average_cost_after_crc,rounding_delta_crc,valuation_version)
 values(mid,c,null,d,v.value_crc,nv,v.average_unit_cost_crc,na,d-q*c,'proportional_value_v2');
 update public.inventory_balances set quantity_on_hand=nq,unit_locked=base_unit,revision=b.revision+1,last_movement_id=mid,last_effective_at=t,updated_at=clock_timestamp() where material_id=mat;
 update public.inventory_valuations set value_crc=nv,average_unit_cost_crc=na,revision=b.revision+1,last_movement_id=mid,updated_at=clock_timestamp() where material_id=mat;
 return mid;
end $$;
create function private.inventory_operation(target uuid,operation text,payload jsonb,expected_revisions jsonb,expected_orders jsonb) returns uuid
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
 select array_agg(m.id order by m.id),array_agg(distinct m.material_id order by m.material_id) into origins,mids from public.inventory_movements m join public.inventory_receipt_items i on i.id=m.receipt_item_id where i.receipt_id=nullif(payload->>'receipt_id','')::uuid;
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
create function public.inventory_operation(target uuid,operation text,payload jsonb,expected_revisions jsonb,expected_orders jsonb) returns uuid language sql security invoker set search_path='' as $$select private.inventory_operation(target,operation,payload,expected_revisions,expected_orders)$$;
revoke all on function private.inventory_write_4b(uuid,integer,text,uuid,uuid,uuid,uuid,numeric,timestamptz,text,numeric),private.inventory_operation(uuid,text,jsonb,jsonb,jsonb),public.inventory_operation(uuid,text,jsonb,jsonb,jsonb) from public,anon,authenticated,service_role;
grant execute on function private.inventory_operation(uuid,text,jsonb,jsonb,jsonb),public.inventory_operation(uuid,text,jsonb,jsonb,jsonb) to authenticated;
create function private.inventory_guard_4b() returns trigger language plpgsql security definer set search_path='' as $$
declare m public.inventory_movements;c public.inventory_movement_costs;p public.inventory_movements;pc public.inventory_movement_costs;
 b public.inventory_balances;v public.inventory_valuations;s public.inventory_movements;sc public.inventory_movement_costs;
 d numeric;qr numeric;vr numeric;avg numeric;positive boolean;
begin
 select * into strict m from public.inventory_movements where id=new.id;select * into c from public.inventory_movement_costs where movement_id=m.id;
 if not found then raise exception 'Movimiento sin evidencia de valoración' using errcode='23514';end if;
 if m.material_sequence=1 then
 if m.stock_before<>0 or c.value_before_crc<>0 or c.average_cost_before_crc is not null then raise exception 'Inicio de cadena inválido' using errcode='23514';end if;
 else
 select * into p from public.inventory_movements where material_id=m.material_id and material_sequence=m.material_sequence-1;
 select * into pc from public.inventory_movement_costs where movement_id=p.id;
 if p.id is null or pc.movement_id is null or p.stock_after<>m.stock_before or pc.value_after_crc<>c.value_before_crc or pc.average_cost_after_crc is distinct from c.average_cost_before_crc or p.effective_at>m.effective_at or p.unit_snapshot<>m.unit_snapshot then raise exception 'Cadena de inventario inconsistente' using errcode='23514';end if;
 end if;
 avg:=case when m.stock_after=0 then null else round(c.value_after_crc/m.stock_after,8) end;
 if (m.stock_after=0)<>(c.value_after_crc=0) or c.average_cost_after_crc is distinct from avg or (m.stock_after>0 and avg<=0) then raise exception 'Promedio y stock incoherentes' using errcode='23514';end if;
 if m.movement_type in ('purchase_entry','opening_balance') then
 if c.valuation_version<>'moving_average_value_v1' then raise exception 'Versión de entrada inválida' using errcode='23514';end if;
 else
 if c.valuation_version<>'proportional_value_v2' then raise exception 'Versión de salida inválida' using errcode='23514';end if;
 positive:=m.movement_type in ('return','adjustment_positive');d:=c.internal_amount_crc;
 if c.value_after_crc<>c.value_before_crc+(case when positive then d else -d end) or c.rounding_delta_crc<>d-m.quantity*c.unit_cost_applied_crc then raise exception 'Signo/delta inconsistente' using errcode='23514';end if;
 if m.movement_type in ('consumption','adjustment_negative') then
 if m.stock_before<=0 or d<>(case when m.stock_after=0 then c.value_before_crc else round(c.value_before_crc*m.quantity/m.stock_before,8) end) or c.unit_cost_applied_crc is distinct from c.average_cost_before_crc then raise exception 'Salida proporcional inconsistente' using errcode='23514';end if;
 elsif m.movement_type='return' then
 select * into s from public.inventory_movements where id=m.source_movement_id;select * into sc from public.inventory_movement_costs where movement_id=s.id;
 select coalesce(sum(r.quantity),0),coalesce(sum(rc.internal_amount_crc),0) into qr,vr from public.inventory_movements r join public.inventory_movement_costs rc on rc.movement_id=r.id where r.source_movement_id=s.id and r.movement_type='return' and r.material_sequence<m.material_sequence;
 if s.movement_type<>'consumption' or m.quantity>s.quantity-qr or c.unit_cost_applied_crc<>sc.unit_cost_applied_crc or d<>(case when m.quantity=s.quantity-qr then sc.internal_amount_crc-vr else round((sc.internal_amount_crc-vr)*m.quantity/(s.quantity-qr),8) end) or (m.quantity<s.quantity-qr and d>=sc.internal_amount_crc-vr) then raise exception 'Devolución inconsistente' using errcode='23514';end if;
 elsif m.movement_type='adjustment_positive' then
 if m.stock_before>0 then
 if d<>round(c.value_before_crc*m.quantity/m.stock_before,8) or c.unit_cost_applied_crc<>c.average_cost_before_crc then raise exception 'Ajuste proporcional inconsistente' using errcode='23514';end if;
 elsif not exists(select 1 from public.inventory_adjustment_cost_evidence e where e.movement_id=m.id and e.amount_crc=d and c.unit_cost_applied_crc=round(d/m.quantity,8)) then raise exception 'Falta evidencia de ajuste valorado' using errcode='23514';end if;
 elsif m.movement_type='entry_reversal' then
 select * into s from public.inventory_movements where id=m.source_movement_id;select * into sc from public.inventory_movement_costs where movement_id=s.id;
 if s.movement_type not in ('purchase_entry','opening_balance') or s.material_sequence<>m.material_sequence-1 or m.quantity<>s.quantity or m.stock_after<>s.stock_before or c.value_after_crc<>sc.value_before_crc or c.average_cost_after_crc is distinct from sc.average_cost_before_crc or d<>sc.movement_amount_crc then raise exception 'Reversión inconsistente' using errcode='23514';end if;
 end if;
 end if;
 select * into b from public.inventory_balances where material_id=m.material_id;select * into v from public.inventory_valuations where material_id=m.material_id;
 select * into p from public.inventory_movements where id=b.last_movement_id;select * into pc from public.inventory_movement_costs where movement_id=p.id;
 if b.material_id is null or v.material_id is null or p.id is null or pc.movement_id is null or b.revision<>p.material_sequence or v.revision<>b.revision or v.last_movement_id<>b.last_movement_id or b.quantity_on_hand<>p.stock_after or v.value_crc<>pc.value_after_crc or v.average_unit_cost_crc is distinct from pc.average_cost_after_crc or b.last_effective_at<>p.effective_at or b.unit_locked<>p.unit_snapshot then raise exception 'Proyección inconsistente' using errcode='23514';end if;
 return null;
end $$;
create constraint trigger inventory_guard_4b after insert on public.inventory_movements deferrable initially deferred for each row execute function private.inventory_guard_4b();
revoke all on function private.inventory_guard_4b() from public,anon,authenticated,service_role;
commit;
