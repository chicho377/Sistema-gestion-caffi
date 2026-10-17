begin;
-- Reconcile monetary display after filtering, without rounding individual temporal segments.
create or replace function private.report_query(kind text, first_day date,last_day date,filters jsonb default '{}',page_no integer default 1,page_size integer default 25) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb; adm boolean:=private.is_admin();
begin
 if not private.is_active() then raise exception 'Acceso denegado' using errcode='42501';end if;
 if page_no is null or page_size is null or page_no<1 or page_no>1000000 or page_size<1 or page_size>5000 or jsonb_typeof(filters)<>'object' or length(coalesce(filters->>'q',''))>200 then raise exception 'Filtros inválidos' using errcode='22023';end if;
 if exists(select 1 from jsonb_object_keys(filters) k where k not in ('q','state','source','record','entity','user')) then raise exception 'Filtro no autorizado' using errcode='22023';end if;
 with filtered as materialized(select * from private.report_rows(kind,first_day,last_day) r where
 (coalesce(filters->>'q','')='' or strpos(lower(r.search),lower(filters->>'q'))>0)
 and (coalesce(filters->>'state','')='' or r.state=filters->>'state' or (kind='profit' and r.data->>'state'=filters->>'state'))
 and (coalesce(filters->>'source','')='' or r.source=filters->>'source')
 and (coalesce(filters->>'record','')='' or r.rid=filters->>'record' or r.data->>'registro'=filters->>'record')
 and (coalesce(filters->>'entity','')='' or r.data->>'entidad'=filters->>'entity')
 and (coalesce(filters->>'user','')='' or r.data->>'usuario_id'=filters->>'user')),
 boundaries as(select *,round(sum(amount) over(order by at_date desc,rid,data::text rows unbounded preceding),2) boundary from filtered),
 rows as materialized(select rid,at_date,state,search,case when kind='hours' and adm then data||jsonb_build_object('costo_periodo_crc',(boundary-coalesce(lag(boundary) over(order by at_date desc,rid,data::text),0))::text) else data end data,amount,source from boundaries),
 totals as(select count(*) n,coalesce(sum(amount),0) amount,
 coalesce(sum(amount) filter(where source='payments'),0) payments,
 coalesce(sum(amount) filter(where source='manual_income'),0) income,
 -coalesce(sum(amount) filter(where source='expenses'),0) expenses,
 count(*) filter(where data->>'complete'='false') incomplete,
 count(*) filter(where data->>'complete'='true') complete,
 coalesce(sum((data->>'revenue')::numeric) filter(where data->>'complete'='true'),0) revenue_complete,
 coalesce(sum((data->>'total_cost')::numeric) filter(where data->>'complete'='true'),0) cost_complete,
 coalesce(sum((data->>'revenue')::numeric) filter(where data->>'complete'='false'),0) revenue_incomplete,
 coalesce(sum((data->>'profit')::numeric) filter(where data->>'complete'='true'),0) profit_complete,
 coalesce(sum((data->>'material_cost')::numeric),0) material,
 coalesce(sum((data->>'labor_cost')::numeric),0) labor,
 coalesce(sum((data->>'expense_cost')::numeric),0) other,
 coalesce(sum((data->>'segundos_periodo')::numeric),0) seconds,
 coalesce(sum((data->>'segundos_periodo')::numeric) filter(where state<>'finished'),0) provisional_seconds
 from rows)
 select jsonb_build_object('kind',kind,'from',first_day,'to',last_day,'timezone','America/Costa_Rica','generated_at',statement_timestamp(),'page',page_no,'page_size',page_size,'count',t.n,
 'rows',coalesce((select jsonb_agg(r.data order by r.at_date desc,r.rid,r.data::text) from(select * from rows order by at_date desc,rid,data::text limit page_size offset ((page_no-1)::bigint*page_size)) r),'[]'),
 'summary',jsonb_build_object('registros',t.n,'segundos_periodo',t.seconds::text,'segundos_provisionales',t.provisional_seconds::text,'estados',coalesce((select jsonb_object_agg(x.state,x.n) from(select state,count(*) n from rows group by state) x),'{}'))
 ||case when adm then jsonb_build_object('importe_crc',round(t.amount,2)::text,'payments_crc',round(t.payments,2)::text,'manual_income_crc',round(t.income,2)::text,'expenses_crc',round(t.expenses,2)::text,'movimiento_neto_crc',round(t.payments+t.income-t.expenses,2)::text,
 'pedidos_completos',t.complete,'pedidos_incompletos',t.incomplete,'ingreso_completo_crc',t.revenue_complete::text,'costo_completo_crc',t.cost_complete::text,'utilidad_completos_crc',t.profit_complete::text,'margen_completos',case when t.revenue_complete>0 then round(t.profit_complete/t.revenue_complete*100,2)::text end,'ingreso_incompleto_crc',t.revenue_incomplete::text,
 'global_profit',case when t.incomplete=0 then t.profit_complete::text end,'global_margin',case when t.incomplete=0 and t.revenue_complete>0 then round(t.profit_complete/t.revenue_complete*100,2)::text end,'estado_costos',case when t.incomplete>0 then 'Datos de costo incompletos' else 'Completo' end,'materiales_crc',t.material::text,'mano_obra_crc',t.labor::text,'otros_gastos_crc',t.other::text,
 'causas',coalesce((select jsonb_agg(jsonb_build_object('pedido',r.data->>'number','causas',r.data->'warnings')) from rows r where r.data->>'complete'='false'),'[]')) else '{}'::jsonb end) into result from totals t;
 return result;
end $$;
commit;
