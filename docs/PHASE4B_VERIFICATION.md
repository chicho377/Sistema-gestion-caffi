# Fase 4B — Consumos, devoluciones y correcciones

Fecha: 2026-10-03. Proyecto exclusivo: SIGCA DEV `pysgfnwsycgoneaecgcl` (ACTIVE_HEALTHY). Base normativa: D-22/P4A, D-23 y su aclaración matemática de devoluciones. Estado: implementación y verificación para revisión del usuario; no constituye autorización de 4C/4D/4E ni cierre de producción.

## Alcance e implementación

Se reutilizan el diario `inventory_movements`, sus costos privados y las proyecciones de cantidad/valoración de 4A. Se implementan ocho operaciones mediante `public.inventory_operation(target, operation, payload, expected_revisions, expected_orders)`: consumo, devolución, ajuste positivo, ajuste negativo, reversión de línea, reversión de recepción completa, corrección de cantidad y corrección de atribución. No se generan gastos, ingresos, consumos de receta ni devoluciones automáticas al entregar/cancelar.

La aplicación incorpora `/inventario/operaciones`, accesible desde Inventario, historial de material y detalle de pedido. Formulario por rol, línea opcional, historial paginado (25 filas), detalle anterior/nuevo de atribuciones y valoración exclusivamente administrativa. SweetAlert2 confirma operaciones; Sonner informa éxito. Loading, vacío, error de red y conflicto conservan la información necesaria para recargar y reintentar. UUID estable hasta confirmar éxito; un UUID ya comprometido responde conflicto, nunca duplica movimientos.

## Migraciones aplicadas

| Migración | Propósito |
|---|---|
| `20261003040656_phase4b_inventory_operations.sql` | Excepciones de esquema autorizadas, evidencia aditiva, RPC, vistas, validación diferida, auditoría y permisos |
| `20261003042715_phase4b_receipt_reversal_alias.sql` | Corrige colisión entre alias SQL y variable PL/pgSQL en reversión multilínea; misma firma y grants |
| `20261003092616_phase4b_request_serialization.sql` | Serializa UUID antes de verificar idempotencia, también entre atribución y movimiento físico |

Las tres son nuevas y transaccionales. No se editaron migraciones aplicadas. Cada aplicación tuvo pruebas locales y dry-run limitado a su archivo de 4B. Resultado final: **22 migraciones local/DEV coincidentes**, `db push --dry-run` sin migraciones, seeds ni roles pendientes. Las huellas de constraints, columnas/NOT NULL, cuerpos/firma/configuración/grants de funciones, RLS y policies coinciden. La comparación omite únicamente la representación de NOT NULL como `pg_constraint.contype='n'` del PostgreSQL local más nuevo; compara su semántica mediante `pg_attribute.attnotnull`.

### Excepciones limitadas ejecutadas

| Restricción anterior | Sustituta validada |
|---|---|
| `inventory_movements_movement_type_check` | `inventory_movements_4b_type_check` |
| `inventory_movements_check` | `inventory_movements_4b_stock_check` |
| `inventory_movement_costs_check` | `inventory_movement_costs_4b_value_check` |
| `inventory_movement_costs_valuation_version_check` | `inventory_movement_costs_4b_version_check` |
| `inventory_balances_check` | `inventory_balances_4b_state_check` |
| `inventory_valuations_check` | `inventory_valuations_4b_state_check` |

Expresiones exactas: [preflight aprobado](PHASE4B_PREFLIGHT.md) y primera migración. Guarda previa verifica nombre, definición y dependencias; `DROP CONSTRAINT ... RESTRICT`, sustitución inmediata, `NOT VALID` y `VALIDATE` en la misma transacción. DEV: cero restricciones antiguas y seis nuevas validadas. Ningún CASCADE, borrado de tablas/columnas/registros, renombrado de historia o reset.

Únicos NOT NULL flexibilizados: `inventory_movements.receipt_item_id`, `inventory_movement_costs.movement_amount_crc` y `inventory_movement_costs.average_cost_after_crc`. CHECKs condicionales mantienen línea de recepción obligatoria para entradas 4A, importe convencional positivo en versión v1 y promedio positivo con stock. `quote_money` permanece intacto. La única función 4A sustituida es `private.inventory_receipt_complete()`: misma firma, trigger, permisos y autorización; comparación de promedios nullable mediante `IS [NOT] DISTINCT FROM`.

### Modelo y seguridad

