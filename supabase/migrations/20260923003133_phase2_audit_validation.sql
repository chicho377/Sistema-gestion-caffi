-- Auditoría Fase 2: igualar la validación de correo con el servidor.
-- Restricciones aditivas; no cambia ni elimina filas ni constraints anteriores.
begin;
alter table public.clients add constraint clients_email_no_whitespace
 check (email !~ '[[:space:]]') not valid;
alter table public.settings add constraint settings_email_no_whitespace
 check (email !~ '[[:space:]]') not valid;
alter table public.clients validate constraint clients_email_no_whitespace;
alter table public.settings validate constraint settings_email_no_whitespace;
commit;
