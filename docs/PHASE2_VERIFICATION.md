# Verificación de Fase 2 — SIGCA DEV

Fecha: 2026-09-22. Proyecto exclusivo: `pysgfnwsycgoneaecgcl` (SIGCA).
El informe inicial se conserva como antecedente; la sección «Auditoría completa de alcance» al final contiene la matriz y los resultados actualizados.
Fase 1 aprobada previamente; checkpoint existente `75666ab`, sin cambios pendientes al comenzar. Sin Fase 3.

## Alcance implementado

Configuración inicial de caffi crochet, clientes, categorías, materiales, productos, materiales estimados, duplicación y fotografías privadas. Búsqueda y paginación de 25 registros, edición y activación/desactivación. Historial de pedidos vacío explícito, sin totales ficticios. Dashboard sigue como shell.

Decisiones D-18: productos/pedidos en CRC; costos de materiales CRC/USD; materiales creados por Colaborador con costo pendiente; toda configuración editable solo por Admin. Valor de hora pendiente. Formato aprobado PED-AAAA-00001 visible, sin generar pedidos. Logo pendiente de imagen del usuario, carga y ruta autorizada preparadas.

## Migración y esquema real

`20260922141211_phase2_catalogs.sql`: creada mediante CLI, probada localmente, listada frente a remoto, dry-run y aplicación exclusivamente en DEV. El dry-run incluyó esa migración, sin roles/seed. CLI confirmó equivalencia local/remota tras aplicarla.

`20260922194304_phase2_exchange_audit.sql`: corrección de atribución de cotizaciones, también probada localmente y aplicada tras dry-run exclusivo. El RPC de servidor revalida Admin activo en BD y registra su identidad en auditoría; se revoca la escritura directa de exchange_rates a service_role. No modifica eventos anteriores ni borra datos.

| Tabla | Lectura / operación |
|---|---|
| settings | Admin lee/edita; fila única; branding público únicamente a usuarios activos mediante proyección segura |
| clients | Admin y Colaborador activos crean/leen/editan/desactivan |
| product_categories | Ambos roles activos; unicidad normalizada de nombre |
| materials | Ambos roles activos; no contiene columnas de costo/moneda |
| material_costs | Solo Admin; FK única al material; ausencia de fila = pendiente |
| products | Ambos roles activos; SKU único normalizado, precio CRC, categoría FK |
| product_materials | Ambos roles activos; producto/material únicos, cantidad positiva, FKs |
| product_images | Ambos consultan; inserción validada exclusivamente en servidor; principal único y desactivación |
| exchange_rates | Admin consulta; servidor persiste tasa validada, fecha y procedencia |

Todas tienen RLS, constraints, índices pertinentes y timestamps. Sin grants DELETE a authenticated; anon sin acceso empresarial. Políticas *_read / *_insert / *_update verifican el perfil vigente mediante private.is_active o private.is_admin. exchange_rates solo tiene política de lectura Admin. En imágenes los grants de inserción se revocan a authenticated aunque exista la política: no es posible saltarse la validación de bytes.

Auditoría por triggers de INSERT/UPDATE con antes/después y actor; audit_log conserva su RLS Admin de Fase 1. Las imágenes registradas desde servidor revalidan el actor en BD y atribuyen su auditoría. RPC de material guarda catálogo/costo en la misma transacción; duplicación copia campos/asociaciones y referencias privadas; selección de principal bloquea el producto y actualiza transaccionalmente.

Funciones privilegiadas en private, search_path vacío y EXECUTE restringido. Wrappers públicos SECURITY INVOKER. register_catalog_image solo ejecutable por service_role. Data API expone public,graphql_public; private no está expuesto.

store_exchange_rate también es exclusivo de service_role, con actor Admin activo verificado en la transacción. Actualización real desde UI y rechazo del RPC para Colaborador comprobados; la cotización no cambia ante el intento no autorizado.

## Archivos e imágenes

Bucket catalog-images privado, límite 5 MB, almacenamiento WebP. Una política SELECT exige usuario activo y asociación autorizada a product_images o logo. No hay política cliente de carga, actualización ni borrado de objetos.

La aplicación valida MIME y contenido decodificado JPEG/PNG/WebP, rechaza animación, limita 25 megapíxeles, recodifica sin metadata y genera nombres UUID. Descarga por /api/catalog-image/[id] con sesión y JWT/RLS, Cache-Control private/no-store. Logo: /api/catalog-image/logo. No se generan URLs públicas ni enlaces firmados duraderos.

Desactivar una foto conserva bytes y auditoría. Si falla asociar un archivo después de subirlo, se informa y se conserva para revisión; no se borra como compensación automática. Retención/eliminación de archivos sigue pendiente para producción.

## Tipo de cambio

