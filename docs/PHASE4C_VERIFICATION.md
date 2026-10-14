# Fase 4C — Control de horas

Implementación: 2026-10-04, checkpoint `24abe2e`. Auditoría final iniciada el 4 y retomada el 11 y el 14 de octubre de 2026. Alcance: D-24, complementando D-22/D-23. Proyecto único: SIGCA DEV `pysgfnwsycgoneaecgcl`. La sección «Auditoría final» al final de este documento sustituye los conteos de implementación siguientes; no declara aprobación del usuario ni cierre de 4D/4E.

## Resultado de implementación previo a la auditoría final

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

No nuevas decisiones funcionales. No 4D/4E, envíos, rentabilidad ni reportes. Implementación confirmada posteriormente en `24abe2e`, sin tag final.

## Auditoría final — 20 criterios solicitados

Auditoría final completada el 14 de octubre de 2026: **20 COMPLETO, 0 PARCIAL, 0 PENDIENTE funcional, 0 NO APLICA**. Pendientes externos separados: tarifa empresarial definitiva, A51 antes de producción y avisos de dependencias de desarrollo. Esta matriz sustituye los conteos de la implementación inicial; la aprobación corresponde al usuario.

| ID / requisito | Estado | Evidencia | Entorno | Observación |
|---|---|---|---|---|
| A4C-01 Duración | COMPLETO | scenarios, audit-real, reconstruction.sql | Local + DEV real | FLOOR una vez; <1 s, varios intervalos, tres días, pausas en extremos |
| A4C-02 Unicidad | COMPLETO | phase4c-real, audit-real; índice parcial | DEV real / JWT | Doble Play, pedidos distintos, paused, varios trabajadores |
| A4C-03 Pausas | COMPLETO | scenarios, phase4c-real | Local + DEV real | Doble pausa/reanudación; cierre paused con timestamp idéntico |
| A4C-04 Tarifa | COMPLETO | scenarios, audit-real, ui-real | DEV real / JWT + HTML/RSC | NULL bloquea; cero/negativo/escala extra rechazados; snapshot inmutable |
| A4C-05 Transiciones | COMPLETO | phase4c-real + audit-real | DEV real, clientes independientes | Play/reanudar/finalizar contra los tres destinos; sin autocierre |
| A4C-06 Inactivo | COMPLETO | phase4c-real + audit-real | DEV real / JWT previo | Pausa/reanudación/fin rechazados; cierre Admin explícito; perfil restaurado |
| A4C-07 Históricos | COMPLETO | scenarios, boundaries, audit-real | Local + DEV real | Producción/Ready/Delivered/Cancelled, trabajador/línea inactivos, límites y tarifa explícita |
| A4C-08 Correcciones | COMPLETO | scenarios, boundaries, audit-real | Local + DEV real | Inicio/fin/pausas/actividad/pedido/línea; identidad/tarifa inmutables; before/after |
| A4C-09 Fechas del pedido | COMPLETO | scenarios; trigger work_order_guard | Local + DEV real | Fecha incompatible rechazada sin desplazar sesiones |
| A4C-10 Idempotencia | COMPLETO | phase4c-audit-real.mjs | DEV real / JWT | Secuencial y simultánea en las siete operaciones, incluida intervención Admin; payload distinto PT409 |
| A4C-11 Rollback | COMPLETO | phase4c-atomicity-audit.sql | DEV real, cinco fallos inducidos | Sesión, pausa, tarifa, solicitud y auditoría; cero estado parcial; BEGIN/ROLLBACK |
| A4C-12 RLS/grants | COMPLETO | phase4c-audit-real.mjs; matriz siguiente | DEV real / JWT | Cinco relaciones, cuatro identidades; DML directo rechazado |
| A4C-13 Privacidad | COMPLETO | audit-real + ui-real + inspección de código | DEV real + revisión | Historial ajeno operativo permitido; costos no consultados para Colaborador |
| A4C-14 Concurrencia/locks | COMPLETO | phase4c-real + audit-real | DEV real | Perfiles → solicitud → trabajador → pedidos → sesión → pausas; sin deadlock observado |
| A4C-15 Desconexión | COMPLETO | ui-real + audit-ui-real | UI DEV real + red inducida | Cierre de página/proceso, navegador nuevo, otro contexto; pérdida de respuesta tras COMMIT y reintento sin duplicación en ambos roles |
| A4C-16 Auditoría | COMPLETO | audit-real; conteo eventos/solicitudes | DEV real | Siete tipos de evento; no eventos por segundo; sin lectura Colaborador |
| A4C-17 Responsive | COMPLETO | ui-real + audit-ui-real | UI DEV real + conflictos coordinados | Admin/Colaborador: 320/375/768/1024/1440; controles, indicador, historial, intervención, corrección/histórico, privacidad y reduced-motion |
| A4C-18 Regresión | COMPLETO | phase3e-real, phase4a-real, phase4b-real | DEV real | 3E 117, 4A 57 y 4B 71: 245 comprobaciones aprobadas; 3E ejecutada sobre parches de seguridad |
| A4C-19 Esquema | COMPLETO | CLI; phase4c-schema.sql; catálogos PG | Local + DEV real | Tres migraciones 4C, 25 totales, dry-run vacío; anteriores intactas |
| A4C-20 Calidad/alcance | COMPLETO | comandos de calidad y Advisors | Local + simulado + DEV real | lint/typecheck/tests/build/E2E correctos; audit producción cero; cinco avisos de tooling documentados aparte |

