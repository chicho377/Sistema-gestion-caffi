# Fase 4A — Inventario base: verificación DEV

Fecha: 2026-10-02. Proyecto exclusivo: SIGCA DEV, `pysgfnwsycgoneaecgcl`. PostgreSQL remoto 17.6.1.166. Decisiones aplicadas: D-22 y P4A-01/02/03; D-01 a D-21 no se modificaron. Checkpoint documental previo al código: `6679da3`, `docs: define phase 4 inventory decisions and preflight`.

Implementación para revisión del usuario. No se crea tag final ni se habilitan 4B, 4C, 4D o 4E. A51 continúa pendiente obligatorio antes de producción.

## Objetos implementados

Migraciones nuevas, probadas localmente y revisadas mediante dry-run antes de aplicar:

- `20261002160448_phase4a_inventory.sql`: esquema, operaciones, RLS, auditoría y vistas, dentro de una transacción.
- `20261002162443_phase4a_fk_indexes.sql`: tres índices que cubren las FKs compuestas de movimientos/proyecciones. Resuelve las observaciones de FK sin índice encontradas después de la primera aplicación. No elimina índices existentes.

Las 19 migraciones locales/remotas coinciden. El dry-run final con `--linked --skip-vault --dry-run` devuelve `upToDate: true`, sin migraciones, seeds ni roles pendientes. No se editaron migraciones aplicadas, ni se ejecutaron DROP, TRUNCATE, reset o borrados de datos.

| Tabla | Contenido | Policy SELECT para authenticated |
|---|---|---|
| inventory_receipts | Cabecera inmutable, UUID estable, tipo, fecha efectiva, procedencia, motivo y actor | inventory_receipts_read: Admin activo |
| inventory_receipt_items | Líneas, material/unidad históricos, cantidades y snapshots CRC/USD | inventory_receipt_items_read: Admin activo |
| inventory_receipt_expenses | Vínculo explícito opcional, actor y fecha | inventory_receipt_expenses_read: Admin activo |
| inventory_movements | Diario positivo, secuencia por material, cantidad antes/después | inventory_movements_read: usuario activo |
| inventory_movement_costs | Total autoritativo, costo aplicado, valor/promedio antes/después y residuo | inventory_movement_costs_read: Admin activo |
| inventory_balances | Proyección operativa, revisión y unidad congelada | inventory_balances_read: usuario activo |
| inventory_valuations | Proyección privada de valor y promedio | inventory_valuations_read: Admin activo |

Las siete tablas tienen RLS. No hay grants de INSERT/UPDATE/DELETE a usuarios de aplicación. Anónimo no tiene acceso; inactivo queda excluido por el perfil vigente incluso con JWT anterior. Las cinco vistas usan `security_invoker=true`: `inventory_stock_read`, `inventory_movements_read`, `inventory_valuations_read`, `inventory_receipt_items_read`, `inventory_movement_costs_read`. Los numeric se transportan como texto. Colaborador recibe exclusivamente las dos primeras vistas operativas; las consultas financieras quedan vacías por RLS y las páginas financieras exigen Admin antes de consultar datos.

RPC públicas SECURITY INVOKER:

- `register_inventory_receipt(target, payload, expected_revisions)`: compra o saldo inicial según `kind`; Admin activo, multilínea, UUID estable y revisión por material.
- `link_inventory_expense(target, expense)`: vínculo explícito posterior; Admin activo, inmutable, conflicto si ya existe.

Operaciones privadas SECURITY DEFINER con `search_path=''`, actor desde `auth.uid()` y perfil bloqueado para lectura. Helpers internos sin grants cliente; `private` fuera de Data API. Se bloquean materiales en orden UUID antes de validar y actualizar sus proyecciones. Revisión obsoleta/duplicado: SQLSTATE PT409 y HTTP 409, sin actualización parcial.

