-- Corrección 3E: impedir reutilización de respuestas CDN con JWT ya inactivo.
-- Metadatos mantienen RLS/grants y la autorización funcional existente.
-- Bytes solo por endpoints SIGCA, después de autorizar mediante JWT vigente.
begin;
alter policy order_references_read on storage.objects using(false);
alter policy catalog_images_read on storage.objects using(false);
commit;
