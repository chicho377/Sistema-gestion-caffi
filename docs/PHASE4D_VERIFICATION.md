# Fase 4D — Envíos y entregas

Fecha: 2026-10-15. Proyecto único: SIGCA DEV `pysgfnwsycgoneaecgcl`. D-22 y precisiones aprobadas el 14/15 de octubre; D-01..D-24 conservadas. Cierre previo 4C: `fb44ed7`, tag `v0.10-phase4c`.

## Matriz de auditoría

| Requisito | Estado | Evidencia | Entorno | Observación |
|---|---|---|---|---|
| Envío único y alta desde Confirmado | COMPLETO | phase4d-scenarios, UNIQUE order_id | Local + DEV JWT | No reemplazo de cancelado por segundo registro |
| Shipping/personal_delivery/pickup | COMPLETO | scenarios, UI | Local + DEV real | Retiro omite shipped |
| Avance y estado del pedido | COMPLETO | scenarios, carreras | DEV real | Despacho ready; entrega ready/delivered; operación independiente de pedido |
| Retroceso administrativo | COMPLETO | scenarios + UI | DEV real | Un paso, motivo, fechas activas limpiadas; historia auditada |
| Cancelación terminal | COMPLETO | scenarios + UI | DEV real | No directa desde delivered; conserva despacho real |
| Dirección snapshot | COMPLETO | phase4d-ui-real | DEV real | Copia dirección del cliente al crear; no del snapshot comercial sin dirección |
| Dirección/transportista/guía | COMPLETO | scenarios | Local + DEV real | Shipping exige dirección y transportista; guía opcional |
| Cronología e históricos | COMPLETO | scenarios; shipment_order_dates | Local + DEV real | No futuro, >= confirmación y entrega >= despacho; Admin motivado |
| Costos privados CRC | COMPLETO | RLS y UI HTML/RSC | DEV real JWT/UI | Tabla financiera separada; decimales como texto en vista |
| Gasto mismo pedido/CRC/válido | COMPLETO | scenarios | Local + DEV real | Validación al vincular; no gasto automático |
| Exclusión envío/recepción | COMPLETO | phase4d-real | DEV real concurrente | Advisory compartido en ambos caminos, incluidos RPC 4A existentes |
| Anulación y reemplazo de gasto | COMPLETO | scenarios; carrera anulación/vínculo | DEV real | Mantiene vínculo anulado; sustitución explícita no cambia snapshot de costo |
| RLS/grants y perfiles | COMPLETO | phase4d-real | JWT Admin/Colaborador/inactivo/anónimo | DML denegado en tablas; vista no actualizable; perfil vigente |
| Idempotencia/revisión | COMPLETO | scenarios + phase4d-real | DEV real concurrente | UUID mismo efecto, payload distinto y revisión vieja PT409 |
| Concurrencia con pedido | COMPLETO | phase4d-real | Sesiones JWT independientes | Mismo lock de pedido; estado revalidado después del lock |
| Rollback | COMPLETO | phase4d-rollback.sql | Local + DEV con fallos inducidos | Alta y registro financiero sin cambios parciales; transacción revertida |
| Auditoría before/after | COMPLETO | phase4d-real | DEV real | Ocho operaciones, actor/fecha/motivo; sin lectura Colaborador |
| Responsive | COMPLETO | phase4d-ui-real | DEV real UI | Ambos roles 320/375/768/1024/1440, controles táctiles y reduced-motion |
| Red/conflicto y recuperación UI | PARCIAL | phase4d-network-real | DEV + red inducida | Pendiente finalizar ejecución específica |
| Regresión/calidad/equivalencia | COMPLETO | suites + CLI + Advisors | Local/simulado/DEV | 310 regresiones reales; 27 migraciones equivalentes, dry-run vac�o |

## Modelo y seguridad

