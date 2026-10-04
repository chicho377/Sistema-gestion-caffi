# Fase 4B — Consumos, devoluciones y correcciones

Fecha: 2026-10-03. Proyecto exclusivo: SIGCA DEV `pysgfnwsycgoneaecgcl` (ACTIVE_HEALTHY). Base normativa: D-22/P4A, D-23 y su aclaración matemática de devoluciones. Estado de implementación inicial: verificación para revisión del usuario; no constituye autorización de 4C/4D/4E ni cierre de producción.

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


## Auditoría final 4B — 2026-10-03

Esta sección prevalece sobre los conteos de implementación anteriores. Checkpoint previo autorizado: **0702eca** (`feat: implement phase 4b inventory consumption and corrections`), 25 archivos; Git limpio después del commit. Antes del checkpoint se verificaron secretos, artefactos, 22 migraciones equivalentes y dry-run vacío. Un espacio final detectado al revisar archivos recién agregados fue corregido en el mismo commit antes de iniciar la auditoría.

La auditoría añade pruebas y documentación; no cambia código de aplicación, migraciones, decisiones funcionales, Auth ni permisos. Sin tag, push o avance a 4C/4D/4E.

### Matriz final de los veinte criterios solicitados

| Requisito | Estado | Evidencia | Entorno | Observación |
|---|---|---|---|---|
| A4B-01 Consumo y valoración | COMPLETO | `phase4b-real.mjs`; cadenas auditadas con BigInt | DEV real JWT | Parcial/total/fraccionario/subcentavo; material inactivo; Q=V=0 y A=NULL |
| A4B-02 Cadena extensa | COMPLETO | `phase4b-audit-real.mjs`, reconstrucción por movimiento | DEV real JWT | Secuencia mixta exacta solicitada; final positivo, cero y positivo después de cero; verifica retornables |
| A4B-03 Devoluciones | COMPLETO | Escenarios compartidos y carreras específicas | DEV real JWT | Parciales, última exacta, R=0/R=v_rem rechazados, exceso y concurrencia |
| A4B-04 Ajustes | COMPLETO | Cadenas/roles JWT + `phase4b-audit-rates.sql` | DEV real; tasas controladas inducidas | CRC, USD actual/fallback/histórico/faltante; motivo y cantidad; no revaluación pura |
| A4B-05 Reversiones 4A | COMPLETO | Escenarios de reversión simple/multilínea y carreras | DEV real JWT | Restaura Q/V/A; rechaza posteriores y segundo intento; originales conservados |
| A4B-06 Correcciones | COMPLETO | Original y costo comparados íntegros; reconstrucción; before/after | DEV real JWT | Cantidad compensada; nuevo consumo proporcional vigente; atribución sin alterar inventario |
| A4B-07 Estados | COMPLETO | Matriz quote/confirmed/in_production/ready/delivered/cancelled | DEV real JWT | Colaborador solo estados operativos; Admin cerrado solo vínculo previo; ambos ganadores de carrera observados |
| A4B-08 Concurrencia | COMPLETO | Suites base/ampliada entre sesiones independientes | DEV real JWT | Incluye reversión/consumo, corrección/corrección, UUID y revisión; un commit/409 cuando corresponde |
| A4B-09 Constraints | COMPLETO | Huellas antes/después local y `phase4b-audit-constraints.sql` | Local + clones temporales en DEV real | Solo 6 CHECK y 3 NOT NULL; 8 combinaciones inválidas rechazadas; migraciones previas idénticas a cierre 4A |
| A4B-10 Regresión matemática 4A | COMPLETO | Suites 4A recorrido, precisión y auditoría; comparación exacta de función | Local + DEV real JWT | Misma función salvo dos comparaciones nullable; apertura, entradas sucesivas, USD, multilínea, carreras y rollback |
| A4B-11 Separación por rol | COMPLETO | Data API, vistas, evidencia financiera y respuestas de Server Actions | DEV real JWT + UI | Sin costos/promedios/tasas/deltas para Colaborador; no depende de ocultar controles |
| A4B-12 Matriz RLS | COMPLETO | 9 tablas × 4 roles; tabla detallada debajo | DEV real JWT | SELECT y tres DML directos más RPC pertinente; JWT previamente vigente para inactivo |
| A4B-13 Inmutabilidad | COMPLETO | DML 42501 y originales intactos tras correcciones | DEV real JWT | UPDATE/DELETE usan filtros contradictorios para no borrar/modificar aun ante un defecto; sin DML autorizado directo |
| A4B-14 Cronología | COMPLETO | Futuro/backdating, igual timestamp y secuencia, rechazo antes de origen | DEV real JWT | Admin no inserta antes de historia consolidada; Quote no permite atribución/consumo |
| A4B-15 Idempotencia | COMPLETO | Reenvío simultáneo y secuencial por seis operaciones | DEV real JWT | Consumo, devolución, ajuste, reversión, atribución y cantidad: solo un efecto |
| A4B-16 Rollback | COMPLETO | `phase4b-audit-failures.sql` | DEV real, fallos inducidos | 7 puntos: auditoría, movimiento, costo, balance, valoración, atribución y segunda línea; hashes íntegros |
| A4B-17 UI/responsive | COMPLETO | `phase4b-audit-ui-real.mjs` | UI contra DEV; red inducida separada | Ambos roles/cinco anchos; material inactivo, línea, corrección Admin, foco, reduced-motion, red y conflictos; sin fuga en Server Actions |
| A4B-18 Regresión Fase 3 | COMPLETO | 3E integrado y regresión 4A financiera/Storage | DEV real JWT + local | Auth/perfiles, consecutivos, pagos, estados, manual_income, gastos y tres buckets privados; inventario no modifica esas fuentes |
| A4B-19 Alcance | COMPLETO | Git diff y migraciones sin cambios | Revisión local + DEV | Sin cronómetro/envíos/rentabilidad/reportes/receta automática/devolución proveedor/revaluación pura |
| A4B-20 Calidad | COMPLETO | npm, Advisors, secretos, huellas/dry-run | Local + DEV real | 28 locales, 26 E2E simulados; build/typecheck; sin vulnerabilidades npm de producción |

