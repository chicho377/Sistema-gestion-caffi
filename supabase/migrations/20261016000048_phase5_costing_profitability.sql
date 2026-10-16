begin;
alter table public.order_items add column estimated_minutes_snapshot integer check(estimated_minutes_snapshot>=0),
 add column estimate_captured_at timestamptz check(isfinite(estimate_captured_at));
create function private.capture_line_estimate() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='UPDATE' then
  if (new.estimated_minutes_snapshot,new.estimate_captured_at) is distinct from (old.estimated_minutes_snapshot,old.estimate_captured_at)
   and not (pg_trigger_depth()>1 and old.estimate_captured_at is null) then
   raise exception 'Estimación histórica inmutable' using errcode='42501';end if;
 else
  new.estimated_minutes_snapshot:=null;new.estimate_captured_at:=null;
  if not exists(select 1 from public.order_items where id=new.id) and exists(select 1 from public.orders where id=new.order_id and confirmed_at is not null) then
   select estimated_minutes into new.estimated_minutes_snapshot from public.products where id=new.product_id;
   new.estimate_captured_at:=clock_timestamp();
  end if;
 end if;return new;
end $$;
create trigger capture_line_estimate before insert or update on public.order_items for each row execute function private.capture_line_estimate();
create function private.capture_confirmed_estimates() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if old.confirmed_at is null and new.confirmed_at is not null then
  update public.order_items i set estimated_minutes_snapshot=(select p.estimated_minutes from public.products p where p.id=i.product_id),estimate_captured_at=clock_timestamp() where i.order_id=new.id and i.estimate_captured_at is null;
 end if;return new;
end $$;
create trigger capture_confirmed_estimates after update on public.orders for each row execute function private.capture_confirmed_estimates();
create function private.audit_line_estimate() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.estimate_captured_at is not null and (tg_op='INSERT' or old.estimate_captured_at is null) then
 insert into public.audit_log(user_id,action,entity_type,entity_id,metadata) values(auth.uid(),'order_item.estimate_captured','order_items',new.id,jsonb_build_object('before',null,'after',jsonb_build_object('minutes',new.estimated_minutes_snapshot,'captured_at',new.estimate_captured_at),'order_id',new.order_id));
 end if;return new;
end $$;
create trigger audit_line_estimate after insert or update on public.order_items for each row execute function private.audit_line_estimate();
revoke all on function private.capture_line_estimate(),private.capture_confirmed_estimates(),private.audit_line_estimate() from public,anon,authenticated,service_role;

