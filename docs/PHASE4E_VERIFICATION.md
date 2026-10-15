# Fase 4E — Cierre integral de Fase 4

Fecha: 2026-10-15. Proyecto único SIGCA DEV `pysgfnwsycgoneaecgcl`. Autorización acelerada y precisiones D-22 aprobadas. Resultado: **14 COMPLETO, 0 PARCIAL y 0 PENDIENTE funcional DEV**. No comprende autorización de producción ni Fase 5.

## Matriz

| Requisito | Estado | Evidencia | Entorno | Observación |
|---|---|---|---|---|
| Recepción/valoración 4A | COMPLETO | phase4a-real: 57; phase4e-real | DEV JWT | Compras, snapshots, costos y regresión |
| Consumos/devoluciones/correcciones 4B | COMPLETO | phase4b-real: 71; reconstrucción SQL | DEV JWT/SQL | Cantidad/valor/secuencia coherentes |
| Horas 4C | COMPLETO | phase4c-real: 65; phase4e-real | DEV JWT | Dos trabajadores, pausa/reanudación/finalización y bloqueo ready |
| Envíos 4D | COMPLETO | PHASE4D_VERIFICATION: 20 criterios | Local/DEV/UI | 0 parcial/pendiente funcional |
| Recorrido integrado envío y retiro | COMPLETO | phase4e-real: 36 | DEV JWT | Pedido, producción, consumo, devolución, horas, ready, entrega explícita |
| Independencia de módulos | COMPLETO | phase4e-real | DEV JWT | Inventario no crea finanzas; horas no cambian inventario/finanzas |
| Gasto oficial de envío | COMPLETO | phase4e-real y carreras 4D | DEV JWT | Vínculo explícito, sin duplicar ni modificar gasto |
| Privacidad y permisos | COMPLETO | 4D RLS/UI; regresiones 4A/B/C | DEV JWT/UI | Inactivo/anónimo bloqueados; Colaborador sin costos HTML/RSC/API |
| Concurrencia e idempotencia | COMPLETO | 4D real + regresiones | DEV sesiones independientes | Revisión vieja, carreras con pedido y exclusión gasto/recepción |
| Auditoría y rollback | COMPLETO | 4D real y SQL fault | DEV real + fallos inducidos | Before/after; seis puntos de fallo transaccional |
| Historia y reconstrucción | COMPLETO | phase4e-real; SQL 4B/4C | DEV real | Snapshots de entrada, consumo y tarifa estables |
| Responsive | COMPLETO | 4D UI: 50; auditorías previas 4A/B/C | UI con DEV | Ambos roles; 320/375/768/1024/1440 |
| Regresión Fase 3/Storage | COMPLETO | phase3e-real: 117 | DEV JWT/UI | Storage privado y relaciones financieras preservados |
| Calidad, esquema y secretos | COMPLETO | comandos y huella SQL | Local + DEV lectura | 27 migraciones equivalentes y dry-run vacío |

## Evidencia ejecutada y límites

- Local PostgreSQL/PGlite y unidades: **30/30**. E2E con Supabase simulado: **26/26**. No sustituyen JWT/RLS real.
- 4D API/JWT: **130**; UI real: **50**; red/conflictos UI: **9**, de las cuales **3** son conflicto/corrección reales y **6** comprobaciones de fallos de red/reintento inducidos.
- Regresión real: Fase 3E **117**, 4A **57**, 4B **71**, 4C **65**: **310** comprobaciones correctas.
- Integración 4E: **36** comprobaciones reales, dos recorridos completos mediante RPC autenticadas. No se presenta el recorrido API como recorrido íntegramente manual en navegador.
- Total de esta pasada: **529 comprobaciones reales JWT/UI**, más **6 de red inducida** y **6 puntos de rollback SQL inducido**. Los conteos de suites y criterios son magnitudes diferentes.
- Reconstrucción independiente final: **962 movimientos**, cero diferencias de diario/proyecciones/devoluciones y cero costos faltantes. **130 sesiones finalizadas**, cero diferencias de duración, cero solapamientos, cero tarifas faltantes y cero sesiones abiertas.
- Tarifa utilizada por la prueba temporal: 456.78 CRC; restaurada a su valor previo NULL. Los snapshots de las sesiones de prueba conservan su tarifa aplicada. No es una tarifa empresarial elegida por SIGCA.
- Fixtures identificados se conservan; sin borrar cuentas, registros ni historial. Fallos SQL se ejecutan en BEGIN/ROLLBACK y no dejan triggers/funciones de prueba.
- Lint, typecheck y build correctos. `npm audit --omit=dev`: **0 vulnerabilidades**. Escaneo de archivos versionables y assets cliente correcto; `.env.local` ignorado; ningún SMTP local ni artefacto de pruebas versionable.

