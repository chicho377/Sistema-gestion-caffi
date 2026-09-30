select jsonb_build_object(
'columns',(select md5(string_agg(column_name||':'||data_type||':'||udt_name||':'||is_nullable||':'||coalesce(column_default,''),E'\n' order by ordinal_position)) from information_schema.columns where table_schema='public' and table_name='manual_income'),
'constraints',(select md5(string_agg(conname||':'||pg_get_constraintdef(oid),E'\n' order by conname)) from pg_constraint where conrelid='public.manual_income'::regclass and contype<>'n'),
'functions',(select md5(string_agg(pg_get_functiondef(p.oid),E'\n' order by n.nspname,p.proname)) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private') and p.proname in ('register_manual_income','void_manual_income','guard_manual_income','audit_manual_income')),
'policies',(select md5(string_agg(policyname||':'||cmd||':'||coalesce(qual,''),E'\n' order by policyname)) from pg_policies where tablename='manual_income'),
'indexes',(select md5(string_agg(indexdef,E'\n' order by indexname)) from pg_indexes where schemaname='public' and tablename='manual_income'),
'view',(select md5(definition) from pg_views where schemaname='public' and viewname='manual_income_read'),
'view_options',(select array_to_string(reloptions,',') from pg_class where oid='public.manual_income_read'::regclass),
'rls',(select relrowsecurity from pg_class where oid='public.manual_income'::regclass),
'triggers',(select md5(string_agg(pg_get_triggerdef(oid),E'\n' order by tgname)) from pg_trigger where not tgisinternal and tgrelid='public.manual_income'::regclass),
'grants',(select md5(string_agg(table_name||':'||grantee||':'||privilege_type,E'\n' order by table_name,grantee,privilege_type)) from information_schema.table_privileges where table_schema='public' and table_name in ('manual_income','manual_income_read') and grantee in ('anon','authenticated','service_role')),
'execute',(select md5(string_agg(n.nspname||'.'||p.proname||':'||r||':'||has_function_privilege(r,p.oid,'EXECUTE'),E'\n' order by n.nspname,p.proname,r)) from pg_proc p join pg_namespace n on n.oid=p.pronamespace cross join unnest(array['anon','authenticated','service_role']) r where n.nspname in ('public','private') and p.proname in ('register_manual_income','void_manual_income','guard_manual_income','audit_manual_income'))
) as fingerprint;
