# Respaldo y recuperación

Verificación 2026-10-17: organización Supabase Free; API DEV devuelve backup_count=0, pitr_enabled=false y physical_backup_data vacío. walg_enabled=true es un dato interno, NO evidencia de copias recuperables. PROD no identificado: frecuencia/retención contratadas todavía no verificables.

Según [documentación oficial](https://supabase.com/docs/guides/platform/backups), Free requiere exportaciones externas propias. Los planes con copias diarias ofrecen retenciones distintas (Pro 7 días, Team 14, Enterprise hasta 30); PITR es adicional y requiere configuración/compute compatible. No está contratado ni activo aquí. Las copias de PostgreSQL no incluyen los objetos binarios de Storage.

## Procedimiento operativo propuesto para aprobar al habilitar PROD

Designar responsable y ubicación cifrada externa con acceso limitado. Antes del primer dato real, definir frecuencia/retención y verificar una restauración aislada; no prometer RPO/RTO hasta medirlos. Como preparación, generar copia antes de cada cambio de esquema y exportación periódica según la política que se contrate. No guardar dumps en Git, test-results ni almacenamiento público. Conservar manifest de fecha, ref, versiones, hashes y conteo de objetos sin credenciales.

Export de emergencia: desde estación autorizada, verificar `npx supabase db dump --help`; enlazar exclusivamente PROD en checkout dedicado. Guardar `db dump --linked --file RUTA_SEGURA/schema.sql` y `db dump --linked --data-only --use-copy --file RUTA_SEGURA/data.sql`; exportar roles con `--role-only` si corresponde. La CLI requiere Docker/pg_dump según entorno: comprobar el resultado/exit code y contenido antes de considerar el respaldo válido. Los esquemas administrados Auth/Storage pueden estar excluidos por el dump normal: seguir [guía de restauración CLI](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore) y verificar cobertura de identidades/metadatos; un dump de public no equivale a un respaldo completo de Auth.

Storage: copiar separadamente objetos de catalog-images, order-references y expense-receipts mediante API autenticada autorizada, preservando bucket/ruta/MIME/hash. No hacer buckets públicos. Respaldar configuración Auth/SMTP por mecanismo seguro; contraseñas y claves no van en manifiestos.

## Incidentes

- Eliminación accidental o pérdida: detener escrituras del entorno afectado, preservar evidencia, identificar último punto sano y alcance; restaurar primero en entorno aislado autorizado, validar relaciones/diario/auditoría/objetos. Decidir recuperación parcial o completa con aprobación del dueño, nunca sobrescribir PROD automáticamente.
- Migración fallida: comprobar rollback e historial; no marcarla aplicada manualmente ni editar una migración publicada. Preparar corrección aditiva revisada. No ejecutar reset ni CASCADE.
- Corrupción lógica: preservar estado previo al análisis y evidencia; reconstruir cantidades/valores desde diario, conciliar pagos/saldos y sesiones. Correcciones empresariales auditadas cuando sean suficientes, sin reescribir historia por SQL improvisado.
- Storage: recuperar binario y metadato coherentes; restaurar solo PostgreSQL no recupera archivos borrados.
- Recuperación completa: programar indisponibilidad, autorizar el punto de recuperación y pérdida aceptable, restaurar mediante Dashboard/plan real, verificar RLS/grants/Auth/buckets, reconfigurar secretos fuera del dump y ejecutar smoke. Documentar tiempos y diferencias.

No se realizó restore destructivo ni se creó una copia de datos reales durante esta fase. La prueba aislada de recuperación y la política productiva quedan pendientes del entorno PROD.