Constraints/domains: cantidades finitas no negativas hasta cuatro decimales y positivas en entradas; importes positivos hasta dos; costo/promedio hasta ocho; residuo exacto hasta doce (producto de escalas 4 y 8). FKs con RESTRICT, secuencia única por material, una apertura por material y correspondencia movimiento/línea/material. El trigger diferido verifica recepción completa, encadenamiento monetario y proyecciones antes de COMMIT. Guards impiden modificar movimientos/snapshots/vínculos y cambiar la unidad después del primer movimiento.

Auditoría: `inventory.<tabla>.registered` / `inventory.<tabla>.updated`, con actor, timestamp, before/after y motivo de cabecera. El tipo de recepción distingue compra y apertura. Evidencia de costos y auditoría general siguen restringidas a Admin; los eventos de proyección no son compras adicionales.

## Algoritmo y evidencia histórica

Se mantiene valor interno V separado del promedio A. Una entrada total T y cantidad q calcula costo `round(T/q,8)`; actualiza `V'=V+T`, `Q'=Q+q`, `A'=round(V'/Q',8)`. El residuo `T-q*unit_cost` se conserva como evidencia, sin ingreso/gasto/movimiento adicional. Se rechaza costo positivo que colapse a cero. No se reconstruye V multiplicando Q por el promedio redondeado.

DEV verificó 3 unidades por CRC 10: promedio 3.33333333 y residuo 0.00000001; después otras 3 por CRC 11: valor 21 y promedio 3.50000000. También verificó un empate exacto: CRC 1 / 200000000 → 0.00000001, valor interno 1 y residuo -1.00000000. Cambiar el costo de catálogo no modificó el snapshot.

USD reutiliza el resolver de gastos y su proveedor aprobado. La aplicación intenta obtener referencia actual cuando corresponde; el RPC valida la referencia persistida y congela importe original, tasa completa, fecha real, procedencia, origen, fallback y equivalente HALF UP. Un aporte histórico Admin conserva además actor/fecha/motivo. Se observó en DEV el uso de referencia del 2026-10-01 para entrada del 2026-10-02, con fallback explícito. No se presenta como cotización del día ni como prueba de disponibilidad continua del proveedor.

Un vínculo a gasto no crea, modifica ni anula gastos. Anular un gasto no modifica existencias, valoración o snapshots. Compras y consumos no se suman como dos costos; la futura atribución contable permanece en las fases autorizadas correspondientes.

## Matriz

Estados admitidos: COMPLETO, PARCIAL, PENDIENTE, NO APLICA. «Local» usa PostgreSQL PGlite y lógica de aplicación; «Simulado» usa fixture/control de red; «DEV real» usa JWT de usuarios existentes y el Supabase conectado.