### Distinción de entornos y límites de la evidencia

- **Local:** PostgreSQL PGlite ejecuta migraciones y compara constraints, atributos NOT NULL y funciones antes/después. Las migraciones hasta 4A se comparan con el commit de cierre `aec1fb6`; no hay ediciones. `inventory_receipt_complete()` conserva exactamente su cuerpo salvo las dos comparaciones NULL autorizadas, además de firma/configuración/grants.
- **DEV real JWT:** operaciones HTTP de Admin/Colaborador con sesiones independientes; inactivación/restauración temporal; fixtures etiquetados y conservados. Las carreras verifican resultados persistidos, no mocks. Ambos ganadores consumo/transición se observaron usando solicitudes desde dos sesiones con pequeños desfases de envío, sin sustituir locks o simular resultados.
- **DEV real con estados inducidos:** tasas sintéticas actual/fallback/histórica/faltante dentro de BEGIN/ROLLBACK; no se afirma consulta real al proveedor durante esos casos. La caché original se restaura completamente. Fallos de siete etapas mediante triggers temporales dentro de una transacción revertida. Cero triggers, tasas futuras o fixtures transaccionales persistentes tras terminar.
- **Constraints en DEV:** ocho combinaciones inválidas se prueban sobre clones temporales `LIKE ... INCLUDING ALL` de tablas reales, con las mismas expresiones CHECK; no se deshabilitan triggers ni se mutan movimientos históricos. Las FKs/RLS se comprueban por separado mediante catálogo y JWT sobre tablas reales.
- **UI contra DEV:** pruebas con servidor local de producción y datos reales; los abortos de POST se etiquetan como red inducida. No se almacenan sesiones ni credenciales en capturas/JSON. Foco, tamaño de input y movimiento reducido son comprobaciones concretas, no una certificación universal de accesibilidad.
- **E2E simulado:** 26 pruebas de regresión con fixture; no cuentan como RLS ni concurrencia real.

