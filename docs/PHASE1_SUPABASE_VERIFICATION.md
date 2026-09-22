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

El estado anterior describe la aplicación inicial de la migración. El cierre técnico posterior se registra a continuación; las pruebas E2E con Auth simulado no sustituyen la validación real.

## Configuración y pruebas de cierre — 2026-09-22

### Configuración completada

- Proyecto verificado nuevamente por MCP: SIGCA desarrollo, `pysgfnwsycgoneaecgcl`.
- `.env.local` creado con URL, clave publicable y service_role obtenidos mediante CLI autenticada; secreto de flujo generado con 32 bytes criptográficos aleatorios y APP_URL local. No se publican valores de claves ni secretos. No contiene configuración ni contraseña SMTP; Git lo ignora y no está en el índice.
- Management API: signup público deshabilitado, usuarios anónimos deshabilitados, email habilitado, confirmación de correo requerida.
- Site URL `http://localhost:3000`; única Redirect URL autorizada `http://localhost:3000/auth/confirm`, sin comodines. Se corrigió una configuración intermedia que apuntaba a Vercel: ese despliegue no es el destino de estas pruebas locales.
- SMTP alojado: Gmail en puerto 587 con STARTTLS, nombre remitente SIGCA. El usuario corrigió el correo remitente/usuario SMTP; se verificó la coincidencia de ambos sin modificar su credencial. El error inicial 535 correspondía al correo equivocado, no se concluye que la contraseña estuviera mal.
- Plantillas invite/recovery publicadas por Management API y verificadas contra los archivos locales. Usan RedirectTo y TokenHash; si RedirectTo falta o coincide con SiteURL, añaden `/auth/confirm`. Paleta, botones y tipografía con fuentes de respaldo coherentes con DESIGN_SYSTEM. Se mantiene la confirmación explícita y cookie firmada de cambio de contraseña.
- Primer Administrador: tras comprobar ausencia de admin y migración aplicada, el usuario autorizó aprovisionamiento directo. Auth Admin creó la identidad sin contraseña; el mismo bloque SQL documentado asignó nombre y admin/active. Comprobados un evento profile.created y uno profile.updated. La contraseña la establece personalmente el titular mediante correo.

### Resultados diferenciados

| Tipo de prueba | Evidencia y resultado |
|---|---|
| Local estática | Lint, typecheck y build correctos; npm audit --omit=dev: cero vulnerabilidades |
| PostgreSQL local | npm test: 7 pruebas aprobadas |
| E2E simulado | 7 recorridos aprobados, 320/375/768/1024/1440 px; Auth HTTP simulado, sin equivalencia con recepción de correo |
| Supabase real, SQL | Script transaccional remoto aprobado nuevamente; rollback conserva la cuenta administrativa real; RLS, grants, funciones y triggers verificados |
| Supabase real, API | signup devuelve signup_disabled, acceso anónimo devuelve anonymous_provider_disabled; no se crean usuarios; anon no lee profiles/audit_log; private devuelve PGRST106 y no está expuesto |
| Aplicación local contra Supabase real | /, /dashboard, /usuarios y /mas redirigen a login sin sesión; recuperación solicitada desde la interfaz; Auth registró recovery_sent_at. Un token inválido enviado desde /auth/confirm fue rechazado y la UI mostró un error seguro |
| Correo real | Usuario confirmó recepción por Gmail y llegada al Dashboard del Administrador, corroborada por Auth y auth.login. Posteriormente confirmó invitación, establecimiento de contraseña, acceso, recuperación, cambio de contraseña y nuevo acceso del Colaborador. Auth confirma invited_at, email_confirmed_at, recovery_sent_at y evento auth.login; no se inspeccionaron contraseñas |
| UI con sesión Auth real aislada | Dashboard y Usuarios accesibles al Administrador; invitación enviada mediante formulario de SIGCA; Colaborador accede a Dashboard y es rechazado en /usuarios. Logout y rechazo posterior de rutas protegidas aprobados para ambos |
| API/RLS con sesión Auth real | Colaborador solo obtiene su perfil, no obtiene auditoría, no cambia su rol/estado ni estado del Administrador; no puede autorizar invitaciones. Se usan clave publicable y JWT real de usuario, sin service_role para estas comprobaciones |
| Desactivación/reactivación real | Desde Usuarios se desactivó al Colaborador manteniendo su sesión abierta: RPC y lecturas quedaron bloqueadas inmediatamente; al volver a verificar el perfil la UI redirigió al login. Reactivación desde Usuarios restauró acceso y conservó collaborator. Ambos cambios quedaron auditados con actor Administrador |
| Renovación real | refreshSession devolvió sesión válida; getUser verificó la identidad después. No se esperó una hora al vencimiento natural del JWT |
| Responsive real | Dashboard de Colaborador y Usuarios de Administrador comprobados en 320/375/768/1024/1440 px, sin desbordamiento horizontal |
| Enlaces Auth reales | Token de recuperación administrativo verificado desde la UI: abre nueva contraseña; segundo uso rechazado. No se cambió ninguna contraseña durante esta comprobación; no equivale a un nuevo correo entregado |
| Secretos | Escaneo de 58 archivos versionados/candidatos y 152 assets de navegador: sin coincidencias de secretos privados; .env.local ignorado, no versionado, SMTP ausente |