| Requisito | Estado | Evidencia | Entorno | Observación |
|---|---|---|---|---|
| 4A-01 Alcance y checkpoint | COMPLETO | Commit 6679da3 y dos migraciones nuevas | Git/local/DEV real | Sin operaciones 4B–4E |
| 4A-02 Primera/segunda entrada y promedio periódico | COMPLETO | phase4a-real, phase4a.test | Local + DEV real | V autoritativo separado de A |
| 4A-03 HALF UP ocho decimales y residuo | COMPLETO | phase4a-precision-real | DEV real | Empate positivo y residuo negativo verificados |
| 4A-04 Ceros, negativos, escala y colapso de costo | COMPLETO | phase4a-real, phase4a.test | Local + DEV real | Sin entradas gratuitas ni float |
| 4A-05 CRC y USD histórico | COMPLETO | phase4a-real | DEV real | 1.25 USD × 501.2345 = 626.54 CRC |
| 4A-06 USD actual con fallback persistido | COMPLETO | phase4a-real y lectura de snapshot | DEV real | Fecha real e indicador conservados |
| 4A-07 Fuente caída/inválida, referencia actual y ausencia absoluta | COMPLETO | expense-rate.test y phase4a.test | Local/simulado | Condiciones controladas; no se borró la caché DEV para fabricarlas |
| 4A-08 Histórico sin tasa exacta y aporte motivado | COMPLETO | phase4a-real | DEV real | No se utiliza una tasa de otra fecha para históricos |
| 4A-09 Saldo inicial solo primer movimiento/motivo | COMPLETO | phase4a-real, phase4a.test | Local + DEV real | Segunda apertura rechazada |
| 4A-10 Aperturas simultáneas | COMPLETO | Dos sesiones en phase4a-real | DEV real | Una persiste, otra 409 |
| 4A-11 Unidad congelada y material inactivo | COMPLETO | DML/RPC phase4a-real; UI phase4a-ui-real | DEV real | Historia permanece consultable |
| 4A-12 Recepción multilínea atómica | COMPLETO | Línea inválida y ausencia de cabecera/proyección parcial | Local + DEV real | Rollback integral |
| 4A-13 Dos entradas concurrentes mismo material | COMPLETO | phase4a-real | DEV real | Un éxito y un 409; sin actualización perdida |
| 4A-14 Multimaterial con orden inverso | COMPLETO | phase4a-real | DEV real | Orden determinístico, sin deadlock observado |
| 4A-15 UUID estable/reenvío/revisión obsoleta | COMPLETO | phase4a-real y phase4a-ui-real | DEV real | No duplicación; formulario conserva UUID al recargar |
| 4A-16 Gasto opcional y actualización concurrente | COMPLETO | phase4a-real | DEV real | Edición simultánea de notas no altera inventario |
| 4A-17 Anular gasto y vincular posteriormente | COMPLETO | phase4a-real, phase4a-precision-real | DEV real | Sin reversión cruzada; vínculo no sobrescribible |
| 4A-18 FK/UUID inexistente | COMPLETO | phase4a-real | DEV real | Gasto inexistente rechazado; no acceso financiero por cambiar UUID |
| 4A-19 Colaborador operativo sin costos | COMPLETO | Cinco tablas financieras vacías; vista operativa y HTML/RSC | DEV real | Sin costos, importes, tasas, promedios ni auditoría |
| 4A-20 Admin/Colaborador/inactivo/anónimo y DML | COMPLETO | JWT reales, perfil inactivo y API directa | DEV real | Perfil restaurado tras la prueba; sin cambios de contraseña |
| 4A-21 Auditoría y snapshot frente a costo actual | COMPLETO | phase4a-real, phase4a-precision-real | DEV real | Actor/timestamp; copia histórica permanece idéntica |
| 4A-22 Mínimos/alertas derivados | COMPLETO | phase4a-precision-real y UI | DEV real | Incluye igualdad; no alerta mutable |
| 4A-23 Responsive cinco anchos y roles | COMPLETO | phase4a-ui-real + capturas inspeccionadas | DEV real | 320/375/768/1024/1440; tarjetas móvil, tablas escritorio |
| 4A-24 Loading/vacío/error y recuperación | COMPLETO | tests/e2e/phase4a.spec.ts | Simulado | Fixture explícito; no sustituye RLS real |
| 4A-25 Red y conflicto UI | COMPLETO | phase4a-ui-real | DEV real + red inducida | Corte del POST simulado; conflicto y alta posteriores reales |
| 4A-26 Regresión Fase 3 | COMPLETO | phase3d-regression-real y pruebas de gasto 4A | DEV real | Pedidos, consecutivos, pagos, ingresos y gastos |
| 4A-27 Equivalencia, RLS/grants y private | COMPLETO | Huellas SQL, migration list, dry-run y API | Local + DEV real | 19 migraciones; cero CHECKs sin validar/definers inseguros |
| 4A-28 Calidad, secretos y artefactos | COMPLETO | Lint/typecheck/tests/build/E2E/audit/verify-secrets | Local | .env.local y test-results ignorados |
| A51 Protección de contraseñas filtradas | PENDIENTE | Security Advisors | DEV real | Obligatorio antes de producción; no bloquea DEV |
| Consumos/devoluciones/ajustes, horas, envíos y rentabilidad | NO APLICA | No hay operaciones habilitadas | Revisión de alcance | Requieren fases posteriores |

