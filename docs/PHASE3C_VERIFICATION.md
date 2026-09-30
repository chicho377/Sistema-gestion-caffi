# Fase 3C — Verificación de ingresos manuales

## Alcance y entorno

Exclusivamente Fase 3C, posterior a 3B cerrada en `f7b71d5`. Proyecto comprobado SIGCA DEV `pysgfnwsycgoneaecgcl`. No 3D/3E, gastos, reportes, devoluciones ni modificaciones funcionales de pagos. D-02/D-19/D-20/D-21 siguen vigentes. Los ingresos de pedidos siguen únicamente en payments.

## Migración e inventario

`20260929201704_phase3c_manual_income.sql`: una transacción BEGIN/COMMIT, exclusivamente objetos nuevos 3C; sin DROP, TRUNCATE, reset ni modificación de datos existentes. El dry-run mostró solo ese archivo, sin seeds ni roles; aplicado a DEV. Doce versiones locales/remotas coinciden.

`manual_income`: id UUID PK; amount sobre dominio numeric quote_money (finito, escala <=2) con CHECK >0; currency CRC; income_date timestamptz; income_type opcional product_sale/cards/stickers/other; payment_method opcional cash/sinpe_movil/transfer/card/other; description opcional <=3000; is_historical calculado en America/Costa_Rica; status valid/voided; created_by, voided_by FK restrictivas a profiles; voided_at/void_reason; created_at/updated_at reales. Sin order_id/payment_id ni FK comercial. CHECKs de cronología/finitud, estados, catálogos existentes y evidencia completa de anulación. Índice fecha/estado/id y ambos actores.

- `public.register_manual_income(uuid,jsonb)` → `private.register_manual_income`: importe textual exacto, lista cerrada de campos, fecha no futura, identidad auth.uid, bloqueo compartido de perfil Admin activo. Reutiliza validadores privados de dinero/fecha ya existentes sin modificarlos. UUID estable de solicitud evita duplicar al reintentar; conflicto HTTP 409.
- `public.void_manual_income(uuid,text)` → `private.void_manual_income`: mismo control de actor, bloqueo FOR UPDATE del ingreso, transición única valid → voided, motivo 1–1000 y timestamp confiable. Segunda anulación/conflicto devuelve 409.
- Wrappers SECURITY INVOKER; únicamente implementaciones privadas necesarias SECURITY DEFINER; todas con search_path vacío. EXECUTE solo authenticated en operaciones, no en helpers de triggers. Sin permiso comercial service_role.
- Trigger BEFORE `manual_income_guard`: autor y fechas del sistema, inmutabilidad de todos los campos originales, solo anulación válida, rechazo de DELETE incluso fuera del cliente.
- Trigger AFTER `manual_income_audit` → `private.audit_manual_income`: eventos manual_income.created/manual_income.voided, actor, entidad, motivo, before/after completos y timestamp. Fallo de auditoría revierte alta/anulación.
- `manual_income_read`: security_invoker=true, importe transportado como texto exacto, hereda RLS. No se crea agregación/reporte.

## Permisos comprobados

| Actor | SELECT tabla/vista | INSERT | UPDATE | DELETE | RPC |
|---|---|---|---|---|---|
| Admin activo | Permitido | Denegado directo | Denegado directo | Denegado | Alta/anulación autorizadas |
| Colaborador | 0 filas incluso UUID conocido | Denegado | Denegado | Denegado | Denegado |
| Inactivo con JWT vigente | 0 filas | Denegado | Denegado | Denegado | Denegado |
| Anónimo | Denegado | Denegado | Denegado | Denegado | Denegado |

RLS `manual_income_admin_read`: SELECT authenticated USING (SELECT private.is_admin()), que consulta rol/estado vigente. Solo grant SELECT sobre tabla/vista. Ningún grant/policy DML. `private` no expuesto (PGRST106). Colaborador tampoco lee audit_log. Las pruebas negativas DELETE apuntan a UUID inexistente; ninguna fila se elimina. UPDATE del importe calculado de la vista puede devolver 0A000 antes de evaluar grants; UPDATE de tabla devuelve 42501. Los grants de vista también se inspeccionaron y compararon con local.

## Matriz requisito por requisito