- `inventory_movements`: pedido/línea, origen del mismo material, motivo, UUID/posición de solicitud; FKs RESTRICT, unicidades e índices. Movimiento original inmutable.
- `inventory_movement_costs.internal_amount_crc`: delta autoritativo positivo hasta 8 decimales en versión `proportional_value_v2`. Evidencia v1 preservada; snapshot de promedio/costo y residuo privado hasta 12 decimales.
- Nueva `inventory_movement_attribution_corrections`: before/after de pedido/línea, actor, motivo, timestamp y revisión única por origen. No cambia cantidad ni costo original.
- Nueva `inventory_adjustment_cost_evidence`: importe y moneda original, CRC, tasa, fecha real, procedencia y aporte histórico Admin para ajuste positivo sin stock. No simula compra ni gasto.
- Nuevas vistas `inventory_operations_read` y `inventory_operation_costs_read`, ambas `security_invoker=true`. La primera no contiene costos. La segunda aplica RLS administrativo.
- RPC pública invoker; dispatcher privado definer con `search_path=''`, perfil activo y rol vigente comprobados dentro de la transacción. Helpers privados sin EXECUTE para clientes. `private` fuera de Data API.
- RLS SELECT de atribuciones para perfiles activos; SELECT de evidencia financiera solo Admin. DML directo revocado. Triggers reutilizados `inventory_immutable`/`inventory_audit` en nuevas tablas, nuevo constraint trigger diferido `inventory_guard_4b`. Auditoría conserva eventos y actor; Colaborador no lee `audit_log`.
- Sin nuevos buckets, cambios de Auth, dependencias o variables de entorno.

## Matemática y concurrencia

Consumo total: `D=V`, `Q'=0`, `V'=0`, `A'=NULL`. Parcial: `D=HALF_UP(V*q/Q,8)`, `Q'=Q-q`, `V'=V-D`, `A'=HALF_UP(V'/Q',8)`. Se congela A anterior, pero D proviene de V, nunca de `material_costs` ni de reconstruir V como Q*A. Se rechaza colapso a cero o salida parcial que agote el valor conservando cantidad.

Devolución: `q_rem=q0-qr`, `v_rem=D0-Vr`. Parcial `R=HALF_UP(v_rem*r/q_rem,8)` exige `0<R<v_rem`; última usa exactamente `R=v_rem`. Se reintegra `Q+r,V+R` y se recalcula promedio. Caso `q_rem=2,v_rem=0.00000001`: devolver 1 o 0.1 se rechaza por los respectivos límites de precisión; devolver 2 recupera exactamente el remanente. No hay ampliación de escala ni reescritura del consumo.

Ajuste negativo usa el algoritmo de salida; positivo con stock usa valoración proporcional; sin stock exige evidencia CRC/USD bajo contrato 4A. Reversión de entrada restaura sus valores anteriores solo si es el último movimiento del material. Recepción completa valida todas sus líneas antes de compensar cualquiera. Corrección de cantidad puede devolver y volver a consumir en una sola transacción; atribución se corrige mediante evidencia separada.

Locks: perfil → exclusión por UUID de solicitud → pedidos ordenados → materiales UUID ordenados → proyecciones → orígenes UUID ordenados. La exclusión de UUID usa advisory lock transaccional antes de consultar idempotencia; no invierte locks de entidades. Pedido usa `private.lock_order` de 3B. Revisión desactualizada produce PT409/HTTP 409. Dos consumos válidos con la misma revisión generan un éxito y un conflicto; después de recargar, el segundo puede completarse. Nunca se acepta una sobrescritura silenciosa.

Fecha de Colaborador proviene del servidor. Admin no puede preceder confirmación, movimiento origen ni `last_effective_at`; a igual fecha decide `material_sequence`. Entregar/cancelar no devuelve stock. Consumo ordinario solo en producción/listo; devoluciones posteriores y correcciones vinculadas reservadas a Admin conforme D-23.

## Matriz de verificación