## Ejecución y resultados

- `npm run lint`: correcto, sin warnings tras la revisión final.
- `npm run typecheck`: correcto.
- `npm test`: 25 pruebas aprobadas en la repetición final, incluyendo la ampliación de escenarios FX de `phase4a.test.mjs`.
- `npm run build`: correcto.
- `npm run test:e2e`: 26 aprobadas, fixture simulado; las dos pruebas nuevas son 4A y se repitieron correctamente después de los ajustes finales de interfaz.
- `npm audit --omit=dev`: cero vulnerabilidades.
- `node tests/verify-secrets.mjs`: correcto; claves privadas ausentes de archivos versionables y assets cliente; .env.local ignorado.
- `tests/phase4a-real.mjs`: 57 comprobaciones DEV aprobadas.
- `tests/phase4a-precision-real.mjs`: 13 comprobaciones DEV aprobadas.
- `tests/phase4a-ui-real.mjs`: 50 comprobaciones aprobadas: 48 reales y 2 de red inducida; evidencia en `test-results/phase4a-ui-real.json`. Incluye el registro y el vínculo posterior desde UI, con foco de error y conservación del formulario.
- `tests/phase3d-regression-real.mjs`: 31 comprobaciones DEV aprobadas. Solo se añadió soporte opcional a `SIGCA_UI_URL` para usar el servidor real en puerto separado del E2E simulado.

Las pruebas reales usan Admin/Colaborador existentes, sesiones en memoria y JWT ordinarios para operaciones de negocio. Service role se limita al arnés de autenticación autorizado, no a registrar movimientos. No envían correos ni cambian contraseñas. Los fixtures etiquetados VALIDACION-4A, PRECISION-4A, UI-REAL-4A y REGRESION-F3D permanecen en DEV; no son datos de negocio y no se borran como limpieza. La regresión de Fase 3 realiza anulaciones/cancelaciones explícitas de sus fixtures conservando evidencia. El ensayo de inactividad restaura el perfil al finalizar.

Conteo agregado: 149 comprobaciones reales y 2 inducidas, 151 aprobadas. No son 151 casos unitarios independientes: incluyen precondiciones y pasos de recorrido. Matriz: 28 COMPLETO, 0 PARCIAL, 1 PENDIENTE (A51 producción), 1 NO APLICA (fases posteriores).

Capturas/resúmenes/huellas locales están en `test-results/` ignorado, no en documentación versionada. Las capturas móvil/escritorio fueron inspeccionadas; se comprobó ausencia de scroll horizontal, tarjetas y separación financiera por rol. No se añaden librerías, variables de entorno, buckets ni políticas de Storage.

## Hallazgos corregidos y límites de la evidencia

1. Tres FKs compuestas necesitaban índices que cubrieran todas sus columnas: segunda migración aditiva, nueva prueba local/dry-run/validación remota.
2. La recuperación de un 409 permitía enviar antes de que terminara la recarga: transición pendiente bloquea el envío, conserva campos y UUID. El recorrido real vuelve a consultar la revisión y registra correctamente.
3. Los selectores de pruebas debían distinguir el alert de SIGCA del anunciador Next.js, esperar redirección y usar el nombre accesible del select. Son correcciones del arnés, no fallos de autorización.
4. Los importes finales de recepción se presentan a dos decimales; los costos/promedios/residuos se muestran como evidencia de precisión interna.
5. No se simula una caída del proveedor como si fuese una incidencia real. La lógica de proveedor fallido/sin caché tiene evidencia controlada local; la selección de fallback y su persistencia tienen evidencia DEV real. No se alteró la caché remota para ejecutar esos escenarios.

## Equivalencia SQL y Advisors

`tests/sql/phase4a-schema.sql` compara columnas, constraints/domains, funciones, policies, índices, vistas/security_invoker, triggers, grants de tabla/columna/EXECUTE y buckets privados existentes. Huellas local/DEV iguales:

| Grupo | MD5 |
|---|---|
| columns | 30f16266fd6a1c6baa2a60c598f6cc72 |
| constraints | 7bfb161c2f77cce509ba626b3d079895 |
| functions | b8eaf537a46152528e6a6a77f0cb9157 |
| policies | f2050070725aea89ef8ba60124721886 |
| indexes | 5cc44afea88be40abfe832fdb06f53c2 |
| views | d0bd4a131ee9eb1b641a3fef7c11e6a9 |
| triggers | 6087c75704e926367825de767a8a8504 |
| grants | e3ef65fa8f976cdc7ed65ed514dd837d |
| column_grants | 6e20693981cb2c8bc5cf7bad69896e1c |
| execute | 16f1c92faa1e2423bdb2830b83c1ffc3 |

RLS true; constraints sin validar 0; SECURITY DEFINER sin search_path seguro 0. Los tres buckets anteriores siguen privados; 4A no incorpora archivos binarios.

Security Advisors: A51 WARN [protección de contraseñas filtradas](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection), pendiente antes de producción, y un INFO [order_counters sin policy](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy), aislamiento intencional aceptado. Sin hallazgos nuevos de seguridad ni cambios Auth/plan.

Performance Advisors: 34 INFO [unused_index](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index), observaciones dependientes de estadísticas/carga DEV. Incluyen índices anteriores y nuevos; el registro de 23 INFO del cierre 3E se conserva como evidencia histórica. No se elimina ningún índice para silenciarlos. Cero observaciones de FKs sin índice después de la segunda migración.

## Alcance pendiente

No hay decisión funcional nueva elegida por cuenta propia. No se implementan consumos, devoluciones, correcciones de stock, cronómetro, envíos, costeo, rentabilidad o reportes. La ampliación futura 4B deberá extender las restricciones de tipos de movimiento y proyecciones positivas de 4A mediante migraciones nuevas y la autorización que corresponda; no se habilita anticipadamente stock cero después de consumos que todavía no existen.

Entrega sin tag final, pendiente de revisión/aceptación del usuario. A51 continúa pendiente antes de producción.

## Archivos relevantes

Nuevos: seis rutas/loading bajo `src/app/(private)/inventario/`, `src/components/inventory-form.tsx`, `src/features/inventory/domain.ts`, `src/features/inventory/actions.ts`, las dos migraciones indicadas, `tests/phase4a.test.mjs`, `tests/phase4a-real.mjs`, `tests/phase4a-precision-real.mjs`, `tests/phase4a-ui-real.mjs`, `tests/e2e/phase4a.spec.ts`, `tests/sql/phase4a-schema.sql` y este documento.

Modificados después del checkpoint: README, ARCHITECTURE, DATABASE y PHASE4A_PREFLIGHT; navegación `app-shell`/`mas`; formulario, acción y detalle de catálogo para unidad congelada; fixture E2E y puerto configurable del arnés de regresión 3D. AGENTS.md, reference, package.json/lockfile y migraciones previas permanecen intactos. DECISIONS/REQUIREMENTS y las decisiones aprobadas se incorporaron exclusivamente en el checkpoint documental previo.

## Auditoría final solicitada después de la aceptación provisional

Fecha 2026-10-02. Antes de auditar se verificaron status, diff/check, secretos/artefactos, 19 migraciones local/DEV coincidentes y dry-run vacío. Commit de implementación creado: **51b56cd — feat: implement phase 4a inventory receipts and valuation**. Git quedó limpio inmediatamente después. Sin tag.

Esta sección registra la auditoría posterior; sus conteos prevalecen sobre los de implementación anteriores. No fue necesario modificar código de aplicación, migraciones, Auth, configuración remota ni reglas funcionales. Los nuevos archivos son pruebas reproducibles y documentación. El único cambio a un arnés previo es `SIGCA_UI_URL` opcional en phase3e-real, preservando puerto 3000 por defecto.

### Matriz final de los 18 criterios solicitados