### Conteos finales y evidencia reproducible

- Backend/JWT DEV: 65 del runner base + 30 de límites + 176 ampliadas = **271 comprobaciones**.
- UI base: **48** comprobaciones (46 reales y dos fallos de red inducidos).
- UI ampliada: **93** comprobaciones por bloques: 50 Admin, 35 Colaborador, cuatro de respuesta perdida/reintento y cuatro de cierre/reapertura del proceso de navegador. De estas, **79** son recorridos reales y **14** usan fallos de red inducidos/coordinación explícita (10 conflictos con polling abortado y cuatro de respuesta perdida/reintento). No se cuentan las repeticiones ni los intentos fallidos como aprobaciones adicionales.
- El bloque Admin se completó antes del fallo de instrumentación de red del primer recorrido. Los bloques restantes se ejecutaron por separado con SIGCA_UI_SEGMENT=member/network/browser; el runner sin esta variable ejecuta todo. Evidencia ignorada por Git: phase4c-audit-ui.json (50), phase4c-audit-ui-member.json (35), phase4c-audit-ui-network.json (4), phase4c-audit-ui-browser.json (4). No se afirma que el primer recorrido completo haya pasado.
- Rollback: **cinco puntos de fallo SQL inducidos** en DEV, todos sin estado parcial. Se distinguen de los recorridos ordinarios y del fallo de auditoría de la implementación inicial.
- Regresión real: **245** comprobaciones (3E:117, 4A:57, 4B:71), incluida protección de Storage y vínculos financieros.
- Local: **29/29** tests; E2E con Supabase simulado: **26/26**. Lint, typecheck y build aprobados sobre Next.js 16.3.8; lint del runner ampliado repetido después de sus ajustes. No se presenta E2E simulado como prueba de RLS remota.
- Reconstrucción independiente final de **112 sesiones terminadas**: cero diferencias, cero solapamientos, cero snapshots faltantes y cero sesiones abiertas. Las sesiones de fixtures/interrupciones se conservan; no hubo borrados compensatorios.
- Estado DEV final: settings.hourly_rate = NULL; perfiles restaurados activos; cero triggers de inyección restantes. La tarifa definitiva sigue pendiente como dato, no como decisión funcional.
- 14 de octubre: **25 migraciones local/DEV equivalentes**, dry-run vacío; huellas idénticas de columnas, constraints, funciones, RLS y policies. Tres migraciones 4C originales; ninguna nueva durante auditoría.
- Security: A51 WARN y order_counters INFO preexistentes. Performance: 44 INFO unused_index, sin WARN/ERROR. No se alteraron Auth/plan ni índices.
- npm audit --omit=dev: **0 vulnerabilidades**. npm audit completo: **5 high** en herramientas de desarrollo; no están resueltas ni se ocultan con el resultado de producción.
- Git: seis archivos modificados y tres nuevos, exclusivamente correcciones 4C, parches de seguridad, pruebas y documentación. Sin secretos ni artefactos de prueba versionables; .env.local y test-results ignorados. Sin commit ni tag de cierre.

### Matriz de acceso comprobada por Data API y JWT

«Operativo» permite leer sesiones/pausas de otros trabajadores; no implica lectura financiera. «Propias» son solicitudes cuyo actor es el usuario vigente. La ausencia de filas bajo RLS es un rechazo de datos válido; no se exige un error HTTP para SELECT filtrado.

