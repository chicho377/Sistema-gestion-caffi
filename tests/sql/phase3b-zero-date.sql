-- ZT-01: regresión de corrección temporal preservando autorización original. Todo revierte.
begin;
insert into auth.users(id,email) values('61000000-0000-4000-8000-000000000099','phase3b-zero-date@example.test');
update public.profiles set role='admin' where id='61000000-0000-4000-8000-000000000099';
set local role authenticated;
select set_config('request.jwt.claim.sub','61000000-0000-4000-8000-000000000099',true);
insert into public.clients(id,name) values('62000000-0000-4000-8000-000000000099','ZT-01');
do $$
declare o uuid:='64000000-0000-4000-8000-000000000099'; d date:=(clock_timestamp() at time zone 'America/Costa_Rica')::date; previous public.orders; current_order public.orders; t timestamptz;
begin
 perform public.save_quote(o,0,jsonb_build_object('client_id','62000000-0000-4000-8000-000000000099','order_date',d,'requested_delivery_date',d,'discount_amount','0','items',jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'product_name_snapshot','ZT-01','quantity','1','unit_price','0','discount_amount','0','is_active',true))));
 perform public.confirm_order(o,1,'{"zero_reason":"Regalo autorizado"}');
 select * into previous from public.orders where id=o;
 t:=clock_timestamp();
 perform public.correct_order_dates(o,2,jsonb_build_object('confirmed_at',to_char(t at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'reason','Corrección permitida del mismo año, sin pagos'));
 select * into current_order from public.orders where id=o;
 if current_order.confirmed_at<>t or current_order.revision<>3 or current_order.order_number<>previous.order_number then raise exception 'Corrección temporal incompleta';end if;
 if current_order.zero_total_authorized_by is distinct from previous.zero_total_authorized_by or current_order.zero_total_authorized_at is distinct from previous.zero_total_authorized_at or current_order.zero_total_reason is distinct from previous.zero_total_reason or current_order.zero_total_authorized_revision is distinct from previous.zero_total_authorized_revision then raise exception 'Autorización original modificada';end if;
 if not exists(select 1 from public.order_history(o) where action='order.dates_corrected') then raise exception 'Corrección sin auditoría';end if;

end $$;
rollback;
select 'PASS ZT-01: fecha corregida y autorización histórica intacta' as result;