### Correcciones limitadas a Fase 1

- Una prueba a 375 px detectó que el toast interceptaba el botón Cerrar sesión. Se ajustó su separación superior; los siete E2E posteriores pasaron.
- Deshabilitado logging de solicitudes entrantes de Next en desarrollo para no registrar URLs con tokens Auth.
- Alternativa de destino en plantillas para correos enviados sin RedirectTo específico, sin modificar verificación de tokens ni autorización de contraseña.

### Security Advisors y límites

La revisión actual devuelve una advertencia: `auth_leaked_password_protection`. La organización está en plan Free y la protección contra contraseñas filtradas exige Pro o superior según [Supabase](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). No se contrató ni cambió el plan. No hay hallazgos de RLS o funciones en esta revisión. Las revisiones iniciales sin hallazgos quedan como evidencia histórica, no como resultado final actual.

La sesión del navegador del usuario no estaba disponible en la superficie de automatización. Para evitar solicitar su contraseña o repetir accesos, las comprobaciones automatizadas reales utilizaron una sesión Supabase aislada obtenida con Auth Admin generateLink y verifyOtp para una identidad existente y confirmada. Las cookies y tokens se mantuvieron en memoria, sin trazas ni archivos de sesión. Las operaciones de aplicación conservaron su cliente autenticado y RLS; no se añadió ningún bypass al código. Esta técnica prueba autorización y navegación, no sustituye el login con contraseña ni la recepción de correo por el titular, corroborados separadamente.

### Cierre en desarrollo

Fase 1 implementada y validada funcionalmente en SIGCA desarrollo. No se avanzó a Fase 2. Estado final: dos identidades autorizadas, Administrador activo y Colaborador activo; se conserva la auditoría y no se eliminan cuentas de prueba como compensación.

No quedan pasos manuales de configuración o acceso pendientes para este cierre. La recepción/uso de correos y las contraseñas fueron comprobadas personalmente por el titular; las pruebas automatizadas de autorización se ejecutaron por separado con sesiones reales.

Límites documentados: contraseñas que no coinciden y enlace vencido se cubrieron en E2E simulado; enlace inválido y ya utilizado se comprobaron también contra Auth real. No se acortó la vigencia global ni se esperó el vencimiento natural del enlace/JWT: se verificó renovación real explícita. La advertencia de protección contra contraseñas filtradas permanece por la limitación de plan; resolverla exige evaluar Pro o superior, sin contratación automática. Este cierre de desarrollo no constituye despliegue ni habilitación de producción en Vercel.
