# Verificación de Fase 3A — SIGCA DEV

Fecha: 2026-09-23. Proyecto exclusivo: `pysgfnwsycgoneaecgcl` (SIGCA desarrollo).

Checkpoint documental previo: `f0dfc9b docs: finalize phase 3 business rules`. Al crearlo solo estaban pendientes los cuatro documentos de reglas aprobadas. Implementación limitada a Cotización y su cancelación; no se implementó 3B. D-01 a D-21 permanecen vigentes. AGENTS.md y reference no se modificaron.

## Resultado y alcance

3A implementada y validada para desarrollo: listado/búsqueda/filtros, alta, detalle, edición, líneas de catálogo/personalizadas, snapshots, importes CRC, fechas empresariales, alertas, imágenes privadas versionadas, cancelación terminal y auditoría. No se generan número comercial, confirmación, adelanto ni pagos. Dashboard continúa como shell.

## Migraciones y equivalencia

1. `20260923055811_phase3a_quotes.sql`: orders, order_items, order_files, dominio quote_money, vistas comerciales, RPC, constraints/FKs/índices, RLS/grants, triggers y bucket privado.
2. `20260923110205_phase3a_conflict_response.sql`: reemplaza únicamente las funciones privadas save_quote/cancel_quote para responder PT409 ante revisión obsoleta o estado cambiado. Conserva firmas, ACL, controles y datos.

Ambas se probaron localmente antes de aplicarlas. Cada dry-run mostró exclusivamente la migración correspondiente de 3A, sin seeds ni roles. Aplicación solo a DEV. Siete versiones locales/remotas coinciden y el último dry-run devuelve upToDate=true, sin pendientes. No se editaron migraciones aplicadas; no hubo DROP, TRUNCATE, reset ni eliminación de usuarios/datos.

