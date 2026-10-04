# Fase 4C — Control de horas

Fecha: 2026-10-04. Alcance: D-24, complementando D-22/D-23. Implementación lista para revisión; no declara aprobación del usuario ni cierre de 4D/4E. Proyecto único: SIGCA DEV `pysgfnwsycgoneaecgcl`.

## Resultado y entornos

- 28 criterios funcionales/técnicos COMPLETO, 0 PARCIAL y 0 PENDIENTE funcional. Dos pendientes externos separados: valor real de tarifa y A51 antes de producción.
- Local: `npm test`, 29/29; PostgreSQL PGlite aplica todas las migraciones. El caso 4C comparte escenarios con DEV, no sustituye sus pruebas de JWT/concurrencia.
- DEV real: 65 comprobaciones `phase4c-real.mjs`, 30 `phase4c-boundaries-real.mjs`, 46 de UI real. Total específico 4C: **141** comprobaciones reales, sin sumar nuevamente ejecuciones repetidas.
- Fallos inducidos: 2 abortos de red UI (uno por rol) y 1 fallo SQL de auditoría dentro de BEGIN/ROLLBACK. Se ejecutaron sobre aplicación/DEV reales, pero el fallo fue provocado; no se presentan como caídas espontáneas.
- Regresión DEV real: Fase 3 integrada 117, 4A 57, 4B 71: **245** comprobaciones. Total de comprobaciones reales específicas + regresión: **386**.
- Simulado: `npm run test:e2e`, **26/26**, con fixture Supabase local; no se cuenta como evidencia de RLS/concurrencia remota.
- Reconstrucción final independiente por suma de tramos trabajados: **22 sesiones terminadas, 0 diferencias, 0 solapamientos, 0 tarifas faltantes, 0 sesiones abiertas**. Además el runner JWT reconstruyó sus primeras 16 mediante microsegundos BigInt independientes del cálculo SQL.
- Lint sin errores/advertencias; typecheck y build correctos; `npm audit --omit=dev`: 0 vulnerabilidades.

## Matriz

Estados: COMPLETO / PARCIAL / PENDIENTE / NO APLICA. Evidencia de scripts en `tests/`; resultados generados/capturas en `test-results/`, ignorado por Git.