Fuente monetaria: venta de referencia BCCR; transporte: [tipodecambio.paginasweb.cr](https://tipodecambio.paginasweb.cr/docs), proveedor independiente identificado en UI. No se presenta como conexión directa al webservice autenticado del BCCR.

Consulta real exitosa y persistencia verificadas: fecha del dato 2026-09-22, venta 450 CRC/USD. Es evidencia de esa ejecución, no un valor fijo del programa. La app consulta al abrir Configuración/Materiales como Admin, reutiliza durante una hora y permite actualización explícita. Conserva la última tasa válida ante error; no acepta fecha anterior ni datos inválidos. Antes del primer éxito no inventa un valor.

El importe original del material no se convierte ni redondea al persistir. El equivalente CRC es informativo. No se implementan gastos, valoración, inventario real ni reglas financieras de fases futuras.

## Pruebas y evidencia diferenciada

### Locales

- `npm test`: 12 pruebas aprobadas. PostgreSQL embebido PGlite ejecuta las migraciones reales; auth/storage son esquemas mínimos simulados.
- Constraints, roles, auditoría, duplicados, FK inválida, cantidad cero/NaN, inactivación, protección financiera, RPC y rollback.
- Validación de teléfono/correo/números; rechazo de archivo disfrazado, SVG, MIME incorrecto y exceso de tamaño.
- Tasa guardada ante caída, respuesta inválida o anterior: fallos de fuente **simulados**, sin provocar una caída real del proveedor.

### E2E simulados

App/SDK reales contra fixture HTTP local. 13 recorridos: regresión de Fase 1, catálogos vacíos, formularios, roles y los cinco tamaños. No son pruebas de Supabase alojado ni de correo.

### Contra Supabase DEV real

- SQL `tests/sql/phase2-remote-verification.sql` ejecutado con roles y rollback completo; sin borrar registros existentes.
- Browser/API con cuentas existentes confirmadas Admin/Colaborador. Sesiones aisladas obtenidas mediante Auth Admin, sin pedir/guardar contraseñas.
- Configuración y cotización real; creación/edición/búsqueda/desactivación de clientes; creación de categorías/materiales/productos; costo pendiente y posterior asignación USD por Admin.
- SKU/categoría duplicados y relaciones inválidas rechazados por API real.
- product_materials desde UI, duplicación conservando asociaciones y referencias privadas.
- Storage real: carga validada desde SIGCA; archivo disfrazado y carga directa rechazados; principal; descargas anónimas/ruta sin sesión denegadas.
- Colaborador: sin filas de settings/material_costs/exchange_rates/audit_log, sin escritura financiera; SELECT * de materials sin columnas financieras; HTML/RSC sin importe restringido.
- Inactivación temporal con sesión abierta: RLS impide acceso, ruta de imagen devuelve 401, UI retira acceso. Reactivación restaura acceso sin cambio de rol.
- Error de red de guardado inducido en navegador: mensaje y conservación del formulario; recuperación tras volver la conexión.
- Auditoría de archivos atribuida al usuario operativo.
- Los registros VERIFICACION-F2 y fotos de prueba se conservan desactivados; costos e historial no se borran. Ambos perfiles existentes permanecen activos.

### Responsive y revisión visual

320, 375, 768, 1024 y 1440 px: catálogos, detalle/producto con materiales y fotos, formularios y Configuración. Sin desbordamiento de página. Tarjetas móviles, tablas escritorio, acciones accesibles sin hover, tipografías/tokens/scrollbar/reduced-motion conservados. Capturas locales ignoradas por Git en test-results/phase2-real. Revisión visual de móvil y escritorio realizada.

Verificación real adicional del listado de costos y formulario financiero Admin en los cinco tamaños: sin desbordamiento, equivalente CRC visible e inputs de al menos 16 px.

Se corrigieron durante validación: captura de rutas desconocidas por un segmento dinámico (se sustituyó por rutas explícitas), nombres accesibles de campos y edición antes de hidratación. Campos permanecen deshabilitados hasta que los manejadores están listos; un error de guardado no borra lo escrito.

## Security Advisors y secretos

Security Advisors: sin hallazgos nuevos de Fase 2. Persiste WARN auth_leaked_password_protection ya documentado en Fase 1 (plan Free); [remediación oficial](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). No se cambió el plan.

Performance Advisors: INFO de índices aún sin uso en catálogos recientes; se conservan, sin operaciones destructivas.

Se compararon en memoria los secretos reales con archivos versionables y assets de navegador: sin coincidencias. SMTP alojado comparado sin imprimirlo: sin coincidencias en repositorio ni .env.local. .env.local continúa ignorado por Git. AGENTS.md, DESIGN_SYSTEM.md y reference intactos.

## Verificación final

Lint y typecheck correctos, sin advertencias de lint; 12 pruebas locales y 13 E2E aprobados. Recorrido real completo y verificaciones adicionales de finanzas/cotizaciones aprobados. Build final de producción correcto. npm audit --omit=dev: cero vulnerabilidades. Assets finales: 49 archivos revisados, sin secretos ni identificadores de variables privadas; 85 archivos versionables revisados sin coincidencias con secretos.

Arranque final con npm start y Supabase DEV real: catálogos por ambos roles, Configuración, formulario existente y ancho 320 px comprobados sin errores de hidratación/runtime. Servidor local disponible en http://localhost:3000. No se publicó un despliegue externo.

## Archivos relevantes

Nuevos:

```
src/app/(private)/clientes/{page.tsx,[id]/page.tsx}
src/app/(private)/categorias/{page.tsx,[id]/page.tsx}
src/app/(private)/materiales/{page.tsx,[id]/page.tsx}
src/app/(private)/productos/{page.tsx,[id]/page.tsx}
src/app/(private)/configuracion/page.tsx
src/app/api/catalog-image/[id]/route.ts
src/components/catalog-forms.tsx
src/features/catalog/{actions,data,exchange,exchange-parser,image-validation,images,schema}.ts
src/features/catalog/{list-page,detail-page}.tsx
supabase/migrations/20260922141211_phase2_catalogs.sql
supabase/migrations/20260922194304_phase2_exchange_audit.sql
tests/phase2.test.mjs
tests/phase2-real.mjs
tests/e2e/phase2.spec.ts
tests/sql/phase2-remote-verification.sql
docs/PHASE2_VERIFICATION.md
```

Modificados: README.md; docs/REQUIREMENTS.md, DECISIONS.md, ARCHITECTURE.md y DATABASE.md; layout privado, página Más, AppShell, globals.css y proxy; next.config.ts, package.json/lock y eslint.config.mjs; tests/security.test.mjs y fixture HTTP. Nueva dependencia directa: sharp 0.35.4 (ya presente transitivamente en Next). Se declara ESM y Node >=22.18 para pruebas TypeScript nativas; .temp de CLI queda fuera de lint.

## Pendientes delimitados

- Aportar el logo definitivo y definir el valor por hora desde Configuración.
- La disponibilidad de una tasa nueva depende del proveedor; se conserva la última obtenida, con fecha visible.
- Advertencia heredada de contraseñas filtradas y planificación de respaldo/retención antes de producción.
- No se repitió SMTP ni se modificó Auth: la evidencia de correo real pertenece al cierre aprobado de Fase 1.
- No se desplegó en Vercel ni se implementaron pedidos, pagos, gastos, stock, cronómetro, costeo o reportes. Fase 3 requiere autorización.

## Auditoría completa de alcance — 22 de septiembre de 2026

Esta sección sustituye los conteos y la conclusión del informe inicial de arriba. Base auditada: commit `a3ca89b` (Fase 2); árbol limpio al comenzar. Proyecto confirmado SIGCA DEV `pysgfnwsycgoneaecgcl`, PostgreSQL 17.6. Sin cambios en producción.

### Hallazgos y correcciones

- Inconsistencia real: SQL admitía tabulaciones/saltos de línea en correos que el servidor rechazaba. Nueva migración **M3 `20260923003133_phase2_audit_validation.sql`**, generada con CLI: añade `clients_email_no_whitespace` y `settings_email_no_whitespace`. Cero datos afectados en preinspección; no se cambian filas ni eliminan constraints. Pruebas locales antes de dry-run; dry-run solo M3, aplicación DEV y pruebas SQL/API posteriores correctas. El nombre usa UTC (23/09), fecha local Costa Rica 22/09.
- Ajustes visuales dentro del diseño aprobado: spinner funcional al guardar, borde rojo de controles nativos inválidos y alineación derecha de costo numérico en tabla.
- Tipo de cambio ratificado en DECISIONS, REQUIREMENTS, ARCHITECTURE y DATABASE. **No es desviación.** No se cambia proveedor ni mecanismo. Las operaciones históricas futuras conservarán tasa/importe/moneda aplicados; cambiar proveedor no modificará historia.
- Segunda corrección comprobada: teléfono compuesto solo por signos. **M4 `20260923004701_phase2_phone_validation.sql`** añade clients_phone_has_digit/settings_phone_has_digit, manteniendo formato y longitudes previos. Servidor también exige dígitos. Sin datos afectados; pruebas locales, dry-run exclusivo M4, aplicación DEV y rechazo real SQL/API/UI correctos.
- Sin nuevas reglas de negocio ni decisiones funcionales impuestas. Las nueve tablas continúan siendo nueve; M3/M4 solo añaden cuatro CHECK en total.
- Logo definitivo y tarifa/hora son **datos pendientes de configuración**, con funcionalidad disponible; no son huecos de implementación.
- Los datos VERIFICACION-F2 identifican pruebas de catálogos. Se conservan entidades principales/fotos desactivadas y sus asociaciones/auditoría; nunca se crearon pedidos ni historial de compra ficticio.

### Cómo leer la evidencia

- **M1**: `20260922141211_phase2_catalogs.sql`; **M2**: `20260922194304_phase2_exchange_audit.sql`; **M3**: restricción de correo descrita arriba.
- **M4**: `20260923004701_phase2_phone_validation.sql`, rechazo de teléfonos sin dígitos; complementa las referencias M1/M3 de Configuración/Clientes en la matriz.
- **L**: `npm test`, validaciones/parser/archivos y PostgreSQL PGlite. Auth/Storage mínimos son **simulados**; no sustituyen el servicio alojado.
- **E**: `npm run test:e2e`, navegador/app reales contra fixture HTTP **simulado**. Vacíos, errores de servidor, loading y cinco tamaños. La caída inducida no afirma una caída real de Supabase.
- **R-SQL**: `tests/sql/phase2-remote-verification.sql` ejecutado en PostgreSQL **DEV real**, con roles y rollback de datos temporales. Comprueba grants/RLS/constraints/RPC/auditoría y las nueve tablas ante usuario inactivo.
- **R-UI/API**: `tests/phase2-real.mjs` contra build de producción local + **Supabase DEV real**; usa JWT de Admin/Colaborador obtenidos con Auth Admin de cuentas existentes. No guarda contraseñas, tokens, enlaces o estado de sesión. Mutaciones de usuario van con su JWT, no con service_role. Incluye tamaño excesivo real desde UI, bytes inválidos, fotos, edición/estado por módulo y reactivación de usuario.
- **S**: comparación en memoria de secretos reales con archivos versionables/assets, sin imprimirlos; comprobación de Git/SMTP/Data API.
- La evidencia de logo combina rama administrativa/RPC real en transacción y pipeline compartido de imágenes real. No se reemplazó el logo pendiente por una imagen ficticia.
- No se probaron correo ni despliegue Vercel en esta auditoría; correo pertenece al cierre aprobado de Fase 1.
- La evidencia «inspección» se refiere a código y/o metadatos reales, no a un recorrido de navegador que no se haya realizado.

### Matriz requisito por requisito

Cada fila es un criterio auditado. Los grupos TEST/DB comprueban evidencia e infraestructura además de las funciones; los conteos corresponden a filas, no a funcionalidades comerciales distintas.

| Requisito | Estado | Evidencia | Prueba | Observación |
|---|---|---|---|---|
| CFG01 — Nombre del emprendimiento | COMPLETO | Configuración + schema/actions; settings; M1/M3 | R-SQL + R-UI/API; L | caffi crochet; editable por Admin. |
| CFG02 — Logo: carga y ruta privada | COMPLETO | Configuración + schema/actions; settings; M1/M3 | R-SQL + R-UI/API; L | /api/catalog-image/logo; rama Admin comprobada por SQL, procesamiento compartido probado con foto real. |
| CFG03 — Teléfono | COMPLETO | Configuración + schema/actions; settings; M1/M3 | R-SQL + R-UI/API; L | 83639663; validación servidor y SQL. |
| CFG04 — Correo | COMPLETO | Configuración + schema/actions; settings; M1/M3 | R-SQL + R-UI/API; L | carolinaserranorodriguez@gmail.com; reforzado rechazo SQL de whitespace. |
| CFG05 — Moneda | COMPLETO | Configuración + schema/actions; settings; M1/M3 | R-SQL + R-UI/API; L | CRC para productos/pedidos; materiales CRC/USD; no hay pedidos operativos. |
| CFG06 — Adelanto habitual | COMPLETO | Configuración + schema/actions; settings; M1/M3 | R-SQL + R-UI/API; L | 50 % inicial; constraint 0–100 y editable por Admin. |
| CFG07 — Valor por hora: función de edición | COMPLETO | Configuración + schema/actions; settings; M1/M3 | R-SQL + R-UI/API; L | nullable; vacío significa pendiente, no cero supuesto. |
| CFG08 — Formato de número de pedido | COMPLETO | Configuración + schema/actions; settings; M1/M3 | R-SQL + R-UI/API; L | PED-AAAA-00001; solo consulta del formato aprobado, sin consecutivos operativos. |
| CFG09 — Tipo de cambio aprobado | COMPLETO | Configuración + schema/actions; settings; M1/M3 | R-SQL + R-UI/API; L | Proveedor V1 tipodecambio.paginasweb.cr, referencia venta BCCR. |
| CFG10 — Persistencia de configuración | COMPLETO | Configuración + schema/actions; settings; M1/M3 | R-SQL + R-UI/API; L | Fila única de settings, update autenticado. |
| CFG11 — Validaciones de configuración | COMPLETO | Configuración + schema/actions; settings; M1/M3 | R-SQL + R-UI/API; L | Longitudes, teléfono/correo, límites monetarios; validación cliente/servidor/SQL. |
| CFG12 — Auditoría de configuración | COMPLETO | Configuración + schema/actions; settings; M1/M3 | R-SQL + R-UI/API; L | catalog_audit antes/después y actor; logo por RPC atribuido. |
| CFG13 — Permisos de configuración por rol | COMPLETO | Configuración + schema/actions; settings; M1/M3 | R-SQL + R-UI/API; L | Admin modifica; Colaborador solo obtiene nombre/logo mediante business_brand. |
| CFG14 — Solo Admin modifica finanzas | COMPLETO | Configuración + schema/actions; settings; M1/M3 | R-SQL + R-UI/API; L | RLS private.is_admin y grants de columnas. |
| CFG15 — Colaborador no obtiene datos restringidos por API | COMPLETO | Configuración + schema/actions; settings; M1/M3 | R-SQL + R-UI/API; L | SELECT settings/material_costs/exchange_rates devuelve cero filas; sin depender de UI. |
| CFG16 — Imagen definitiva del logo | PENDIENTE | Función disponible; settings.logo_path | Inspección de configuración | Dato del usuario pendiente; no es funcionalidad faltante. |
| CFG17 — Valor concreto de hora | PENDIENTE | Función disponible; settings.hourly_rate | Inspección de configuración | Decisión de valor del usuario pendiente; no es funcionalidad faltante. |
| FX01 — Proveedor actual V1 | COMPLETO | exchange.ts/parser; cuatro documentos; exchange_rates | L fallback simulado; R-UI/API tasa real; inspección | Decisión ratificada en los cuatro documentos; no es desviación. |
| FX02 — Conservar última tasa válida | COMPLETO | exchange.ts/parser; cuatro documentos; exchange_rates | L fallback simulado; R-UI/API tasa real; inspección | Se prueban caída, respuesta inválida y fecha anterior; no se inventa tasa inicial. |
| FX03 — No exigir secretos para proveedor público | COMPLETO | exchange.ts/parser; cuatro documentos; exchange_rates | L fallback simulado; R-UI/API tasa real; inspección | Sin claves nuevas ni credenciales para este proveedor. |
| FX04 — Conservar importe/moneda originales | COMPLETO | exchange.ts/parser; cuatro documentos; exchange_rates | L fallback simulado; R-UI/API tasa real; inspección | material_costs guarda original; conversión CRC informativa. |
| FX05 — Contrato de tasa histórica y cambio de proveedor | COMPLETO | exchange.ts/parser; cuatro documentos; exchange_rates | L fallback simulado; R-UI/API tasa real; inspección | D-18/RF-CON-06: guardar tasa aplicada y no recalcular historia al actualizar o cambiar proveedor. |
| FX06 — Persistir tasa en operaciones históricas futuras | NO APLICA | RF-CON-06 / contrato DATABASE | Inventario de tablas | No existen esas operaciones en Fase 2; obligación documentada para su fase. |
| CLI01 — Crear clientes | COMPLETO | schema/actions/list/detail; clients; M1/M3; loading/error comunes | R-UI/API + R-SQL; E vacíos; inspección estados | — |
| CLI02 — Editar clientes | COMPLETO | schema/actions/list/detail; clients; M1/M3; loading/error comunes | R-UI/API + R-SQL; E vacíos; inspección estados | — |
| CLI03 — Consultar clientes | COMPLETO | schema/actions/list/detail; clients; M1/M3; loading/error comunes | R-UI/API + R-SQL; E vacíos; inspección estados | — |
| CLI04 — Buscar clientes | COMPLETO | schema/actions/list/detail; clients; M1/M3; loading/error comunes | R-UI/API + R-SQL; E vacíos; inspección estados | — |
| CLI05 — Activar/desactivar clientes | COMPLETO | schema/actions/list/detail; clients; M1/M3; loading/error comunes | R-UI/API + R-SQL; E vacíos; inspección estados | — |
| CLI06 — Validaciones de clientes | COMPLETO | schema/actions/list/detail; clients; M1/M3; loading/error comunes | R-UI/API + R-SQL; E vacíos; inspección estados | Correo, teléfono, campos/longitudes; nueva prueba de whitespace por API. |
| CLI07 — Clientes responsive | COMPLETO | schema/actions/list/detail; clients; M1/M3; loading/error comunes | R-UI/API + R-SQL; E vacíos; inspección estados | — |
| CLI08 — Historial conservado | COMPLETO | schema/actions/list/detail; clients; M1/M3; loading/error comunes | R-UI/API + R-SQL; E vacíos; inspección estados | is_active y auditoría; conservación de registro al desactivar. |
| CLI09 — Sin borrado destructivo de clientes | COMPLETO | schema/actions/list/detail; clients; M1/M3; loading/error comunes | R-UI/API + R-SQL; E vacíos; inspección estados | Sin DELETE para roles de aplicación ni acción de borrado. |
| CLI10 — Clientes: estado vacío | COMPLETO | schema/actions/list/detail; clients; M1/M3; loading/error comunes | R-UI/API + R-SQL; E vacíos; inspección estados | — |
| CLI11 — Clientes: loading | COMPLETO | schema/actions/list/detail; clients; M1/M3; loading/error comunes | R-UI/API + R-SQL; E vacíos; inspección estados | — |
| CLI12 — Clientes: errores | COMPLETO | schema/actions/list/detail; clients; M1/M3; loading/error comunes | R-UI/API + R-SQL; E vacíos; inspección estados | — |
| CLI13 — Permisos Admin/Colaborador en clientes | COMPLETO | schema/actions/list/detail; clients; M1/M3; loading/error comunes | R-UI/API + R-SQL; E vacíos; inspección estados | — |
| CLI14 — RLS real de clientes | COMPLETO | schema/actions/list/detail; clients; M1/M3; loading/error comunes | R-UI/API + R-SQL; E vacíos; inspección estados | — |
| CLI15 — Sin historial ficticio de pedidos | COMPLETO | schema/actions/list/detail; clients; M1/M3; loading/error comunes | R-UI/API + R-SQL; E vacíos; inspección estados | Mensaje explícito de módulo aún no habilitado; sin totales ni pedidos inventados. |
| CAT01 — Crear categorías | COMPLETO | schema/actions/list/detail; product_categories; M1 | R-UI/API + R-SQL; E vacíos; estados comunes | — |
| CAT02 — Editar categorías | COMPLETO | schema/actions/list/detail; product_categories; M1 | R-UI/API + R-SQL; E vacíos; estados comunes | — |
| CAT03 — Listar categorías | COMPLETO | schema/actions/list/detail; product_categories; M1 | R-UI/API + R-SQL; E vacíos; estados comunes | — |
| CAT04 — Activar/desactivar categorías | COMPLETO | schema/actions/list/detail; product_categories; M1 | R-UI/API + R-SQL; E vacíos; estados comunes | — |
| CAT05 — Duplicados razonables de categoría | COMPLETO | schema/actions/list/detail; product_categories; M1 | R-UI/API + R-SQL; E vacíos; estados comunes | Nombre normalizado: mayúsculas/minúsculas y espacios; índice único. |
| CAT06 — Categorías sin borrado destructivo | COMPLETO | schema/actions/list/detail; product_categories; M1 | R-UI/API + R-SQL; E vacíos; estados comunes | — |
| CAT07 — RLS de categorías | COMPLETO | schema/actions/list/detail; product_categories; M1 | R-UI/API + R-SQL; E vacíos; estados comunes | — |
| CAT08 — Auditoría de categorías | COMPLETO | schema/actions/list/detail; product_categories; M1 | R-UI/API + R-SQL; E vacíos; estados comunes | — |
| CAT09 — Categorías: estado vacío | COMPLETO | schema/actions/list/detail; product_categories; M1 | R-UI/API + R-SQL; E vacíos; estados comunes | — |
| CAT10 — Categorías: loading | COMPLETO | schema/actions/list/detail; product_categories; M1 | R-UI/API + R-SQL; E vacíos; estados comunes | — |
| CAT11 — Categorías: errores | COMPLETO | schema/actions/list/detail; product_categories; M1 | R-UI/API + R-SQL; E vacíos; estados comunes | — |
| CAT12 — Categorías responsive | COMPLETO | schema/actions/list/detail; product_categories; M1 | R-UI/API + R-SQL; E vacíos; estados comunes | — |
| MAT01 — Código de material | COMPLETO | materials/material_costs; schema/actions/list/detail; M1 | R-UI/API + R-SQL; inspección modelo; L | — |
| MAT02 — Nombre de material | COMPLETO | materials/material_costs; schema/actions/list/detail; M1 | R-UI/API + R-SQL; inspección modelo; L | — |
| MAT03 — Categoría de material | COMPLETO | materials/material_costs; schema/actions/list/detail; M1 | R-UI/API + R-SQL; inspección modelo; L | — |
| MAT04 — Unidad de medida | COMPLETO | materials/material_costs; schema/actions/list/detail; M1 | R-UI/API + R-SQL; inspección modelo; L | — |
| MAT05 — Costo unitario actual | COMPLETO | materials/material_costs; schema/actions/list/detail; M1 | R-UI/API + R-SQL; inspección modelo; L | material_costs Admin; pendiente si creado sin costo, edición CRC/USD. |
| MAT06 — Stock mínimo | COMPLETO | materials/material_costs; schema/actions/list/detail; M1 | R-UI/API + R-SQL; inspección modelo; L | Parámetro no negativo; no es existencia. |
| MAT07 — Material activo/inactivo | COMPLETO | materials/material_costs; schema/actions/list/detail; M1 | R-UI/API + R-SQL; inspección modelo; L | — |
| MAT08 — Colaborador no recibe costo unitario | COMPLETO | materials/material_costs; schema/actions/list/detail; M1 | R-UI/API + R-SQL; inspección modelo; L | Respuesta HTML/RSC real sin importe. |
| MAT09 — Costo protegido ante API directa | COMPLETO | materials/material_costs; schema/actions/list/detail; M1 | R-UI/API + R-SQL; inspección modelo; L | materials no contiene columnas financieras; RLS de material_costs. |
| MAT10 — Sin movimientos operativos | COMPLETO | materials/material_costs; schema/actions/list/detail; M1 | R-UI/API + R-SQL; inspección modelo; L | No existen inventory_movements ni acciones equivalentes. |
| MAT11 — Sin FIFO/promedio/lotes | COMPLETO | materials/material_costs; schema/actions/list/detail; M1 | R-UI/API + R-SQL; inspección modelo; L | Método no inventado ni implementado. |
| MAT12 — Sin consumo real/stock negativo operativo | COMPLETO | materials/material_costs; schema/actions/list/detail; M1 | R-UI/API + R-SQL; inspección modelo; L | No existe stock real editable ni API de consumo; constraint min_stock>=0. |
| MAT13 — Sin presentar stock ficticio como operativo | COMPLETO | materials/material_costs; schema/actions/list/detail; M1 | R-UI/API + R-SQL; inspección modelo; L | Listado/detalle explican que mínimo es parámetro. |
| MAT14 — Crear/editar/consultar/buscar materiales | COMPLETO | materials/material_costs; schema/actions/list/detail; M1 | R-UI/API + R-SQL; inspección modelo; L | — |
| MAT15 — Materiales: validación y duplicado de código | COMPLETO | materials/material_costs; schema/actions/list/detail; M1 | R-UI/API + R-SQL; inspección modelo; L | — |
| PRO01 — Crear productos | COMPLETO | products/product_images; schema/actions/detail/forms; M1 | R-UI/API + R-SQL; E vacíos; inspección | — |
| PRO02 — Editar productos | COMPLETO | products/product_images; schema/actions/detail/forms; M1 | R-UI/API + R-SQL; E vacíos; inspección | — |
| PRO03 — Consultar productos | COMPLETO | products/product_images; schema/actions/detail/forms; M1 | R-UI/API + R-SQL; E vacíos; inspección | — |
| PRO04 — Buscar productos | COMPLETO | products/product_images; schema/actions/detail/forms; M1 | R-UI/API + R-SQL; E vacíos; inspección | — |
| PRO05 — Activar/desactivar producto mediante is_active | COMPLETO | products/product_images; schema/actions/detail/forms; M1 | R-UI/API + R-SQL; E vacíos; inspección | Sin eliminación ni segundo campo status. |
| PRO06 — SKU único | COMPLETO | products/product_images; schema/actions/detail/forms; M1 | R-UI/API + R-SQL; E vacíos; inspección | — |
| PRO07 — Nombre de producto | COMPLETO | products/product_images; schema/actions/detail/forms; M1 | R-UI/API + R-SQL; E vacíos; inspección | — |
| PRO08 — Categoría de producto | COMPLETO | products/product_images; schema/actions/detail/forms; M1 | R-UI/API + R-SQL; E vacíos; inspección | — |
| PRO09 — Descripción de producto | COMPLETO | products/product_images; schema/actions/detail/forms; M1 | R-UI/API + R-SQL; E vacíos; inspección | — |
| PRO10 — Precio base | COMPLETO | products/product_images; schema/actions/detail/forms; M1 | R-UI/API + R-SQL; E vacíos; inspección | CRC; numérico finito no negativo. |
| PRO11 — Tiempo estimado | COMPLETO | products/product_images; schema/actions/detail/forms; M1 | R-UI/API + R-SQL; E vacíos; inspección | Minutos enteros no negativos; opcional. |
| PRO12 — Personalizable y observaciones | COMPLETO | products/product_images; schema/actions/detail/forms; M1 | R-UI/API + R-SQL; E vacíos; inspección | — |
| PRO13 — Imagen principal | COMPLETO | products/product_images; schema/actions/detail/forms; M1 | R-UI/API + R-SQL; E vacíos; inspección | — |
| PRO14 — Imágenes de referencia | COMPLETO | products/product_images; schema/actions/detail/forms; M1 | R-UI/API + R-SQL; E vacíos; inspección | — |
| PRO15 — Duplicar producto | COMPLETO | products/product_images; schema/actions/detail/forms; M1 | R-UI/API + R-SQL; E vacíos; inspección | Nuevo SKU/nombre; copia campos, relaciones activas y referencias privadas. |
| PRO16 — Rechazo de SKU duplicado | COMPLETO | products/product_images; schema/actions/detail/forms; M1 | R-UI/API + R-SQL; E vacíos; inspección | — |
| PRO17 — Productos: estado vacío | COMPLETO | products/product_images; schema/actions/detail/forms; M1 | R-UI/API + R-SQL; E vacíos; inspección | — |
| PRO18 — Productos: loading | COMPLETO | products/product_images; schema/actions/detail/forms; M1 | R-UI/API + R-SQL; E vacíos; inspección | — |
| PRO19 — Productos: errores | COMPLETO | products/product_images; schema/actions/detail/forms; M1 | R-UI/API + R-SQL; E vacíos; inspección | — |
| PRO20 — Productos responsive | COMPLETO | products/product_images; schema/actions/detail/forms; M1 | R-UI/API + R-SQL; E vacíos; inspección | — |
| PRO21 — Auditoría de productos | COMPLETO | products/product_images; schema/actions/detail/forms; M1 | R-UI/API + R-SQL; E vacíos; inspección | — |
| PRO22 — RLS de productos | COMPLETO | products/product_images; schema/actions/detail/forms; M1 | R-UI/API + R-SQL; E vacíos; inspección | — |
| PRO23 — Sin estado redundante | COMPLETO | products/product_images; schema/actions/detail/forms; M1 | R-UI/API + R-SQL; E vacíos; inspección | Esquema real contiene is_active; no status. |
| REL01 — Asociar producto | COMPLETO | product_materials; RelationForm/saveRelation; M1 | R-UI/API edición/desactivación + R-SQL; inspección | — |
| REL02 — Asociar material | COMPLETO | product_materials; RelationForm/saveRelation; M1 | R-UI/API edición/desactivación + R-SQL; inspección | — |
| REL03 — Cantidad estimada | COMPLETO | product_materials; RelationForm/saveRelation; M1 | R-UI/API edición/desactivación + R-SQL; inspección | — |
| REL04 — Notas de asociación | COMPLETO | product_materials; RelationForm/saveRelation; M1 | R-UI/API edición/desactivación + R-SQL; inspección | — |
| REL05 — Editar asociación | COMPLETO | product_materials; RelationForm/saveRelation; M1 | R-UI/API edición/desactivación + R-SQL; inspección | — |
| REL06 — Desactivar asociación | COMPLETO | product_materials; RelationForm/saveRelation; M1 | R-UI/API edición/desactivación + R-SQL; inspección | is_active; fila conservada, sin DELETE. |
| REL07 — Validar referencias | COMPLETO | product_materials; RelationForm/saveRelation; M1 | R-UI/API edición/desactivación + R-SQL; inspección | FKs con ON DELETE RESTRICT. |
| REL08 — Impedir relaciones inválidas | COMPLETO | product_materials; RelationForm/saveRelation; M1 | R-UI/API edición/desactivación + R-SQL; inspección | FK, par único, cantidad positiva finita. |
| REL09 — RLS de product_materials | COMPLETO | product_materials; RelationForm/saveRelation; M1 | R-UI/API edición/desactivación + R-SQL; inspección | — |
| REL10 — Cantidad explícitamente estimativa | COMPLETO | product_materials; RelationForm/saveRelation; M1 | R-UI/API edición/desactivación + R-SQL; inspección | Texto visible Materiales estimados. |
| REL11 — No genera consumo real | COMPLETO | product_materials; RelationForm/saveRelation; M1 | R-UI/API edición/desactivación + R-SQL; inspección | No hay escritura a movimientos. |
| REL12 — No modifica stock | COMPLETO | product_materials; RelationForm/saveRelation; M1 | R-UI/API edición/desactivación + R-SQL; inspección | No existe columna de stock real. |
| REL13 — No genera costo histórico | COMPLETO | product_materials; RelationForm/saveRelation; M1 | R-UI/API edición/desactivación + R-SQL; inspección | No hay cálculos ni filas de costo aplicado. |
| IMG01 — Bucket privado | COMPLETO | images/image-validation; api/catalog-image; M1; Storage real | R-UI/API + R-SQL + L bytes/MIME + S | catalog-images public=false, único bucket del proyecto. |
| IMG02 — Ninguna imagen empresarial pública | COMPLETO | images/image-validation; api/catalog-image; M1; Storage real | R-UI/API + R-SQL + L bytes/MIME + S | Descarga anónima rechazada; no URLs públicas en app. |
| IMG03 — Storage por rol/perfil activo | COMPLETO | images/image-validation; api/catalog-image; M1; Storage real | R-UI/API + R-SQL + L bytes/MIME + S | catalog_images_read con private.is_active y asociación activa/logo. |
| IMG04 — Usuario inactivo bloqueado | COMPLETO | images/image-validation; api/catalog-image; M1; Storage real | R-UI/API + R-SQL + L bytes/MIME + S | Ruta 401 y RLS sin acceso tras cambio de perfil. |
| IMG05 — Límite de tamaño | COMPLETO | images/image-validation; api/catalog-image; M1; Storage real | R-UI/API + R-SQL + L bytes/MIME + S | 5 MiB; rechazo UI real de 5 MiB+1 y prueba local. |
| IMG06 — Tipo real y MIME | COMPLETO | images/image-validation; api/catalog-image; M1; Storage real | R-UI/API + R-SQL + L bytes/MIME + S | Decodificación sharp y coincidencia MIME; no basta extensión; JPEG/PNG/WebP. |
| IMG07 — Descarga autorizada | COMPLETO | images/image-validation; api/catalog-image; M1; Storage real | R-UI/API + R-SQL + L bytes/MIME + S | Ambos roles activos reciben WebP; anónimo no. |
| IMG08 — Mecanismo privado equivalente a URL firmada | COMPLETO | images/image-validation; api/catalog-image; M1; Storage real | R-UI/API + R-SQL + L bytes/MIME + S | Ruta con sesión y JWT por solicitud; no-store; no enlaces públicos. |
| IMG09 — Retirada/reemplazo seguro | COMPLETO | images/image-validation; api/catalog-image; M1; Storage real | R-UI/API + R-SQL + L bytes/MIME + S | Nuevos UUID, sin upsert; retirar preserva bytes/referencias de duplicados. |
| IMG10 — Tratamiento de huérfanos | COMPLETO | images/image-validation; api/catalog-image; M1; Storage real | R-UI/API + R-SQL + L bytes/MIME + S | Fallo de asociación informa y retiene privado; no compensación destructiva; SELECT requiere vínculo activo. |
| IMG11 — Permisos de imágenes Admin/Colaborador | COMPLETO | images/image-validation; api/catalog-image; M1; Storage real | R-UI/API + R-SQL + L bytes/MIME + S | Ambos fotos; solo Admin logo; RPC de inserción reservado servidor. |
| IMG12 — Sin secretos en cliente | COMPLETO | images/image-validation; api/catalog-image; M1; Storage real | R-UI/API + R-SQL + L bytes/MIME + S | Scanner de valores reales y assets; configuración privilegiada server-only. |
| IMG13 — Borrado físico/retención automática de archivos | NO APLICA | D-12; tratamiento no destructivo actual | Inspección de acciones/policies | Política de producción pendiente previamente; no autorizada en esta fase. |
| AUD01 — Auditar creaciones | COMPLETO | 18 triggers catalog_audit/catalog_stamp; audit_log; M1/M2 | R-SQL + R-UI/API; inventario real | — |
| AUD02 — Auditar ediciones | COMPLETO | 18 triggers catalog_audit/catalog_stamp; audit_log; M1/M2 | R-SQL + R-UI/API; inventario real | — |
| AUD03 — Auditar activación/desactivación | COMPLETO | 18 triggers catalog_audit/catalog_stamp; audit_log; M1/M2 | R-SQL + R-UI/API; inventario real | — |
| AUD04 — Auditar cambios financieros | COMPLETO | 18 triggers catalog_audit/catalog_stamp; audit_log; M1/M2 | R-SQL + R-UI/API; inventario real | — |
| AUD05 — Auditar configuración | COMPLETO | 18 triggers catalog_audit/catalog_stamp; audit_log; M1/M2 | R-SQL + R-UI/API; inventario real | — |
| AUD06 — Auditar imágenes | COMPLETO | 18 triggers catalog_audit/catalog_stamp; audit_log; M1/M2 | R-SQL + R-UI/API; inventario real | — |
| AUD07 — Auditar tipo de cambio | COMPLETO | 18 triggers catalog_audit/catalog_stamp; audit_log; M1/M2 | R-SQL + R-UI/API; inventario real | store_exchange_rate revalida Admin y fija actor; no se reescriben eventos anteriores. |
| AUD08 — Colaborador no consulta auditoría | COMPLETO | 18 triggers catalog_audit/catalog_stamp; audit_log; M1/M2 | R-SQL + R-UI/API; inventario real | audit_admin_read heredada; sin filas mediante JWT de Colaborador. |
| UX01 — Mobile-first | COMPLETO | globals.css; AppShell; forms; loading/error; layouts | R-UI responsive/táctil/reduced-motion; E cinco tamaños; inspección visual/código | — |
| UX02 — Responsive 320 px | COMPLETO | globals.css; AppShell; forms; loading/error; layouts | R-UI responsive/táctil/reduced-motion; E cinco tamaños; inspección visual/código | — |
| UX03 — Responsive 375 px | COMPLETO | globals.css; AppShell; forms; loading/error; layouts | R-UI responsive/táctil/reduced-motion; E cinco tamaños; inspección visual/código | — |
| UX04 — Responsive 768 px | COMPLETO | globals.css; AppShell; forms; loading/error; layouts | R-UI responsive/táctil/reduced-motion; E cinco tamaños; inspección visual/código | — |
| UX05 — Responsive 1024 px | COMPLETO | globals.css; AppShell; forms; loading/error; layouts | R-UI responsive/táctil/reduced-motion; E cinco tamaños; inspección visual/código | — |
| UX06 — Responsive 1440 px | COMPLETO | globals.css; AppShell; forms; loading/error; layouts | R-UI responsive/táctil/reduced-motion; E cinco tamaños; inspección visual/código | — |
| UX07 — Sin overflow horizontal | COMPLETO | globals.css; AppShell; forms; loading/error; layouts | R-UI responsive/táctil/reduced-motion; E cinco tamaños; inspección visual/código | — |
| UX08 — Navegación adaptable | COMPLETO | globals.css; AppShell; forms; loading/error; layouts | R-UI responsive/táctil/reduced-motion; E cinco tamaños; inspección visual/código | — |
| UX09 — Tarjetas móviles | COMPLETO | globals.css; AppShell; forms; loading/error; layouts | R-UI responsive/táctil/reduced-motion; E cinco tamaños; inspección visual/código | — |
| UX10 — Tablas de escritorio | COMPLETO | globals.css; AppShell; forms; loading/error; layouts | R-UI responsive/táctil/reduced-motion; E cinco tamaños; inspección visual/código | — |
| UX11 — Lucide Icons | COMPLETO | globals.css; AppShell; forms; loading/error; layouts | R-UI responsive/táctil/reduced-motion; E cinco tamaños; inspección visual/código | — |
| UX12 — Sin emojis como iconografía | COMPLETO | globals.css; AppShell; forms; loading/error; layouts | R-UI responsive/táctil/reduced-motion; E cinco tamaños; inspección visual/código | — |
| UX13 — SweetAlert2 en acciones críticas | COMPLETO | globals.css; AppShell; forms; loading/error; layouts | R-UI responsive/táctil/reduced-motion; E cinco tamaños; inspección visual/código | Confirmar activación/desactivación y retirada de foto. |
| UX14 — Sonner en guardados | COMPLETO | globals.css; AppShell; forms; loading/error; layouts | R-UI responsive/táctil/reduced-motion; E cinco tamaños; inspección visual/código | Confirmación no bloqueante; error inline. |
| UX15 — Animaciones breves | COMPLETO | globals.css; AppShell; forms; loading/error; layouts | R-UI responsive/táctil/reduced-motion; E cinco tamaños; inspección visual/código | Transiciones de botón 150/100 ms; spinner funcional, sin decoración infinita. |
| UX16 — prefers-reduced-motion | COMPLETO | globals.css; AppShell; forms; loading/error; layouts | R-UI responsive/táctil/reduced-motion; E cinco tamaños; inspección visual/código | Consulta CSS reduce anula transiciones/animaciones, comprobada en navegador. |
| UX17 — Scrollbar personalizado | COMPLETO | globals.css; AppShell; forms; loading/error; layouts | R-UI responsive/táctil/reduced-motion; E cinco tamaños; inspección visual/código | Tokens/track/thumb/hover; visibilidad depende del navegador/SO. |
| UX18 — Controles táctiles adecuados | COMPLETO | globals.css; AppShell; forms; loading/error; layouts | R-UI responsive/táctil/reduced-motion; E cinco tamaños; inspección visual/código | Áreas de acciones/summary/checkbox label >=43 px por tolerancia de render, objetivo44; inputs16. |
| UX19 — Loading | COMPLETO | globals.css; AppShell; forms; loading/error; layouts | R-UI responsive/táctil/reduced-motion; E cinco tamaños; inspección visual/código | Skeleton de segmento privado; pendiente deshabilita botón y añade spinner. |
| UX20 — Estados vacíos | COMPLETO | globals.css; AppShell; forms; loading/error; layouts | R-UI responsive/táctil/reduced-motion; E cinco tamaños; inspección visual/código | — |
| UX21 — Estados de error | COMPLETO | globals.css; AppShell; forms; loading/error; layouts | R-UI responsive/táctil/reduced-motion; E cinco tamaños; inspección visual/código | — |
| UX22 — Validaciones visibles | COMPLETO | globals.css; AppShell; forms; loading/error; layouts | R-UI responsive/táctil/reduced-motion; E cinco tamaños; inspección visual/código | Mensajes de servidor y validación nativa; borde rojo :user-invalid añadido. |
| UX23 — Tablas en Configuración y formularios de detalle | NO APLICA | Layout de formularios/tarjetas | R-UI cinco tamaños | No son listados tabulares; no corresponde crear una tabla. |
| UX24 — Modales complejos / bottom sheet | NO APLICA | Formularios de página y SweetAlert sencillo | Inspección UI | No hay formularios complejos en modal en esta fase. |
| SCOPE01 — Sin pedidos operativos | COMPLETO | Inventario PostgreSQL real (11 tablas: 2 F1+9 F2); rutas build; migraciones | Inspección DB/código/UI | — |
| SCOPE02 — Sin ventas | COMPLETO | Inventario PostgreSQL real (11 tablas: 2 F1+9 F2); rutas build; migraciones | Inspección DB/código/UI | — |
| SCOPE03 — Sin pagos | COMPLETO | Inventario PostgreSQL real (11 tablas: 2 F1+9 F2); rutas build; migraciones | Inspección DB/código/UI | — |
| SCOPE04 — Sin ingresos | COMPLETO | Inventario PostgreSQL real (11 tablas: 2 F1+9 F2); rutas build; migraciones | Inspección DB/código/UI | — |
| SCOPE05 — Sin gastos operativos | COMPLETO | Inventario PostgreSQL real (11 tablas: 2 F1+9 F2); rutas build; migraciones | Inspección DB/código/UI | — |
| SCOPE06 — Sin cronómetro | COMPLETO | Inventario PostgreSQL real (11 tablas: 2 F1+9 F2); rutas build; migraciones | Inspección DB/código/UI | — |
| SCOPE07 — Sin sesiones de trabajo | COMPLETO | Inventario PostgreSQL real (11 tablas: 2 F1+9 F2); rutas build; migraciones | Inspección DB/código/UI | — |
| SCOPE08 — Sin movimientos de inventario | COMPLETO | Inventario PostgreSQL real (11 tablas: 2 F1+9 F2); rutas build; migraciones | Inspección DB/código/UI | — |
| SCOPE09 — Sin consumo real de materiales | COMPLETO | Inventario PostgreSQL real (11 tablas: 2 F1+9 F2); rutas build; migraciones | Inspección DB/código/UI | — |
| SCOPE10 — Sin envíos | COMPLETO | Inventario PostgreSQL real (11 tablas: 2 F1+9 F2); rutas build; migraciones | Inspección DB/código/UI | — |
| SCOPE11 — Sin rentabilidad | COMPLETO | Inventario PostgreSQL real (11 tablas: 2 F1+9 F2); rutas build; migraciones | Inspección DB/código/UI | — |
| SCOPE12 — Dashboard sin datos financieros | COMPLETO | Inventario PostgreSQL real (11 tablas: 2 F1+9 F2); rutas build; migraciones | Inspección DB/código/UI | — |
| SCOPE13 — Sin reportes de negocio de fases posteriores | COMPLETO | Inventario PostgreSQL real (11 tablas: 2 F1+9 F2); rutas build; migraciones | Inspección DB/código/UI | — |
| SCOPE14 — Cotizaciones cambiarias pertenecen a Fase 2 | COMPLETO | Inventario PostgreSQL real (11 tablas: 2 F1+9 F2); rutas build; migraciones | Inspección DB/código/UI | exchange_rates son referencias CRC/USD; no presupuestos/pedidos. |
| TEST01 — CRUD no destructivo | COMPLETO | tests/phase2-real.mjs; tests/sql/phase2-remote-verification.sql; tests/phase2.test.mjs; tests/e2e | R-UI/API + R-SQL; L; E (clasificación detallada) | Crear, leer, editar y activar/desactivar; DELETE prohibido. |
| TEST02 — Duplicados | COMPLETO | tests/phase2-real.mjs; tests/sql/phase2-remote-verification.sql; tests/phase2.test.mjs; tests/e2e | R-UI/API + R-SQL; L; E (clasificación detallada) | — |
| TEST03 — Desactivación | COMPLETO | tests/phase2-real.mjs; tests/sql/phase2-remote-verification.sql; tests/phase2.test.mjs; tests/e2e | R-UI/API + R-SQL; L; E (clasificación detallada) | — |
| TEST04 — Permisos Admin | COMPLETO | tests/phase2-real.mjs; tests/sql/phase2-remote-verification.sql; tests/phase2.test.mjs; tests/e2e | R-UI/API + R-SQL; L; E (clasificación detallada) | — |
| TEST05 — Permisos Colaborador | COMPLETO | tests/phase2-real.mjs; tests/sql/phase2-remote-verification.sql; tests/phase2.test.mjs; tests/e2e | R-UI/API + R-SQL; L; E (clasificación detallada) | — |
| TEST06 — Usuario inactivo | COMPLETO | tests/phase2-real.mjs; tests/sql/phase2-remote-verification.sql; tests/phase2.test.mjs; tests/e2e | R-UI/API + R-SQL; L; E (clasificación detallada) | — |
| TEST07 — API directa | COMPLETO | tests/phase2-real.mjs; tests/sql/phase2-remote-verification.sql; tests/phase2.test.mjs; tests/e2e | R-UI/API + R-SQL; L; E (clasificación detallada) | — |
| TEST08 — RLS real | COMPLETO | tests/phase2-real.mjs; tests/sql/phase2-remote-verification.sql; tests/phase2.test.mjs; tests/e2e | R-UI/API + R-SQL; L; E (clasificación detallada) | — |
| TEST09 — Subida privada | COMPLETO | tests/phase2-real.mjs; tests/sql/phase2-remote-verification.sql; tests/phase2.test.mjs; tests/e2e | R-UI/API + R-SQL; L; E (clasificación detallada) | — |
| TEST10 — Descarga privada | COMPLETO | tests/phase2-real.mjs; tests/sql/phase2-remote-verification.sql; tests/phase2.test.mjs; tests/e2e | R-UI/API + R-SQL; L; E (clasificación detallada) | — |
| TEST11 — Archivo inválido | COMPLETO | tests/phase2-real.mjs; tests/sql/phase2-remote-verification.sql; tests/phase2.test.mjs; tests/e2e | R-UI/API + R-SQL; L; E (clasificación detallada) | — |
| TEST12 — Tamaño excesivo | COMPLETO | tests/phase2-real.mjs; tests/sql/phase2-remote-verification.sql; tests/phase2.test.mjs; tests/e2e | R-UI/API + R-SQL; L; E (clasificación detallada) | — |
| TEST13 — Relación producto/material inválida | COMPLETO | tests/phase2-real.mjs; tests/sql/phase2-remote-verification.sql; tests/phase2.test.mjs; tests/e2e | R-UI/API + R-SQL; L; E (clasificación detallada) | — |
| TEST14 — SKU duplicado | COMPLETO | tests/phase2-real.mjs; tests/sql/phase2-remote-verification.sql; tests/phase2.test.mjs; tests/e2e | R-UI/API + R-SQL; L; E (clasificación detallada) | — |
| TEST15 — Categoría duplicada | COMPLETO | tests/phase2-real.mjs; tests/sql/phase2-remote-verification.sql; tests/phase2.test.mjs; tests/e2e | R-UI/API + R-SQL; L; E (clasificación detallada) | — |
| TEST16 — Responsive | COMPLETO | tests/phase2-real.mjs; tests/sql/phase2-remote-verification.sql; tests/phase2.test.mjs; tests/e2e | R-UI/API + R-SQL; L; E (clasificación detallada) | — |
| TEST17 — Errores | COMPLETO | tests/phase2-real.mjs; tests/sql/phase2-remote-verification.sql; tests/phase2.test.mjs; tests/e2e | R-UI/API + R-SQL; L; E (clasificación detallada) | — |
| TEST18 — Estados vacíos | COMPLETO | tests/phase2-real.mjs; tests/sql/phase2-remote-verification.sql; tests/phase2.test.mjs; tests/e2e | R-UI/API + R-SQL; L; E (clasificación detallada) | — |
| DB01 — Tabla settings: esquema/permisos/RLS/auditoría | COMPLETO | Inventario y matriz por tabla abajo; PHASE2_SCHEMA_AUDIT.json | Catálogos pg_* remotos; R-SQL | Función, columnas, constraints, FKs e índices enumerados abajo. |
| DB02 — Tabla clients: esquema/permisos/RLS/auditoría | COMPLETO | Inventario y matriz por tabla abajo; PHASE2_SCHEMA_AUDIT.json | Catálogos pg_* remotos; R-SQL | Función, columnas, constraints, FKs e índices enumerados abajo. |
| DB03 — Tabla product_categories: esquema/permisos/RLS/auditoría | COMPLETO | Inventario y matriz por tabla abajo; PHASE2_SCHEMA_AUDIT.json | Catálogos pg_* remotos; R-SQL | Función, columnas, constraints, FKs e índices enumerados abajo. |
| DB04 — Tabla materials: esquema/permisos/RLS/auditoría | COMPLETO | Inventario y matriz por tabla abajo; PHASE2_SCHEMA_AUDIT.json | Catálogos pg_* remotos; R-SQL | Función, columnas, constraints, FKs e índices enumerados abajo. |
| DB05 — Tabla material_costs: esquema/permisos/RLS/auditoría | COMPLETO | Inventario y matriz por tabla abajo; PHASE2_SCHEMA_AUDIT.json | Catálogos pg_* remotos; R-SQL | Función, columnas, constraints, FKs e índices enumerados abajo. |
| DB06 — Tabla products: esquema/permisos/RLS/auditoría | COMPLETO | Inventario y matriz por tabla abajo; PHASE2_SCHEMA_AUDIT.json | Catálogos pg_* remotos; R-SQL | Función, columnas, constraints, FKs e índices enumerados abajo. |
| DB07 — Tabla product_materials: esquema/permisos/RLS/auditoría | COMPLETO | Inventario y matriz por tabla abajo; PHASE2_SCHEMA_AUDIT.json | Catálogos pg_* remotos; R-SQL | Función, columnas, constraints, FKs e índices enumerados abajo. |
| DB08 — Tabla product_images: esquema/permisos/RLS/auditoría | COMPLETO | Inventario y matriz por tabla abajo; PHASE2_SCHEMA_AUDIT.json | Catálogos pg_* remotos; R-SQL | Función, columnas, constraints, FKs e índices enumerados abajo. |
| DB09 — Tabla exchange_rates: esquema/permisos/RLS/auditoría | COMPLETO | Inventario y matriz por tabla abajo; PHASE2_SCHEMA_AUDIT.json | Catálogos pg_* remotos; R-SQL | Función, columnas, constraints, FKs e índices enumerados abajo. |

**Conteo: 181 COMPLETO, 0 PARCIAL, 2 PENDIENTE, 4 NO APLICA; total 187.** Los dos pendientes son exclusivamente datos de logo y valor/hora. No hay funcionalidad de Fase 2 pendiente por una decisión nueva.

### Matriz efectiva de permisos, no solo visibilidad UI

Todas las operaciones siguientes requieren perfil **activo**. Para las nueve tablas, un usuario **inactivo**, aun con JWT válido, recibe cero filas en SELECT y no puede insertar/actualizar mediante RLS; funciones privilegiadas revalidan actor. Anónimo carece de grants de lectura/escritura empresarial. Ningún rol de usuario tiene DELETE. service_role es un rol técnico de servidor con bypass, nunca identidad de navegador; sus grants reales completos constan en el JSON del esquema, y los endpoints revalidan actor.

| Tabla | Admin activo | Colaborador activo | Políticas RLS | Columnas/datos protegidos | Grants y límites |
|---|---|---|---|---|---|
| settings | Leer; editar nombre/teléfono/correo/adelanto/hora. Logo por servidor. | Solo nombre/logo mediante business_brand, sin leer tabla. | settings_read/insert/update: is_admin | hourly_rate, deposit_percentage y fila de settings | INSERT permitido por grant/RLS Admin, pero fila singleton existente impide otra; currency/formato no tienen UPDATE cliente. |
| clients | Crear/leer/editar/activar/desactivar | Igual, si activo | clients_read/insert/update: is_active | Datos de contacto solo a usuarios activos | Sin DELETE; historial por auditoría. |
| product_categories | Crear/leer/editar/activar/desactivar | Igual, si activo | product_categories_read/insert/update: is_active | Sin columnas financieras | Índice de nombre normalizado. |
| materials | Crear/leer/editar/activar/desactivar | Igual, si activo | materials_read/insert/update: is_active | No contiene costo ni moneda | save_material con costo no nulo exige Admin. |
| material_costs | Leer/crear/editar costo y moneda | Ninguna fila/operación | material_costs_read/insert/update: is_admin | amount, currency; toda fila restringida | No borrado físico; sin fila = pendiente. |
| products | Crear/leer/editar/activar/desactivar/duplicar | Igual, si activo | products_read/insert/update: is_active | Precio de venta autorizado; no costo/margen | SKU normalizado único; solo is_active. |
| product_materials | Crear/leer/editar/desactivar | Igual, si activo | product_materials_read/insert/update: is_active | Sin costos | FKs RESTRICT; único producto/material. |
| product_images | Leer/editar caption, is_main, is_active; alta validada por servidor | Igual para fotos, si activo | product_images_read/insert/update: is_active | path protegido contra escritura cliente | INSERT cliente revocado aunque exista policy; UPDATE restringido a tres columnas. |
| exchange_rates | Leer; solicitar actualización al servidor | Ninguna fila/operación | exchange_rates_read: is_admin | Tasa y fuente reservadas a Administración | Sin INSERT/UPDATE cliente; service_role también sin escritura directa; RPC exclusivo. |

`is_admin()` e `is_active()` consultan el perfil vigente; no confían en metadata editable ni en rol antiguo del JWT. UPDATE tiene USING y WITH CHECK. La protección de filas y los grants se combinan; una policy no restituye un grant revocado. Referencia técnica: [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security).

Auditoría heredada: `audit_log` solo SELECT Admin (`audit_admin_read`); Colaborador no lee ni escribe; triggers insertan. La tabla de costos segregada evita filtrar sus columnas mediante SELECT *, joins, filtros o respuestas de escritura de materials. business_brand devuelve únicamente nombre/logo a perfiles activos. Data API expone `public,graphql_public`; **private no está expuesto**.

### Inventario físico de las nueve tablas

Snapshot de solo metadatos consultado en DEV: [PHASE2_SCHEMA_AUDIT.json](PHASE2_SCHEMA_AUDIT.json). Incluye columnas/tipos/nullabilidad, definición exacta y nombre de cada constraint, índices, triggers y grants. No contiene filas empresariales ni secretos.

Las nueve tablas tienen PK UUID por defecto gen_random_uuid(), created_at/updated_at timestamptz no nulos con now(), RLS habilitada y dos triggers: `catalog_stamp` BEFORE UPDATE (identidad/created_at inmutables, actualiza updated_at) y `catalog_audit` AFTER INSERT OR UPDATE (actor, entidad y before/after). No necesitan FK por obligación artificial cuando no referencian otra entidad.

#### clients

Propósito: Contactos e historial conservado. Fase 2 / RF-CLI-01/02/03/05.
Columnas: `id` uuid NOT NULL; `name` text NOT NULL; `phone` text; `email` text; `address` text; `location` text; `notes` text; `is_active` boolean NOT NULL; `created_at` timestamp with time zone NOT NULL; `updated_at` timestamp with time zone NOT NULL.

Constraints y FKs (definiciones reales):
- `clients_address_check`: `CHECK ((length(address) <= 1000))`.
- `clients_email_check`: `CHECK (((email ~ '^[^ @]+@[^ @]+\.[^ @]+$'::text) AND (length(email) <= 254)))`.
- `clients_email_no_whitespace`: `CHECK ((email !~ '[[:space:]]'::text))`.
- `clients_location_check`: `CHECK ((length(location) <= 300))`.
- `clients_name_check`: `CHECK (((length(TRIM(BOTH FROM name)) >= 1) AND (length(TRIM(BOTH FROM name)) <= 120)))`.
- `clients_notes_check`: `CHECK ((length(notes) <= 3000))`.
- `clients_phone_check`: `CHECK ((phone ~ '^\+?[0-9 ()-]{8,25}$'::text))`.
- `clients_phone_has_digit`: `CHECK ((phone ~ '[0-9]'::text))`.
- `clients_pkey`: `PRIMARY KEY (id)`.

Índices (incluyen los creados por PK/UNIQUE):
- `CREATE UNIQUE INDEX clients_pkey ON public.clients USING btree (id)`.
- `CREATE INDEX clients_name_idx ON public.clients USING btree (lower(name))`.
- `CREATE INDEX clients_active_idx ON public.clients USING btree (is_active, name)`.

RLS y permisos: fila clients de la matriz anterior. Auditoría: ambos triggers comunes, con before/after incluso al activar/desactivar.

#### exchange_rates

Propósito: Caché persistente de referencia cambiaria, no pedido/cotización comercial. Fase 2 / D-18, RF-CON-05/06.
Columnas: `id` uuid NOT NULL; `source` text NOT NULL; `rate_date` date NOT NULL; `sell_rate` numeric NOT NULL; `fetched_at` timestamp with time zone NOT NULL; `created_at` timestamp with time zone NOT NULL; `updated_at` timestamp with time zone NOT NULL.

Constraints y FKs (definiciones reales):
- `exchange_rates_pkey`: `PRIMARY KEY (id)`.
- `exchange_rates_rate_date_key`: `UNIQUE (rate_date)`.
- `exchange_rates_sell_rate_check`: `CHECK (((sell_rate > (0)::numeric) AND (sell_rate < 'Infinity'::numeric)))`.
- `exchange_rates_source_check`: `CHECK ((source = 'BCCR via tipodecambio.paginasweb.cr'::text))`.

Índices (incluyen los creados por PK/UNIQUE):
- `CREATE UNIQUE INDEX exchange_rates_pkey ON public.exchange_rates USING btree (id)`.
- `CREATE UNIQUE INDEX exchange_rates_rate_date_key ON public.exchange_rates USING btree (rate_date)`.
- `CREATE INDEX exchange_rates_latest_idx ON public.exchange_rates USING btree (rate_date DESC)`.

RLS y permisos: fila exchange_rates de la matriz anterior. Auditoría: ambos triggers comunes, con before/after incluso al activar/desactivar.

#### material_costs

Propósito: Costo actual original CRC/USD segregado. Fase 2 / D-01, D-18 / RF-CON-05.
Columnas: `id` uuid NOT NULL; `material_id` uuid NOT NULL; `amount` numeric NOT NULL; `currency` text NOT NULL; `created_at` timestamp with time zone NOT NULL; `updated_at` timestamp with time zone NOT NULL.

Constraints y FKs (definiciones reales):
- `material_costs_amount_check`: `CHECK (((amount >= (0)::numeric) AND (amount < 'Infinity'::numeric)))`.
- `material_costs_currency_check`: `CHECK ((currency = ANY (ARRAY['CRC'::text, 'USD'::text])))`.
- `material_costs_material_id_fkey`: `FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE RESTRICT`.
- `material_costs_material_id_key`: `UNIQUE (material_id)`.
- `material_costs_pkey`: `PRIMARY KEY (id)`.

Índices (incluyen los creados por PK/UNIQUE):
- `CREATE UNIQUE INDEX material_costs_pkey ON public.material_costs USING btree (id)`.
- `CREATE UNIQUE INDEX material_costs_material_id_key ON public.material_costs USING btree (material_id)`.

RLS y permisos: fila material_costs de la matriz anterior. Auditoría: ambos triggers comunes, con before/after incluso al activar/desactivar.

#### materials

Propósito: Catálogo operativo sin costos ni existencias. Fase 2 / RF-INV-02 y RF-CON-04 limitados a Fase 2.
Columnas: `id` uuid NOT NULL; `code` text NOT NULL; `name` text NOT NULL; `category` text NOT NULL; `unit` text NOT NULL; `min_stock` numeric NOT NULL; `is_active` boolean NOT NULL; `created_at` timestamp with time zone NOT NULL; `updated_at` timestamp with time zone NOT NULL.

Constraints y FKs (definiciones reales):
- `materials_category_check`: `CHECK (((length(TRIM(BOTH FROM category)) >= 1) AND (length(TRIM(BOTH FROM category)) <= 100)))`.
- `materials_code_check`: `CHECK (((length(TRIM(BOTH FROM code)) >= 1) AND (length(TRIM(BOTH FROM code)) <= 60)))`.
- `materials_min_stock_check`: `CHECK (((min_stock >= (0)::numeric) AND (min_stock < 'Infinity'::numeric)))`.
- `materials_name_check`: `CHECK (((length(TRIM(BOTH FROM name)) >= 1) AND (length(TRIM(BOTH FROM name)) <= 120)))`.
- `materials_pkey`: `PRIMARY KEY (id)`.
- `materials_unit_check`: `CHECK (((length(TRIM(BOTH FROM unit)) >= 1) AND (length(TRIM(BOTH FROM unit)) <= 40)))`.

Índices (incluyen los creados por PK/UNIQUE):
- `CREATE UNIQUE INDEX materials_pkey ON public.materials USING btree (id)`.
- `CREATE UNIQUE INDEX materials_code_unique ON public.materials USING btree (lower(TRIM(BOTH FROM code)))`.
- `CREATE INDEX materials_active_name_idx ON public.materials USING btree (is_active, name)`.

RLS y permisos: fila materials de la matriz anterior. Auditoría: ambos triggers comunes, con before/after incluso al activar/desactivar.

#### product_categories

Propósito: Organización del catálogo. Fase 2 / Fase 2 / RF-PRO-02.
Columnas: `id` uuid NOT NULL; `name` text NOT NULL; `description` text; `is_active` boolean NOT NULL; `created_at` timestamp with time zone NOT NULL; `updated_at` timestamp with time zone NOT NULL.

Constraints y FKs (definiciones reales):
- `product_categories_description_check`: `CHECK ((length(description) <= 1000))`.
- `product_categories_name_check`: `CHECK (((length(TRIM(BOTH FROM name)) >= 1) AND (length(TRIM(BOTH FROM name)) <= 100)))`.
- `product_categories_pkey`: `PRIMARY KEY (id)`.

Índices (incluyen los creados por PK/UNIQUE):
- `CREATE UNIQUE INDEX product_categories_pkey ON public.product_categories USING btree (id)`.
- `CREATE UNIQUE INDEX product_categories_name_unique ON public.product_categories USING btree (lower(regexp_replace(TRIM(BOTH FROM name), '\s+'::text, ' '::text, 'g'::text)))`.

RLS y permisos: fila product_categories de la matriz anterior. Auditoría: ambos triggers comunes, con before/after incluso al activar/desactivar.

#### product_images

Propósito: Metadatos de fotos/referencias privadas. Fase 2 / RF-PRO-05, D-12.
Columnas: `id` uuid NOT NULL; `product_id` uuid NOT NULL; `path` text NOT NULL; `caption` text NOT NULL; `is_main` boolean NOT NULL; `is_active` boolean NOT NULL; `created_at` timestamp with time zone NOT NULL; `updated_at` timestamp with time zone NOT NULL.

Constraints y FKs (definiciones reales):
- `product_images_caption_check`: `CHECK ((length(caption) <= 300))`.
- `product_images_path_check`: `CHECK ((path ~ '^products/[a-f0-9-]+/[a-f0-9-]+\.webp$'::text))`.
- `product_images_pkey`: `PRIMARY KEY (id)`.
- `product_images_product_id_fkey`: `FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT`.

Índices (incluyen los creados por PK/UNIQUE):
- `CREATE UNIQUE INDEX product_images_pkey ON public.product_images USING btree (id)`.
- `CREATE INDEX product_images_product_idx ON public.product_images USING btree (product_id)`.
- `CREATE INDEX product_images_path_idx ON public.product_images USING btree (path)`.
- `CREATE UNIQUE INDEX product_images_main_unique ON public.product_images USING btree (product_id) WHERE (is_main AND is_active)`.

RLS y permisos: fila product_images de la matriz anterior. Auditoría: ambos triggers comunes, con before/after incluso al activar/desactivar.

#### product_materials

Propósito: Estimación de materiales, no consumo. Fase 2 / RF-PRO-04.
Columnas: `id` uuid NOT NULL; `product_id` uuid NOT NULL; `material_id` uuid NOT NULL; `estimated_quantity` numeric NOT NULL; `notes` text; `is_active` boolean NOT NULL; `created_at` timestamp with time zone NOT NULL; `updated_at` timestamp with time zone NOT NULL.

Constraints y FKs (definiciones reales):
- `product_materials_estimated_quantity_check`: `CHECK (((estimated_quantity > (0)::numeric) AND (estimated_quantity < 'Infinity'::numeric)))`.
- `product_materials_material_id_fkey`: `FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE RESTRICT`.
- `product_materials_notes_check`: `CHECK ((length(notes) <= 1000))`.
- `product_materials_pkey`: `PRIMARY KEY (id)`.
- `product_materials_product_id_fkey`: `FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT`.
- `product_materials_product_id_material_id_key`: `UNIQUE (product_id, material_id)`.

Índices (incluyen los creados por PK/UNIQUE):
- `CREATE UNIQUE INDEX product_materials_pkey ON public.product_materials USING btree (id)`.
- `CREATE UNIQUE INDEX product_materials_product_id_material_id_key ON public.product_materials USING btree (product_id, material_id)`.
- `CREATE INDEX product_materials_material_idx ON public.product_materials USING btree (material_id)`.

RLS y permisos: fila product_materials de la matriz anterior. Auditoría: ambos triggers comunes, con before/after incluso al activar/desactivar.

#### products

Propósito: Catálogo de piezas, precio CRC y personalización. Fase 2 / RF-PRO-01/02/03/06.
Columnas: `id` uuid NOT NULL; `sku` text NOT NULL; `name` text NOT NULL; `category_id` uuid; `description` text; `base_price` numeric NOT NULL; `estimated_minutes` integer; `is_customizable` boolean NOT NULL; `customization_notes` text; `is_active` boolean NOT NULL; `created_at` timestamp with time zone NOT NULL; `updated_at` timestamp with time zone NOT NULL.

Constraints y FKs (definiciones reales):
- `products_base_price_check`: `CHECK (((base_price >= (0)::numeric) AND (base_price < 'Infinity'::numeric)))`.
- `products_category_id_fkey`: `FOREIGN KEY (category_id) REFERENCES product_categories(id) ON DELETE RESTRICT`.
- `products_customization_notes_check`: `CHECK ((length(customization_notes) <= 3000))`.
- `products_description_check`: `CHECK ((length(description) <= 3000))`.
- `products_estimated_minutes_check`: `CHECK ((estimated_minutes >= 0))`.
- `products_name_check`: `CHECK (((length(TRIM(BOTH FROM name)) >= 1) AND (length(TRIM(BOTH FROM name)) <= 120)))`.
- `products_pkey`: `PRIMARY KEY (id)`.
- `products_sku_check`: `CHECK (((length(TRIM(BOTH FROM sku)) >= 1) AND (length(TRIM(BOTH FROM sku)) <= 60)))`.

Índices (incluyen los creados por PK/UNIQUE):
- `CREATE UNIQUE INDEX products_pkey ON public.products USING btree (id)`.
- `CREATE UNIQUE INDEX products_sku_unique ON public.products USING btree (lower(TRIM(BOTH FROM sku)))`.
- `CREATE INDEX products_category_idx ON public.products USING btree (category_id)`.
- `CREATE INDEX products_active_name_idx ON public.products USING btree (is_active, name)`.

RLS y permisos: fila products de la matriz anterior. Auditoría: ambos triggers comunes, con before/after incluso al activar/desactivar.

#### settings

Propósito: Configuración general/financiera. Fase 2 / RF-CON-01/02/03/05/06, D-18.
Columnas: `id` uuid NOT NULL; `singleton` boolean NOT NULL; `business_name` text NOT NULL; `phone` text NOT NULL; `email` text NOT NULL; `currency` text NOT NULL; `deposit_percentage` numeric NOT NULL; `hourly_rate` numeric; `order_number_format` text NOT NULL; `logo_path` text; `created_at` timestamp with time zone NOT NULL; `updated_at` timestamp with time zone NOT NULL.

Constraints y FKs (definiciones reales):
- `settings_business_name_check`: `CHECK (((length(TRIM(BOTH FROM business_name)) >= 1) AND (length(TRIM(BOTH FROM business_name)) <= 120)))`.
- `settings_currency_check`: `CHECK ((currency = 'CRC'::text))`.
- `settings_deposit_percentage_check`: `CHECK (((deposit_percentage >= (0)::numeric) AND (deposit_percentage <= (100)::numeric)))`.
- `settings_email_check`: `CHECK (((email ~ '^[^ @]+@[^ @]+\.[^ @]+$'::text) AND (length(email) <= 254)))`.
- `settings_email_no_whitespace`: `CHECK ((email !~ '[[:space:]]'::text))`.
- `settings_hourly_rate_check`: `CHECK (((hourly_rate >= (0)::numeric) AND (hourly_rate < 'Infinity'::numeric)))`.
- `settings_logo_path_check`: `CHECK ((logo_path ~ '^branding/[a-f0-9-]+\.webp$'::text))`.
- `settings_order_number_format_check`: `CHECK ((order_number_format = 'PED-AAAA-00001'::text))`.
- `settings_phone_check`: `CHECK ((phone ~ '^\+?[0-9 ()-]{8,25}$'::text))`.
- `settings_phone_has_digit`: `CHECK ((phone ~ '[0-9]'::text))`.
- `settings_pkey`: `PRIMARY KEY (id)`.
- `settings_singleton_check`: `CHECK (singleton)`.
- `settings_singleton_key`: `UNIQUE (singleton)`.

Índices (incluyen los creados por PK/UNIQUE):
- `CREATE UNIQUE INDEX settings_pkey ON public.settings USING btree (id)`.
- `CREATE UNIQUE INDEX settings_singleton_key ON public.settings USING btree (singleton)`.

RLS y permisos: fila settings de la matriz anterior. Auditoría: ambos triggers comunes, con before/after incluso al activar/desactivar.


### Funciones y RPC de M1/M2

Todas tienen search_path vacío. Sin EXECUTE para anon/PUBLIC. Las funciones SECURITY DEFINER permanecen en private. Los wrappers públicos son SECURITY INVOKER.

| Función | Seguridad / ejecución | Responsabilidad |
|---|---|---|
| private.catalog_stamp() | INVOKER, solo trigger | Impide cambiar id/created_at y marca updated_at |
| private.audit_catalog() | DEFINER, solo trigger | Inserta audit_log transaccional con actor/before/after |
| public.save_material(uuid,text,text,text,text,numeric,boolean,numeric,text) | INVOKER; authenticated | Catálogo/costo atómicos; costo no nulo exige Admin activo |
| public.duplicate_product(uuid,text,text) | INVOKER; authenticated | Copia producto, relaciones activas y referencias; exige activo |
| private.copy_product_images(uuid,uuid) | DEFINER; authenticated, esquema no expuesto | Copia referencias activas tras verificar perfil activo |
| private.business_brand() | DEFINER; authenticated | Proyección nombre/logo si actor activo |
| public.business_brand() | INVOKER; authenticated | Wrapper de proyección segura |
| private.register_catalog_image(uuid,uuid,text,text,boolean) | DEFINER; service_role | Verifica actor activo/Admin para logo, atribuye auditoría e inserta metadata o actualiza logo |
| public.register_catalog_image(uuid,uuid,text,text,boolean) | INVOKER; service_role | Wrapper exclusivo servidor, no permite alta directa de metadata cliente |
| public.set_main_image(uuid) | INVOKER; authenticated | Bloquea producto; sustituye principal transaccionalmente |
| private.store_exchange_rate(uuid,date,numeric) | DEFINER; service_role | Verifica Admin activo, fecha válida y atribuye actor; upsert de tasa |
| public.store_exchange_rate(uuid,date,numeric) | INVOKER; service_role | Wrapper de actualización de referencia; sin escritura directa por tabla |

Los wrappers operativos públicos también conservan grant técnico service_role por defaults de Supabase; el servidor no los usa para saltarse permisos de usuarios. private helpers exigen las condiciones descritas. Las 12 funciones anteriores son de Fase 2; is_admin/is_active y funciones Auth/profiles pertenecen a Fase 1.

- **Triggers:** 18 en total; catalog_stamp y catalog_audit en cada una de las nueve tablas (definiciones completas por tabla en snapshot).
- **Policies empresariales:** 25: tres por tabla excepto exchange_rates (solo SELECT). Sin policies DELETE.
- **Vistas:** ninguna creada por Fase 2; ninguna vista en public según catálogo remoto.
- **Bucket:** catalog-images, privado, límite 5.242.880 bytes, MIME almacenado image/webp.
- **Storage policy:** catalog_images_read, SELECT TO authenticated, bucket correcto, perfil activo y ruta de imagen activa o logo actual. Sin policies de INSERT/UPDATE/DELETE cliente.
- **Otros objetos:** índices/constraints enumerados; grants/revokes de tablas/columnas/funciones y USAGE private para service_role; fila singleton inicial aprobada en settings. No nuevas extensiones, roles, enums, secuencias, cron, Edge Functions ni vistas de reportes.
- **M2:** añade store_exchange_rate privado/público y revoca INSERT/UPDATE directos de exchange_rates a service_role; eventos previos no se reescriben.
- **M3 de esta auditoría:** únicamente los dos CHECK de correo; no añade tablas, funciones, triggers ni policies.
- **M4 de esta auditoría:** únicamente dos CHECK de teléfono; no añade tablas, funciones, triggers ni policies.

### Auditoría de acciones y conservación

| Acción | Evento/datos conservados | Verificación |
|---|---|---|
| Crear registro | tabla.insert; after, actor y fecha | SQL real + altas UI |
| Editar | tabla.update; before/after | UI real de los cuatro catálogos |
| Activar/desactivar | tabla.update con is_active anterior/nuevo | Ciclo UI por módulo y BD |
| Costo/moneda | material_costs.insert/update, Admin | Guardado USD real; RLS impide Colaborador |
| Configuración/valor-hora | settings.update, Admin | UI configuración + SQL rollback tarifa |
| Foto/retirada/principal | product_images.insert/update | Carga, principal, retirada y auditoría con actor real |
| Logo | settings.update mediante RPC | Rama Admin SQL con rollback; sin cambiar logo real |
| Tipo de cambio | exchange_rates.insert/update, Admin vía RPC | Prueba real de consulta/persistencia y M2 |

Retirar foto no borra bytes; una copia conserva su referencia independiente. Reemplazar logo crea nueva ruta; el objeto anterior deja de estar vinculado al logo actual y no obtiene lectura por esa vía. Un huérfano por fallo de asociación permanece privado sin vínculo legible, se informa al usuario y queda para revisión. No hay purga automática ni política de retención inventada; la decisión de producción sigue pendiente previamente.

### Resultado de pruebas de esta auditoría

- Lint y typecheck: correctos. Build de producción: correcto.
- Unitarias/SQL local: **12 aprobadas**, incluyendo constraints de correo añadidas, logo/proyección segura e inactivo en nueve tablas.
- E2E simulados: **14 aprobados**; nuevo caso de loading con retraso, error 503 y recuperación de catálogo. El error deliberado de catálogo en la consola pertenece a esta prueba esperada, no a un fallo de la suite.
- R-SQL: ejecución completa contra DEV, rollback correcto; no se borraron datos existentes.
- R-UI/API: recorrido ampliado completo aprobado sobre npm start: CRUD conservador, duplicados, ambos roles, HTML/RSC, tamaño/bytes, Storage, reactivación, errores de red y cinco anchos.
- Responsive real: 320/375/768/1024/1440, sin scroll horizontal; controles esenciales y summaries >=44 px aproximados, checkbox por su label táctil. Configuración comprobada en los cinco anchos. Revisión visual de capturas móvil/escritorio y CSS/tokens.
- Caída del proveedor de tasa: **simulada en pruebas locales**; la consulta exitosa/persistencia sí usa proveedor real. Nunca se afirma que se provocó una caída real del proveedor.
- SMTP: no se reenvió correo ni se cambió configuración; únicamente se verificó que su secreto alojado no esté en archivos de aplicación.
- npm audit --omit=dev: **0 vulnerabilidades**.
- Security Advisors: **sin nuevos hallazgos Fase 2**, persiste WARN heredado auth_leaked_password_protection. [Remediación](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). No se modificó plan/Auth.
- Secretos: .env.local ignorado; SMTP ausente en repositorio y .env.local; private fuera de Data API. Valores privados reales comparados en memoria, sin incluirlos en el informe.
- Migraciones locales/remotas equivalentes: Fase 1 y M1/M2/M3/M4. No hay migraciones pendientes.
- Comprobación dirigida posterior a M4: API rechaza teléfono sin dígitos en clients/settings; UI muestra el error del servidor y conserva formulario. Búsquedas reales de productos por SKU, materiales por código y categorías por nombre aprobadas. Se repitieron detalle y listado financiero Admin en los cinco tamaños, con capturas revisadas. No hubo mutaciones válidas en este recorrido adicional. La suite E2E completa precedió a M4; su cambio de validación se verificó con unitarias, SQL real y este recorrido específico.
- Escaneo final: **88 archivos versionables y 49 assets de cliente**, cero coincidencias con service_role/AUTH_FLOW_SECRET; .env.local ignorado. Git diff --check correcto; AGENTS.md, DESIGN_SYSTEM.md y reference sin modificaciones. Performance Advisors: 6 INFO de índices aún sin uso; no se eliminan.

### Archivos modificados por esta auditoría

README.md; docs/DECISIONS.md, REQUIREMENTS.md, ARCHITECTURE.md, DATABASE.md y PHASE2_VERIFICATION.md; src/app/globals.css; src/components/catalog-forms.tsx; src/features/catalog/list-page.tsx y schema.ts; tests/phase2-real.mjs, phase2.test.mjs, e2e/phase2.spec.ts, sql/phase2-remote-verification.sql y support/supabase-fixture.mjs.

Nuevos: docs/PHASE2_SCHEMA_AUDIT.json y las migraciones M3/M4. Sin dependencias nuevas, cambios de secretos ni modificación del mecanismo Auth. Cambios preparados en el árbol de trabajo para revisión; el commit base de Fase 2 continúa siendo a3ca89b.

### Cierre de alcance

**181 completos, 0 parciales, 2 pendientes de datos, 4 no aplicables.** Desviaciones funcionales abiertas: ninguna identificada; las brechas de validación de correo/teléfono se corrigieron y probaron. No se requiere una nueva aprobación funcional para las correcciones realizadas.

Solo faltan la imagen definitiva y el importe/hora que aportará el usuario. Retención/respaldo, plan de producción y advertencia heredada de Auth continúan delimitados antes de producción; no se convierten en funcionalidades faltantes de Fase 2.

**No se avanzó a Fase 3.** No hay pedidos operativos, finanzas transaccionales, inventario real, cronómetro, envíos, rentabilidad ni reportes. No hubo reset remoto, DROP, TRUNCATE, borrado de usuarios ni eliminación de tablas/datos históricos.
