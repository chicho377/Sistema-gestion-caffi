select (select md5(coalesce(string_agg(to_jsonb(r)::text,E'\n' order by id),'')) from public.exchange_rates r) as rates_hash,
 (select md5(coalesce(string_agg(to_jsonb(e)::text,E'\n' order by id),'')) from public.expenses e) as expenses_hash;