| Requisito | Estado | Evidencia | Entorno | Observación |
|---|---|---|---|---|
| V01 Excepciones exactas, datos compatibles y transacción | COMPLETO | Primera migración, preflight y catálogo posterior | Local + DEV real | 6 anteriores ausentes, 6 sustitutas validadas; solo 3 NOT NULL autorizados |
| V02 Regresión recepción 4A y agotamiento | COMPLETO | `phase4b.test.mjs`, `phase4b-real.mjs`, suites 4A | Local + DEV real | Nueva recepción después de Q/V cero y promedio NULL |
| V03 Consumo parcial, fraccionario y promedio 8 decimales | COMPLETO | Escenarios compartidos: 1 de 3 con V=10; 0.25 y cantidades fraccionarias | Local + DEV real | D proporcional, V residual autoritativo |
| V04 Consumo total y subcentavos | COMPLETO | Agotamiento 2 restantes; Q=200000000,V=1 | Local + DEV real | Cero exacto y snapshot previo; valor mínimo 1e-8 |
| V05 Devoluciones parciales/final y compra intermedia | COMPLETO | 0.5+0.5+1 tras recepción posterior | Local + DEV real | Recupera exactamente D0=6.66666667 |
| V06 Aclaración de precisión D-23 | COMPLETO | Parcial R=0; parcial R=v_rem; total directa | Local + DEV real | Ambos parciales rechazados, total válida |
| V07 Límite retornable y dos devoluciones concurrentes | COMPLETO | Carreras de devolución y alrededor de precisión mínima | DEV real | Sesiones JWT independientes; remanente intacto |
| V08 Stock nunca negativo y consumos concurrentes | COMPLETO | Dos consumos excesivos; dos válidos y recarga | DEV real | Un commit/409, segundo válido tras recargar |
| V09 Consumo/recepción, ajuste/consumo, devolución/consumo | COMPLETO | Carreras de `phase4b-real.mjs` | DEV real | Misma revisión y locks compartidos |
| V10 Consumo/transición 3B | COMPLETO | Carrera consumo vs entrega | DEV real | Commit del consumo previo o rechazo; sin consumo posterior a entrega |
| V11 Idempotencia y revisión | COMPLETO | UUID repetido/simultáneo y UUID entre tablas | Local + DEV real | Solo una operación para la solicitud, conflicto explícito |
| V12 Pedido/línea, precisión de cantidad y material inactivo | COMPLETO | Línea ajena/inactiva, 5 decimales rechazados; material inactivo válido | Local + DEV real | Receta no genera movimientos |
| V13 Cronología y estados | COMPLETO | Futuro, histórico anterior, Colaborador backdating y Entregado | Local + DEV real | Admin corrige consumo vinculado tras Entregado |
| V14 Ajustes Admin con/sin stock | COMPLETO | Proporcionales, CRC y USD histórico sin stock | Local + DEV real | HALF UP; Colaborador rechazado; sin ajuste solo de valor |
| V15 Corrección de cantidad y rollback compuesto | COMPLETO | Devolución seguida de reemplazo imposible | Local + DEV real | No queda devolución parcial de la transacción fallida |
| V16 Corrección de atribución | COMPLETO | Before/after, actor/fecha/motivo y snapshot idéntico | Local + DEV real + UI | Historial consultable; no devolver/reconsumir |
| V17 Reversión línea 4A | COMPLETO | Restaura Q/V/A y rechaza segundo intento/posteriores | Local + DEV real | Recepción original conservada |
| V18 Reversión multilínea | COMPLETO | Todas reversibles; una con consumo posterior | Local + DEV real | Compensa todas o ninguna |
| V19 RLS y grants | COMPLETO | JWT Admin/Colaborador/inactivo/anon; INSERT/UPDATE directo | DEV real | Costos vacíos para Colaborador, helpers inaccesibles |
| V20 Inactivo con JWT vigente | COMPLETO | Inactivación y restauración controladas | DEV real | Lectura vacía y RPC 42501; perfil restaurado |
| V21 Auditoría y fallo transaccional | COMPLETO | `phase4b-audit-rollback.sql`; pruebas locales | DEV real, fallo inducido + local | Excepción antes de audit_log; proyección/movimiento revertidos; trigger no persiste |
| V22 Reconstrucción e historia | COMPLETO | `phase4b-reconstruction.sql` y hashes previos 4A | DEV real | Cero diferencias Q/V/A/secuencia/retornos y cero costos faltantes |
| V23 UI, responsive y privacidad | COMPLETO | `phase4b-ui-real.mjs`, capturas ignoradas | UI contra DEV real | Ambos roles, 320/375/768/1024/1440; HTML/RSC sin costos para Colaborador |
| V24 Estados UI y conflictos | COMPLETO | UUID/revisión obsoleta por operación concurrente; vacío y red abortada | DEV real + red inducida | Conserva formulario; recarga y reintento explícitos |
| V25 Regresión financiera y Storage | COMPLETO | 3E integrado, 4A recorrido/precisión/auditoría | DEV real | Snapshots, gastos/vínculos, tres buckets privados y perfiles |
| V26 Calidad y equivalencia | COMPLETO | npm, huellas SQL, migration list/dry-run y secretos | Local + DEV real | Evidencias y conteos abajo |
| A51 Protección de contraseñas filtradas | PENDIENTE | Security Advisors | DEV real, requisito de producción | Pendiente heredado obligatorio antes de producción, no bloquea DEV |
| 4C/4D/4E, costeo, rentabilidad y reportes | NO APLICA | Diff y migraciones limitados a 4B | Revisión de alcance | No implementados; sin tag final |

Conteo de matriz: **26 COMPLETO, 0 PARCIAL, 1 PENDIENTE (A51 producción), 1 NO APLICA**. No hay decisiones funcionales nuevas pendientes de 4B. La revisión/aceptación del usuario continúa siendo un paso posterior, no se afirma cierre formal unilateral.