La prueba real de concurrencia detectó que SQLSTATE 40001 activaba reintentos de PostgREST en lugar de devolver el conflicto. Se corrigió con PT409/HTTP 409 y se repitió la carrera real: una edición gana, la otra se rechaza sin sobrescribir. Es una corrección técnica documentada por [Supabase](https://supabase.com/docs/guides/troubleshooting/high-cpu-and-infinite-transaction-retries-when-using-custom-error-codes-in-rpc-functions-77326b), no una nueva regla de negocio.

`tests/sql/phase3a-schema.sql` compara firmas del esquema local reconstruido con las siete migraciones y el remoto. Coinciden:

| Grupo | Huella local = remota |
|---|---|
| Columnas, tipos, nullabilidad y defaults de tablas/vistas de 3A | 1984d6450150e4514a0733e1cfc4fdee |
| Constraints CHECK/FK/PK/UNIQUE y dominio monetario | 09c20fc87c9df18e499af5094227d9b7 |
| Definiciones de funciones de 3A | e7a43d9397302aa02162da6aed4073c6 |
| Políticas de tablas y Storage de 3A | 871d37e8e458f2378a95c0bb2ad62e2e |
| Índices de las tres tablas | a08d41e425a2cddeccc428d42aa40d13 |

La nullabilidad se compara en information_schema.columns; se excluyen entradas pg_constraint de tipo n, representadas de forma diferente por versiones de PostgreSQL. Estas huellas de esquema no son credenciales. RLS activado, grants, ACL de funciones, triggers y bucket se inspeccionaron adicionalmente por SQL en DEV.

## Permisos y Storage

- Admin/Colaborador activos: SELECT operativo, crear/editar Cotización, cancelar con motivo y consultar/adjuntar referencias. Solo Admin puede elegir fecha histórica. Inactivo y anónimo carecen de acceso.
- Tablas: orders_read, order_items_read y order_files_read requieren private.is_active(); solo SELECT para authenticated. Sin INSERT/UPDATE/DELETE directos, tampoco DML directo de service_role en las tres tablas.
- save_quote/cancel_quote: wrappers invoker, implementaciones definer en private con search_path vacío y EXECUTE mínimo. Actor desde auth.uid(), perfil vigente, bloqueo de pedido y revisión optimista. Encabezado/líneas/totales/auditoría en la misma transacción.
- register_order_file: exclusivo servidor/service_role, después de validar perfil y bytes; vuelve a verificar actor/pedido/objeto/versión en BD. El navegador no suministra un actor administrativo confiable.
- Bucket order-references privado, máximo 5 MiB, image/webp. Entradas JPEG/PNG/WebP hasta 25 MP sin animación; valida MIME y contenido, recodifica con el validador existente de Fase 2. Nombres UUID, upsert=false.
- order_references_read exige perfil activo y metadato accesible por RLS. No hay políticas de carga, sobrescritura o borrado para el cliente. Descarga mediante /api/order-file/[id], JWT del usuario y Cache-Control: private, no-store.
- Reemplazos conservan metadatos y bytes anteriores. Una carga cuyo registro falle queda privada y sin acceso operativo, para revisión administrativa; no hay limpieza destructiva automática.
- Auditoría: trigger quote_audit en las tres tablas, before/after; quote.cancelled con motivo/actor; quote.file_registered con actor de servidor explícito. Colaborador no puede leer audit_log.

## Matriz de cierre auditada

Cada fila agrupa controles relacionados; COMPLETO exige evidencia real cuando corresponde a permisos, persistencia o Storage. Las pruebas puras de aritmética/fechas y los fallos inducidos se identifican expresamente.

| Requisito | Estado | Evidencia | Prueba | Observación |
|---|---|---|---|---|
| A01 · D-19/D-20/D-21: alta exclusivamente Cotización, UUID, sin número ni marcas de confirmación/entrega | COMPLETO | CHECK y save_quote; /pedidos | SQL local/DEV + API/UI real | order_number, confirmed_at y delivered_at NULL |
| A02 · Admin activo: crear, consultar y editar | COMPLETO | RPC y vistas invoker | SQL local/DEV como Admin; edición concurrente API; consulta UI | Fecha histórica permitida |
| A03 · Colaborador activo: crear, consultar y editar | COMPLETO | Mismo contrato operativo | API/UI DEV | Fecha empresarial actual para nuevas cotizaciones |
| A04 · Inactivo/anónimo: sin operación | COMPLETO | Perfil vigente, RLS y ACL | SQL DEV + JWT previo inactivado + API/descarga/UI | Reactivación restaura acceso |
| A05 · Sin DELETE físico ni escritura directa | COMPLETO | Grants SELECT; escritura mediante RPC | API directa para las tres tablas y ambos roles activos | No borrado automático de datos o usuarios |
| A06 · Catálogo y personalizadas; product_id NULL solo personalizada | COMPLETO | Validación RPC; nombre obligatorio; SKU nulo en personalizada | SQL local/DEV + UI real | No hay un tercer tipo implícito de línea |
| A07 · Cantidad entera positiva | COMPLETO | integer, CHECK, RPC y validación cliente | Unitarias/SQL/API DEV | Cero, negativos, fracción, NaN e Infinity rechazados |
| A08 · Snapshots SKU/nombre/descripción/precio aplicado | COMPLETO | order_items y validación de catálogo | Cambio de SKU/nombre/descr/precio/desactivación del producto en DEV | La modificación del catálogo no modifica valores históricos |
| A09 · Líneas desactivadas conservadas y excluidas del subtotal | COMPLETO | is_active; rechazo de omisión de filas | SQL DEV + edición UI | Desactivar no elimina |
| A10 · Personalizada no crea producto | COMPLETO | INSERT únicamente en order_items | SQL local/DEV compara cantidad de productos | No promoción automática al catálogo |
| A11 · Dinero numeric/decimal; sin float autoritativo | COMPLETO | quote_money numeric, vistas texto, bigint cliente | Inventario y huellas DEV + unitarias | Number se usa solo para cantidad entera acotada, no dinero |
| A12 · HALF UP: 0.125 → 0.13; suma de líneas redondeadas | COMPLETO | round(numeric,2), contrato halfUp | Unitarias y PostgreSQL local/DEV | 0.13+0.13=0.26 frente a redondear 0.250 al final=0.25; tres decimales no son entrada comercial admisible |
| A13 · Importes >2 decimales y valores no finitos/negativos rechazados | COMPLETO | quote_input_money y cents | Local, SQL DEV, API 0.125 y UI inválida | Sin redondeo silencioso de entrada |
| A14 · Subtotal, descuento monetario general y total | COMPLETO | RPC suma líneas activas, aplica descuento <=subtotal | SQL local/DEV y UI/API total 24.00 | El total de BD es autoritativo |
| A15 · Manipulación subtotal/total/estado/actor no autorizada | COMPLETO | Lista cerrada de payload y grants | SQL + API DEV | DML y campos extra rechazados |
| A16 · Zona America/Costa_Rica y fecha de creación real | COMPLETO | SQL now() AT TIME ZONE; businessDate; created_at servidor | SQL DEV, inspección y unitarias | No se recibe created_at desde el formulario |
| A17 · order_date no futura e histórico solo Admin | COMPLETO | Validación RPC por rol | SQL local/DEV + unitarias | Colaborador puede conservar la fecha original de una cotización existente |
| A18 · Entrega >=fecha del pedido y futuro admitido | COMPLETO | CHECK y RPC | SQL de auditoría DEV usa entrega a +8/+9 días | Se rechaza entrega anterior |
| A19 · Límites de medianoche de Costa Rica | COMPLETO | businessDate con zona explícita | Unitarias 05:59:59Z / 06:00:00Z | No se cambió el reloj de DEV; el contrato SQL usa la misma zona |
| A20 · Alerta exactamente 8 días: ninguna | COMPLETO | deliveryAlert | Unitaria con fecha fija | Comparación de fechas civiles, sin desfase UTC |
| A21 · Alertas exactamente 7 y 6 días: amarillo | COMPLETO | warning + texto/icono | Unitarias y revisión visual de componente | No depende solo del color |
| A22 · Alertas exactamente 5, 1 y hoy: rojo | COMPLETO | danger + texto/icono | Unitarias; hoy visible en DEV | Texto Entrega próxima |
| A23 · Vencido: rojo con días correctos; Cancelado sin alerta | COMPLETO | deliveryAlert y QuoteAlert | Unitarias (atraso 2 días) + UI cancelada | Sin integración ficticia de Dashboard |
| A24 · Cancelar Admin/Colaborador con motivo, actor y timestamp | COMPLETO | cancel_quote y SweetAlert2 | Admin SQL DEV; Colaborador UI/API DEV | Evento explícito quote.cancelled |
| A25 · Cancelado terminal: no editar/reactivar/adjuntar/borrar | COMPLETO | Estado, RPC, RLS y UI | SQL/API/UI DEV | Única transición 3A: Cotización → Cancelado |
| A26 · Dos sesiones, revisión obsoleta y HTTP 409 | COMPLETO | FOR UPDATE + revision + PT409 | Carrera Admin/Colaborador API DEV: un ganador y un status 409 | Sin última escritura gana silenciosa |
| A27 · Formulario conserva borrador ante conflicto | COMPLETO | Error sin navegación/revalidación exitosa | UI real frente a cambio desde segunda sesión | Se comprueban notas y precio local; BD conserva al ganador |
| A28 · Rollback: creación de encabezado + líneas | COMPLETO | Transacción RPC | Fallo en segunda línea, SQL local/DEV | Sin encabezado, líneas ni auditoría parcial |
| A29 · Rollback: edición de línea + recálculo | COMPLETO | Transacción RPC | Fallo del descuento tras actualizar la línea, SQL local/DEV | Comparación completa de encabezado/líneas/eventos |
| A30 · Rollback: desactivación + recálculo | COMPLETO | Transacción RPC | Descuento inválido después de is_active=false, SQL local/DEV | Estado y total originales conservados |
| A31 · Rollback: cancelación | COMPLETO | UPDATE y auditoría en misma transacción | Trigger de prueba falla al insertar quote.cancelled, SQL local/DEV | Trigger y fixtures revertidos; no persiste DDL de prueba |
| A32 · Rollback: asociación/reemplazo de archivo | COMPLETO | Registro transaccional después de carga | CHECK de tamaño falla después de desactivar versión, SQL local/DEV | Versión anterior y auditoría intactas; el objeto subido no se elimina automáticamente |
| A33 · Bucket privado, UUID y tamaño máximo | COMPLETO | order-references; 5 MiB; ruta padre/UUID | Inventario DEV, SQL y carga real | Servidor genera UUID; cliente no decide actor/path confiable |
| A34 · MIME/bytes reales, sin confiar en extensión | COMPLETO | normalizeImage JPEG/PNG/WebP; 25 MP; sin animación; recodificación | Unitarias del validador + PNG falso rechazado en UI DEV | Bucket solo admite WebP resultante |
| A35 · Acceso de archivos vinculado al pedido; sin URL pública permanente | COMPLETO | order_references_read + ruta con JWT; private, no-store | SQL objeto sin metadato oculto + API/Storage DEV activo/inactivo/anónimo | Todos los perfiles activos comparten acceso operativo aprobado; no existe propiedad individual de pedidos |
| A36 · Sin overwrite; versiones y bytes anteriores conservados | COMPLETO | upsert=false, replaces_id e is_active | Reemplazo real UI/Storage DEV | Sin DELETE de compensación |
| A37 · RLS/grants reales orders/order_items/order_files | COMPLETO | SELECT authenticated, private.is_active; DML revocado | Inventario + SQL DEV + matriz API real inferior | service_role tampoco tiene DML directo sobre las tres tablas |
| A38 · RPC archivos solo servidor y private no expuesto | COMPLETO | ACL service_role, PGRST106 para esquema private | API DEV y catálogo de ACL | Navegador no puede registrar actor suministrado |
| A39 · Auditoría de creación, cliente, entrega y notas | COMPLETO | orders.insert/update con before/after | Aserciones SQL local/DEV de campos concretos | No solo presencia genérica de evento |
| A40 · Auditoría de alta/edición/desactivación de línea, precio/descuento/recálculo | COMPLETO | order_items.insert/update y orders.update | Aserciones SQL local/DEV de valores anteriores/nuevos | Total 25.90, luego 1.00 tras desactivación |
| A41 · Auditoría de archivo y cancelación; sin lectura de Colaborador | COMPLETO | quote.file_registered / quote.cancelled | SQL DEV y API JWT real | Actor explícito de servidor; no binarios ni campos de credenciales en eventos |
| A42 · Búsqueda/filtros, listado y estados vacíos | COMPLETO | /pedidos; 25 por página; opciones/detalle paginados | Búsqueda real por fixture y vacío E2E simulado | La prueba de vacío no se presenta como base remota vacía |
| A43 · Loading, error y recuperación | COMPLETO | Boundaries y mensajes | E2E con demora/error de fixture | Fallo deliberado, no caída real del proveedor |
| A44 · Error de red conserva formulario y no escribe | COMPLETO | catch de acción y borrador | POST abortado en navegador conectado a DEV | Inyección de fallo de red: prueba híbrida, no interrupción real de Supabase |
| A45 · Responsive 320/375/768/1024/1440, edición y controles táctiles | COMPLETO | Tarjetas móviles; grillas; controles >=44 px aproximadamente | E2E simulado + listado/detalle y guardado UI real en cinco anchos | Medición sin overflow y controles >=43 px por redondeo; capturas móvil/escritorio |
| A46 · Lucide, SweetAlert2, Sonner, reduced-motion, labels/errores | COMPLETO | Componentes y estilos existentes; alerta accesible de importes | Revisión de código/UI, E2E reduced-motion y alerta por rol | No se afirma prueba con lectores de pantalla ni dispositivos físicos |
| A47 · Ausencia de 3B y fases posteriores en código/rutas/esquema | COMPLETO | Inventario DEV y rutas de build; constraints NULL | Inspección de funciones/tablas; API intenta estado/número y falla | Sin confirmación, counters, payments, ingresos, gastos, inventario, cronómetro, envíos, utilidad o reportes operativos |
| A48 · Segunda migración exclusivamente técnica | COMPLETO | Solo private.save_quote/private.cancel_quote | Test compara ambas definiciones exactas y normaliza únicamente CREATE OR REPLACE y SQLSTATE | 40001 → PT409; no otro DDL ni decisión funcional |
| A49 · Secretos y artefactos fuera de Git/browser | COMPLETO | Entorno ignorado y escaneo de manifiesto/assets | Escaneo local sin imprimir valores | Sin credenciales privadas, SMTP, capturas ni temporales versionables |
| A50 · Security Advisors sin hallazgos nuevos de 3A | COMPLETO | Consulta MCP real | Solo aviso Auth heredado | No se cambió plan/configuración Auth |
| A51 · Protección de contraseñas filtradas | PENDIENTE | auth_leaked_password_protection WARN | Security Advisors DEV | PENDIENTE para producción; por decisión del usuario no bloquea DEV. Sin cambios de Auth ni de plan en este cierre |
| A52 · Porcentajes >2 decimales en operaciones de 3A | NO APLICA | No hay entrada porcentual en cotizaciones: descuentos monetarios | Contrato de payload cerrado | No se afirma haber probado un cálculo porcentual inexistente; corresponde a subfase autorizada posterior |
| A53 · Confirmación, PED anual, autorización de total cero final, adelanto y pagos | NO APLICA | D-19/D-20/D-21: reglas documentadas, aún no habilitadas | Ausencia y bloqueo comprobados en fila de alcance | Cotización provisional vacía/cero sí permitida; no equivale a venta final cero |
| A54 · Finanzas tras Confirmado/Entregado, sobrepagos, cancelación con pagos y ventas realizadas | NO APLICA | Decisiones vigentes para implementación posterior | Sin motor de pagos/estados futuros en 3A | No implementado ni evaluado como funcionalidad terminada |

Totales: COMPLETO = 50; PARCIAL = 0; PENDIENTE = 1; NO APLICA = 3.

## Evidencia ejecutada

### Local

- npm run lint: correcto, sin errores ni advertencias ESLint.
- npm run typecheck: correcto.
- npm test: 16 pruebas aprobadas, incluidas regresiones de Fases 1/2, aritmética/fechas de 3A y migraciones ejecutadas en PGlite (motor PostgreSQL local; Auth/Storage locales son esquemas mínimos de prueba).
- npm run build: correcto, rutas de pedidos y descarga compiladas.
- npm audit --omit=dev: 0 vulnerabilidades.
- git diff --check: correcto. .env.local ignorado; sin credenciales SMTP en ese archivo ni secretos privados encontrados en fuentes versionables/assets cliente. No nuevas dependencias ni variables de entorno.

### Simulada

npm run test:e2e: **20/20**, incluidas seis pruebas nuevas de 3A. Fixture HTTP local de Supabase; cubre navegación protegida, Auth/regresión, formularios, totales de vista previa, cantidades/precios inválidos, línea inactiva, estados vacíos, loading, error y recuperación. Las excepciones impresas al simular fallos son esperadas y verificadas por el test. No prueban persistencia remota ni envío de correos.

Revisión focalizada final de 3A: **6/6** tras ajustar la navegación del test de login (un contexto nuevo de Chromium había enviado Origin null al seguir la redirección inicial; el servidor lo rechazó correctamente). Se separó la verificación de ruta protegida de la navegación a login, sin flexibilizar controles de origen. También se verificó el formato exacto de totales mayores que el límite de longitud de cada entrada, sin pérdida de precisión.

### Supabase DEV real

- tests/sql/phase3a-verification.sql y tests/sql/phase3a-audit.sql ejecutados en DEV con JWT claims y SET LOCAL ROLE authenticated/anon. Recorre RPC/constraints/RLS/auditoría/fechas/snapshots/rollback; revierte únicamente la transacción de sus fixtures. No modifica ni elimina datos previos.
- tests/phase3a-real.mjs: **92 comprobaciones aprobadas** sobre servidor Next.js local de producción, API real y navegador Chromium. Incluye una comprobación híbrida de POST abortado deliberadamente, diferenciada de una caída real del proveedor. Admin consulta UI y participa en edición concurrente; Colaborador crea/edita/cancela y usa Storage; pruebas negativas directas de columnas/INSERT/UPDATE/DELETE de las tres tablas, auditoría/private/anónimo/inactivo. Incluye conflicto HTTP 409 y borrador intacto, archivo disfrazado, URL pública bloqueada, reemplazo y bytes anteriores, controles táctiles y guardado real en cinco tamaños, listado/detalle y reactivación de perfil.
- Cotización de la ejecución final: `a133b934-cc24-436a-897a-067cd24b6e2f`, conservada Cancelada con motivo. Cliente/producto de prueba desactivados. Registros de ejecuciones de diagnóstico también conservados y cerrados; no se eliminaron usuarios ni información.
- Evidencia local no versionada: test-results/phase3a-real-summary.json, phase3a-local-schema.json, phase3a-real-detail-{ancho}.png y capturas simuladas. El informe conserva los resultados aunque una futura ejecución de Playwright limpie esa carpeta.
- No se enviaron correos ni cambiaron contraseñas durante esta fase. El acceso de pruebas usa sesiones aisladas en memoria de cuentas previamente autorizadas.

### Responsive

| Ancho | Simulado | Listado/detalle real | Revisión |
|---|---|---|---|
| 320 | Aprobado | Aprobado | Sin desbordamiento; campos/líneas apilados |
| 375 | Aprobado | Aprobado | Navegación móvil y controles accesibles |
| 768 | Aprobado | Aprobado | Grilla adaptada a tablet |
| 1024 | Aprobado | Aprobado | Sidebar y edición en columnas |
| 1440 | Aprobado | Aprobado | Tabla/listado y detalle completos |

La comprobación automatizada mide scrollWidth <= innerWidth; se revisaron además capturas de 320 y 1440. Se conserva prefers-reduced-motion global y su prueba E2E de regresión. No se afirma haber probado navegadores físicos iOS/Android o lectores de pantalla.

## Security Advisors y límites

Resultado real: únicamente el aviso heredado auth_leaked_password_protection (WARN). Sin nuevos hallazgos de seguridad correspondientes a 3A. [Configuración y limitaciones del proveedor](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). No se modificó el plan ni configuración Auth ajena a esta fase.

No quedan decisiones funcionales nuevas bloqueantes para 3A. Seguridad frente a DML directo y concurrencia fue comprobada en DEV; validación de gran volumen y navegadores físicos no forman parte de estas evidencias. El manejo de archivos fallidos preserva el objeto privado sin borrado automático. Confirmación, números, depósitos, pagos y resto del ciclo requieren 3B: no se simularon ni se implementaron.

## Archivos del lote

- Nuevos: src/app/(private)/pedidos/page.tsx, pedidos/[id]/page.tsx; src/app/api/order-file/[id]/route.ts; src/components/quote-form.tsx; src/features/orders/{domain,actions,files,alert}; las dos migraciones citadas; tests/phase3a.test.mjs, tests/phase3a-real.mjs, tests/e2e/phase3a.spec.ts, tests/sql/phase3a-verification.sql y phase3a-schema.sql; este informe.
- Actualizados: src/components/app-shell.tsx, src/proxy.ts, src/app/globals.css, tsconfig.json (ES2020 para bigint), tests/support/supabase-fixture.mjs, README.md y docs/{REQUIREMENTS,ARCHITECTURE,DATABASE,DECISIONS}.md.
- Sin modificaciones funcionales a Fases 1/2; sin cambios a AGENTS.md/reference, dependencias, SMTP o secretos.

## Auditoría de cierre posterior a b185a40

La implementación aceptada provisionalmente estaba confirmada en b185a40 y Git limpio al comenzar. Se mantuvieron las reglas D-19/D-20/D-21. Corrección de interfaz: el error de cálculo ahora usa role=alert y estilo de error, sin cambiar validaciones ni reglas. Se ampliaron las pruebas SQL transaccionales, API/UI real, comparación exacta de la segunda migración e inventario reproducible. No se crearon nuevas migraciones ni objetos permanentes remotos.

La nueva prueba real espera la carga inicial antes de escribir y comprueba el borrador antes y después de un 409. En el primer diagnóstico la escritura había coincidido con la carga del textarea; también se corrigió el comparador de snapshots para equiparar 12.5 y 12.50 mediante céntimos exactos y se seleccionó la línea personalizada por identidad en vez de asumir su posición tras recargar (el detalle ordena por created_at/id). No se modificó el mecanismo de concurrencia por estas diferencias del ensayo.

### Matriz de acceso comprobada en DEV

| Tabla | Admin | Colaborador | Inactivo | Anónimo | Policies | Grants |
|---|---|---|---|---|---|---|
| orders | SELECT; crear/editar/cancelar por RPC | Igual, histórico nuevo no permitido | Sin lectura/escritura | Sin lectura/escritura | orders_read → private.is_active() | authenticated: SELECT; sin INSERT/UPDATE/DELETE |
| order_items | SELECT; cambios por save_quote | Igual | Sin lectura/escritura | Sin lectura/escritura | order_items_read → private.is_active() | authenticated: SELECT; sin INSERT/UPDATE/DELETE |
| order_files | SELECT; registrar por servidor validado | Igual | Sin lectura/descarga/registro | Sin lectura/descarga/registro | order_files_read → private.is_active() | authenticated: SELECT; sin INSERT/UPDATE/DELETE |

Los tres grants se verificaron en catálogo remoto y con llamadas directas JWT Admin/Colaborador/anónimo/inactivo. Los wrappers públicos save_quote/cancel_quote tienen EXECUTE para authenticated; register_order_file solo service_role. La RLS se refuerza con la comprobación activa dentro de cada función definer. El privilegio postgres propietario se limita a tareas administrativas, no es un rol de aplicación.

### Inventario completo de objetos de las dos migraciones

Fuente: tests/sql/phase3a-inventory.sql ejecutado contra DEV. La segunda migración reemplaza dos cuerpos de función; no agrega objetos.

- Tablas: `public.order_files`, `public.order_items`, `public.orders`.
- Vistas: `public.quote_items_read`, `public.quote_products_read`, `public.quotes_read`, todas security_invoker=true y SELECT authenticated.
- Dominio: `public.quote_money`, numeric con CHECK enumerado abajo.
- Triggers: `public.orders.quote_audit`, `public.order_items.quote_audit`, `public.order_files.quote_audit`, AFTER INSERT OR UPDATE → private.audit_catalog() (función preexistente de Fase 2).
- Políticas: `public.orders.orders_read`, `public.order_items.order_items_read`, `public.order_files.order_files_read`, `storage.objects.order_references_read`. Todas SELECT authenticated.
- Storage: `order-references`, privado, 5242880 bytes, MIME image/webp; order_references_read exige perfil activo y metadato RLS visible. Sin nuevas policies INSERT/UPDATE/DELETE.

Funciones (los tres wrappers public son las RPC):

| Función y firma | Seguridad | EXECUTE de aplicación |
|---|---|---|
| `public.cancel_quote(target uuid, expected_revision integer, reason text)` | INVOKER, search_path vacío | authenticated |
| `private.cancel_quote(target uuid, expected_revision integer, reason text)` | DEFINER, search_path vacío | authenticated |
| `private.quote_input_money(v text)` | INVOKER, search_path vacío | ninguno |
| `public.register_order_file(actor uuid, target uuid, object_path text, caption_text text, size_bytes integer, replaces uuid)` | INVOKER, search_path vacío | service_role |
| `private.register_order_file(actor uuid, target uuid, object_path text, caption_text text, size_bytes integer, replaces uuid)` | DEFINER, search_path vacío | service_role |
| `public.save_quote(target uuid, expected_revision integer, payload jsonb)` | INVOKER, search_path vacío | authenticated |
| `private.save_quote(target uuid, expected_revision integer, payload jsonb)` | DEFINER, search_path vacío | authenticated |

Índices: 16 (11 explícitos y 5 de PK/UNIQUE).

| Índice | Definición |
|---|---|
| `order_files_pkey` | `CREATE UNIQUE INDEX order_files_pkey ON public.order_files USING btree (id)` |
| `order_files_path_key` | `CREATE UNIQUE INDEX order_files_path_key ON public.order_files USING btree (path)` |
| `order_files_order_idx` | `CREATE INDEX order_files_order_idx ON public.order_files USING btree (order_id)` |
| `order_files_actor_idx` | `CREATE INDEX order_files_actor_idx ON public.order_files USING btree (uploaded_by)` |
| `order_files_replaces_idx` | `CREATE INDEX order_files_replaces_idx ON public.order_files USING btree (replaces_id)` |
| `order_items_pkey` | `CREATE UNIQUE INDEX order_items_pkey ON public.order_items USING btree (id)` |
| `order_items_order_id_id_key` | `CREATE UNIQUE INDEX order_items_order_id_id_key ON public.order_items USING btree (order_id, id)` |
| `order_items_product_idx` | `CREATE INDEX order_items_product_idx ON public.order_items USING btree (product_id)` |
| `orders_pkey` | `CREATE UNIQUE INDEX orders_pkey ON public.orders USING btree (id)` |
| `orders_client_idx` | `CREATE INDEX orders_client_idx ON public.orders USING btree (client_id)` |
| `orders_delivery_idx` | `CREATE INDEX orders_delivery_idx ON public.orders USING btree (production_status, requested_delivery_date)` |
| `orders_created_idx` | `CREATE INDEX orders_created_idx ON public.orders USING btree (created_at DESC, id)` |
| `orders_creator_idx` | `CREATE INDEX orders_creator_idx ON public.orders USING btree (created_by)` |
| `orders_updater_idx` | `CREATE INDEX orders_updater_idx ON public.orders USING btree (updated_by)` |
| `orders_canceller_idx` | `CREATE INDEX orders_canceller_idx ON public.orders USING btree (cancelled_by)` |
| `orders_zero_actor_idx` | `CREATE INDEX orders_zero_actor_idx ON public.orders USING btree (zero_total_authorized_by)` |

Constraints CHECK/FK/PK/UNIQUE y dominio: 39. Todas las FKs usan ON DELETE RESTRICT.

| Objeto | Constraint | Definición |
|---|---|---|
| `order_items` | `order_items_product_id_fkey` | `FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT` |
| `orders` | `orders_notes_check` | `CHECK ((length(notes) <= 3000))` |
| `quote_money` | `quote_money_check` | `CHECK (((VALUE >= (0)::numeric) AND (VALUE < 'Infinity'::numeric) AND (scale(VALUE) <= 2)))` |
| `orders` | `orders_check` | `CHECK ((requested_delivery_date >= order_date))` |
| `orders` | `orders_production_status_check` | `CHECK ((production_status = ANY (ARRAY['quote'::text, 'cancelled'::text])))` |
| `orders` | `orders_currency_check` | `CHECK ((currency = 'CRC'::text))` |
| `orders` | `orders_check1` | `CHECK ((((discount_amount)::numeric <= (subtotal)::numeric) AND ((total)::numeric = ((subtotal)::numeric - (discount_amount)::numeric))))` |
| `orders` | `orders_order_number_check` | `CHECK ((order_number IS NULL))` |
| `orders` | `orders_confirmed_at_check` | `CHECK ((confirmed_at IS NULL))` |
| `orders` | `orders_delivered_at_check` | `CHECK ((delivered_at IS NULL))` |
| `orders` | `orders_zero_total_authorized_by_check` | `CHECK ((zero_total_authorized_by IS NULL))` |
| `orders` | `orders_zero_total_authorized_at_check` | `CHECK ((zero_total_authorized_at IS NULL))` |
| `orders` | `orders_zero_total_reason_check` | `CHECK ((zero_total_reason IS NULL))` |
| `order_items` | `order_items_order_id_id_key` | `UNIQUE (order_id, id)` |
| `order_items` | `order_items_order_id_fkey` | `FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE RESTRICT` |
| `orders` | `orders_revision_check` | `CHECK ((revision > 0))` |
| `orders` | `orders_check2` | `CHECK ((((production_status = 'quote'::text) AND (cancelled_at IS NULL) AND (cancelled_by IS NULL) AND (cancel_reason IS NULL)) OR ((production_status = 'cancelled'::text) AND (cancelled_at IS NOT NULL) AND (cancelled_by IS NOT NULL) AND ((length(TRIM(BOTH FROM cancel_reason)) >= 1) AND (length(TRIM(BOTH FROM cancel_reason)) <= 1000)))))` |
| `orders` | `orders_pkey` | `PRIMARY KEY (id)` |
| `orders` | `orders_client_id_fkey` | `FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE RESTRICT` |
| `orders` | `orders_zero_total_authorized_by_fkey` | `FOREIGN KEY (zero_total_authorized_by) REFERENCES profiles(id) ON DELETE RESTRICT` |
| `orders` | `orders_created_by_fkey` | `FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE RESTRICT` |
| `orders` | `orders_updated_by_fkey` | `FOREIGN KEY (updated_by) REFERENCES profiles(id) ON DELETE RESTRICT` |
| `orders` | `orders_cancelled_by_fkey` | `FOREIGN KEY (cancelled_by) REFERENCES profiles(id) ON DELETE RESTRICT` |
| `order_items` | `order_items_product_name_snapshot_check` | `CHECK (((length(TRIM(BOTH FROM product_name_snapshot)) >= 1) AND (length(TRIM(BOTH FROM product_name_snapshot)) <= 120)))` |
| `order_items` | `order_items_description_snapshot_check` | `CHECK ((length(description_snapshot) <= 3000))` |
| `order_items` | `order_items_quantity_check` | `CHECK ((quantity > 0))` |
| `order_items` | `order_items_customization_check` | `CHECK ((length(customization) <= 3000))` |
| `order_items` | `order_items_notes_check` | `CHECK ((length(notes) <= 3000))` |
| `order_items` | `order_items_check` | `CHECK ((((discount_amount)::numeric <= ((quantity)::numeric * (unit_price)::numeric)) AND ((line_total)::numeric = round((((quantity)::numeric * (unit_price)::numeric) - (discount_amount)::numeric), 2))))` |
| `order_items` | `order_items_pkey` | `PRIMARY KEY (id)` |
| `order_files` | `order_files_caption_check` | `CHECK ((length(caption) <= 300))` |
| `order_files` | `order_files_mime_type_check` | `CHECK ((mime_type = 'image/webp'::text))` |
| `order_files` | `order_files_byte_size_check` | `CHECK (((byte_size >= 1) AND (byte_size <= 5242880)))` |
| `order_files` | `order_files_path_check` | `CHECK ((path ~ '^orders/[a-f0-9-]{36}/[a-f0-9-]{36}\.webp$'::text))` |
| `order_files` | `order_files_pkey` | `PRIMARY KEY (id)` |
| `order_files` | `order_files_path_key` | `UNIQUE (path)` |
| `order_files` | `order_files_order_id_fkey` | `FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE RESTRICT` |
| `order_files` | `order_files_uploaded_by_fkey` | `FOREIGN KEY (uploaded_by) REFERENCES profiles(id) ON DELETE RESTRICT` |
| `order_files` | `order_files_replaces_id_fkey` | `FOREIGN KEY (replaces_id) REFERENCES order_files(id) ON DELETE RESTRICT` |

NOT NULL: `order_files.id`, `order_files.order_id`, `order_files.path`, `order_files.caption`, `order_files.mime_type`, `order_files.byte_size`, `order_files.uploaded_by`, `order_files.is_active`, `order_files.created_at`, `order_files.updated_at`, `order_items.id`, `order_items.order_id`, `order_items.product_name_snapshot`, `order_items.description_snapshot`, `order_items.quantity`, `order_items.unit_price`, `order_items.discount_amount`, `order_items.line_total`, `order_items.customization`, `order_items.notes`, `order_items.is_active`, `order_items.created_at`, `order_items.updated_at`, `orders.id`, `orders.client_id`, `orders.client_snapshot`, `orders.order_date`, `orders.requested_delivery_date`, `orders.production_status`, `orders.currency`, `orders.subtotal`, `orders.discount_amount`, `orders.total`, `orders.notes`, `orders.revision`, `orders.created_by`, `orders.updated_by`, `orders.created_at`, `orders.updated_at`.

El inventario remoto de tablas públicas contiene únicamente: `audit_log`, `clients`, `exchange_rates`, `material_costs`, `materials`, `order_files`, `order_items`, `orders`, `product_categories`, `product_images`, `product_materials`, `products`, `profiles`, `settings`. Se inspeccionaron adicionalmente las funciones public/private: no existe RPC de confirmación ni objetos de fases futuras. Los textos PED del formato en Configuración y las reglas documentales no generan números ni constituyen implementación de 3B.

## Cierre de esta auditoría

- 50 COMPLETO, 0 PARCIAL, 1 PENDIENTE heredado de Auth, 3 NO APLICA a 3A. No se detectó una nueva decisión funcional que requiera aprobación.
- lint, typecheck y build correctos; 16/16 tests locales, 20/20 E2E simuladas, 92 comprobaciones de la suite DEV (incluye fallo de red inducido); npm audit --omit=dev: 0 vulnerabilidades.
- SQL de atomicidad y eventos ejecutado en PostgreSQL local y Supabase DEV; siete versiones de migración coinciden y las cinco huellas de esquema siguen iguales. No se hizo db push porque no hay cambios de esquema.
- Corrección funcional técnica: anuncio accesible del error de importes; sin cambio de cálculos, permisos o decisiones. Fortalecimiento de pruebas y evidencia documental descritos arriba.
- Git: checkpoint b185a40 preservado; cierre autorizado con los siete archivos de esta auditoría (cinco modificados y dos nuevos), bajo el mensaje test: complete phase 3a audit and validation. git diff --check correcto; .env.local, test-results y artefactos ignorados; escaneo sin secretos privados en archivos versionables ni assets del navegador.
- Modificados: docs/PHASE3A_VERIFICATION.md, src/components/quote-form.tsx, tests/e2e/phase3a.spec.ts, tests/phase3a-real.mjs y tests/phase3a.test.mjs. Nuevos: tests/sql/phase3a-audit.sql y tests/sql/phase3a-inventory.sql.
- No hubo DROP, TRUNCATE, reset ni eliminación de usuarios; los intentos DELETE de prueba fueron denegados por permisos y no borraron registros. Las cotizaciones de diagnóstico quedaron canceladas y sus clientes/productos desactivados; el Colaborador quedó activo. Los fixtures SQL solo existieron dentro de transacciones revertidas.
- No se avanzó a 3B. No se escribió código ni migraciones de confirmación, consecutivos, adelantos, pagos ni demás fases.

### Cierre formal autorizado

Fase 3A cerrada formalmente para desarrollo por instrucción del usuario. A51 (auth_leaked_password_protection) permanece PENDIENTE para producción y no bloquea DEV. Este cierre no modifica Supabase Auth ni el plan contratado y no autoriza implementar 3B.