| Requisito | Estado | Evidencia | Entorno | Observación |
|---|---|---|---|---|
| 1. Promedio ponderado autoritativo | COMPLETO | phase4a-audit-real y phase4a-real; ejemplos inferiores | DEV real | Cuatro entradas sucesivas fraccionarias, valor/Q/promedio exactos |
| 2. Precisión, HALF UP y residuos | COMPLETO | phase4a-precision-real, phase4a-real, domains SQL | Local + DEV real | Cantidad 4, costo 8, moneda 2; residuo separado; cero/colapso rechazados |
| 3. Atomicidad multilínea | COMPLETO | phase4a-audit-real: tres líneas, segunda inválida | DEV real, fallo inducido de validación | Conteos de siete tablas y audit_log idénticos; proyecciones previas idénticas |
| 4. Concurrencia e idempotencia | COMPLETO | phase4a-real y phase4a-audit-real | DEV real, sesiones independientes | Mismo material, dos aperturas, A/B vs B/A, A/B vs B/C, revisión obsoleta y UUID simultáneo |
| 5. Saldo inicial | COMPLETO | phase4a-real y phase4a-audit-real | DEV real | Admin, positivo, motivo; rechazo después de compra o apertura anterior |
| 6. Unidad congelada | COMPLETO | UI real, save_material Admin/Colaborador, Data API y SQL | Local + DEV real | Sin movimientos conserva edición; con movimientos autoritativamente bloqueada |
| 7. CRC/USD y snapshots | COMPLETO | phase4a-real, SQL audit-rates, phase4a.test y expense-rate.test | DEV real + SQL controlado con rollback + local | CRC sin tasa; fallback real; hoy/exacta histórica con fixture; ausencia absoluta local; actualización de caché no cambia snapshot |
| 8. Independencia respecto de gastos | COMPLETO | phase4a-real y phase4a-audit-real | DEV real | Sin/vínculo válido/inexistente; reclasificar/anular no altera inventario; conteos sin altas automáticas |
| 9. Material inactivo | COMPLETO | phase4a-audit-real y phase4a-real | DEV real | Entrada rechazada; Colaborador sigue viendo existencia/historia |
| 10. Separación financiera por rol | COMPLETO | JWT, JOIN conocido, tablas/vistas y HTML/RSC en cinco anchos | DEV real | Sin datos financieros ni vínculos a gastos en respuestas operativas; rutas Admin rechazadas |
| 11. RLS, grants y private | COMPLETO | Matriz inferior, 28 combinaciones y API directa | DEV real | UUID conocido, JWT previo inactivo, anon, DML y RPC; private devuelve PGRST106 |
| 12. Diario inmutable y reconstrucción | COMPLETO | phase4a-reconstruction.sql + arnés real | DEV real, consulta de todos los movimientos | Cero errores de cadena/proyección, costos faltantes o stock negativo |
| 13. Alerta derivada | COMPLETO | Cambio de min_stock en phase4a-audit-real | DEV real | Igualdad activa alerta, mínimo 0 la retira; proyecciones y snapshots idénticos |
| 14. Auditoría | COMPLETO | Eventos de siete tablas, before/after de proyecciones, motivo de apertura | DEV real | Actor/timestamp; histórico Admin conserva procedencia/motivo; Colaborador sin audit_log |
| 15. Alcance exclusivo | COMPLETO | Catálogo SQL, CHECK de tipos y rutas/build | Local + DEV real | Sin consumption/return/ajustes, timers, shipments, rentabilidad o reportes |
| 16. Regresión Fase 3 | COMPLETO | Reejecución phase3e-real: 117 comprobaciones | DEV real | Pedido, PED, pagos, estados, ingresos, gastos y Storage privado |
| 17. Calidad y Advisors | COMPLETO | Comandos npm, secretos, Security/Performance | Local + DEV real | Hallazgos previos conservados; ningún índice eliminado |
| 18. Evidencia y cierre para revisión | COMPLETO | Este documento y archivos de prueba versionables | Documentación | Sin tag; esperar revisión del usuario |