-- Read-only calculations: a STABLE function observes one statement snapshot.
create function private.order_costing(target uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare o public.orders; l record; s record; material numeric:=0;labor numeric:=0;expense numeric:=0;
 shared_m numeric:=0;shared_l numeric:=0;shared_e numeric:=0;seconds numeric:=0;
 sources jsonb:='[]';lines jsonb:='[]';warnings jsonb:='[]';buckets jsonb:='{}';b jsonb;
 raw_m numeric;raw_l numeric;raw_e numeric;cum_m numeric:=0;cum_l numeric:=0;cum_e numeric:=0;
 prev_m numeric:=0;prev_l numeric:=0;prev_e numeric:=0;cm numeric;cl numeric;ce numeric;
 net numeric:=0;previous_revenue numeric:=0;line_revenue numeric;rev numeric;total numeric;profit numeric;
 line_seconds numeric;unallocated numeric:=0;state text;line_cost numeric;estimate numeric;
begin
 if not private.is_admin() then raise exception 'Acceso exclusivo de Administración' using errcode='42501';end if;
 select * into o from public.orders where id=target;if not found then raise exception 'Pedido no disponible' using errcode='22023';end if;
 state:=case o.production_status when 'delivered' then 'realized' when 'cancelled' then 'cancelled' when 'quote' then 'quote' else 'provisional' end;
 -- Each consumption carries its net remaining assigned value, attributed to its current corrected destination.
 for s in
 select m.id,m.order_item_id,m.material_id,c.internal_amount_crc-coalesce(r.amount,0) as amount,
 c.internal_amount_crc is null or coalesce(r.missing,false) as missing,m.quantity,
 (select name from public.materials where id=m.material_id) as label
 from public.inventory_operations_read m left join public.inventory_movement_costs c on c.movement_id=m.id
 left join lateral(select sum(rc.internal_amount_crc) as amount,bool_or(rc.internal_amount_crc is null) as missing
 from public.inventory_movements rm left join public.inventory_movement_costs rc on rc.movement_id=rm.id where rm.source_movement_id=m.id and rm.movement_type='return') r on true
 where m.movement_type='consumption' and m.order_id=target
 loop
 if s.missing or s.amount<0 then warnings:=warnings||jsonb_build_array('Valor histórico de consumo incompleto: '||s.id);continue;end if;
 material:=material+s.amount;
 if s.order_item_id is null then shared_m:=shared_m+s.amount;else
 b:=coalesce(buckets->s.order_item_id::text,'{}');b:=jsonb_set(b,'{m}',to_jsonb(coalesce((b->>'m')::numeric,0)+s.amount));buckets:=jsonb_set(buckets,array[s.order_item_id::text],b);end if;
 sources:=sources||jsonb_build_array(jsonb_build_object('kind','material','id',s.id,'line_id',s.order_item_id,'label',s.label,'amount',s.amount::text,'quantity',s.quantity));
 end loop;
 for s in select w.*,r.hourly_rate_applied from public.work_sessions w left join public.work_session_rates r on r.work_session_id=w.id where w.order_id=target order by w.id loop
 if s.worked_seconds is null or s.hourly_rate_applied is null or s.hourly_rate_applied<=0 then
 warnings:=warnings||jsonb_build_array(case when s.status<>'finished' then 'Sesión abierta sin duración consolidada: ' else 'Tarifa histórica incompleta: ' end||s.id);continue;end if;
 raw_l:=s.hourly_rate_applied*s.worked_seconds::numeric/3600;labor:=labor+raw_l;seconds:=seconds+s.worked_seconds;
 if s.order_item_id is null then shared_l:=shared_l+raw_l;else
 b:=coalesce(buckets->s.order_item_id::text,'{}');b:=jsonb_set(b,'{l}',to_jsonb(coalesce((b->>'l')::numeric,0)+raw_l));b:=jsonb_set(b,'{seconds}',to_jsonb(coalesce((b->>'seconds')::numeric,0)+s.worked_seconds));buckets:=jsonb_set(buckets,array[s.order_item_id::text],b);end if;
 sources:=sources||jsonb_build_array(jsonb_build_object('kind','labor','id',s.id,'line_id',s.order_item_id,'label',coalesce(s.activity,'Trabajo'),'seconds',s.worked_seconds::text,'rate',s.hourly_rate_applied::text,'amount',raw_l::text));
 end loop;
 for s in select e.*,exists(select 1 from public.inventory_receipt_expenses x where x.expense_id=e.id) as acquisition,
 exists(select 1 from public.shipment_finances f where f.expense_id=e.id) as shipping from public.expenses e where e.order_id=target and e.status='valid' order by e.id loop
 if s.acquisition then
 sources:=sources||jsonb_build_array(jsonb_build_object('kind','excluded_acquisition','id',s.id,'label',s.description,'amount',s.amount_crc::text));continue;end if;
 expense:=expense+s.amount_crc;
 if s.order_item_id is null then shared_e:=shared_e+s.amount_crc;else
 b:=coalesce(buckets->s.order_item_id::text,'{}');b:=jsonb_set(b,'{e}',to_jsonb(coalesce((b->>'e')::numeric,0)+s.amount_crc));buckets:=jsonb_set(buckets,array[s.order_item_id::text],b);end if;
 sources:=sources||jsonb_build_array(jsonb_build_object('kind',case when s.shipping then 'shipping_expense' else 'expense' end,'id',s.id,'line_id',s.order_item_id,'label',s.description,'amount',s.amount_crc::text));
 end loop;
 -- Cumulative HALF UP in stable UUID order conserves the exact order total, including fractional-cent residues.
 for l in select * from public.order_items where order_id=target order by id loop
 net:=net+case when l.is_active then l.line_total else 0 end;
 line_revenue:=case when o.subtotal>0 then round(o.total*net/o.subtotal,2)-previous_revenue else 0 end;
 previous_revenue:=previous_revenue+line_revenue;
 b:=coalesce(buckets->l.id::text,'{}');
 raw_m:=coalesce((b->>'m')::numeric,0)+case when o.total>0 then shared_m*line_revenue/o.total else 0 end;
 raw_l:=coalesce((b->>'l')::numeric,0)+case when o.total>0 then shared_l*line_revenue/o.total else 0 end;
 raw_e:=coalesce((b->>'e')::numeric,0)+case when o.total>0 then shared_e*line_revenue/o.total else 0 end;
 cum_m:=cum_m+raw_m;cum_l:=cum_l+raw_l;cum_e:=cum_e+raw_e;
 cm:=round(cum_m,2)-prev_m;cl:=round(cum_l,2)-prev_l;ce:=round(cum_e,2)-prev_e;
 prev_m:=prev_m+cm;prev_l:=prev_l+cl;prev_e:=prev_e+ce;line_cost:=cm+cl+ce;
 line_seconds:=coalesce((b->>'seconds')::numeric,0);estimate:=l.estimated_minutes_snapshot::numeric*l.quantity;
 lines:=lines||jsonb_build_array(jsonb_build_object('id',l.id,'name',l.product_name_snapshot,'active',l.is_active,'revenue',line_revenue::text,'material_cost',cm::text,'labor_cost',cl::text,'expense_cost',ce::text,'total_cost',line_cost::text,'profit',case when state<>'cancelled' and jsonb_array_length(warnings)=0 then (line_revenue-line_cost)::text end,'margin_percent',case when line_revenue>0 and state<>'cancelled' and jsonb_array_length(warnings)=0 then round((line_revenue-line_cost)/line_revenue*100,2)::text end,'worked_seconds',line_seconds::text,'estimated_minutes',estimate::text,'estimate_captured_at',l.estimate_captured_at,'shared_cost',case when o.total>0 then round((shared_m+shared_l+shared_e)*line_revenue/o.total,2)::text else null end));
 end loop;
 material:=round(material,2);labor:=round(labor,2);expense:=round(expense,2);total:=material+labor+expense;
 unallocated:=total-prev_m-prev_l-prev_e;
 if o.total>0 and unallocated<>0 then raise exception 'No se pudo reconciliar el costeo' using errcode='22023';end if;
 rev:=case when state='cancelled' then null else o.total end;profit:=case when jsonb_array_length(warnings)=0 then rev-total end;
 return jsonb_build_object('order_id',o.id,'number',o.order_number,'client',o.client_snapshot->>'name','production_status',o.production_status,'state',state,'complete',jsonb_array_length(warnings)=0,'warnings',warnings,'revenue',rev::text,'commercial_total',o.total::text,'material_cost',material::text,'labor_cost',labor::text,'expense_cost',expense::text,'total_cost',total::text,'profit',profit::text,'margin_percent',case when rev>0 then round(profit/rev*100,2)::text end,'worked_seconds',seconds::text,'profit_per_hour',case when seconds>0 then round(profit*3600/seconds,2)::text end,'unallocated_order_cost',unallocated::text,'shared_cost',round(shared_m+shared_l+shared_e,2)::text,'lines',lines,'sources',sources);
end $$;
create function public.order_costing(target uuid) returns jsonb language sql stable security invoker set search_path='' as $$select private.order_costing(target)$$;
revoke all on function private.order_costing(uuid),public.order_costing(uuid) from public,anon,authenticated,service_role;
grant execute on function private.order_costing(uuid),public.order_costing(uuid) to authenticated;
commit;
