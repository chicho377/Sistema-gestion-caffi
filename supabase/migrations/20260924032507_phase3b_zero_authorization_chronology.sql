-- Excepción adicional autorizada: sustituir únicamente este CHECK, sin modificar filas.
begin;
alter table public.orders
 drop constraint orders_3b_zero_time_check restrict,
 add constraint orders_3b_zero_time_check check ((zero_total_authorized_at is null or
   (confirmed_at is not null and isfinite(zero_total_authorized_at))) is true) not valid;
alter table public.orders validate constraint orders_3b_zero_time_check;
commit;
