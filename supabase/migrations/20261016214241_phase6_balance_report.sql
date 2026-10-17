begin;
-- R2: include current receivables even when no payment has ever been recorded.
create or replace function private.report_rows(kind text, first_day date, last_day date)
returns table(rid text, at_date timestamptz, state text, search text, data jsonb, amount numeric, source text)
language plpgsql stable security definer set search_path='' as $$
declare lo timestamptz:=first_day::timestamp at time zone 'America/Costa_Rica';
 hi timestamptz:=(last_day+1)::timestamp at time zone 'America/Costa_Rica'; adm boolean:=private.is_admin();
begin
 if not private.is_active() then raise exception 'Acceso denegado' using errcode='42501';end if;
 if kind not in ('orders','payments','cash','profit','inventory','movements','hours','shipments','audit','operation','balances') then raise exception 'Reporte inválido' using errcode='22023';end if;
 if not adm and kind not in ('inventory','movements','hours','shipments','operation') then raise exception 'Acceso financiero denegado' using errcode='42501';end if;
 if first_day is null or last_day is null or not isfinite(first_day) or not isfinite(last_day) or first_day>last_day then raise exception 'Rango inválido' using errcode='22023';end if;
 if kind in ('orders','operation','balances') then
 return query
 select o.id::text,coalesce(o.delivered_at,o.confirmed_at,o.order_date::timestamp at time zone 'America/Costa_Rica'),o.production_status,
 concat_ws(' ',o.id,o.order_number,o.client_snapshot->>'name'),
 jsonb_build_object('id',o.id,'pedido',coalesce(o.order_number,o.id::text),'cliente',o.client_snapshot->>'name','fecha_pedido',o.order_date,'confirmado',o.confirmed_at,'entregado',o.delivered_at,'fecha_solicitada',o.requested_delivery_date,'estado',o.production_status,
 'alerta',case when o.production_status in ('delivered','cancelled') then null when o.requested_delivery_date<(statement_timestamp() at time zone 'America/Costa_Rica')::date then 'Atrasado '||((statement_timestamp() at time zone 'America/Costa_Rica')::date-o.requested_delivery_date)||' días' when o.requested_delivery_date<=(statement_timestamp() at time zone 'America/Costa_Rica')::date+5 then 'Entrega próxima' when o.requested_delivery_date<=(statement_timestamp() at time zone 'America/Costa_Rica')::date+7 then 'Próximo a entregar' else null end,'dias_restantes',o.requested_delivery_date-(statement_timestamp() at time zone 'America/Costa_Rica')::date,
 'clasificacion',case when o.production_status='delivered' then 'realizada' when o.production_status='cancelled' then 'cancelado' when o.production_status='quote' then 'cotización' else 'provisional' end)
 || case when kind in ('orders','balances') then jsonb_build_object('total_crc',o.total::text,'pagado_crc',coalesce(p.paid,0)::text,'saldo_actual_crc',(o.total-coalesce(p.paid,0))::text,'estado_financiero',case when o.total=0 or coalesce(p.paid,0)>=o.total then 'Pagado' when coalesce(p.paid,0)=0 then 'Sin adelanto' else 'Abonado' end) else '{}'::jsonb end,
 case when kind in ('orders','balances') then case when kind='balances' then o.total-coalesce(p.paid,0) else o.total end else null end,'orders'::text
 from public.orders o left join lateral(select sum(p1.amount) as paid from public.payments p1 where p1.order_id=o.id and p1.status='valid' and kind in ('orders','balances')) p on true
 where (kind='balances' and o.production_status not in ('quote','cancelled')) or (kind='operation' and o.production_status not in ('delivered','cancelled')) or
 (kind='orders' and coalesce(o.delivered_at,o.confirmed_at,o.order_date::timestamp at time zone 'America/Costa_Rica')>=lo and coalesce(o.delivered_at,o.confirmed_at,o.order_date::timestamp at time zone 'America/Costa_Rica')<hi);
 elsif kind='payments' then
 return query select p.id::text,p.payment_date,p.status,concat_ws(' ',o.order_number,c.name,p.reference,p.id),
 jsonb_build_object('id',p.id,'pedido',o.order_number,'cliente',c.name,'total_crc',o.total::text,'pagos_validos_actuales_crc',coalesce(t.paid,0)::text,'saldo_actual_crc',(o.total-coalesce(t.paid,0))::text,'fecha',p.payment_date,'metodo',p.payment_method,'tipo',p.payment_type,'estado',p.status,'monto_crc',p.amount::text,'referencia',p.reference),
 case when p.status='valid' then p.amount else 0 end,'payments'::text
 from public.payments p join public.orders o on o.id=p.order_id join public.clients c on c.id=p.client_id
 left join lateral(select sum(p2.amount) paid from public.payments p2 where p2.order_id=o.id and p2.status='valid') t on true where p.payment_date>=lo and p.payment_date<hi;
 elsif kind='cash' then
 return query select p.id::text,p.payment_date,p.status,concat_ws(' ',o.order_number,o.client_snapshot->>'name',p.reference,p.id),
 jsonb_build_object('id',p.id,'source_type','payments','referencia_original',p.id,'pedido',o.order_number,'fecha',p.payment_date,'estado',p.status,'monto_original',p.amount::text,'moneda','CRC','monto_crc',p.amount::text,'metodo',p.payment_method),case when p.status='valid' then p.amount else 0 end,'payments'::text
 from public.payments p join public.orders o on o.id=p.order_id where p.payment_date>=lo and p.payment_date<hi
 union all select i.id::text,i.income_date,i.status,concat_ws(' ',i.description,i.income_type,i.id),jsonb_build_object('id',i.id,'source_type','manual_income','referencia_original',i.id,'fecha',i.income_date,'estado',i.status,'descripcion',i.description,'tipo',i.income_type,'monto_original',i.amount::text,'moneda','CRC','monto_crc',i.amount::text,'metodo',i.payment_method),case when i.status='valid' then i.amount else 0 end,'manual_income'::text from public.manual_income i where i.income_date>=lo and i.income_date<hi
 union all select e.id::text,e.expense_date,e.status,concat_ws(' ',e.description,o.order_number,c.name,e.id),jsonb_build_object('id',e.id,'source_type','expenses','referencia_original',e.id,'pedido',o.order_number,'fecha',e.expense_date,'estado',e.status,'descripcion',e.description,'categoria',c.name,'monto_original',e.amount::text,'moneda',e.currency,'tasa',e.exchange_rate_applied::text,'fecha_tasa',e.exchange_rate_date,'monto_crc',e.amount_crc::text,'metodo',e.payment_method),case when e.status='valid' then -e.amount_crc else 0 end,'expenses'::text from public.expenses e left join public.orders o on o.id=e.order_id join public.expense_categories c on c.id=e.category_id where e.expense_date>=lo and e.expense_date<hi;
 elsif kind='profit' then
 return query with eligible as materialized(select o.* from public.orders o where coalesce(o.delivered_at,o.confirmed_at)>=lo and coalesce(o.delivered_at,o.confirmed_at)<hi and o.production_status not in ('quote','cancelled')),
 costs as materialized(select o.id,o.order_number,o.client_snapshot,o.production_status,coalesce(o.delivered_at,o.confirmed_at) dt,private.order_costing(o.id) c from eligible o)
 select c.id::text,c.dt,c.production_status,concat_ws(' ',c.id,c.order_number,c.client_snapshot->>'name'),c.c,(c.c->>'revenue')::numeric,'profit'::text from costs c;
 elsif kind='inventory' then
 return query select m.id::text,statement_timestamp(),case when coalesce(b.quantity_on_hand,0)<m.min_stock then 'bajo_minimo' else 'disponible' end,concat_ws(' ',m.id,m.name,m.code,m.category),
 jsonb_build_object('id',m.id,'codigo',m.code,'material',m.name,'unidad',m.unit,'existencia_actual',coalesce(b.quantity_on_hand,0)::text,'minimo',m.min_stock::text,'activo',m.is_active,'situacion','Actual / al momento de la consulta')||case when adm then jsonb_build_object('valoracion_crc',coalesce(v.value_crc,0)::text,'promedio_crc',v.average_unit_cost_crc::text) else '{}'::jsonb end,
 case when adm then coalesce(v.value_crc,0) end,'inventory'::text from public.materials m left join public.inventory_balances b on b.material_id=m.id left join public.inventory_valuations v on v.material_id=m.id and adm;
 elsif kind='movements' then
 return query select m.id::text,m.effective_at,m.movement_type,concat_ws(' ',m.id,x.code,x.name,o.order_number),
 jsonb_build_object('id',m.id,'material',x.name,'codigo',x.code,'pedido',o.order_number,'linea',m.order_item_id,'fecha',m.effective_at,'tipo',m.movement_type,'cantidad',m.quantity::text,'unidad',m.unit_snapshot,'stock_anterior',m.stock_before::text,'stock_posterior',m.stock_after::text,'secuencia',m.material_sequence,'motivo',m.reason)
 ||case when adm then jsonb_build_object('valor_interno_crc',coalesce(c.internal_amount_crc,c.movement_amount_crc)::text,'delta_valor_crc',(c.value_after_crc-c.value_before_crc)::text) else '{}'::jsonb end,null::numeric,'movements'::text
 from public.inventory_operations_read m join public.materials x on x.id=m.material_id left join public.orders o on o.id=m.order_id left join public.inventory_movement_costs c on c.movement_id=m.id and adm where m.effective_at>=lo and m.effective_at<hi;
 elsif kind='hours' then
 return query with spans as materialized(select w.*,private.report_work_boundary(w.id,hi)-private.report_work_boundary(w.id,lo) seconds from public.work_sessions w where w.started_at<hi and coalesce(w.finished_at,statement_timestamp())>=lo)
 select w.id::text,greatest(w.started_at,lo),w.status,concat_ws(' ',w.id,p.full_name,o.order_number,l.product_name_snapshot,w.activity),
 jsonb_build_object('id',w.id,'trabajador',p.full_name,'pedido',o.order_number,'linea',l.product_name_snapshot,'actividad',w.activity,'inicio',w.started_at,'fin',w.finished_at,'estado',w.status,'segundos_periodo',w.seconds::text,'horas_periodo',round(w.seconds::numeric/3600,6)::text,'segundos_sesion',w.worked_seconds::text,'estimacion_linea_minutos',(l.estimated_minutes_snapshot::numeric*l.quantity)::text,'estimacion_estado',case when l.estimated_minutes_snapshot is null then 'Estimación histórica no disponible' else 'Snapshot histórico de línea; no sumable entre sesiones' end,
 'real_linea_segundos',(select sum(w2.worked_seconds)::text from public.work_sessions w2 where w2.order_item_id=w.order_item_id),'desviacion_linea_segundos',((select sum(w2.worked_seconds) from public.work_sessions w2 where w2.order_item_id=w.order_item_id)-l.estimated_minutes_snapshot::numeric*l.quantity*60)::text)
 ||case when adm then jsonb_build_object('tarifa_crc',r.hourly_rate_applied::text,'costo_periodo_crc',round(r.hourly_rate_applied*w.seconds/3600,2)::text) else '{}'::jsonb end,
 case when adm then r.hourly_rate_applied*w.seconds/3600 end,'hours'::text
 from spans w join public.profiles p on p.id=w.user_id join public.orders o on o.id=w.order_id left join public.order_items l on l.id=w.order_item_id left join public.work_session_rates r on r.work_session_id=w.id and adm;
 elsif kind='shipments' then
 return query select s.id::text,e.dt,s.status,concat_ws(' ',s.id,o.order_number,o.client_snapshot->>'name',s.courier,s.tracking_number),
 jsonb_build_object('id',s.id,'pedido',o.order_number,'tipo',s.delivery_type,'estado',s.status,'evento',e.event,'fecha_evento',e.dt,'transportista',s.courier,'guia',s.tracking_number,'despacho',s.shipped_at,'entrega',s.delivered_at,'fecha_solicitada',o.requested_delivery_date,'cumplimiento',case when s.delivered_at is null then 'Pendiente' when (s.delivered_at at time zone 'America/Costa_Rica')::date<=o.requested_delivery_date then 'En fecha' else 'Fuera de fecha' end)
 ||case when adm then jsonb_build_object('costo_operativo_crc',f.cost_crc::text,'gasto_id',f.expense_id,'estado_gasto',ex.status) else '{}'::jsonb end,null::numeric,'shipments'::text
 from public.shipments s join public.orders o on o.id=s.order_id cross join lateral(values ('creado',s.created_at),('despachado',s.shipped_at),('entregado',s.delivered_at),('cancelado',s.cancelled_at)) e(event,dt) left join public.shipment_finances f on f.shipment_id=s.id and adm left join public.expenses ex on ex.id=f.expense_id and adm where e.dt>=lo and e.dt<hi;
 elsif kind='audit' then
 return query select a.id::text,a.created_at,a.action,concat_ws(' ',a.id,a.entity_id,a.entity_type,a.action,p.full_name,a.reason),
 jsonb_build_object('id',a.id,'fecha',a.created_at,'usuario',p.full_name,'usuario_id',a.user_id,'entidad',a.entity_type,'registro',a.entity_id,'accion',a.action,'motivo',a.reason,'evidencia',a.metadata),null::numeric,'audit'::text from public.audit_log a left join public.profiles p on p.id=a.user_id where a.created_at>=lo and a.created_at<hi;
 end if;
end $$;

commit;
