-- Excepción autorizada: solo ocho CHECK de orders; sustitución atómica, sin datos borrados.
begin;
alter table public.orders
 add column number_year integer,
 add column number_sequence bigint,
 add column deposit_percentage_override public.quote_money check(deposit_percentage_override between 0 and 100),
 add column deposit_percentage_applied public.quote_money,
 add column deposit_required_amount public.quote_money,
 add column commercial_revision bigint not null default 1 check(commercial_revision>0),
 add column zero_total_authorized_revision bigint;

alter table public.orders
 drop constraint orders_production_status_check restrict,
 drop constraint orders_order_number_check restrict,
 drop constraint orders_confirmed_at_check restrict,
 drop constraint orders_delivered_at_check restrict,
 drop constraint orders_zero_total_authorized_by_check restrict,
 drop constraint orders_zero_total_authorized_at_check restrict,
 drop constraint orders_zero_total_reason_check restrict,
 drop constraint orders_check2 restrict,
 add constraint orders_3b_status_check check ((production_status in ('quote','confirmed','in_production','ready','delivered','cancelled')) is true) not valid,
 add constraint orders_3b_number_check check ((case when confirmed_at is null then order_number is null and number_year is null and number_sequence is null and deposit_percentage_applied is null and deposit_required_amount is null else order_number is not null and number_year is not null and number_sequence is not null and number_sequence>0 and number_year=extract(year from confirmed_at at time zone 'America/Costa_Rica') and order_number='PED-'||number_year::text||'-'||lpad(number_sequence::text,greatest(5,length(number_sequence::text)),'0') and deposit_percentage_applied is not null and deposit_percentage_applied between 0 and 100 and deposit_required_amount is not null end) is true) not valid,
 add constraint orders_3b_confirmation_check check ((((production_status='quote' and confirmed_at is null) or production_status='cancelled' or (production_status in ('confirmed','in_production','ready','delivered') and confirmed_at is not null)) and (confirmed_at is null or (confirmed_at at time zone 'America/Costa_Rica')::date>=order_date)) is true) not valid,
 add constraint orders_3b_delivery_check check ((case when production_status='delivered' then delivered_at is not null and confirmed_at is not null and delivered_at>=confirmed_at else delivered_at is null end) is true) not valid,
 add constraint orders_3b_zero_actor_check check ((case when confirmed_at is not null and total=0 then zero_total_authorized_by is not null and zero_total_authorized_at is not null and zero_total_reason is not null and zero_total_authorized_revision is not null and zero_total_authorized_revision=commercial_revision else zero_total_authorized_by is null and zero_total_authorized_at is null and zero_total_reason is null and zero_total_authorized_revision is null end) is true) not valid,
 add constraint orders_3b_zero_time_check check ((zero_total_authorized_at is null or (confirmed_at is not null and zero_total_authorized_at>=confirmed_at)) is true) not valid,
 add constraint orders_3b_zero_reason_check check ((zero_total_reason is null or length(trim(zero_total_reason)) between 1 and 1000) is true) not valid,
 add constraint orders_3b_cancellation_check check ((case when production_status='cancelled' then cancelled_at is not null and cancelled_by is not null and cancel_reason is not null and length(trim(cancel_reason)) between 1 and 1000 else cancelled_at is null and cancelled_by is null and cancel_reason is null end) is true) not valid;
alter table public.orders validate constraint orders_3b_status_check;
alter table public.orders validate constraint orders_3b_number_check;
alter table public.orders validate constraint orders_3b_confirmation_check;
alter table public.orders validate constraint orders_3b_delivery_check;
alter table public.orders validate constraint orders_3b_zero_actor_check;
alter table public.orders validate constraint orders_3b_zero_time_check;
alter table public.orders validate constraint orders_3b_zero_reason_check;
alter table public.orders validate constraint orders_3b_cancellation_check;
create unique index orders_number_unique on public.orders(order_number);
create unique index orders_year_sequence_unique on public.orders(number_year,number_sequence);
create index orders_confirmed_idx on public.orders(confirmed_at);
create index orders_delivered_idx on public.orders(delivered_at);
commit;
