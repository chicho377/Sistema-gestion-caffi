select (select jsonb_agg(jsonb_build_object('name',policyname,'command',cmd,'roles',roles,'expression',qual)) from pg_policies where schemaname='storage' and tablename='objects' and policyname='expense_receipts_read') as policies,
 (select md5(coalesce(string_agg(to_jsonb(f)::text,E'\n' order by id),'')) from public.expense_files f) as metadata_hash,
 (select count(*) from storage.objects where bucket_id='expense-receipts') as object_count;
