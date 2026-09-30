-- Solo comprobantes 3D. Evita que clientes calienten caché CDN con su JWT.
-- La autorización del propietario/Admin sigue en expense_files + expenses RLS.
-- SIGCA descarga bytes únicamente después de comprobar ese acceso vigente.
begin;
alter policy expense_receipts_read on storage.objects using(false);
commit;