- `shipments`: datos operativos, UUID, order_id único, tipo/estado, dirección snapshot, transportista, guía/notas, fechas, revisión y actores. FKs e índices; RLS de lectura para perfiles activos. Datos sensibles de costos no existen en esta tabla.
- `shipment_finances`: pagador, snapshot costo CRC, expense_id vigente exclusivo y metadatos. RLS solo Admin. `shipment_finances_read` security_invoker convierte importes numeric a texto y muestra estado/importe del gasto oficial, incluido «gasto anulado».
- `shipment_requests`: UUID, actor, fingerprint, revisión resultado y operación. RLS actor/Admin activo. Respuestas de escritura solo UUID; nunca devuelven datos financieros.
- `shipment_operate`: wrapper invoker público / helper privado definer; search_path vacío, grants mínimos, perfil vigente. create/edit/advance/back/cancel/correct/finance/link. Sin DML de aplicación ni permisos nuevos de usuario.
- Locks: perfil FOR SHARE → UUID de solicitud → pedido FOR UPDATE → shipment → finanzas/gasto. Exclusión de gasto mediante advisory compartido con trigger aditivo en inventory_receipt_expenses. Se conserva FOR SHARE de 4A sobre expense para evitar upgrades de lock. Un gasto puede anularse después de vincularse, sin modificar shipment ni perder referencia.
- Cancelado terminal. Correcciones de tipo/dirección posteriores al despacho requieren retroceso. Fechas previas quedan en audit_log. El guard aditivo de orders impide que una corrección de confirmed_at invalide fechas de envío, sin modificar transition_order.
- Costos customer_direct son evidencia operativa privada; no payment/expense ni incremento del pedido. Business utiliza expense como fuente financiera oficial; el costo operativo es snapshot independiente y no se suma otra vez. Sustituir expense_id no cambia ese snapshot. No se implementa rentabilidad.
- Sin buckets/comprobantes nuevos. Storage previo conserva sus controles.

## Migraciones

1. `20261015000100_phase4d_shipments.sql`: tres tablas, vista, constraints/FKs/índices/RLS, RPC, validadores y triggers aditivos.
2. `20261015000200_phase4d_address_snapshot.sql`: corrige exclusivamente la fuente de dirección al crear: clients.address. El snapshot comercial de orders solo conserva nombre/teléfono/correo. Mantiene firma, grants y resto de operación; no actualiza registros anteriores.

Cada migración pasó prueba PostgreSQL local y dry-run antes de aplicarse a DEV. No se editó ninguna migración ya aplicada. Sin DROP/TRUNCATE/reset ni eliminación de datos. Los fixtures interrumpidos se conservan.

## Evidencia y calidad

- `phase4d.test.mjs`: scenarios compartidos sobre PostgreSQL PGlite; valida además SQL de rollback. No sustituye pruebas JWT/carreras remotas.
- `phase4d-real.mjs`: **130** comprobaciones DEV/JWT, incluyendo RLS/API directa, carreras, vínculo financiero y auditoría. Las pruebas DELETE usan UUID inexistente, nunca borran datos históricos.
- `phase4d-ui-real.mjs`: **50** comprobaciones de UI contra DEV, ambos roles/cinco tamaños, creación, avances, retroceso/cancelación y privacidad HTML/RSC.
- `phase4d-network-real.mjs`: **9** comprobaciones (conflicto de revisi�n por rol y correcci�n Admin reales; seis comprobaciones de red/reintento inducidas). La prueba espera la recarga efectiva del formulario antes de operar. La interfaz captura errores de transporte y conserva el UUID al reintentar. Fallos de red deliberadamente inducidos; no presentarlos como caídas espontáneas de Supabase. Evidencia separada de simulaciones completas.
- `phase4d-rollback.sql`: BEGIN/ROLLBACK con triggers temporales de prueba; inyección en shipments, finanzas, solicitudes y auditoría. No quedan funciones/triggers/fixtures de esta transacción.
- Suite local: 30/30. E2E con Supabase simulado: 26/26; no se presenta como RLS real. Build/typecheck/lint correctos; repetir verificaciones afectadas después de cualquier corrección.
- Huella local/DEV idéntica: columnas, constraints, funciones (incluidas configuración/grants), RLS y policies.

Reproducción: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `npm run test:e2e`, `npm audit --omit=dev`, `node tests/verify-secrets.mjs`. Runners reales requieren SIGCA_REAL_TESTS=1 y SIGCA_TEST_ADMIN_EMAIL/SIGCA_TEST_MEMBER_EMAIL de cuentas confirmadas; SIGCA_UI_URL apunta al servidor local. Sesiones/tokens solo en memoria; resultados/capturas en test-results ignorado. Ejecutar runners que alteran perfiles/tarifa secuencialmente.

## Pendientes externos conservados

- [A51](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection): obligatorio antes de producción; no modifica Auth ni plan.
- Cinco avisos altos de dependencias de desarrollo, mantenimiento pendiente; audit de producción cero. No degradar ESLint/Next automáticamente para silenciar avisos.
- [order_counters](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy): aislamiento intencional aceptado.
- [Performance](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index): 48 INFO en la consulta final (49 antes del recorrido integrado), sin WARN/ERROR; no eliminar índices para silenciarlos.
- Tarifa real puede permanecer NULL. Sin Fase 5, rentabilidad ni reportes.

Regresi�n DEV real secuencial: Fase 3E 117, 4A 57, 4B 71 y 4C 65; **310 correctas**. Incluye Storage privado y v�nculos financieros. Reconstrucci�n antes de 4E: 956 movimientos y 126 sesiones, cero diferencias; tarifa real NULL restaurada y sin sesiones abiertas.
