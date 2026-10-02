# Fase 3E — Validación integral de Fase 3

Autorización del usuario: exclusivamente validación, seguridad, permisos, auditoría, regresión y correcciones técnicas necesarias de 3A–3D. Base de trabajo: bb8c810, limpio y sincronizado. Proyecto verificado SIGCA DEV pysgfnwsycgoneaecgcl. No nuevos módulos, Fase 4 ni tag final. A51 pendiente de producción; order_counters aislado intencionalmente.

## Plan y clasificación de evidencia

1. Inspección del contrato/documentos y esquema local/DEV, Security/Performance Advisors.
2. Suites SQL locales y DEV con ROLLBACK para cronología, historial y fallos controlados.
3. Recorrido integrado con JWT reales, separación de fuentes, matriz consolidada de permisos, Storage, concurrencia y responsive.
4. Regresiones reales necesarias de 3A/3B/3C/3D, E2E simulados y comandos de calidad.
5. Matriz final y PHASE3_CLOSURE; no declarar completo un caso real que solo haya sido simulado.

Estado: AUDITORÍA APROBADA POR EL USUARIO; FASE 3 CERRADA PARA DEV. Conteo: 20 criterios completos, 0 parciales funcionales, 0 pendientes funcionales de DEV. A51: 1 pendiente separado antes de producción. Fases posteriores: 1 NO APLICA. Todas las evidencias siguientes son nuevas ejecuciones de 3E, no aprobaciones anteriores heredadas.

## E3-01 — Caché de imágenes y perfil inactivo (reproducido en DEV)

Con JWT real de Colaborador se descargó un objeto de `order-references` y uno de `catalog-images`. Tras inactivar el perfil con Admin, repetir la misma descarga respondió con bytes; una petición con cacheNonce nuevo fue denegada. Se restauró el perfil activo y se desactivó el producto/imagen de prueba, conservando los objetos e historial. Evidencia local ignorada: `test-results/phase3e-storage-probe.json`.

Corrección técnica: extender el patrón aprobado de comprobantes a ambas rutas de imágenes. Los metadatos siguen autorizándose con JWT/RLS vigente; solamente los bytes usan infraestructura de servidor, nonce y no-store. No cambia quién puede consultar pedidos o catálogo. Migración nueva `20261001235914_phase3e_private_image_delivery.sql`: dos ALTER POLICY, dentro de transacción; sin DROP, nuevas tablas, grants, cambios de datos ni migraciones previas editadas.

Trazabilidad: `order_references_read` antes = bucket order-references + private.is_active() + existencia order_files.path; `catalog_images_read` antes = bucket catalog-images + private.is_active() + product_images activo o logo empresarial. Ambas pasan a USING(false) para acceso directo a Storage; las consultas RLS de metadatos permanecen intactas. Se invalidó solo caché de objetos existentes, conservando bytes/metadatos. Aplicación y verificación DEV completas: endpoints autorizados 200/no-store, SDK denegado, anónimo denegado y perfil inactivo sin descarga repetida.

## Verificaciones ejecutadas durante 3E (avance)

