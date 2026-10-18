# Despliegue de SIGCA

Estado 2026-10-17: candidato, sin producción verificada. DEV exclusivo pysgfnwsycgoneaecgcl; nunca usarlo como PROD. 34 migraciones versionadas. No copiar usuarios, pedidos, archivos, fixtures ni datos de prueba.

## Recursos requeridos

PROD_SUPABASE_REQUIRED: proporcionar project ref de un proyecto separado y acceso administrativo, o autorizar expresamente su creación indicando organización/plan/región. La organización actual es Free; no se contrató nada. VERCEL_PROD_CONFIGURATION_REQUIRED: conectar el equipo propietario del proyecto y confirmar proyecto/origen HTTPS. El MCP actual corresponde a davidmorag1095-8816s-projects y no muestra proyectos. Auth DEV menciona sistema-gestion-caffi-chicho377s-projects.vercel.app, pero ese despliegue no está accesible para inspección. No concluir que no existe globalmente.

## Secuencia de despliegue

1. Verificar el ref PROD, su nombre/organización y que está vacío. No restablecer ni borrar un proyecto con información. Respaldar antes de cualquier migración sobre información real.
2. Usar checkout limpio del RC. Revisar `supabase/migrations`; son esquema y configuración aprobada, no tests. La semilla empresarial es settings (caffi crochet, teléfono/correo aprobados, adelanto habitual); no ejecutar tests ni cargar test-results en PROD.
3. En un checkout dedicado, `npx supabase link --project-ref REF_PROD_CONFIRMADO`, `npx supabase migration list`, `npx supabase db push --dry-run`; verificar exactamente las migraciones pendientes. Aplicar `npx supabase db push`, comprobar historial, RLS, funciones, triggers y tres buckets privados. No usar db reset. No alterar el enlace DEV de trabajo por accidente.
4. Configurar Auth: signup y anonymous deshabilitados, email habilitado, confirmación requerida. Site URL = origen HTTPS canónico; único retorno necesario `ORIGEN/auth/confirm`. Sin comodines ni URLs DEV en PROD. Publicar invite/recovery desde supabase/templates; conservar RedirectTo, TokenHash y confirmación segura existente. SMTP alojado en Supabase, nunca variables Next.js; cuenta remitente autorizada, puerto 587/STARTTLS. Probar entrega controlada tras confirmar el entorno.
5. Configurar A51 cuando el plan lo permita. Crear primer Admin siguiendo ADMIN_GUIDE. Confirmar settings y política de respaldo.
6. En Vercel Production, configurar NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY de PROD, SUPABASE_SERVICE_ROLE_KEY de PROD solo servidor, AUTH_FLOW_SECRET nuevo con >=32 bytes aleatorios y APP_URL HTTPS canónico. Guardar por canales protegidos, nunca en Git/logs. Preview usa DEV y credenciales independientes; nunca promover un build con claves públicas DEV a Production.
7. Node compatible con engines (>=22.18); `npm ci`, lint/typecheck/tests/build y comprobaciones de seguridad. Framework Next.js, comandos estándar, sin output estático. Verificar dominio TLS y headers con respuesta real. Mantener bodySizeLimit 8mb y límites de archivos de 5MB.
8. Desplegar solo tras validar los pasos anteriores. Hacer smoke con datos identificados y acciones empresariales válidas; no DELETE ni carga/concurrencia agresiva. Antes de cada registro financiero confirmar que es dato smoke autorizado. Conservar su auditoría y anular/cancelar cuando corresponda; un entorno auditado no puede quedar sin rastro.
9. Revalidar login/invitación/recuperación, ambos roles, inactivo, Storage, reportes y exportaciones. Solo entonces aprobar v1.0.0. Revertir despliegue frontend no revierte migraciones: restauración de datos requiere plan/autorización independiente.

No hay despliegue productivo ejecutado en esta fase. No se crearon recursos cloud ni modificaron URLs Auth.