## Pruebas y reproducción

- `npm run lint`, `npm run typecheck`, `npm run build`: correctos.
- `npm test`: **27/27**. PostgreSQL local PGlite con migraciones reales; no es prueba de red/JWT Supabase. Se volvió a ejecutar la suite 4B después de ampliar casos de atribución y reversión fallida.
- `npm run test:e2e`: **26/26** de regresión con fixture simulado. No se usa ese resultado para afirmar RLS/concurrencia real.
- `npm audit --omit=dev`: **0 vulnerabilidades**.
- `tests/phase4b-real.mjs`: **71 comprobaciones** con JWT reales, incluidas carreras entre sesiones independientes. Fixtures etiquetados `VALIDACION-4B-*` conservados.
- `tests/phase4b-ui-real.mjs`: **85 comprobaciones: 83 contra DEV real y 2 de red inducida**. Formularios de las ocho operaciones Admin/dos Colaborador en los cinco anchos; consumo/devolución, conflicto real y recuperación por recarga. Los dos abortos de POST son fallos de red **inducidos**, no fallos de Supabase.
- Regresión DEV: **57** recorrido 4A + **13** precisión/vínculos + **223** auditoría 4A + **117** integración 3E = **410 comprobaciones**. Incluyen denegaciones de DML, no borrados exitosos ni limpieza destructiva.
- Fallo de auditoría: SQL real dentro de BEGIN/ROLLBACK con función temporal y trigger de prueba; no se presenta como petición JWT HTTP. Verificada ausencia del trigger al terminar.
- Evidencias JSON/capturas bajo `test-results/` ignorado; ninguna sesión, token o contraseña se guarda allí.

Servidor utilizado: build local de producción en `http://localhost:3002`, conectado a DEV. Configurar variables de opt-in indicadas en README y ejecutar suites reales secuencialmente: temporalmente inactivan/reactivan la cuenta Colaborador para verificar JWT vigente. No cambiar contraseñas ni enviar correos.

```powershell
node tests/phase4b-real.mjs
node tests/phase4b-ui-real.mjs
node tests/phase4a-real.mjs
node tests/phase4a-precision-real.mjs
node tests/phase4a-audit-real.mjs
node tests/phase3e-real.mjs
node tests/verify-secrets.mjs
```

SQL de lectura reproducible: `tests/sql/phase4b-schema.sql` y `tests/sql/phase4b-reconstruction.sql`. SQL inducido de auditoría está claramente separado en `phase4b-audit-rollback.sql` y revierte toda su infraestructura temporal. Las pruebas crean fixtures conservados; no eliminarlos como compensación automática.

## Evidencia histórica y Advisors

Reconstrucción final: **388 movimientos**, cero diferencias del diario, cero costos faltantes, cero diferencias de proyecciones y cero inconsistencias de devolución. Cantidad, valor, promedio y secuencia coinciden con las proyecciones. Cuentas de prueba restauradas activas y cero triggers inducidos persistentes.

Antes de 4B: 44 movimientos. Corte de comparación `2026-10-03 04:24:51.108656+00`. Hash de costos anteriores (excluyendo únicamente la nueva columna nullable) `bb111a425df99ba34b5b72d787a0ac6f`; hash de líneas de recepción `403442af6b20a2cf0fd8708307b2e2f3`. Ambos idénticos después de migraciones/pruebas. No se reinterpretó ningún costo histórico.

Security Advisors: ningún hallazgo nuevo de 4B. [A51 WARN](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection) pendiente de producción y [INFO de order_counters](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy) aceptado por aislamiento intencional. No se crearon policies/grants para silenciarlo. Performance: **39 INFO unused_index**, cero WARN/ERROR en la consulta final; [referencia](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index). El conteo depende del uso observado; no se eliminó ningún índice para silenciar avisos.

Checkpoint documental existente: `06cfacd` (`docs: define phase 4b inventory consumption decisions`). Implementación/pruebas/documentación quedan como cambios pendientes de revisión, sin commit final ni tag no solicitado. `.env.local` ignorado; verificación de secretos privados contra archivos versionables y assets cliente correcta; sin artefactos de pruebas versionables.

No se avanzó a 4C/4D/4E.

Resumen de evidencias contadas: **564 comprobaciones contra DEV real** (71 API 4B + 83 UI 4B + 410 regresión), **2 fallos de red inducidos** y **1 escenario SQL DEV de fallo de auditoría inducido**, separados de 27 pruebas locales y 26 E2E simulados. No se suman ejecuciones repetidas ni se confunden estos conteos con los 26 criterios funcionales de la matriz. Git: 9 archivos modificados y 16 nuevos; todos correspondientes a documentación, aplicación, migraciones y pruebas 4B. Diff check y verificación de secretos correctos.