- 24 pruebas locales aprobadas tras ajustar las comparaciones de fase: 3C se compara al terminar 3C; 3D antes de 3E. La nueva prueba 3E exige que todos los contratos previos permanezcan iguales salvo las dos policies justificadas. No se omite una diferencia inesperada.
- Build Next.js 16.3.6, typecheck y lint aprobados antes de DEV; sin cambiar dependencias.
- Dry-run y aplicación exclusivos de 20261001235914. 17 versiones local/remoto coincidentes, ninguna migración aplicada editada. Caché de ambos buckets invalidada; archivos conservados.
- Huellas de Fase 3 iguales: columnas, constraints y validación, funciones, policies, índices, vistas/opciones, triggers/estado, grants de tabla/columna, EXECUTE y buckets. RLS activa; cero constraints sin validar y cero definers sin search_path seguro. Query reproducible: tests/sql/phase3e-schema.sql.
- El inventario exploratorio más amplio encontró seis wrappers de Fases 1/2 con EXECUTE service_role por privilegios predeterminados remotos (business_brand, duplicate_product, record_access, record_invitation, save_material, set_main_image), ausentes en el bootstrap mínimo local. No son objetos de Fase 3 ni confieren identidad de usuario a service_role: mantienen comprobaciones de perfil/funciones privadas. Se documenta esta diferencia previa sin cambiar sus grants fuera del alcance. Las huellas finales están explícitamente acotadas a objetos de Fase 3.
- Doce suites SQL DEV con transacción revertida: phase3a-verification/audit; phase3b-verification/history/zero-date/audit; phase3c-verification; phase3d-verification/permissions/rates-dev/audit; phase3e-atomicity. Incluyen fallos inducidos de auditoría, confirmación/contador, pagos/anulación, ingreso, gasto, asociación y reclasificación. Son ejecución PostgreSQL DEV con fixtures y rol SQL, **no JWT ni correo real**.
- Regresión JWT 3A: 92 comprobaciones; 3B: 219. Las ejecuciones de 3C/3D e integración terminaron; conteos finales más abajo.
- npm audit --omit=dev: cero vulnerabilidades. Escaneo de secretos privados en archivos versionables y assets de cliente: aprobado. .env.local ignorado; sin SMTP en aplicación ni artefactos de pruebas versionables.

## Fuentes financieras oficiales

| Evento comercial | Tabla fuente oficial | Tablas que NO deben duplicarlo |
|---|---|---|
| Cobro de pedido | payments | manual_income, expenses |
| Ingreso externo a pedidos | manual_income | payments, expenses |
| Salida/gasto | expenses | payments, manual_income |

La confirmación representa venta comprometida, no cobro. Entrega no crea un movimiento financiero. Los triggers de estas fuentes guardan auditoría y validan integridad; no crean movimientos en otra fuente. El recorrido integrado comprueba deltas de filas antes/después de cada alta.

## Aritmética y alcance negativo

Dinero viaja como texto decimal; cálculos autoritativos en numeric PostgreSQL. UI de pedidos usa bigint/céntimos exactos. Number en cantidad convierte exclusivamente integer validado; Math.round de alertas opera días. parseExpenseRate compara el lexema contra JSON para validar estructura, pero conserva y persiste el lexema original completo, sin usar la aproximación numérica para convertir CRC. Pruebas de precisión y HALF UP se mantienen.

Inventario de rutas revisado: pedidos, ingresos manuales y gastos, además de módulos previos. Sin implementación operativa de inventario/stock/consumo, cronómetro, envíos, costeo, utilidad/rentabilidad, reportes, dashboard financiero, conciliación o reembolsos. No tag final.

## Advisors finales — 2026-10-01 22:59 Costa Rica

Security: A51 WARN auth_leaked_password_protection pendiente antes de producción; INFO order_counters sin policies aceptado como aislamiento intencional. Cero hallazgos nuevos de seguridad. [A51](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection), [aislamiento RLS](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).

Performance: 23 INFO unused_index en la consulta final (24 al comenzar; payments_date_idx pasó a utilizarse). No se eliminaron índices. Clasificación: FKs/actores/historia (orders_client/creator/canceller, order_files_actor/replaces, payments_creator/voider, products_category, product_materials_material, manual_income_creator/voider, expenses_line/updater/voider/rate_actor, expense_files_uploader); filtros/listados (orders_confirmed, clients_name/active, materials_active_name, products_active_name, expenses_creator_date/date_status). Bajo uso de DEV no demuestra un costo perjudicial. Conservar y evaluar con carga representativa antes de optimizar. [Unused Index](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index).

## Matriz consolidada con JWT reales (36 combinaciones)