## Esquema y archivos

4E no agrega migraciones ni reglas de negocio. 4D incorpora `20261015000100_phase4d_shipments.sql` y `20261015000200_phase4d_address_snapshot.sql`; tres tablas, vista con security_invoker, RPC controlada y guards aditivos. Las **27 migraciones** locales/DEV coinciden; `db push --dry-run --skip-vault` devuelve migrations/seeds/roles vacíos. Huella local/DEV idéntica en columnas, constraints validados, funciones/configuración/grants, RLS y policies.

Aplicación: `/envios`, ShipmentPanel, acciones/tipos de shipping, navegación y vínculo desde pedido. Pruebas: runners 4D API/UI/red, escenarios PGlite, SQL de rollback/huella y runner integrado 4E. Documentación: decisiones, requisitos, arquitectura, base de datos, README y matrices 4D/4E. No dependencias, variables de entorno o buckets nuevos.

## Reproducción

Ejecutar los comandos de calidad de package.json y `node tests/verify-secrets.mjs`. Para DEV, configurar SIGCA_REAL_TESTS=1, SIGCA_TEST_ADMIN_EMAIL y SIGCA_TEST_MEMBER_EMAIL de las cuentas confirmadas autorizadas, sin contraseñas ni enlaces en archivos. Construir e iniciar servidor local y definir SIGCA_UI_URL (en esta pasada http://localhost:3005).

Ejecutar secuencialmente `tests/phase4d-real.mjs`, `tests/phase4d-ui-real.mjs`, `tests/phase4d-network-real.mjs`, las regresiones indicadas y `tests/phase4e-real.mjs`. El runner UI utiliza identificadores producidos por el runner API. No paralelizar suites que inactivan perfiles o cambian temporalmente Configuración. Evidencias JSON/logs/capturas permanecen en test-results ignorado.

Las reconstrucciones son `tests/sql/phase4b-reconstruction.sql` y `tests/sql/phase4c-reconstruction.sql`. El SQL de rollback 4D inyecta fallos y revierte la transacción completa; no es una caída espontánea del servicio. La equivalencia usa `tests/sql/phase4d-schema.sql` y la huella de la prueba local.

## Observaciones conservadas

- [A51: protección contra contraseñas filtradas](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection), WARN obligatorio antes de producción. No se modificó Auth ni el plan.
- [order_counters sin policies](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy), único INFO Security aceptado como aislamiento intencional.
- [Performance: unused_index](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index), **48 INFO**, sin WARN/ERROR en consulta final; antes del recorrido eran 49. No se eliminó ningún índice.
- Cinco avisos altos de dependencias de desarrollo ya documentados en 4C; mantenimiento de tooling separado de las dependencias de producción, que pasan audit.
- Tarifa empresarial definitiva pendiente como dato de Administración, puede permanecer NULL y bloquea iniciar cronómetro hasta configurarla.

Fase 4 cerrada para desarrollo bajo autorización acelerada. Commit de cierre: `feat: complete phase 4 operations and validation`; tag previsto `v0.11-phase4-complete`, sin sobrescribir tags. Fase 5 no implementada: sin costeo agregado, rentabilidad ni reportes.