| Requisito | Estado | Evidencia | Entorno | Observación |
|---|---|---|---|---|
| C01 Modelo running/paused/finished | COMPLETO | Migración principal; scenarios | Local + DEV real | No idle persistido |
| C02 Una sesión abierta global | COMPLETO | Índice parcial; doble Play y Play A/B | Local + DEV real | Worker lock serializa también historia/correcciones |
| C03 Varios trabajadores por pedido | COMPLETO | scenarios | Local + DEV real | Sin unicidad por pedido |
| C04 Pedido/línea válidos | COMPLETO | scenarios; boundaries | Local + DEV real | Línea ajena rechazada; histórica inactiva admitida |
| C05 Inicio sin tarifa bloqueado | COMPLETO | scenarios + UI ambos roles | Local + DEV real | DEV restaurado a NULL |
| C06 Tarifa CRC positiva/2 decimales/snapshot | COMPLETO | scenarios; RLS rates/view | Local + DEV real | Cero y escala extra rechazados; cambio no afecta sesión |
| C07 FLOOR neto; cero segundos | COMPLETO | 10.9→10, 0.8→0; reconstrucción | Local + DEV real | Nunca redondear cada intervalo |
| C08 Pausas consistentes | COMPLETO | Múltiples pausas; doble pausa; solapadas | Local + DEV real | Una abierta; intervalos contenidos |
| C09 Reanudación | COMPLETO | scenarios; carrera resume/finish | Local + DEV real | Solo propia, paused, in_production |
| C10 Finalización running/paused | COMPLETO | scenarios + UI | Local + DEV real | Pausa y sesión cierran con el mismo instante |
| C11 Persistencia y dispositivo | COMPLETO | phase4c-ui-real | DEV real, navegadores automatizados | Recarga y segundo contexto autenticado independiente; no prueba física de hardware |
| C12 Idempotencia | COMPLETO | UUID secuencial/concurrente | DEV real | Mismo UUID/payload reconoce resultado, no duplica |
| C13 Revisión y carreras | COMPLETO | pause/finish, resume/finish, intervención Admin | DEV real | Conflicto PT409, sin pérdida silenciosa |
| C14 Integración con transiciones | COMPLETO | Tres bloqueos + carreras transición/Play | Local + DEV real | Mismo bloqueo FOR UPDATE de orders; sin autocierre |
| C15 Inactivo/intervención Admin | COMPLETO | JWT previo; Admin finaliza ajena | DEV real | Trabajador restaurado; historia preservada |
| C16 Históricos y cronología | COMPLETO | históricos Delivered/Cancelled/inactivo; boundaries | Local + DEV real | Límites de confirmación/entrega/cancelación, no futuro |
| C17 Correcciones temporales/pausas | COMPLETO | scenarios; boundaries | Local + DEV real | Agregar/quitar/corregir pausas; validación atómica |
| C18 Actividad y atribución | COMPLETO | boundaries; corrección UI Admin | DEV real | Pedido/línea histórica; atribución no cambia tiempos |
| C19 Trabajador/tarifa inmutables | COMPLETO | Rechazos payload; snapshot antes/después | Local + DEV real | No reasignar trabajador |
| C20 No solapamiento | COMPLETO | Alta solapada rechazada; reconstrucción global | Local + DEV real | Intervalos [inicio,fin); abierta incluye pausa |
| C21 RLS/Data API/DML | COMPLETO | JWT Admin/Colaborador/inactivo/anon | DEV real | INSERT/UPDATE/DELETE directo rechazados; private no expuesto |
| C22 Colaborador sin tarifa | COMPLETO | Tabla/vista RLS, RPC, HTML/RSC cinco anchos | DEV real | Historia operativa de otros trabajadores sí visible |
| C23 Auditoría y atomicidad | COMPLETO | before/after con pausas; SQL rollback | DEV real + fallo inducido | Sesión/tarifa/solicitud ausentes tras fallo; sin eventos por segundo |
| C24 Reconstrucción de duración | COMPLETO | phase4c-reconstruction.sql | DEV real | 22 sesiones; cero diferencias |
| C25 Responsive/estados | COMPLETO | UI admin/member; capturas | DEV real + 2 fallos de red inducidos | 320/375/768/1024/1440; formularios Admin también |
| C26 Regresión y aislamiento financiero | COMPLETO | 3E/4A/4B; boundaries before/after | DEV real | Horas no modifica pagos/ingresos/gastos/inventario |
| C27 Calidad/secretos | COMPLETO | lint/typecheck/tests/build/E2E/audit/scanner | Local + simulado | Sin secretos ni artefactos versionables |
| C28 Migraciones/Advisors/equivalencia | COMPLETO | CLI/MCP + phase4c-schema.sql | Local + DEV real | 25 migraciones; sin pendientes; sin alertas Security nuevas |

## Objetos e integración

Migraciones nuevas (no se editó ninguna aplicada):

1. `20261004072955_phase4c_work_sessions.sql`: cuatro tablas, operaciones, auditoría, integridad, RLS/grants e integración aditiva con pedidos.
2. `20261004075210_phase4c_rate_projection.sql`: vista Admin `security_invoker` que entrega tarifa como texto decimal, evitando pérdida de precisión de JSON/JavaScript.
3. `20261004175741_phase4c_read_snapshot.sql`: lectura STABLE para que sesión y server_now compartan snapshot; evita observar un Play concurrente posterior al instante de consulta.

Las tres pasaron pruebas locales y dry-run individual antes de aplicarse exclusivamente en DEV. Las 22 migraciones anteriores permanecen intactas; ahora existen 25 locales/remotas, sin seeds/roles/Vault pendientes. Huellas local/DEV iguales para columnas, constraints, funciones (incluida volatilidad/config/grants), RLS y policies.

Tablas: `work_sessions`, `work_pauses`, `work_session_rates`, `work_session_requests`. Vistas: `work_session_rates_read`. Tarifas separadas físicamente. Foreign keys a perfiles/pedidos/líneas/sesiones; índices de relaciones, trabajador/fecha, unicidad parcial de sesión abierta y de pausa abierta.

RPC públicas: `work_operate(request_id, operation, target, expected_revision, payload)` y `work_read(target_order)`. Operaciones: start/pause/resume/finish/historical/correct. Wrappers invoker, helpers privados definer solo donde hace falta; search_path vacío y grants explícitos. Sin DML de aplicación. Perfiles vigentes, nunca metadata editable.