Cada fila prueba SELECT y DML directo con predicado imposible para UPDATE/DELETE (sin riesgo de borrar datos), además de RPC con payload inválido para distinguir autorización de validación. Las altas/operaciones válidas se prueban en recorridos 3A–3E, no se atribuyen a esos payloads inválidos. Las RPC de archivos son infraestructura y rechazan a todos los JWT de aplicación. El contador no tiene RPC pública de asignación.

| Tabla | Actor | SELECT | INSERT | UPDATE | DELETE | RPC (HTTP/código) |
|---|---|---|---|---|---|---|
| orders | Admin | autorizado bajo RLS | 403 | 403 | 403 | save_quote 400/22023 |
| order_items | Admin | autorizado bajo RLS | 403 | 403 | 403 | save_quote 400/22023 |
| order_files | Admin | autorizado bajo RLS | 403 | 403 | 403 | register_order_file 403/42501 |
| order_counters | Admin | sin filas/acceso | 403 | 403 | 403 | NO APLICA: contador interno sin RPC directa |
| payments | Admin | autorizado bajo RLS | 403 | 403 | 403 | register_payment 409/PT409 |
| manual_income | Admin | autorizado bajo RLS | 403 | 403 | 403 | register_manual_income 400/22023 |
| expense_categories | Admin | autorizado bajo RLS | 403 | 403 | 403 | save_expense_category 400/22023 |
| expenses | Admin | autorizado bajo RLS | 403 | 403 | 403 | register_expense 400/22023 |
| expense_files | Admin | autorizado bajo RLS | 403 | 403 | 403 | register_expense_file 403/42501 |
| orders | Colaborador | autorizado bajo RLS | 403 | 403 | 403 | save_quote 400/22023 |
| order_items | Colaborador | autorizado bajo RLS | 403 | 403 | 403 | save_quote 400/22023 |
| order_files | Colaborador | autorizado bajo RLS | 403 | 403 | 403 | register_order_file 403/42501 |
| order_counters | Colaborador | sin filas/acceso | 403 | 403 | 403 | NO APLICA: contador interno sin RPC directa |
| payments | Colaborador | autorizado bajo RLS | 403 | 403 | 403 | register_payment 409/PT409 |
| manual_income | Colaborador | sin filas/acceso | 403 | 403 | 403 | register_manual_income 403/42501 |
| expense_categories | Colaborador | autorizado bajo RLS | 403 | 403 | 403 | save_expense_category 403/42501 |
| expenses | Colaborador | autorizado bajo RLS | 403 | 403 | 403 | register_expense 400/22023 |
| expense_files | Colaborador | autorizado bajo RLS | 403 | 403 | 403 | register_expense_file 403/42501 |
| orders | Anónimo | sin filas/acceso | 401 | 401 | 401 | save_quote 401/42501 |
| order_items | Anónimo | sin filas/acceso | 401 | 401 | 401 | save_quote 401/42501 |
| order_files | Anónimo | sin filas/acceso | 401 | 401 | 401 | register_order_file 401/42501 |
| order_counters | Anónimo | sin filas/acceso | 401 | 401 | 401 | NO APLICA: contador interno sin RPC directa |
| payments | Anónimo | sin filas/acceso | 401 | 401 | 401 | register_payment 401/42501 |
| manual_income | Anónimo | sin filas/acceso | 401 | 401 | 401 | register_manual_income 401/42501 |
| expense_categories | Anónimo | sin filas/acceso | 401 | 401 | 401 | save_expense_category 401/42501 |
| expenses | Anónimo | sin filas/acceso | 401 | 401 | 401 | register_expense 401/42501 |
| expense_files | Anónimo | sin filas/acceso | 401 | 401 | 401 | register_expense_file 401/42501 |
| orders | Inactivo | sin filas/acceso | 403 | 403 | 403 | save_quote 403/42501 |
| order_items | Inactivo | sin filas/acceso | 403 | 403 | 403 | save_quote 403/42501 |
| order_files | Inactivo | sin filas/acceso | 403 | 403 | 403 | register_order_file 403/42501 |
| order_counters | Inactivo | sin filas/acceso | 403 | 403 | 403 | NO APLICA: contador interno sin RPC directa |
| payments | Inactivo | sin filas/acceso | 403 | 403 | 403 | register_payment 403/42501 |
| manual_income | Inactivo | sin filas/acceso | 403 | 403 | 403 | register_manual_income 403/42501 |
| expense_categories | Inactivo | sin filas/acceso | 403 | 403 | 403 | save_expense_category 403/42501 |
| expenses | Inactivo | sin filas/acceso | 403 | 403 | 403 | register_expense 403/42501 |
| expense_files | Inactivo | sin filas/acceso | 403 | 403 | 403 | register_expense_file 403/42501 |

