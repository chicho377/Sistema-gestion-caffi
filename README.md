# SIGCA — Fase 1: base y seguridad

Aplicación privada para un emprendimiento de crochet. Implementada únicamente Fase 1: Next.js App Router, sistema visual, shell responsive, autenticación y administración privada de usuarios. No hay módulos operativos ni métricas ficticias. La fuente funcional sigue siendo `AGENTS.md` y `/docs`; `/reference` se conserva intacto.

## Requisitos y ejecución local

Node.js 22 o superior (verificado con Node 24), npm y un proyecto Supabase de desarrollo configurado como se indica abajo.

```powershell
npm ci
Copy-Item .env.example .env.local
# Completar .env.local con los valores del proyecto, sin compartir sus secretos.
npm run dev
```

Abrir `http://localhost:3000`. Sin configuración, la pantalla de login explica que el servicio aún no está listo; no habilita datos de demostración ni acceso alternativo. `.env.local` está ignorado por Git. No sobrescribir un archivo de entorno existente al repetir la instalación.

Para ejecutar producción local:

```powershell
npm run build
npm start
```

Configurar las variables antes de construir: Next.js incorpora las públicas al bundle. En Vercel usar Node 22+, las mismas variables por ambiente y reconstruir después de cambiarlas. No se realizó despliegue en esta entrega.

## Variables de entorno

| Variable | Uso | Exposición |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL del proyecto Supabase | Pública |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Clave publicable del mismo proyecto | Pública, protegida por RLS |
| `SUPABASE_SERVICE_ROLE_KEY` | API administrativa de invitación | Solo servidor |
| `AUTH_FLOW_SECRET` | Firma del permiso temporal para establecer contraseña | Solo servidor, aleatorio, mínimo 32 caracteres |
| `APP_URL` | Origen canónico: `http://localhost:3000` en desarrollo, HTTPS en producción | Solo servidor |

Generar localmente `AUTH_FLOW_SECRET` y copiar el resultado únicamente al gestor de secretos o `.env.local`:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

No usar contraseñas personales como secreto ni prefijar claves administrativas con `NEXT_PUBLIC_`. Las credenciales de Google SMTP se guardan exclusivamente en Supabase, no en esta aplicación.

## Configuración manual exacta de Supabase

1. Seleccionar un proyecto de desarrollo vacío o revisar que no existan tablas `profiles`/`audit_log` incompatibles. No aplicar la migración sobre tablas existentes sin revisar el esquema; la migración no elimina tablas.
2. En **Authentication → configuración de usuarios/proveedores**, desactivar **Allow new users to sign up** y acceso anónimo. Mantener email/password habilitado y confirmación de correo. No habilitar otros proveedores para esta fase. `supabase/config.toml` ya deshabilita registros para el entorno local, pero no cambia automáticamente la configuración alojada.
3. Aplicar la migración mediante la CLI, desde la raíz del repositorio:

   ```powershell
   npx supabase login
   npx supabase link --project-ref TU_PROJECT_REF
   npx supabase db push --dry-run
   npx supabase db push
   ```

   Introducir la contraseña de base de datos solo en el prompt seguro cuando se solicite. No escribirla en archivos versionados. En SIGCA desarrollo (`pysgfnwsycgoneaecgcl`) la migración de Fase 1 ya se aplicó y verificó usando el ref explícito y `--skip-vault`; no es necesario volver a aplicarla. Consultar el registro de verificación enlazado abajo.
4. En **Data API**, mantener `public` como esquema expuesto y **no exponer `private`**. La migración otorga solo privilegios necesarios a `authenticated`; no abrir permisos para resolver errores. Revisar Security Advisors después de aplicar.
5. En **Authentication → URL Configuration**, configurar Site URL `http://localhost:3000` y añadir exactamente `http://localhost:3000/auth/confirm` a Redirect URLs. Para producción usar el dominio HTTPS real y su `/auth/confirm`. `APP_URL` debe coincidir con ese origen. Evitar comodines de producción.
6. En **Authentication → Email → SMTP**, activar SMTP personalizado de Google. Usar el servidor y puerto autorizados por la cuenta Google (habitualmente `smtp.gmail.com`, puerto 587 con TLS), usuario igual al correo remitente y contraseña de aplicación de Google. Requiere verificación en dos pasos y disponibilidad de contraseñas de aplicación en esa cuenta; cuentas Workspace pueden requerir habilitación por su administrador. Remitente coherente con la cuenta, nombre `SIGCA`. No pegar estas credenciales en HTML.
7. En **Email Templates → Invite user**, pegar `supabase/templates/invite.html`. En **Reset password**, pegar `supabase/templates/recovery.html`. Ambas usan `RedirectTo` enviado por el servidor y `TokenHash`. No utilizar el enlace por defecto con tokens en fragmento: esta app valida el hash mediante una acción servidor.
8. Confirmar vigencia limitada de enlaces (el entorno local usa una hora) y límites de envío adecuados. La política de contraseña la aplica Supabase; la app exige coincidencia de confirmación y transmite errores genéricos. Mantener las restricciones del servicio.
9. Copiar URL, clave publicable y clave administrativa desde la configuración API del proyecto hacia `.env.local`. Generar `AUTH_FLOW_SECRET` y configurar `APP_URL`.
10. Provisionar el primer Administrador como se indica a continuación y completar la verificación real antes de usar la aplicación con información empresarial.