Helpers: work_seconds, work_validate, work_integrity, work_immutable, work_order_guard, work_operate y work_read. Integridad diferida contrasta sesión/pausas/tarifa; guards preservan identidad/tarifa/solicitud. El trigger aditivo `work_order_guard` cubre tanto transición como corrección de fechas: **no fue necesario reemplazar transition_order ni correct_order_dates**. Sus firmas, cuerpos, grants y todos los triggers anteriores se compararon sin diferencias en el test local 4C. No DROP ni flexibilizaciones de constraints anteriores; tarifa endurecida con CHECK adicional compatible con NULL.

Locks: perfiles ordenados FOR SHARE → UUID de solicitud → serialización por trabajador → pedidos ordenados FOR UPDATE → sesión → pausas. El lock de fila de pedido es el mismo utilizado por private.lock_order y 3B/4B; no usa una exclusión independiente de pedidos. Tiempo efectivo tomado después de locks relevantes. RLS de lectura operativa para perfiles activos; rates solo Admin; solicitudes para actor/Admin. Private sigue fuera de Data API.

Corrección D-24 actualiza fila vigente y permite sustituir pausas dentro de la transacción, conservando todas las pausas anteriores/nuevas en audit_log; no añade sistema de versiones ni borra auditoría. Eventos work_session.start/pause/resume/finish/admin_finished/historical/correct. Snapshot de tarifa inmutable vinculado 1:1 a la sesión.

## Interfaz y reproducción

`/tiempo`, acceso desde sidebar, Más, pedido y líneas; indicador global de sesión propia. Historia de equipo por pedido, sesiones abiertas del equipo para Admin, intervenciones, correcciones y carga histórica. Contador visual con resincronización al volver, reconectar y actuar. SweetAlert2, Sonner y Lucide; tarjetas móviles, reduced-motion y CSS existente. Formularios conservan marcas exactas no editadas, incluidas pausas con microsegundos, al corregir otros campos.

No se calcula rentabilidad ni se crean movimientos financieros. La lectura financiera entrega tarifa histórica únicamente a Admin. No se instalaron dependencias, variables ni buckets adicionales.

Comandos de reproducción:

```text
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
npm audit --omit=dev
node tests/verify-secrets.mjs
```

Los runners reales requieren `SIGCA_REAL_TESTS=1`, correos de identidades de prueba existentes en `SIGCA_TEST_ADMIN_EMAIL`/`SIGCA_TEST_MEMBER_EMAIL` y `SIGCA_UI_URL` apuntando al servidor local real (esta ejecución: http://localhost:3003). No compartir tokens/contraseñas; las sesiones de prueba se mantienen en memoria. Ejecutar pruebas que temporalmente modifican tarifa/estado de perfil **secuencialmente**, nunca junto con otra prueba que use esas identidades. Fixtures identificados VALIDACION-4C se conservan; no hay borrado compensatorio.

La primera medición ampliada del botón en 1440 no obtuvo una caja estable; la prueba final espera visibilidad y tamaño y pasa en todos los anchos. No se redujo el umbral táctil. E2E muestra errores de red/lectura esperados de escenarios inducidos; suite final 26/26. El test 3E ahora toma su huella inmediatamente después de su propia migración: no atribuye el trigger posterior 4C a cambios de 3E. El test 4C comprueba aparte la conservación de funciones/triggers anteriores.

## Advisors y pendientes externos

| Punto | Estado | Observación |
|---|---|---|
| Valor real de hora | PENDIENTE — dato Admin | DEV queda en NULL; Play bloqueado correctamente. No se inventó valor empresarial. Valores de prueba restaurados |
| A51 auth_leaked_password_protection | PENDIENTE antes de producción | WARN preexistente, no bloquea DEV; no se cambió Auth ni plan |
| order_counters | NO APLICA como corrección | INFO aceptado por aislamiento intencional, sin policies/grants nuevos |
| Performance | NO APLICA como eliminación automática | 44 INFO unused_index, sin WARN/ERROR; índices conservados |

[A51](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection), [aislamiento RLS](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy), [observaciones de índices](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index).

No nuevas decisiones funcionales. No 4D/4E, envíos, rentabilidad ni reportes. Sin tag final; cambios preparados para revisión del usuario, sin commit/push automático en esta entrega.
