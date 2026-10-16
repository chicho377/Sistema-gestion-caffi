# Fase 5 — Costeo y rentabilidad

Cierre DEV, 2026-10-15 Costa Rica. Alcance D-25 y RF-COS-01 a RF-COS-08. Solo proyecto `pysgfnwsycgoneaecgcl`. Sin Fase 6. Matriz: 20 COMPLETO, 0 PARCIAL, 0 PENDIENTE funcional DEV, 0 NO APLICA. Los pendientes de producción se distinguen al final.

| Requisito | Estado | Evidencia / prueba | Entorno | Observación |
|---|---|---|---|---|
| Material histórico neto | COMPLETO | phase5-real: consumo, retorno, corrección de cantidad | DEV JWT | No lee costo actual para reinterpretar historia |
| Atribución vigente | COMPLETO | Corrección mueve consumo neto y su devolución | DEV JWT | Sin duplicación entre pedidos |
| Mano de obra | COMPLETO | Sesión histórica, corrección de duración y atribución | DEV JWT | Tarifa histórica, segundos netos |
| Gastos válidos | COMPLETO | Solo gastos, anulación, mezcla | DEV JWT | Usa equivalente CRC histórico |
| No duplicar adquisición | COMPLETO | Gasto vinculado a recepción excluido | DEV JWT | Compra no se suma a consumo |
| No duplicar envío | COMPLETO | Gasto vinculado más snapshot de envío | DEV JWT | Solo gasto cuenta |
| Ingreso comercial | COMPLETO | Totales, descuentos propios y general | DEV JWT / local | No utiliza pagos ni ingreso manual |
| Estados | COMPLETO | Cotización, provisional, entregado, cancelado | DEV JWT / local | Cancelado: ingreso/utilidad NULL, costos conservados |
| Reparto por línea | COMPLETO | Tres líneas, descuento, componentes conciliados | DEV JWT | UUID estable, límites acumulados |
| Precisión subcentavo | COMPLETO | 0.90/h × 60 segundos entre siete líneas | DEV JWT / local | 0.015 redondea a 0.02, sin residuo no asignado |
| Cero y margen negativo | COMPLETO | Total cero con costo, margen negativo | DEV JWT | Compartido sin asignar cuando ingreso cero |
| Correcciones posteriores | COMPLETO | Gasto y sesión corregida tras entrega | DEV JWT | Resultado se recalcula, fuentes no se reescriben |
| Ganancia por hora / datos incompletos | COMPLETO | Contrato RPC, sesiones abiertas, tarifas y duración | local / DEV JWT | Sin dato requerido no inventa costo ni cociente |
| Snapshot RF-COS-08 | COMPLETO | Confirmar 12 min, catálogo cambia a 99, línea nueva ×2=198 | DEV JWT / local | Captura auditada, sin backfill; personalizado NULL |
| Seguridad financiera | COMPLETO | RPC miembro/anon rechazada; HTML/RSC miembro sin costos | DEV JWT / UI | Admin requerido antes de consultar datos |
| Inactivo y grants | COMPLETO | phase5-security.sql; regresiones de perfiles | DEV SQL controlado / JWT regresión | Inactivo Admin específico se prueba con SET LOCAL ROLE y auth.uid, no se presenta como JWT nuevo |
| Atomicidad de captura | COMPLETO | phase5-rollback.sql fuerza fallo de auditoría | local / DEV SQL, fallo inducido | Cotización, número y snapshot hacen rollback juntos |
| Responsive y errores | COMPLETO | phase5-ui-real: ambos roles, cinco anchos | DEV UI + red inducida | 320/375/768/1024/1440; tarjetas móvil, tabla con scroll local |
| Regresión | COMPLETO | 3E=117, 4A=57, 4B=71, 4C=65, 4D=130 | DEV JWT | 440 comprobaciones; incluye RLS, Storage, inventario, horas y envíos |
| Calidad y equivalencia | COMPLETO | 31 locales, 26 E2E, lint/typecheck/build, 30 migraciones | local / simulado / DEV | dry-run vacío; fingerprint SQL local/DEV igual |

## Evidencia reproducible