Hallazgos durante construcción de pruebas: un toast de éxito anterior podía adelantar la lectura de la devolución siguiente en el test. Se cambió la sincronización para comprobar el remanente retornable persistido antes de tomar la huella para la corrección. La base conservó la devolución y la atribución como operaciones separadas; no se justificó cambiar la implementación por ese fallo del test.

A51 permanece **PENDIENTE antes de producción**, fuera de los veinte criterios funcionales DEV. `order_counters` conserva INFO aceptado por aislamiento; Performance se documenta sin eliminar índices. No hay nuevas decisiones funcionales detectadas.

### Matriz RLS consolidada (36 combinaciones con JWT reales)

SELECT refleja filas conocidas. INSERT/UPDATE/DELETE directos devuelven 42501 en los cuatro roles. Una RPC autorizada con payload inválido devuelve 22023; denegación de rol devuelve 42501. Los recorridos funcionales prueban además payloads válidos.

| Tabla | Admin SELECT | Colaborador SELECT | Inactivo SELECT | Anónimo SELECT | INSERT | UPDATE | DELETE | RPC por rol |
|---|---|---|---|---|---|---|---|---|
| inventory_receipts | permitido | sin filas/acceso | sin filas/acceso | sin filas/acceso | 42501 todos | 42501 todos | 42501 todos | Admin: register_inventory_receipt permitida; Colaborador: register_inventory_receipt denegada; Inactivo: register_inventory_receipt denegada; Anónimo: register_inventory_receipt denegada |
| inventory_receipt_items | permitido | sin filas/acceso | sin filas/acceso | sin filas/acceso | 42501 todos | 42501 todos | 42501 todos | Admin: register_inventory_receipt permitida; Colaborador: register_inventory_receipt denegada; Inactivo: register_inventory_receipt denegada; Anónimo: register_inventory_receipt denegada |
| inventory_receipt_expenses | permitido | sin filas/acceso | sin filas/acceso | sin filas/acceso | 42501 todos | 42501 todos | 42501 todos | Admin: link_inventory_expense permitida; Colaborador: link_inventory_expense denegada; Inactivo: link_inventory_expense denegada; Anónimo: link_inventory_expense denegada |
| inventory_movements | permitido | permitido | sin filas/acceso | sin filas/acceso | 42501 todos | 42501 todos | 42501 todos | Admin: consumption permitida; Colaborador: consumption permitida; Inactivo: consumption denegada; Anónimo: consumption denegada |
| inventory_movement_costs | permitido | sin filas/acceso | sin filas/acceso | sin filas/acceso | 42501 todos | 42501 todos | 42501 todos | Admin: consumption permitida; Colaborador: consumption permitida; Inactivo: consumption denegada; Anónimo: consumption denegada |
| inventory_balances | permitido | permitido | sin filas/acceso | sin filas/acceso | 42501 todos | 42501 todos | 42501 todos | Admin: consumption permitida; Colaborador: consumption permitida; Inactivo: consumption denegada; Anónimo: consumption denegada |
| inventory_valuations | permitido | sin filas/acceso | sin filas/acceso | sin filas/acceso | 42501 todos | 42501 todos | 42501 todos | Admin: consumption permitida; Colaborador: consumption permitida; Inactivo: consumption denegada; Anónimo: consumption denegada |
| inventory_movement_attribution_corrections | permitido | permitido | sin filas/acceso | sin filas/acceso | 42501 todos | 42501 todos | 42501 todos | Admin: attribution_correction permitida; Colaborador: attribution_correction denegada; Inactivo: attribution_correction denegada; Anónimo: attribution_correction denegada |
| inventory_adjustment_cost_evidence | permitido | sin filas/acceso | sin filas/acceso | sin filas/acceso | 42501 todos | 42501 todos | 42501 todos | Admin: adjustment_positive permitida; Colaborador: adjustment_positive denegada; Inactivo: adjustment_positive denegada; Anónimo: adjustment_positive denegada |