| Requisito | Estado | Evidencia | Prueba | Observación |
|---|---|---|---|---|
| C01 Separación payments/manual_income | COMPLETO | Tabla sin vínculos; sin triggers sobre payments | SQL local/DEV, huellas 3B | UI orienta a Pedidos; no clasificación automática |
| C02 Admin vigente exclusivo | COMPLETO | RLS, requireAdmin y bloqueo de perfil | JWT DEV tabla/vista/RPC/UI | Actor de auth.uid, no metadata |
| C03 Colaborador sin datos con UUID conocido | COMPLETO | Matriz JWT y redirección de RSC | DEV 5 anchos | No contenido sensible en respuesta HTML/RSC |
| C04 Inactivo/anónimo sin acceso | COMPLETO | Matriz y RPC negativas | JWT DEV; Admin inactivo en SQL local/DEV | Se restaura estado del Colaborador al terminar |
| C05 Numeric CRC >0 <=2 decimales | COMPLETO | Dominio/constraint/validador | Local y API DEV | Cero, negativo, 3 decimales, NaN/Infinity, exponente y USD rechazados; no redondeo de entrada |
| C06 Fecha actual/histórica no futura | COMPLETO | Validador BD/trigger/marca histórica | Local/DEV, alta UI actual y RPC histórica | Hora empresarial Costa Rica; created_at real |
| C07 Campos/catálogos aprobados | COMPLETO | CHECKs, formulario, whitelist RPC | Local/DEV | Opcionales conservan NULL; sin catálogo nuevo |
| C08 DML directo bloqueado | COMPLETO | Revokes y matriz cuatro actores | API DEV tabla/vista | Sin UPDATE que eluda RPC |
| C09 Inmutabilidad financiera/descriptiva | COMPLETO | Trigger y comparación de campos | Local/DEV | No se inventó permiso de edición de notas |
| C10 Anulación Admin motivada | COMPLETO | RPC, actor/fecha/motivo y UI | Local/API/UI DEV | No devolución ni borrado |
| C11 Segunda anulación/concurrencia | COMPLETO | Bloqueo de fila y HTTP 409 | Dos sesiones DEV concurrentes | Un éxito, un conflicto; original íntegro |
| C12 Idempotencia de alta | COMPLETO | PK de UUID de solicitud | API DEV | Reintento mismo UUID no duplica ingreso |
| C13 Auditoría before/after/actor | COMPLETO | Dos eventos y contenido | Local/DEV | Colaborador no accede |
| C14 Atomicidad ante fallo de auditoría | COMPLETO | CHECK de fallo solo dentro de transacción revertida | PostgreSQL local y DEV | Revierte alta y anulación; no constraint de prueba persistente |
| C15 Anulado fuera de proyección válida | COMPLETO | Filtro status=valid | SQL local/DEV y API | No reportes ni agregados funcionales en 3C |
| C16 UI administrativa completa | COMPLETO | Lista/búsqueda/estado/clasificación/paginación/detalle/alta/anulación/historial | UI conectada a DEV | SweetAlert2/Sonner/Lucide |
| C17 Loading/vacío/error | COMPLETO | Carga de guardado, búsqueda vacía y E2E de lectura | DEV + fallos inducidos/simulados | 21 E2E aprobados; error de lectura y recuperación incluidos |
| C18 Responsive/accesibilidad básica | COMPLETO | 320/375/768/1024/1440; capturas | Navegador contra DEV | Sin overflow; controles >=43px (aprox.44); foco en error; reduced-motion |
| C19 Equivalencia local/remota | COMPLETO | 11 huellas 3C coincidentes, 12 migraciones | Metadatos PostgreSQL local/DEV | Incluye funciones, grants, RLS, vista, triggers, CHECKs e índices |
| C20 Regresión 3B | COMPLETO | Ocho huellas idénticas; 219 comprobaciones de regresión | SQL local y API/UI DEV | Pagos, saldos, consecutivos y ciclo productivo sin regresión |
| C21 Security Advisors | COMPLETO | Sin hallazgos nuevos 3C | Supabase DEV | Solo A51 WARN y order_counters INFO aceptado |
| C22 Secretos y artefactos | COMPLETO | Escaneo valores privados en candidatos Git y assets | Local build | .env.local ignorado; ninguna dependencia/env nueva |
| C23 Sin 3D/3E | COMPLETO | Revisión de migración y diff | Local/DEV | No tablas de gastos ni reportes |

