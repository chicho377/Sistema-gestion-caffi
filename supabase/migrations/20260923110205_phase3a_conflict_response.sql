-- Conflictos de revisión son HTTP 409, no fallos de serialización reintentables.
-- Conserva ACL, firma, bloqueo y validación; no modifica datos.
begin;
create or replace function private.save_quote(target uuid, expected_revision integer, payload jsonb) returns uuid
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

create or replace function private.cancel_quote(target uuid,expected_revision integer,reason text) returns void
language plpgsql security definer set search_path='' as $$
declare o public.orders;
begin
 if not private.is_active() then raise exception 'Forbidden' using errcode='42501'; end if;
 perform 1 from public.profiles where id=auth.uid() and status='active' for share;
 if not found then raise exception 'Forbidden' using errcode='42501'; end if;
 if reason is null or length(trim(reason)) not between 1 and 1000 then raise exception 'Motivo obligatorio' using errcode='22023'; end if;
 select * into o from public.orders where id=target for update;
 if not found or o.production_status<>'quote' or o.revision is distinct from expected_revision then raise exception 'La cotización cambió. Recarga.' using errcode='PT409'; end if;
 update public.orders set production_status='cancelled',cancel_reason=trim(reason),cancelled_by=auth.uid(),cancelled_at=now(),updated_by=auth.uid(),updated_at=now(),revision=revision+1 where id=target;
 insert into public.audit_log(user_id,action,entity_type,entity_id,reason,metadata) values(auth.uid(),'quote.cancelled','orders',target,trim(reason),jsonb_build_object('before',o.production_status,'after','cancelled'));
end $$;

commit;