Resultado funcional final: **20 COMPLETO, 0 PARCIAL, 0 PENDIENTE funcional, 0 NO APLICA**. A51 sigue separado como requisito pendiente de producción. No se crearon migraciones ni se modificó código de aplicación durante la auditoría.


### Conteos finales de auditoría y cierre técnico

| Evidencia | Resultado |
|---|---|
| Criterios funcionales solicitados | 20 COMPLETO; 0 PARCIAL; 0 PENDIENTE funcional |
| API base 4B reejecutada | 71 comprobaciones DEV JWT |
| Auditoría ampliada 4B | 341 comprobaciones adicionales DEV JWT, matriz 36 combinaciones incluida |
| UI ampliada | 116 comprobaciones: 114 contra DEV y 2 de red inducida |
| Regresión real 4A/3E | 57 + 13 + 223 + 117 = 410 comprobaciones |
| Total contra DEV con JWT/UI | 936 comprobaciones; no suma repeticiones ni duplica los escenarios base compartidos |
| SQL controlado en DEV | 7 fallos inducidos + 8 contratos CHECK en clones + 8 casos de tasa/evidencia, separados del total JWT |
| Local | 28/28 pruebas npm correctas |
| E2E simulado | 26/26 correctos |
| Lint / typecheck / build | Correctos, lint final sin advertencias |
| npm audit --omit=dev | 0 vulnerabilidades |
| Diario global reconstruido | 759 movimientos; cero diferencias de Q/V/A/secuencia/retornables; cero costos faltantes |
| Esquema | 22 migraciones equivalentes; dry-run vacío; huellas de constraints/columnas/funciones/grants/RLS/policies iguales |
| Historia 4A | Ambos hashes previos permanecen idénticos |
| Security Advisors | Solo A51 WARN y order_counters INFO aceptado; ningún hallazgo nuevo |
| Performance Advisors | 38 INFO unused_index; cero WARN/ERROR; ningún índice eliminado |
| Restitución de pruebas | Cero triggers inducidos, cero tasas/fixtures transaccionales residuales; perfiles restaurados activos |

La auditoría no requirió correcciones de funcionalidad ni nuevas decisiones. Se corrigió únicamente la sincronización de una prueba UI y se ampliaron sus verificaciones; los mensajes de éxito no se usan como sustituto de comprobar persistencia en BD. Las huellas e invariantes se comprobaron después de todas las escrituras de prueba.

Archivos de auditoría: `tests/phase4b-audit-real.mjs`, `tests/phase4b-audit-ui-real.mjs`, `tests/phase4b-audit.test.mjs`, `tests/sql/phase4b-audit-constraints.sql`, `tests/sql/phase4b-audit-failures.sql`, `tests/sql/phase4b-audit-rates.sql`, este documento y README. Reutilizan los helpers existentes. Ejecutar pruebas reales secuencialmente con `SIGCA_REAL_TESTS=1`, cuentas DEV autorizadas y `SIGCA_UI_URL=http://localhost:3002`. La UI ampliada utiliza las referencias de `phase4b-real.mjs`, que debe ejecutarse primero.

Git final: **2 archivos modificados y 6 nuevos**, solo documentación y pruebas de auditoría. `git diff --check`, revisión de espacios en archivos nuevos y escaneo de secretos correctos; `.env.local` ignorado, assets cliente sin secretos y ningún artefacto de prueba versionable. El checkpoint de implementación es `0702eca`; los cambios de auditoría quedan para revisión, sin segundo commit, push ni tag no solicitados. No avance a 4C/4D/4E. A51 continúa obligatorio antes de producción y no es un pendiente funcional DEV.
