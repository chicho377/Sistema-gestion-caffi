begin;
create function private.report_charts(first_day date,last_day date) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if not private.is_admin() then raise exception 'Acceso denegado' using errcode='42501';end if;
 -- Monetary aggregates remain numeric in PostgreSQL; series are never computed from paginated UI rows.
 with cash as materialized(select * from private.report_rows('cash',first_day,last_day) where state='valid'),
 monthly as(select to_char(at_date at time zone 'America/Costa_Rica','YYYY-MM') as month_key,round(sum(amount) filter(where source<>'expenses'),2) income,round(-sum(amount) filter(where source='expenses'),2) expenses from cash group by 1),
 categories as(select coalesce(data->>'categoria','Sin categoría') category,round(-sum(amount),2) expenses from cash where source='expenses' group by 1),
 lines as(select o.id,o.total,o.subtotal,l.id lid,l.product_name_snapshot label,sum(case when l.is_active then l.line_total else 0 end) over(partition by o.id order by l.id) cumulative from public.orders o join public.order_items l on l.order_id=o.id where o.production_status='delivered' and o.delivered_at>=first_day::timestamp at time zone 'America/Costa_Rica' and o.delivered_at<(last_day+1)::timestamp at time zone 'America/Costa_Rica'),
 limits as(select *,case when subtotal>0 then round(total*cumulative/subtotal,2) else 0 end boundary from lines),
 revenue as(select label,boundary-coalesce(lag(boundary) over(partition by id order by lid),0) amount from limits),
 products as(select label,sum(amount) amount from revenue group by label)
 select jsonb_build_object('monthly',coalesce((select jsonb_agg(jsonb_build_object('mes',month_key,'ingresos_crc',coalesce(income,0)::text,'gastos_crc',coalesce(expenses,0)::text) order by month_key) from monthly),'[]'),
 'categories',coalesce((select jsonb_agg(jsonb_build_object('categoria',category,'gastos_crc',expenses::text) order by expenses desc,category) from categories),'[]'),
 'products',coalesce((select jsonb_agg(jsonb_build_object('producto',label,'ventas_crc',amount::text) order by amount desc,label) from products),'[]')) into result;
 return result;
end $$;
create function public.report_charts(first_day date,last_day date) returns jsonb language sql stable set search_path='' as $$select private.report_charts(first_day,last_day)$$;
revoke all on function private.report_charts(date,date),public.report_charts(date,date) from public,anon,authenticated,service_role;
grant execute on function private.report_charts(date,date),public.report_charts(date,date) to authenticated;
commit;