## Resultados y reproducibilidad

- Local: lint/typecheck/build correctos; npm test 20/20. El test 3C aplica todas las migraciones en PostgreSQL PGlite y prueba contrato, RLS, inmutabilidad y rollback. No se presenta como Supabase alojado.
- Simulado: E2E final 21/21 de Fases 1/2/3A/3C, incluido loading, vacío, error de lectura y recuperación de 3C. Fallo de red de guardado inducido por Playwright, no caída real del proveedor.
- Supabase DEV real: `tests/phase3c-real.mjs` completado, 123 comprobaciones API/JWT/UI; `tests/sql/phase3c-verification.sql` PASS con ROLLBACK. Sesiones de cuentas existentes en memoria; service_role se usa exclusivamente para generar acceso de prueba, nunca como actor comercial. Sin correos/passwords/usuarios nuevos.
- Equivalencia: `tests/sql/phase3c-schema.sql` compara 11 huellas local/DEV; `tests/sql/phase3b-schema.sql` compara ocho antes/después sin cambios. Artefactos en test-results ignorado.
- Regresión 3B: 219 comprobaciones completadas sobre DEV; seis confirmaciones concurrentes, carreras de pagos/edición/estado/anulación, ciclo completo, saldos y matriz JWT. Sus casos de fallo de red y estrés visual DOM siguen identificados como inducidos/simulados, no como estados naturales de DEV. La primera ejecución se interrumpió por ERR_NETWORK_CHANGED; se repitió completa sin cambiar implementación ni tests de 3B.
- npm audit --omit=dev: 0 vulnerabilidades.

Para repetir: ejecutar comandos npm; detener el servidor simulado; `npm run build` y `npm start`; establecer SIGCA_REAL_TESTS=1 y correos autorizados SIGCA_TEST_ADMIN_EMAIL/SIGCA_TEST_MEMBER_EMAIL; ejecutar `node tests/phase3c-real.mjs` y `node tests/phase3b-real.mjs` secuencialmente. No ejecutar a la vez porque ambos prueban inactivación temporal de la cuenta de prueba. Nunca compartir .env.local ni sesiones.

Los fixtures DEV se conservan etiquetados y anulados. La primera ejecución 3C se detuvo al esperar 42501 para una columna no actualizable de la vista; se corrigió únicamente el test para aceptar el rechazo real 0A000, sin modificar permisos ni esquema aplicado. Su fixture también permanece anulado. No se eliminan filas como compensación.

## Advisors y pendientes

- A51 [protección de contraseñas filtradas](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection): PENDIENTE antes de producción, no bloquea DEV; Auth/plan intactos.
- [INFO RLS sin policies en order_counters](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy): aislamiento intencional aceptado. No se añaden policies ni grants.
- No decisiones funcionales nuevas. UUID de solicitud, límites técnicos, transporte textual y filtros documentados como concreción técnica del contrato aprobado.
- La autorización de implementación no autoriza 3D ni 3E.

## Archivos de esta entrega

- Documentación: README.md, docs/REQUIREMENTS.md, docs/ARCHITECTURE.md, docs/DATABASE.md, docs/DECISIONS.md y este documento. DESIGN_SYSTEM.md permanece intacto.
- UI: src/app/(private)/ingresos-manuales/{page.tsx,loading.tsx,[id]/page.tsx}, src/components/manual-income-form.tsx; enlaces administrativos en app-shell.tsx y mas/page.tsx.
- Servidor/contrato: src/features/manual-income/actions.ts y domain.ts.
- SQL: supabase/migrations/20260929201704_phase3c_manual_income.sql.
- Pruebas: tests/phase3c.test.mjs, tests/phase3c-real.mjs, tests/sql/phase3c-verification.sql, tests/sql/phase3c-schema.sql, tests/e2e/phase3c.spec.ts y una ruta adicional del fixture simulado existente.
- AGENTS.md, reference, dependencias, configuración Auth, plan de Supabase y migraciones anteriores intactos. Archivos generados/capturas no se incluyen en Git. Sin commit automático de esta implementación.