Referencias oficiales: [SSR](https://supabase.com/docs/guides/auth/server-side/creating-a-client), [SMTP](https://supabase.com/docs/guides/auth/auth-smtp), [plantillas](https://supabase.com/docs/guides/auth/auth-email-templates), [configuración Auth](https://supabase.com/docs/guides/auth/general-configuration), [contraseñas de aplicación Google](https://support.google.com/accounts/answer/185833?hl=es).

## Primer Administrador — una sola vez

1. Aplicar primero la migración. El trigger necesita existir antes del alta.
2. En Supabase **Authentication → Users → Add user / Create user**, crear manualmente el correo de la persona administradora con una contraseña segura y correo confirmado. No guardar su contraseña fuera de Supabase Auth. El trigger crea automáticamente `profiles` con rol inicial `collaborator`.
3. En SQL Editor, sustituir el correo y nombre del siguiente bloque y ejecutarlo una sola vez. El bloque rechaza la ejecución si ya existe un Administrador o si no existe exactamente esa identidad:

   ```sql
   do $$
   declare first_user uuid;
   begin
     if exists (select 1 from public.profiles where role = 'admin') then
       raise exception 'El primer Administrador ya está provisionado';
     end if;
     select id into strict first_user from auth.users
       where lower(email) = lower('TU_CORREO_ADMIN');
     update public.profiles
       set role = 'admin', status = 'active', full_name = 'TU_NOMBRE'
       where id = first_user;
     if not found then
       raise exception 'Falta profiles: revisar que la migración precedió al alta';
     end if;
   end $$;
   ```

4. Verificar `profiles` y el evento de auditoría. La provisión manual registra actor nulo porque se ejecuta por mantenimiento, no por una sesión de la aplicación.
5. Entrar en SIGCA. Desde **Más → Usuarios** (también sidebar en escritorio), invitar a las demás personas. Reciben correo y comienzan como Colaborador. La promoción de otra persona es una acción explícita con confirmación. La app y la base impiden cambiar el propio rol.

La cuenta administradora inicial debe crearse con **Create user**. Como alternativa autorizada para este desarrollo, se provisionó mediante `auth.admin.createUser` con correo confirmado y sin generar contraseña, se aplicó el mismo bloque SQL protegido y se envió recuperación para que el titular establezca su contraseña personalmente. Las invitaciones normales se envían desde SIGCA con el enlace correcto.

El primer Administrador de SIGCA desarrollo ya está provisionado y auditado. No repetir el bootstrap.

## Migración, políticas y auditoría

Archivo: `supabase/migrations/20260922014548_phase1_security.sql`, creado con la CLI. No incluye tablas de fases posteriores.

| Elemento | Protección |
|---|---|
| `profiles` | FK a `auth.users`, rol/estado cerrados, defaults seguros y RLS |
| `profiles_read` | Activo lee su propio perfil; Administrador activo lee perfiles de usuarios |
| `profiles_admin_update` | Solo Administrador activo actualiza; privilegio limitado a columnas `role`, `status` |
| `guard_profile` | Prohíbe modificar el propio rol y la identidad del perfil |
| `audit_log` | RLS, sin INSERT/UPDATE/DELETE concedidos a usuarios de aplicación |
| `audit_admin_read` | Solo Administrador activo consulta |
| Trigger de `auth.users` | Crea perfil collaborator/active; ignora metadata para autorización |
| Trigger de correo | Sincroniza correo confirmado desde Auth |
| Trigger de auditoría | Conserva alta y cambios de rol/estado con actor y valores relevantes |
| `record_access` | RPC autorizada: actualiza último acceso y registra login |
| `record_invitation` | RPC autorizada solo admin: registra intención de invitación y correo objetivo |

Funciones privilegiadas acotadas en esquema `private`, `search_path` vacío y EXECUTE restringido. Las funciones invocables desde API son wrappers `SECURITY INVOKER`; los triggers no son endpoints públicos. Las RPC privadas verifican identidad y estado actual, además del rol cuando corresponde. No hay vistas de reportes ni políticas de Storage todavía: la fase no sube archivos.

La invitación cruza Auth y PostgreSQL, sin una transacción única entre ambos servicios. Antes de enviar se registra `user.invitation_requested` bajo permisos del actor; no se presenta ese evento como entrega de correo confirmada. La creación efectiva genera `profile.created`. Ante un error se conserva la evidencia; no se borran usuarios como compensación destructiva.

## Decisiones técnicas de esta fase

- Clientes Supabase separados para navegador, sesión servidor y administración, esta última protegida con `server-only`.
- `proxy.ts` renueva sesión y filtra rutas; páginas y acciones vuelven a verificar usuario en Auth y perfil vigente. Las operaciones de datos usan RLS, no el cliente administrativo.
- Se comprueba estado al navegar y antes de operar. El shell revalida al recuperar foco y cada minuto para retirar una sesión inactiva de una pantalla ya abierta; esto no retrasa el bloqueo en RLS.
- Correo de recuperación con respuesta uniforme para no enumerar cuentas. Los errores de configuración/red visibles son genéricos.
- GET del enlace no consume el token: la persona pulsa Continuar y el servidor verifica el hash de invitación/recuperación. Después se emite una cookie HttpOnly firmada y vinculada al usuario por 15 minutos, como permiso técnico de cambio. Se elimina tras guardar o cerrar sesión. No se almacenan contraseñas en tablas ni logs de aplicación.
- Fuentes locales mediante Fontsource: evita depender de Google Fonts durante build o cargar fuentes desde terceros en cada visita.
- Confirmaciones críticas con SweetAlert2, guardados con Sonner, navegación tablet con `dialog` nativo y foco contenido. Respeto de `prefers-reduced-motion`.
- `agentRules: false` evita que Next.js modifique automáticamente `AGENTS.md`. El log de solicitudes de desarrollo está deshabilitado para no registrar tokens de un solo uso incluidos en URLs de Auth.
- La desactivación es reversible. No se añadió una regla nueva de “último administrador”: el sistema no debe usarse para desactivar la única cuenta administradora sin prever recuperación operativa.

## Archivos relevantes

```text
docs/                         Decisiones aprobadas; actualización D-17
src/
  app/
    globals.css               Tokens, componentes, breakpoints y reduced motion
    layout.tsx                Fuentes, metadatos y notificaciones
    login/                    Inicio de sesión
    recuperar-contrasena/     Solicitud por correo
    nueva-contrasena/         Nueva contraseña y confirmación
    auth/confirm/             Validación explícita de enlace
    auth/session/             Comprobación de sesión activa
    (private)/
      layout.tsx              Protección y shell
      dashboard/              Inicio visual, sin métricas
      mas/                    Cuenta/navegación móvil
      usuarios/               Invitación y roles/estado
  components/                 Formularios, marca, layouts y shell
  features/auth/actions.ts    Login, logout, recuperación y contraseña
  features/users/actions.ts   Invitación y actualización autorizadas
  lib/auth.ts                 Verificación servidor de identidad/perfil/rol
  lib/password-flow.ts        Permiso temporal firmado
  lib/supabase/               Clientes browser/server/admin
  proxy.ts                    Renovación de sesión y protección inicial
supabase/
  config.toml                 Configuración local sin signup público
  migrations/                 SQL de Fase 1
  templates/                  Emails de invitación y recuperación
tests/
  security.test.mjs           PostgreSQL embebido: migración y RLS
  e2e/phase1.spec.ts          Flujos y responsive con Chromium
  support/                   Servicio Auth simulado exclusivo de pruebas
.env.example                 Nombres de variables, sin secretos
package.json / package-lock.json
playwright.config.ts
```

## Dependencias

Versiones exactas en `package.json` y lockfile.

| Paquetes | Propósito |
|---|---|
| `next`, `react`, `react-dom` | App Router, SSR, componentes y Server Actions |
| `typescript`, `@types/node`, `@types/react`, `@types/react-dom` | Tipado y verificación |
| `tailwindcss`, `@tailwindcss/postcss` | Estilos y compilación CSS |
| `@supabase/supabase-js`, `@supabase/ssr` | Auth/API, sesiones SSR y cookies |
| `server-only` | Evitar importar código privilegiado desde cliente |
| `lucide-react` | Iconos consistentes |
| `sonner` | Notificaciones no bloqueantes |
| `sweetalert2` | Confirmaciones de permisos/estado |
| `@fontsource/poppins`, `@fontsource/coiny`, `@fontsource/chewy` | Fuentes locales |
| `eslint`, `eslint-config-next` | Lint de Next.js/TypeScript |
| `supabase` (desarrollo) | CLI y creación/aplicación de migraciones |
| `@electric-sql/pglite` (desarrollo) | Motor PostgreSQL embebido para verificar SQL/RLS sin Docker |
| `@playwright/test` (desarrollo) | Navegación y pruebas responsive |

`agent-browser` se utilizó mediante npx como herramienta de inspección; no es dependencia de la aplicación.

## Validaciones reproducibles

```powershell
npm run lint
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

Para E2E detener cualquier servidor habitual en puertos 3000/54329 antes de iniciar. Playwright arranca servidores aislados con credenciales ficticias locales; nunca apunta a producción. Los datos de pruebas están en `tests/`, no hay bypass de autenticación dentro de la app. Las capturas y trazas quedan en `test-results/`, ignorado por Git.

Las pruebas SQL ejecutan la migración real en PGlite, con roles `anon`/`authenticated` y una tabla/función mínima que simula `auth.users`/`auth.uid`. Comprueban defaults seguros, aislamiento de perfiles, denegaciones, no autoelevación, inactivación con identidad previa y auditoría.

Los E2E ejecutan la app y SDK reales contra un servicio HTTP Auth/datos simulado. Comprueban login/logout, recuperación, invitación, nueva contraseña, errores de enlace, usuario inactivo, rutas por rol, expiración, confirmaciones, reducción de movimiento y ausencia de desbordamiento en 320, 375, 768, 1024 y 1440 px. No demuestran entrega SMTP ni sustituyen integración real con Supabase.

## Resultados y cierre de Fase 1 en desarrollo

Resultados de la verificación local de esta entrega:

| Comprobación | Resultado |
|---|---|
| `npm run lint` | Sin errores ni advertencias |
| `npm run typecheck` | Correcto |
| `npm run build` | Compilación de producción correcta |
| `npm test` | 7 pruebas aprobadas (incluye suite de 6 escenarios SQL y validación de rollback) |
| `npm run test:e2e` | 7 recorridos aprobados en Chromium |
| Responsive | 320, 375, 768, 1024 y 1440 px sin desbordamiento de página |
| `npm audit --omit=dev` | 0 vulnerabilidades reportadas |
| Preservación | Sin cambios en AGENTS.md, reference ni DESIGN_SYSTEM.md |
| Secretos cliente | Sin referencias a claves administrativas o secreto del flujo en assets estáticos de producción |

La migración está aplicada en SIGCA desarrollo y las pruebas SQL remotas pasaron con rollback completo. Auth alojado, SMTP, plantillas y `.env.local` están configurados. Administrador y Colaborador están activos. El titular confirmó los recorridos reales de correo, establecimiento/cambio de contraseña y acceso; Auth y auditoría corroboran las operaciones.

Las pruebas automatizadas con sesiones Supabase reales verificaron Dashboard/Usuarios por rol, invitación desde SIGCA, denegaciones por API/RLS, desactivación inmediata con sesión previa, retirada de acceso en UI, reactivación sin cambio de rol, renovación y logout. Los cinco tamaños también se comprobaron con datos reales. Para no recopilar contraseñas, esas pruebas usaron sesiones aisladas creadas mediante Auth Admin; no sustituyen el recorrido personal por correo. El detalle está en [PHASE1_SUPABASE_VERIFICATION.md](docs/PHASE1_SUPABASE_VERIFICATION.md).

Fase 1 validada funcionalmente en desarrollo, con límites explícitos: enlace vencido y contraseñas distintas se cubrieron en pruebas simuladas; enlaces inválido/utilizado también contra Auth real. No se esperó el vencimiento natural del JWT: se probó renovación explícita. Security Advisors mantiene una advertencia de protección contra contraseñas filtradas, disponible desde plan Pro (este proyecto usa Free). No se cambió el plan ni se desplegó en Vercel. El destino de los correos de desarrollo es localhost:3000 y requiere la aplicación ejecutándose en la computadora donde se abre el enlace.

No se avanza a Fase 2. Las decisiones funcionales pendientes para fases futuras permanecen en `docs/DECISIONS.md`; no se resolvieron de forma implícita.
