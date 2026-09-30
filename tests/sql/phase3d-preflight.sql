select current_database() as database_name,
 to_regclass('public.expenses') as expenses,
 to_regclass('public.expense_categories') as expense_categories,
 to_regclass('public.expense_files') as expense_files,
 (select count(*) from storage.buckets where id='expense-receipts') as existing_bucket,
 (select count(*) from supabase_migrations.schema_migrations) as applied_migrations;
