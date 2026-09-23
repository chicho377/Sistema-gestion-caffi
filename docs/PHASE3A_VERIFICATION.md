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

## Matriz de alcance

| Requisito | Estado | Evidencia | Prueba | Observación |
|---|---|---|---|---|
| Crear/consultar/editar Cotización | COMPLETO | /pedidos, /pedidos/nuevo, /pedidos/[id], save_quote | UI/API DEV + SQL local/remoto | UUID; número y marcas de confirmación/entrega NULL |
| Cotización provisional sin líneas/total cero | COMPLETO | RPC admite colección vacía | SQL local/remoto | No equivale a confirmar cero; sin pagos |
| Catálogo, personalizada y varias líneas | COMPLETO | order_items y QuoteForm | UI DEV + SQL local/remoto | Personalizada no crea producto |
| Snapshots comerciales e inactivos posteriores | COMPLETO | Copia de catálogo validada por RPC | Cambiar/desactivar cliente/producto en DEV y editar pedido | Snapshot conserva nombre/descripción/precio aplicado |
| Desactivar líneas sin borrarlas | COMPLETO | is_active y recálculo | UI DEV + SQL local/remoto | Una fila omitida no puede borrarse por RPC |
| Dinero exacto y descuentos monetarios | COMPLETO | numeric, texto JSON, bigint de vista previa | Unitarias + SQL + total 24.00 en UI DEV | No float en aritmética de 3A; total autoritativo de BD |
| HALF UP y etapas de redondeo | COMPLETO | Dominio/round numeric y función de contrato decimal | 0.125→0.13; dos redondeos→0.26 frente a 0.25 al final | Fracciones de tres decimales son casos del núcleo de redondeo, no entradas comerciales permitidas |
| Rechazo >2 decimales/cantidades inválidas | COMPLETO | Validación cliente/servidor/RPC/constraints | Local + API DEV: 0, negativos, fracciones, NaN/Infinity | Cantidad entera dentro del rango integer de PostgreSQL |
| Cliente/producto activo para altas normales | COMPLETO | Validación RPC y opciones UI | SQL local/remoto | Excepción de histórico Admin aprobada; referencias existentes se conservan |
| Fechas/históricos/created_at | COMPLETO | Día America/Costa_Rica; reglas RPC | Medianoche local unitaria; SQL local/remoto; DML API denegado | Entrega >=order_date; pedido no futuro; histórico solo Admin |
| Alertas 7/6, <=5, atraso y cancelación | COMPLETO | QuoteAlert en listado/detalle | Unitarias de límites/medianoche + UI real | Texto e icono junto al color; sin integración ficticia de Dashboard |
| Búsqueda/filtros/paginación | COMPLETO | Cliente histórico/notas; estado; 25 por página | Listado filtrado real y vacío simulado | Opciones/detalle completos mediante lecturas paginadas |
| Cancelación motivada y terminal | COMPLETO | cancel_quote, SweetAlert2, actor/fecha/motivo | UI/API DEV + SQL local/remoto | Sin editar, reactivar, agregar archivos o borrar después |
| Atomicidad y concurrencia | COMPLETO | Bloqueo de perfil/pedido + revisión | Rollback SQL/API y carrera real entre roles | HTTP 409 para edición obsoleta; no se reintenta automáticamente |
| Admin/Colaborador/inactivo/anónimo | COMPLETO | RLS, grants y RPC | SQL real bajo roles + JWT real/API/UI | Inactivar revoca operaciones con JWT previo; reactivar restaura acceso |
| Totales/estado/actores no manipulables | COMPLETO | Lista de campos permitidos y DML revocado | API directa + SQL | No se usa ocultamiento visual como autorización |
| Archivos privados y versiones | COMPLETO | Bucket/policy, carga servidor, descarga con JWT | UI/Storage DEV | Bytes y metadatos anteriores preservados; sin URL pública |
| Validación de archivos | COMPLETO | Validador compartido normalizeImage | Local MIME/bytes/tamaño; PNG falso rechazado en UI real | No se confía en extensión; sin metadato tras rechazo |
| Auditoría y permiso de lectura | COMPLETO | Triggers y eventos explícitos | Admin verifica eventos; Colaborador sin lectura | No secretos ni binarios en log |
| private fuera de Data API | COMPLETO | Perfil de esquema no expuesto | RPC real a private devuelve PGRST106 | Sin exponer implementaciones privilegiadas |
| Loading/vacío/error/reintento | COMPLETO | Boundaries existentes + feedback de formularios | E2E con fallos/demoras simulados | No se presentan como caída real de Supabase |
| Responsive y sistema visual | COMPLETO | Tarjetas móviles, grillas, tokens/Lucide/Sonner/SweetAlert2 | Simulado y real: 320/375/768/1024/1440 | Sin scroll horizontal de página; revisión visual móvil/escritorio |
| Secretos/archivos temporales | COMPLETO | Entorno ignorado y validación de assets/manifiesto Git | Escaneo local | Sin claves privadas en .next/static o archivos versionables |
| Security Advisors sin hallazgos de 3A | COMPLETO | Consulta MCP posterior a migraciones | Supabase real | Ningún nuevo aviso RLS/funciones/tablas |
| Protección Auth de contraseñas filtradas | PENDIENTE | Aviso heredado de Fases 1/2 | Advisor real | Ajeno a 3A; no se cambió Auth/plan |
| Confirmación/consecutivos/adelanto/pagos | NO APLICA | Fuera de 3A, bloqueado por esquema/UI | Intento de estado/número por API denegado | Requiere autorización 3B |
| Ingresos/gastos/inventario/cronómetro/envíos/reportes | NO APLICA | Sin implementación en este lote | Revisión de alcance/dry-run | Subfases/fases posteriores |