**18 COMPLETO, 0 PARCIAL, 0 PENDIENTE funcional DEV, 0 NO APLICA dentro de estos 18 criterios.** A51 sigue PENDIENTE antes de producción, por separado; no se considera resuelto ni se cambia Auth/plan. Las fases 4B–4E siguen NO APLICA al alcance de esta auditoría.

### Demostración decimal real

Resultados persistidos por phase4a-audit-real y comprobados con aritmética BigInt escalada independiente de PostgreSQL; los importes no se compararon como float:

| Entrada q | Total entrada CRC | Q acumulada | V acumulado CRC | Promedio HALF UP 8 |
|---|---|---|---|---|
| 0.125 | 10.01 | 0.125 | 10.01 | 80.08000000 |
| 2.0001 | 7.13 | 2.1251 | 17.14 | 8.06550280 |
| 3 | 10.00 | 5.1251 | 27.14 | 5.29550643 |
| 0.0001 | 0.01 | 5.1252 | 27.15 | 5.29735425 |

Se repitió también 10/3 y luego 21/6, y el empate 1/200000000 → 0.00000001 con residuo -1.00000000. Cada entrada incrementa exactamente un movimiento por línea, sin gasto adicional. Reconstrucción global del diario: chain_errors=0, projection_errors=0, missing_costs=0, negative_stock=0. No hay tablas work_sessions/shipments ni RPC de consumo/devolución/ajuste habilitadas.

### Matriz real de permisos

Para cada tabla se probó SELECT de un UUID **existente y conocido**, INSERT directo, UPDATE directo, DELETE directo y la RPC asociada. UPDATE/DELETE incorporan filtros contradictorios como protección adicional contra una mutación accidental; aun sin filas candidatas, PostgreSQL rechaza ambos por falta de privilegios (42501). INSERT mínimo también devuelve 42501 antes de validar contenido. No se borró ninguna fila. Los 28 resultados desglosados por rol se conservan en `test-results/phase4a-audit-real.json`.

| Tabla | Admin | Colaborador | Inactivo | Anónimo | SELECT | INSERT | UPDATE | DELETE | RPC |
|---|---|---|---|---|---|---|---|---|---|
| inventory_receipts | Fila completa | 0 filas | 0 filas | 42501 | Admin activo | 42501 todos | 42501 todos | 42501 todos | Recepción: solo Admin |
| inventory_receipt_items | Fila completa | 0 filas | 0 filas | 42501 | Admin activo | 42501 todos | 42501 todos | 42501 todos | Parte de recepción atómica |
| inventory_receipt_expenses | Fila completa | 0 filas | 0 filas | 42501 | Admin activo | 42501 todos | 42501 todos | 42501 todos | Vínculo: solo Admin |
| inventory_movements | Fila operativa | Fila operativa | 0 filas | 42501 | Perfil activo | 42501 todos | 42501 todos | 42501 todos | Solo derivado de recepción Admin |
| inventory_movement_costs | Fila completa | 0 filas | 0 filas | 42501 | Admin activo | 42501 todos | 42501 todos | 42501 todos | Solo derivado de recepción Admin |
| inventory_balances | Fila operativa | Fila operativa | 0 filas | 42501 | Perfil activo | 42501 todos | 42501 todos | 42501 todos | Solo proyección de recepción Admin |
| inventory_valuations | Fila completa | 0 filas | 0 filas | 42501 | Admin activo | 42501 todos | 42501 todos | 42501 todos | Solo proyección de recepción Admin |

No existe RPC independiente para editar cada tabla hija. La matriz ejercita register_inventory_receipt en esas filas y link_inventory_expense para el vínculo. Admin supera autorización y recibe 22023 ante payload deliberadamente inválido; los otros roles reciben 42501. Altas válidas Admin se comprueban en el recorrido real separado. SELECT se concede a authenticated y RLS comprueba el perfil vigente; el rol de negocio no proviene de metadata editable. Anónimo no tiene grant y private devuelve PGRST106 para los cuatro casos.

