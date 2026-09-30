do $$declare t text;r text;op text;begin
 foreach t in array array['expenses','expense_categories','expense_files','expenses_read'] loop
  foreach r in array array['anon','authenticated','service_role'] loop
   foreach op in array array['INSERT','UPDATE','DELETE','TRUNCATE'] loop
    if has_table_privilege(r,'public.'||t,op) then raise exception 'Grant inesperado: % % %',r,t,op;end if;
   end loop;
   if has_table_privilege(r,'public.'||t,'SELECT') is distinct from (r='authenticated') then raise exception 'SELECT inesperado: % %',r,t;end if;
  end loop;
 end loop;
 if not (select bool_and(relrowsecurity) from pg_class where oid in('public.expenses'::regclass,'public.expense_categories'::regclass,'public.expense_files'::regclass)) then raise exception 'RLS incompleto';end if;
 if (select public from storage.buckets where id='expense-receipts') then raise exception 'Bucket público';end if;
end $$;
select 'PASS grants mínimos, sin DML/DELETE/TRUNCATE; RLS y bucket privado' as result;
