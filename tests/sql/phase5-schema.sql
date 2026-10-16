select jsonb_build_object(
 'functions',(select jsonb_agg(jsonb_build_object('schema',n.nspname,'name',p.proname,'body',md5(p.prosrc),'stable',p.provolatile,'definer',p.prosecdef,'config',p.proconfig,'acl',p.proacl::text) order by n.nspname,p.proname) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private') and p.proname in ('order_costing','capture_line_estimate','capture_confirmed_estimates','audit_line_estimate')),
 'columns',(select jsonb_agg(jsonb_build_object('name',column_name,'type',data_type,'nullable',is_nullable) order by column_name) from information_schema.columns where table_schema='public' and table_name='order_items' and column_name in ('estimated_minutes_snapshot','estimate_captured_at')),
 'constraints',(select jsonb_agg(pg_get_constraintdef(oid,true) order by conname) from pg_constraint where conrelid='public.order_items'::regclass and conname in ('order_items_estimated_minutes_snapshot_check','order_items_estimate_captured_at_check')),
 'triggers',(select jsonb_agg(pg_get_triggerdef(oid,true) order by tgname) from pg_trigger where tgname in ('capture_line_estimate','capture_confirmed_estimates','audit_line_estimate')),
 'rls',(select jsonb_build_object('enabled',relrowsecurity,'acl',relacl::text) from pg_class where oid='public.order_items'::regclass)
) as fingerprint;