La consulta anidada inventory_movements → inventory_movement_costs con UUID conocido retorna movimiento operativo y relación financiera vacía para Colaborador. Los identificadores de trazabilidad operativa no habilitan lectura de costos. Vistas financieras, audit_log y rutas de recepciones permanecen restringidas. No se conceden grants nuevos a service_role ni se usa esa clave como actor de negocio; solo prepara sesiones y bytes de infraestructura en los arneses existentes.

### Separación de entornos y conteos de esta auditoría

- **Local:** 26 tests aprobados, incluyendo el nuevo phase4a-audit.test. Usa PGlite y prueba rollback del guion SQL; los tests del resolver inducen proveedor caído/inválido y ausencia de caché. No equivale a una caída observada del proveedor remoto.
- **Simulado:** 26 E2E con fixture, incluidos loading/vacío/error y roles; no sustituye RLS real.
- **DEV real mediante JWT/UI:** phase4a-audit-real 223, phase4a-real 57, phase4a-precision-real 13, phase4a-ui-real 48 reales, phase3e-real 117. **458 comprobaciones reales** aprobadas.
- **Fallos de red inducidos:** 2 comprobaciones adicionales de phase4a-ui-real, sobre formulario y vínculo contra servidor real. Total del arnés UI 50; **460 comprobaciones aprobadas** sumando las cinco suites, sin contar intentos fallidos del arnés ni el guion SQL como pruebas unitarias adicionales.
- **DEV real, datos sintéticos transaccionales:** phase4a-audit-rates.sql aprobado; crea tasas de prueba de hoy/1905 dentro de BEGIN y ROLLBACK, prueba referencia por fecha, precisión, cambio posterior de caché, unidad/DML/domains y fuerza constraints antes de revertir. No son tasas obtenidas del proveedor. Consulta posterior: cero materiales/recepciones del fixture, cero snapshots históricos incompletos y cero CRC incoherentes. No se borran tasas existentes ni se persiste la actualización de caché.
- **Fallos de negocio deliberados:** cantidad intermedia cero, revisión obsoleta, UUID repetido, carreras, permisos denegados y unidad congelada llegan al PostgreSQL real; sus rechazos no son respuestas mock. Están incluidos en los conteos DEV.

La ausencia absoluta de tasa previa se valida en base local vacía; no se elimina ni oculta la caché de DEV para forzarla. El fallback previo se comprobó con la referencia realmente persistida y congelando su fecha real. Esta limitación de entorno no queda disfrazada como prueba real de indisponibilidad del proveedor.

Lint sin warnings, typecheck/build correctos, npm audit producción con cero vulnerabilidades. Responsive real de 4A repetido para ambos roles en 320/375/768/1024/1440; 3E también verifica módulos previos en esos cinco anchos. Los artefactos visuales y resúmenes permanecen ignorados.

### Hallazgos y cambios de la auditoría

No se encontró una regla funcional incumplida que requiriera modificar 4A. Se corrigió una expectativa del arnés: la primera imagen histórica seleccionada estaba desactivada y debía devolver 404, no 200. La regresión 3E verifica adicionalmente imagen activa → 200, caché private/no-store, SDK directo bloqueado e inactivo → 401. Los tres buckets existentes se comprobaron privados; los comprobantes de gasto siguen accesibles solo mediante su proxy autorizado.

Archivos nuevos: tests/phase4a-audit-real.mjs, tests/phase4a-audit.test.mjs, tests/sql/phase4a-audit-rates.sql y tests/sql/phase4a-reconstruction.sql. Modificados: tests/phase3e-real.mjs (solo URL del servidor de prueba) y este documento. No se editaron migraciones aplicadas ni se crearon otras. No cambian dependencias ni UI/reglas de negocio.

Security: A51 WARN pendiente de producción e INFO order_counters intencional; Performance: 34 INFO unused_index, sin eliminaciones. Se mantienen los enlaces y explicaciones de la sección anterior. No se crea tag final ni se declara aceptación del usuario. Sin avance a 4B/4C/4D/4E.