- `tests/phase5.test.mjs`: PGlite con todas las migraciones, autorización, captura, ausencia de backfill, NULL, redondeos, precisión y rollback. Suite completa `npm test`: 31/31.
- `tests/phase5-real.mjs`: 73 comprobaciones con JWT reales Admin/Colaborador y API anónima. Crea fixtures identificados VALIDACION-5 y los conserva. Reconcilia independientemente en centavos componentes, líneas + no asignado y utilidad; verifica lectura sin mutar pedido.
- `tests/phase5-ui-real.mjs`: 41 comprobaciones UI contra DEV y 2 de fallo/recuperación de red inducidos. No se contabilizan estos últimos como falla real del proveedor.
- `tests/sql/phase5-rollback.sql` y `phase5-security.sql`: ejecución transaccional controlada contra DEV, termina en ROLLBACK. No altera datos previos; prueba de rollback distingue explícitamente infraestructura de fallo inducido.
- `tests/sql/phase5-schema.sql`: mismas columnas, constraints, triggers, hash de cuerpos, volatilidad, search_path, ACL y RLS local/DEV.
- `npm run test:e2e`: 26/26 pruebas Playwright existentes con escenarios simulados; no reemplazan las pruebas JWT/UI anteriores.

Para repetir: configurar las variables DEV de pruebas descritas en README (`SIGCA_REAL_TESTS=1`, correos de las dos cuentas autorizadas, `SIGCA_UI_URL` del servidor local). Ejecutar build, iniciar aplicación, ejecutar secuencialmente phase5-real y phase5-ui-real. No ejecutar las regresiones reales en paralelo: algunas inactivan/reactivan el perfil de prueba y configuran/restauran tarifa. No generan contraseñas ni envían correos. Logs, capturas y JSON quedan bajo test-results ignorado; no borrar fixtures como compensación.

## Esquema y seguridad

Migraciones nuevas aplicadas, sin editar las anteriores:

1. `20261016000048_phase5_costing_profitability.sql`: estimación histórica y cálculo.
2. `20261016045816_phase5_cancelled_line_revenue.sql`: ingreso NULL también por línea cancelada.
3. `20261016050025_phase5_cumulative_allocation_precision.sql`: límites de asignación exactos, evitando sumar aproximaciones periódicas.

30 migraciones locales/remotas equivalentes, dry-run sin pendientes. Dos columnas nullable en order_items; tres triggers privados; funciones privadas capture_line_estimate, capture_confirmed_estimates, audit_line_estimate y order_costing; wrapper público order_costing invoker. Cálculo privado STABLE con autorización Admin activo, search_path vacío y grants mínimos. RLS de fuentes conservada; sin tablas/policies/buckets nuevos. Sin UPDATE financiero directo ni nueva utilidad materializada. No se expone private por Data API.

Durante auditoría se corrigieron codificación UTF-8 de estados de ruta, desborde desktop de tabla, ingreso de línea cancelada y precisión acumulada de reparto. Las dos correcciones SQL posteriores usan migraciones nuevas. No hubo decisiones funcionales adicionales.

## Calidad, Advisors y límites

Lint, typecheck, 31 tests, build y 26 E2E: correctos. `npm audit --omit=dev`: cero vulnerabilidades. Verificador de secretos revisa archivos versionables, assets cliente y exclusión de .env.local; no se versionan capturas, logs ni tokens. No nuevas dependencias ni variables.

Security Advisors: A51 WARN permanece obligatorio antes de producción ([protección de contraseñas](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)). INFO de order_counters aceptado por aislamiento intencional ([referencia](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)); sin crear grants/policies para silenciarlo. Performance: 48 INFO unused_index, sin WARN/ERROR; no se eliminan índices ([referencia](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index)). Cinco avisos altos de dependencias de desarrollo previamente documentados permanecen separados de la auditoría de producción.

Tarifa empresarial concreta continúa como dato pendiente de Configuración; no se sustituyó por tarifas sintéticas de pruebas. Estimación histórica previa no disponible es un estado aprobado, no un dato rellenado retrospectivamente. No pendientes funcionales de Fase 5 en DEV. No Fase 6.
