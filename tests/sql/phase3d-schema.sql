with tables as (select unnest(array['expense_categories','expenses','expense_files','expenses_read']) name), funcs as (
select p.*,n.nspname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private') and p.proname in ('expense_actor','lock_expense','guard_expense','audit_expense','save_expense_category','expense_rate','store_expense_exchange_rate','register_expense','edit_expense_notes','void_expense','register_expense_file'))
select jsonb_build_object(
'columns',(select md5(string_agg(table_name||':'||column_name||':'||data_type||':'||udt_name||':'||is_nullable||':'||coalesce(column_default,''),E'\n' order by table_name,ordinal_position)) from information_schema.columns where table_schema='public' and table_name in(select name from tables)),
'constraints',(select md5(string_agg(conrelid::regclass::text||':'||conname||':'||pg_get_constraintdef(oid),E'\n' order by conrelid::regclass::text,conname)) from pg_constraint where connamespace='public'::regnamespace and conrelid::regclass::text in (select name from tables) and contype<>'n'),
'functions',(select md5(string_agg(pg_get_functiondef(oid),E'\n' order by nspname,proname)) from funcs),
'policies',(select md5(string_agg(tablename||':'||policyname||':'||cmd||':'||coalesce(qual,''),E'\n' order by tablename,policyname)) from pg_policies where tablename in(select name from tables) or policyname='expense_receipts_read'),
'indexes',(select md5(string_agg(indexdef,E'\n' order by indexname)) from pg_indexes where schemaname='public' and tablename in(select name from tables)),
'view',(select md5(definition) from pg_views where schemaname='public' and viewname='expenses_read'),
'view_options',(select array_to_string(reloptions,',') from pg_class where oid='public.expenses_read'::regclass),
'rls',(select bool_and(relrowsecurity) from pg_class where relnamespace='public'::regnamespace and relname in ('expenses','expense_categories','expense_files')),
'triggers',(select md5(string_agg(pg_get_triggerdef(oid),E'\n' order by tgname)) from pg_trigger where not tgisinternal and tgrelid::regclass::text in(select name from tables)),
'grants',(select md5(string_agg(table_name||':'||grantee||':'||privilege_type,E'\n' order by table_name,grantee,privilege_type)) from information_schema.table_privileges where table_schema='public' and table_name in(select name from tables) and grantee in ('anon','authenticated','service_role')),
'execute',(select md5(string_agg(nspname||'.'||proname||':'||r||':'||has_function_privilege(r,oid,'EXECUTE'),E'\n' order by nspname,proname,r)) from funcs cross join unnest(array['anon','authenticated','service_role']) r),
'bucket',(select jsonb_build_object('public',public,'file_size_limit',file_size_limit,'allowed_mime_types',allowed_mime_types) from storage.buckets where id='expense-receipts')
) as fingerprint;