| Tabla/vista | Admin | Colaborador | Inactivo | Anónimo | SELECT | INSERT | UPDATE | DELETE | RPC |
|---|---|---|---|---|---|---|---|---|---|
| work_sessions | Operativo completo | Operativo completo | Cero filas | Denegado | RLS perfil activo | Denegado | Denegado | Denegado | work_operate |
| work_pauses | Operativo completo | Operativo completo | Cero filas | Denegado | RLS perfil activo | Denegado | Denegado | Denegado | work_operate |
| work_session_rates | Completo | Cero filas | Cero filas | Denegado | Solo Admin | Denegado | Denegado | Denegado | Snapshot automático; histórica Admin |
| work_session_requests | Completo | Propias | Cero filas | Denegado | Actor/Admin activo | Denegado | Denegado | Denegado | Evidencia automática, sin edición |
| work_session_rates_read | Completo | Cero filas | Cero filas | Denegado | security_invoker | Denegado | Denegado | Denegado | Ninguna mutación directa |

work_read exige perfil activo y devuelve datos operativos. work_operate exige perfil vigente: operaciones propias para Colaborador; Admin puede intervenir pausa/fin ajenos con motivo y crear/corregir históricos. Ambos RPC rechazan inactivo y anónimo. Roles administrativos se consultan en profiles, no en metadata. private permanece fuera de Data API. Los intentos DELETE adversariales se filtraron por UUID aleatorio inexistente: no se borraron registros.

No hay SELECT * de costos en el flujo de aplicación para luego ocultarlos en frontend. El servidor consulta la vista de tarifas únicamente dentro de la rama Admin. work_read serializa la tabla operativa work_sessions y campos explícitos de pausas/perfil, sin unir tarifas. Los SELECT * de scripts de auditoría son pruebas adversariales o lecturas administrativas, no respuestas de aplicación al Colaborador.

### Correcciones y hallazgos de la auditoría

- RF-HOR-01/05: añadido tiempo acumulado del pedido desde sus duraciones operativas; no se calcula costo de mano de obra.
- RF-HOR-08: el indicador global identifica ahora el número PED consultado en servidor bajo RLS; no añade datos financieros ni altera RPC/esquema.
- Se corrigieron dos supuestos del nuevo runner: preparar una sesión de otro trabajador antes de verificar su historial; aceptar SELECT sin filas como protección RLS de settings. No se modificaron permisos para satisfacer las pruebas.
- Se corrigió la instrumentación UI para esperar la hidratación tras navegar y la confirmación de Reanudar antes de cerrar la pestaña. Una respuesta de lectura no acredita que el formulario esté listo; un clic no acredita COMMIT. Estos ajustes no cambian la aplicación ni sus reglas.
- Las carreras UI de revisión obsoleta inducen temporalmente un fallo de polling para conservar una vista obsoleta; la mutación y el conflicto provienen de DEV real. Las acciones esperan la carga del cliente antes de interactuar. No se presenta esa coordinación como uso espontáneo.
- El control de red perdida exige interceptar realmente la acción y comprobar el estado comprometido, sin contar un intento que no llegó al servidor. Los fixtures interrumpidos se cierran explícitamente por RPC con motivo; nunca se borran.
- El 11 de octubre npm informó tres dependencias de producción vulnerables. Se fijaron Next.js/eslint-config-next 16.3.8, Sharp 0.35.5 y source-map-js transitivo 1.2.2. npm audit --omit=dev vuelve a cero. Referencias: [Next.js](https://github.com/advisories/GHSA-3w37-wq28-93x7), [Sharp](https://github.com/advisories/GHSA-wq5f-xc86-pv6w), [source-map-js](https://github.com/advisories/GHSA-68fv-2mgg-jv7q).
- npm audit completo todavía identifica cinco nodos de desarrollo en la cadena braces/micromatch/fast-glob/eslint-config-next. No están en el árbol de producción evaluado por --omit=dev. El remedio automático propuesto degrada eslint-config-next a 14.2.35; no se aplicó ese cambio mayor incompatible. Se registra como pendiente de mantenimiento de tooling, separado de funcionalidad y de A51.

### Observaciones conservadas

A51 permanece pendiente obligatorio antes de producción; no se modificó Auth ni el plan. order_counters permanece aislado intencionalmente. Los 44 INFO de Performance están documentados; ningún índice fue eliminado para silenciarlos. Tarifa empresarial definitiva pendiente como dato de Admin: no se inventa, DEV debe finalizar en NULL.

Sin migraciones adicionales de auditoría, sin cambios de reglas D-24, sin envíos 4D, 4E, rentabilidad, reportes ni cálculo monetario agregado de mano de obra. Sin commit/tag de cierre automático: esperar revisión del usuario.