Anónimo no presenta JWT: responde 401 por falta de privilegio; usuario autenticado sin privilegio responde 403. Inactivo conserva su JWT real, pero las lecturas no devuelven datos y RPC consulta perfil vigente. UUID ajenos de gastos/comprobantes se prueban adicionalmente en la auditoría 3D; pedidos operativos son compartidos según la política aprobada, no se inventó aislamiento por creador.

| Bucket | URL pública | UUID desconocido en endpoint SIGCA |
|---|---|---|
| catalog-images | 400 | 404 |
| order-references | 400 | 404 |
| expense-receipts | 400 | 404 |

## Resultados de recorridos y regresión

| Suite ejecutada nuevamente | Comprobaciones | DEV real | Simulación/inducción incluida |
|---|---:|---:|---:|
| 3A | 92 | 91 | 1 corte de red |
| 3B | 219 | 208 | 10 estrés DOM PED largo + 1 corte de red |
| 3C | 123 | 121 | 2 carga/red inducidas |
| 3D | 149 | 147 | 2 carga/red inducidas |
| Auditoría 3D | 175 | 175 | 0 |
| Integración 3E | 117 | 117 | 0 |
| Total de estas suites | 875 | 859 | 16 |

Adicionales, sin mezclar unidades: 36 combinaciones tabla/rol JWT (176 operaciones SELECT/DML/RPC; cuatro RPC de contador NO APLICA); seis comprobaciones URL pública/UUID inexistente en tres buckets; doce suites SQL PostgreSQL DEV con ROLLBACK y fallos controlados; 24 tests locales. 24 E2E simulados finales aprobados. Los 875 no son 875 requisitos ni incluyen las consultas exploratorias o el probe que reprodujo el defecto. Correo real no se volvió a probar en 3E.

Concurrencia real: confirmación/confirmación; edición/confirmación; pago/pago; pago/reducción; transición/transición; anulación pago/nuevo pago (3B); doble anulación de ingreso (3C); edición/anulación, doble reclasificación y aporte histórico mismo UUID (3D); reclasificación/anulación (3E). No hubo pérdida silenciosa, sobrepago ni consecutivo duplicado; el perdedor recibió conflicto 409 donde corresponde. Aportes históricos son evidencia propia de cada gasto, no escritura arbitraria del Colaborador en exchange_rates.

Rollback: alta de quote inválida y cancelación con fallo de auditoría (3A); confirmación revierte número/contador/adelanto (3B-history); ingreso y anulación (3C); gasto/asociación/reclasificación (3D); registro/anulación de pago y auditoría (3E). Ninguna prueba deja CHECK/trigger de fallo persistente. Storage y PostgreSQL **no** son una transacción distribuida: el test conserva un objeto privado huérfano tras conflicto de asociación, lo comprueba inaccesible y no lo elimina automáticamente.

