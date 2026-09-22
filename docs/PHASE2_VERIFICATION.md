# Verificación de Fase 2 — SIGCA DEV

Fecha: 2026-09-22. Proyecto exclusivo: `pysgfnwsycgoneaecgcl` (SIGCA).
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
