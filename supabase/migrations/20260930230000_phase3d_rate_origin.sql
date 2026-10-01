-- Auditoría 3D: origen derivado de evidencia confiable, nunca de la referencia libre.
-- Conserva los datos históricos, columnas previas, grants y seguridad del invocador.
begin;
create or replace view public.expenses_read with(security_invoker=true) as select id,category_id,order_id,order_item_id,amount::text,currency,expense_date,exchange_rate_applied::text,exchange_rate_date,exchange_rate_source,amount_crc::text,rate_override_reason,rate_provided_by,rate_provided_at,rate_is_fallback,description,notes,payment_method,supplier,status,is_historical,created_by,updated_by,voided_by,voided_at,void_reason,revision,created_at,updated_at,case when currency='CRC' then 'not_applicable' when rate_provided_by is not null then 'admin_historical' else 'provider' end as rate_origin from public.expenses;
commit;