Responsive: 320/375/768/1024/1440 en ambos roles. 3B prueba panel/pagos/modales, 3C alta/listado/detalle Admin y denegación Colaborador, 3D CRC/USD/comprobantes/reclasificación, y 3E añade 35 recorridos de pantallas integradas (25 Admin, 10 Colaborador). Sin overflow de página, fuentes/controles probados en suites previas repetidas y reduced-motion; foco de errores bajo red inducida. Fallback visual en ambos roles/cinco anchos se prueba en E2E **simulado**; selección/persistencia de fallback y ausencia de tasa se prueban en SQL DEV, y resolución ante caída/invalidez del proveedor en test local inducido. El proveedor devolvió tasa vigente durante el recorrido UI real, por lo que no se atribuye a este una caída real inexistente.

El test integrado se corrigió en dos puntos de instrumentación: reloj local aproximadamente 2,5 s atrasado respecto del servidor (se usa HTTP Date con resolución de 1 s; la BD sigue siendo autoritativa), y espera de la redirección transmitida por Next antes de verificar una ruta prohibida. No fueron cambios a reglas de fechas o permisos. Consulta global DEV posterior: cero fechas efectivas futuras en pedidos/pagos/ingresos/gastos. Ambos perfiles de prueba terminaron activos.

## Matriz final de requisitos

| Requisito | Estado | Evidencia | Entorno | Observación |
|---|---|---|---|---|
| E01 Flujo conjunto Cotización→cobro tras entrega + gasto/línea | COMPLETO | phase3e-real: etapas, saldo, revisión, historial | DEV JWT/UI | Catálogo y personalizada; sin rentabilidad |
| E02 Separación de fuentes | COMPLETO | Deltas payments/manual_income/expenses y triggers revisados | DEV JWT + código | Matriz de origen incluida |
| E03 Decimal, HALF UP, adelanto/saldo y USD | COMPLETO | Suites 3A/B/D y SQL 3E | Local + DEV | Lexemas/numeric autoritativos, sin sobrepago |
| E04 Snapshots y evidencia histórica | COMPLETO | Cliente/producto/categoría modificados; tasa/config SQL | DEV JWT + SQL | Anulaciones/reclasificación conservan originales |
| E05 Cronología global CR | COMPLETO | SQL 3B-history y 3E-atomicity; consulta fechas futuras | Local + DEV | Medianoche/cambio anual; no reloj local como BD |
| E06 Once escenarios de concurrencia | COMPLETO | Suites reales 3B/C/D/E | DEV, sesiones distintas | Conflictos sin mutación parcial |
| E07 Atomicidad/rollback | COMPLETO | Doce suites SQL; errores inducidos y huellas | Local + DEV SQL | Storage no atómico con PostgreSQL |
| E08 RLS consolidada / API / roles | COMPLETO | 36 filas de matriz JWT | DEV JWT | Contador aislado; sin DML financiero |
| E09 Storage integral | COMPLETO | Probe E3-01 + corrección + pruebas reales 3A/D/E | DEV Storage/JWT/UI | Tres buckets privados; sin borrado automático |
| E10 Auditoría reconstruible | COMPLETO | Eventos before/after/actor/motivo en 3A–E | DEV JWT + SQL | Colaborador sin audit_log general |
| E11 Navegación y contenido restringido | COMPLETO | Rutas conocidas y comprobación HTML/RSC | DEV UI | No basta ocultar menú |
| E12 Responsive/accesibilidad | COMPLETO | Cinco anchos/ambos roles; 35 recorridos integrados | DEV UI + simulación etiquetada | Fallback visual separado de caída real |
| E13 Dependencias y audit producción | COMPLETO | npm audit --omit=dev, lockfile sin cambios | Local | Next 16.3.6; cero vulnerabilidades |
| E14 Security Advisors | COMPLETO | Consulta final MCP | DEV | A51 separado; INFO contador aceptado |
| E15 Performance Advisors | COMPLETO | 23 unused_index INFO clasificados | DEV | Ningún índice eliminado |
| E16 Migraciones/esquema/grants/EXECUTE | COMPLETO | 17/17 versiones; dry-run vacío; huellas equivalentes | Local + DEV | Sin editar aplicadas; cero CHECK sin validar |
| E17 Calidad final lint/typecheck/tests/build/E2E | COMPLETO | lint/typecheck/build correctos; 24 tests y 24 E2E aprobados | Local + simulado | Build final restaurado con configuración real |
| E18 Alcance negativo | COMPLETO | Inventario rutas/tablas/funciones y diff | Repositorio + DEV | Sin fases posteriores ni tag |
| E19 Documentación y trazabilidad | COMPLETO | PHASE3E_VERIFICATION + PHASE3_CLOSURE | Repositorio | Evidencia diferenciada por entorno |
| E20 Secretos/Git/artefactos | COMPLETO | verify-secrets y diff --check | Repositorio/bundle | Repetido sobre build final: aprobado |
| A51 Protección contraseñas filtradas | PENDIENTE | Security Advisors WARN conocido | Producción | No bloquea DEV; no cambiar Auth/plan |
| Nuevos módulos/Fase 4 | NO APLICA | Fuera de autorización | — | No implementados |

