-- Fase 2: un teléfono no puede consistir solo en signos/espacios.
-- Conserva el formato y longitudes aprobados, sin modificar datos existentes.
begin;
alter table public.clients add constraint clients_phone_has_digit
 check (phone ~ '[0-9]') not valid;
alter table public.settings add constraint settings_phone_has_digit
 check (phone ~ '[0-9]') not valid;
alter table public.clients validate constraint clients_phone_has_digit;
alter table public.settings validate constraint settings_phone_has_digit;
commit;
