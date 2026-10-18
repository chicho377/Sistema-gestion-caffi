# Guía de Administración

## Primer Admin en PROD limpio

Aplicar primero todas las migraciones. Verificar que no exista un perfil admin. En Supabase Authentication → Users → Add user → Create user, crear la identidad del titular con contraseña elegida personalmente y correo confirmado. El trigger genera profiles collaborator. Ejecutar una sola vez el bloque protegido de [README: Primer Administrador](../README.md#primer-administrador--una-sola-vez), sustituyendo correo/nombre; comprobar admin/active y evento de auditoría. No copiar la cuenta de DEV ni generar/guardar contraseñas en archivos. Nunca repetir bootstrap si ya hay Admin.

## Usuarios

Invitar desde Usuarios; correo real con acceso seguro y perfil collaborator/active. Promoción/cambio de estado solo Admin; no cambiar propio rol. Inactivar restringe inmediatamente API/RLS y la UI al revalidar. La auditoría es lectura, no se borra. Si falla SMTP, revisar configuración alojada sin pegar secretos en tickets.

## Configuración empresarial

Configuración contiene nombre caffi crochet, teléfono y correo aprobados, adelanto 50% y tarifa. Confirmar los datos antes de operación real. hourly_rate sigue NULL: introducir tarifa CRC positiva con dos decimales como máximo para habilitar Play. No afecta sesiones históricas; no inventar un valor de prueba en PROD. Logo opcional sigue pendiente; usar carga privada de logo en Configuración. Sin logo, nombre textual válido. Costos/estimaciones opcionales de catálogos se completan según negocio, nunca mediante backfill inventado.

Adelanto se fija al confirmar pedido; cambios de Configuración no reescriben historia. Porcentajes especiales, total cero, históricos y correcciones requieren controles/motivos aprobados. Pago/gasto erróneo se anula; reclasificar gasto válido conserva finanzas. Compras asociadas y gasto de envío mantienen vínculo explícito para evitar doble imputación.

## Seguridad y mantenimiento

Solo servidor usa service_role y AUTH_FLOW_SECRET. Secretos distintos en DEV/PROD, SMTP únicamente Supabase. Verificar identidades, URLs exactas, correo, buckets privados, backups y matriz antes de abrir PROD. A51: organización actual Free no permite protección contra contraseñas filtradas; requiere Pro o superior. En proyecto PROD, Authentication → configuración del proveedor Email/Password security → habilitar Leaked password protection, guardar y volver a ejecutar Security Advisors. No se cambió de plan. Riesgo: contraseñas reutilizadas comprometidas; sigue pendiente antes de producción conforme al compromiso aprobado, no simulado como resuelto.

Ver [checklist](PRODUCTION_CHECKLIST.md), [despliegue](DEPLOYMENT.md) y [recuperación](BACKUP_RECOVERY.md). No lanzar suites DEV sobre PROD. No restablecer base, borrar historial, hacer buckets públicos ni habilitar signup para resolver un error. En incidencias conservar evidencia sin contraseñas/tokens y verificar autorización antes de operaciones destructivas.