## Cierre técnico y archivos

Los comandos finales lint, typecheck, npm test (24/24), build y test:e2e (24/24, simulados) terminaron con código 0. npm audit --omit=dev: 0 vulnerabilidades. Tras los E2E se reconstruyó con la configuración real; verify-secrets pasó sobre ese bundle. git diff --check sin errores; avisos LF/CRLF de Git no son errores de contenido. .env.local y test-results siguen ignorados. Ninguna migración previamente aplicada, package.json o lockfile modificados.

Estado previo al commit de cierre: base bb8c810, diez archivos modificados y diez nuevos, exclusivamente de auditoría 3E. No tag final. Archivos modificados: README.md; docs/ARCHITECTURE.md y DATABASE.md; src/app/api/catalog-image/[id]/route.ts y order-file/[id]/route.ts; src/features/catalog/images.ts y orders/files.ts; tests/phase3a-real.mjs, phase3c.test.mjs y phase3d.test.mjs. Archivos nuevos: docs/PHASE3E_VERIFICATION.md y PHASE3_CLOSURE.md; migración 20261001235914; tests/phase3e-real.mjs, phase3e-permissions-real.mjs, phase3e-storage-probe.mjs, phase3e.test.mjs; tests/sql/phase3e-atomicity.sql y phase3e-schema.sql; tests/support/real-session.mjs.

Único defecto funcional/técnico encontrado y corregido en esta auditoría: E3-01, descarga cacheada después de inactivación en dos buckets. Los otros ajustes son pruebas/evidencia: punto de comparación por fase, reloj del servidor y espera de redirección. No hay decisiones funcionales nuevas ni pasos manuales necesarios para DEV. A51 sigue siendo requisito previo de producción, sin cambios a Auth o plan. Los INFO de Performance se conservan clasificados; order_counters mantiene su aislamiento aprobado.

La conclusión de cierre se limita a DEV y al alcance de Fase 3. No se implementaron inventario, cronómetro, envíos, costeo, rentabilidad, reportes, conciliación, devoluciones ni Fase 4. No se eliminó información histórica ni se usó DROP/TRUNCATE/reset durante 3E. Los fixtures identificados se conservaron mediante cancelación/anulación/desactivación autorizada; no se borraron objetos huérfanos.


Cierre Git autorizado: `test: complete phase 3 integration audit and closure`. Verificación previa: 17 migraciones local/DEV coincidentes, dry-run sin pendientes, huellas equivalentes, diff sin errores y ausencia de secretos/artefactos versionables. A51 permanece obligatorio antes de producción; order_counters conserva aislamiento intencional y los 23 INFO de Performance permanecen documentados sin eliminar índices. No se autoriza Fase 4.
