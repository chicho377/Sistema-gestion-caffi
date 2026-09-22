# Verificación de Fase 1 en Supabase de desarrollo

## Proyecto y alcance

- Proyecto indicado por el usuario: **SIGCA**, desarrollo.
- Project ref confirmado mediante MCP: **pysgfnwsycgoneaecgcl**.
- Región: `us-west-2`; estado inicial: `ACTIVE_HEALTHY`.
- PostgreSQL: 17.6. El nombre interno de la base es `postgres`; SIGCA es el nombre del proyecto.
- Se mostró nombre/ref al usuario antes de cualquier modificación.
- Solo Fase 1; sin borrado de datos, reset, comandos DROP ni módulos de Fase 2.

## Inspección inicial

MCP confirmó:

- Ninguna migración remota.
- Sin objetos en `public` ni `private`, ni funciones en esos esquemas.
- Sin triggers de aplicación en `auth.users`.
- Cero usuarios en `auth.users`.
- Security Advisors: lista de hallazgos vacía.

Migración local única: `20260922014548_phase1_security.sql`.
SHA-256 previo a aplicación: `A249EA692466029D80EFE52B80C116FE10D07B1B0F1817EFE4F894284105B326`.
La inspección no encontró colisiones de nombres ni datos que requieran transformación.

## CLI y dry-run

CLI local: 2.117.0. No se encontró `supabase/.temp/project-ref`; todos los comandos remotos utilizaron el project ref explícito, sin cambiar el vínculo local.
El primer intento quedó bloqueado por falta de autenticación. Después del login completado por el usuario, `supabase projects list` confirmó SIGCA y el ref indicado. No se copiaron tokens al repositorio.

Se intentó el comando solicitado con destino explícito y sin cambios a Vault:

```powershell
npx supabase db push --dry-run --project-ref pysgfnwsycgoneaecgcl --skip-vault
```

Resultado del dry-run autenticado: únicamente `20260922014548_phase1_security.sql`; sin seeds ni roles adicionales. Se revisó el SQL y se aplicó mediante:

```powershell
npx supabase db push --project-ref pysgfnwsycgoneaecgcl --skip-vault --yes
```

La CLI terminó con código 0 y confirmó esa única migración. `migration list --project-ref pysgfnwsycgoneaecgcl` muestra versión local y remota `20260922014548`. El dry-run posterior terminó con `upToDate: true` y listas vacías de migraciones, seeds y roles.

## Preparación de pruebas

- Añadido `tests/sql/phase1-remote-verification.sql`: prueba de creación de perfiles, metadata no autoritativa, permisos anon/colaborador/admin/inactivo, protección del propio rol, columnas permitidas, auditoría, RPC y sincronización de correo.
- El script usa una transacción única con UUID de prueba aleatorios y finaliza en `ROLLBACK`. No envía correos ni conserva usuarios ficticios.
- Añadida verificación local del mismo script en `tests/security.test.mjs`, comprobando que los conteos de usuarios, perfiles y auditoría vuelven exactamente a los previos.
- `npm test`: **7 pruebas aprobadas**, incluyendo el nuevo escenario.
- El mismo script se ejecutó mediante MCP contra SIGCA y devolvió **PASS**. Una consulta independiente posterior confirmó `auth.users = 0`, `profiles = 0`, `audit_log = 0`: no quedaron datos de prueba.

## Inspección posterior a la aplicación

- `profiles` y `audit_log` existen con RLS habilitada.
- Constraints de rol (`admin` / `collaborator`) y estado (`active` / `inactive`), claves primarias y relaciones con `ON DELETE RESTRICT` verificadas; índices de auditoría presentes.
- Políticas: `profiles_read` (perfil propio activo o admin activo), `profiles_admin_update` (admin activo, USING y WITH CHECK) y `audit_admin_read` (admin activo).
- `authenticated` tiene SELECT en ambas tablas y UPDATE únicamente en `profiles.role` y `profiles.status`. Sin permisos de tabla para anon/PUBLIC ni escritura directa en auditoría.
- Esquema `private`: propietario postgres, USAGE para authenticated; sin acceso anon/PUBLIC ni CREATE para authenticated.
- Diez funciones verificadas: ocho privadas y dos wrappers públicos. Todas fijan `search_path` vacío; wrappers `SECURITY INVOKER`, funciones privilegiadas internas con EXECUTE restringido. Los wrappers también conservan el grant administrativo de service_role; sus comprobaciones de identidad permanecen activas.
- Triggers `on_auth_user_created`, `on_auth_email_updated`, `guard_profile` y `audit_profile` presentes.
- Pruebas remotas verificaron creación segura de perfiles ignorando roles en metadata, denegación anon, aislamiento, grants por columna, prohibición de cambiar el propio rol, cambios administrativos, actor/valores de auditoría, RPC, bloqueo de inactivos y sincronización del correo.
- Security Advisors posterior a la aplicación y a las pruebas: **sin hallazgos** (`lints: []`).
- No fue necesaria una migración correctiva ni se modificó el SQL aplicado.

## Estado actual

**Migración de Fase 1 aplicada y verificada en desarrollo.** Esquema local/remoto sincronizado; pruebas SQL remotas aprobadas. No se aplicaron objetos de Fase 2, no se borraron datos y no se ejecutaron operaciones destructivas.

Queda pendiente configurar/verificar Auth alojado (registro público deshabilitado, URLs, SMTP y plantillas), las variables locales, provisionar manualmente el primer Administrador y completar los recorridos con correos reales del README. La migración SQL y `config.toml` no configuran automáticamente Auth alojado. No se crearon cuentas permanentes ni se enviaron correos durante esta verificación. Las pruebas E2E locales con Auth simulado no sustituyen esa validación real.