## Evidencia ejecutada

### Local

- npm run lint: correcto, sin errores ni advertencias ESLint.
- npm run typecheck: correcto.
- npm test: 15 pruebas aprobadas, incluidas regresiones de Fases 1/2, aritmética/fechas de 3A y migraciones ejecutadas en PGlite (motor PostgreSQL local; Auth/Storage locales son esquemas mínimos de prueba).
- npm run build: correcto, rutas de pedidos y descarga compiladas.
- npm audit --omit=dev: 0 vulnerabilidades.
- git diff --check: correcto. .env.local ignorado; sin credenciales SMTP en ese archivo ni secretos privados encontrados en fuentes versionables/assets cliente. No nuevas dependencias ni variables de entorno.

### Simulada

npm run test:e2e: **20/20**, incluidas seis pruebas nuevas de 3A. Fixture HTTP local de Supabase; cubre navegación protegida, Auth/regresión, formularios, totales de vista previa, cantidades/precios inválidos, línea inactiva, estados vacíos, loading, error y recuperación. Las excepciones impresas al simular fallos son esperadas y verificadas por el test. No prueban persistencia remota ni envío de correos.

Revisión focalizada final de 3A: **6/6** tras ajustar la navegación del test de login (un contexto nuevo de Chromium había enviado Origin null al seguir la redirección inicial; el servidor lo rechazó correctamente). Se separó la verificación de ruta protegida de la navegación a login, sin flexibilizar controles de origen. También se verificó el formato exacto de totales mayores que el límite de longitud de cada entrada, sin pérdida de precisión.

### Supabase DEV real

- tests/sql/phase3a-verification.sql ejecutado en DEV con JWT claims y SET LOCAL ROLE authenticated/anon. Recorre RPC/constraints/RLS/auditoría/fechas/snapshots/rollback; revierte únicamente la transacción de sus fixtures. No modifica ni elimina datos previos.
- tests/phase3a-real.mjs: **45 comprobaciones aprobadas** sobre servidor Next.js local de producción, API real y navegador Chromium. Admin consulta UI y participa en edición concurrente; Colaborador crea/edita/cancela y usa Storage; pruebas negativas directas de columnas/DELETE/auditoría/private/anónimo/inactivo. Incluye archivo disfrazado, reemplazo y bytes anteriores, cinco tamaños en listado/detalle y reactivación de perfil.
- Cotización de la ejecución final: `181f76b7-b892-4476-bc7a-0fd8327995fc`, conservada Cancelada con motivo. Cliente/producto de prueba desactivados. Registros de ejecuciones de diagnóstico también conservados y cerrados; no se eliminaron usuarios ni información.
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
