begin;
do $$declare actor uuid;target uuid;begin
 select id into actor from public.profiles where role='admin' and status='active' order by id limit 1;
 select id into target from public.orders order by id limit 1;
 perform set_config('request.jwt.claim.sub',actor::text,true);
 update public.profiles set status='inactive' where id=actor;
 set local role authenticated;
 begin perform public.order_costing(target);raise exception 'Inactive admin was allowed';exception when insufficient_privilege then null;end;
 reset role;
 if has_function_privilege('anon','public.order_costing(uuid)','execute') then raise exception 'Anonymous grant';end if;
 if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.proname in ('order_costing','capture_line_estimate','capture_confirmed_estimates','audit_line_estimate') and n.nspname in ('public','private') and not('search_path=""'=any(p.proconfig))) then raise exception 'Unsafe search_path';end if;
end $$;
rollback;
