# Verificación de Fase 3B — SIGCA DEV

Proyecto exclusivo: pysgfnwsycgoneaecgcl. Base: 9a73fcd; 3A cerrada. A51 pendiente antes de producción, no bloquea DEV. Validación de 3B en DEV; alcance limitado a confirmación, ciclo y pagos. Evidencia detallada por entorno a continuación.

## Excepción limitada de CHECKs

Autorización expresa: únicamente ALTER TABLE public.orders DROP CONSTRAINT ... RESTRICT sobre las ocho restricciones siguientes; reemplazo inmediato en una migración nueva y la misma transacción. No CASCADE, borrado de tablas/columnas/filas ni edición de migraciones aplicadas. FKs, RLS y grants de 3A no se modifican en este primer lote.

orders_check2 valida actualmente dos alternativas: quote exige cancelled_at/cancelled_by/cancel_reason NULL; cancelled exige actor, fecha y motivo de 1..1000 caracteres. Además de regular la cancelación, impide cualquier estado intermedio. Su reemplazo permite estados no cancelados con tripleta NULL y mantiene la evidencia obligatoria de cancelación; usa IS TRUE y motivo NOT NULL para no aceptar UNKNOWN de SQL.

| Restricción anterior | Expresión anterior | Nueva | Expresión nueva (CHECK IS TRUE) |
|---|---|---|---|
| orders_production_status_check | production_status IN ('quote','cancelled') | orders_3b_status_check | production_status in ('quote','confirmed','in_production','ready','delivered','cancelled') |
| orders_order_number_check | order_number IS NULL | orders_3b_number_check | case when confirmed_at is null then order_number is null and number_year is null and number_sequence is null and deposit_percentage_applied is null and deposit_required_amount is null else order_number is not null and number_year is not null and number_sequence is not null and number_sequence>0 and number_year=extract(year from confirmed_at at time zone 'America/Costa_Rica') and order_number='PED-'\|\|number_year::text\|\|'-'\|\|lpad(number_sequence::text,greatest(5,length(number_sequence::text)),'0') and deposit_percentage_applied is not null and deposit_percentage_applied between 0 and 100 and deposit_required_amount is not null end |
| orders_confirmed_at_check | confirmed_at IS NULL | orders_3b_confirmation_check | ((production_status='quote' and confirmed_at is null) or production_status='cancelled' or (production_status in ('confirmed','in_production','ready','delivered') and confirmed_at is not null)) and (confirmed_at is null or (confirmed_at at time zone 'America/Costa_Rica')::date>=order_date) |
| orders_delivered_at_check | delivered_at IS NULL | orders_3b_delivery_check | case when production_status='delivered' then delivered_at is not null and confirmed_at is not null and delivered_at>=confirmed_at else delivered_at is null end |
| orders_zero_total_authorized_by_check | zero_total_authorized_by IS NULL | orders_3b_zero_actor_check | case when confirmed_at is not null and total=0 then zero_total_authorized_by is not null and zero_total_authorized_at is not null and zero_total_reason is not null and zero_total_authorized_revision is not null and zero_total_authorized_revision=commercial_revision else zero_total_authorized_by is null and zero_total_authorized_at is null and zero_total_reason is null and zero_total_authorized_revision is null end |
| orders_zero_total_authorized_at_check | zero_total_authorized_at IS NULL | orders_3b_zero_time_check | zero_total_authorized_at is null or (confirmed_at is not null and zero_total_authorized_at>=confirmed_at) |
| orders_zero_total_reason_check | zero_total_reason IS NULL | orders_3b_zero_reason_check | zero_total_reason is null or length(trim(zero_total_reason)) between 1 and 1000 |
| orders_check2 | (production_status='quote' AND cancelled_at IS NULL AND cancelled_by IS NULL AND cancel_reason IS NULL) OR (production_status='cancelled' AND cancelled_at IS NOT NULL AND cancelled_by IS NOT NULL AND length(trim(cancel_reason)) BETWEEN 1 AND 1000) | orders_3b_cancellation_check | case when production_status='cancelled' then cancelled_at is not null and cancelled_by is not null and cancel_reason is not null and length(trim(cancel_reason)) between 1 and 1000 else cancelled_at is null and cancelled_by is null and cancel_reason is null end |

La tabla anterior registra las expresiones del primer lote; la expresión vigente de orders_3b_zero_time_check fue sustituida posteriormente por la corrección ZT-01, documentada al final.

Migración: 20260923210849_phase3b_order_constraints.sql. Añade columnas de identidad comercial/adelanto/revisión; reemplaza exactamente ocho CHECK y valida todos dentro de BEGIN/COMMIT. No actualiza filas históricas ni eventos. Nuevos índices para número único, año/consecutivo y fechas. Este primer lote no incorporaba aún las operaciones; el segundo lote, descrito más abajo, las incorpora.

Preflight de solo lectura: tests/sql/phase3b-preflight.sql proyecta los defaults/nulls de columnas nuevas y comprueba exactamente las ocho expresiones antes de tocar DEV. Si alguna violación existe, detenerse; nunca corregirla automáticamente. Las expresiones exactas previas se capturan desde pg_get_constraintdef. Inspección inicial: 10 pedidos, todos Cancelados sin confirmación, cero violaciones del contrato de 3A.

## Matriz de avance

| Requisito | Estado | Evidencia | Prueba | Observación |
|---|---|---|---|---|
| Sustitución de ocho CHECK | COMPLETO | Migración aplicada y postflight | PostgreSQL local y DEV | Ocho antiguos ausentes; ocho nuevos validados; contenido/auditoría intactos |
| Confirmación, consecutivos, adelantos, ciclo y pagos | COMPLETO | Segundo lote y matriz detallada inferior | PostgreSQL local, SQL DEV y JWT/UI DEV | No se basa únicamente en el esquema |
| A51 | PENDIENTE | Auditoría 3A | Aviso heredado | Producción; no bloquea DEV |
| 3C/3D/3E y fases posteriores | NO APLICA | Fuera del alcance autorizado | No implementadas | Sin manual_income/gastos/inventario/cronómetro/envíos/reportes |

### Expresiones exactas inspeccionadas en DEV antes de migrar

`orders_check2`: `CHECK ((((production_status = 'quote'::text) AND (cancelled_at IS NULL) AND (cancelled_by IS NULL) AND (cancel_reason IS NULL)) OR ((production_status = 'cancelled'::text) AND (cancelled_at IS NOT NULL) AND (cancelled_by IS NOT NULL) AND ((length(TRIM(BOTH FROM cancel_reason)) >= 1) AND (length(TRIM(BOTH FROM cancel_reason)) <= 1000)))))`

`orders_confirmed_at_check`: `CHECK ((confirmed_at IS NULL))`

`orders_delivered_at_check`: `CHECK ((delivered_at IS NULL))`

`orders_order_number_check`: `CHECK ((order_number IS NULL))`

`orders_production_status_check`: `CHECK ((production_status = ANY (ARRAY['quote'::text, 'cancelled'::text])))`

`orders_zero_total_authorized_at_check`: `CHECK ((zero_total_authorized_at IS NULL))`

`orders_zero_total_authorized_by_check`: `CHECK ((zero_total_authorized_by IS NULL))`

`orders_zero_total_reason_check`: `CHECK ((zero_total_reason IS NULL))`

Preflight exacto: 10 filas, cero violaciones en cada una de las ocho expresiones nuevas. Se conservaron huellas no sensibles para comparar contenido de orders y audit_log después de migrar. Pruebas locales: regresión 3A 4/4; sustitución/preservación y fallo con rollback 2/2.

Postflight DEV: ocho CHECK antiguos ausentes y ocho nuevos validados. Huellas de contenido previo de orders y audit_log idénticas. Las cinco huellas de esquema local/remoto coinciden. Regresión SQL de 3A y atomicidad/auditoría ejecutadas en DEV con fixtures revertidos. Security Advisors: solo A51 heredado, sin cambios en Auth/plan.


## Segundo lote e inventario efectivo

Migración nueva 20260923211331_phase3b_order_operations.sql aplicada a pysgfnwsycgoneaecgcl tras pruebas locales y dry-run exclusivo. Transacción única. No contiene DROP, TRUNCATE ni borrados de registros. El dry-run posterior no encuentra migraciones pendientes. La configuración existente cumple la nueva validación de escala del porcentaje (cero filas incompatibles).

- **order_counters:** year PK y last_sequence bigint positivo. UPSERT atómico dentro de confirm_order; bloqueo de la fila anual, sin MAX()+1. Rollback de la confirmación revierte incremento. Año empresarial de confirmed_at. Unicidad adicional por order_number y (number_year,number_sequence). Secuencia con ancho mínimo cinco, sin truncar números grandes. Cancelaciones posteriores no reutilizan números.
- **payments:** UUID; order_id/client_id históricos; amount quote_money >0; moneda CRC; fecha efectiva con zona; método cash/sinpe_movil/transfer/card/other; referencia y notas; actor de alta; estado valid/voided; actor/fecha/motivo de anulación; timestamps reales. FKs restrictivas a pedido, cliente y perfiles, con índices. CHECKs de monto/moneda/método/evidencia y trigger de inmutabilidad. No edición de monto/fecha/pedido/cliente ni borrado físico.
- **orders:** columnas nuevas de año/consecutivo, porcentaje especial/aplicado, adelanto histórico y revisión comercial/autorización de cero. Ocho CHECK nuevos validados. Se conservan snapshots, revision de concurrencia y timestamps. Sin financial_status persistido.
- **settings:** CHECK adicional de máximo dos decimales para deposit_percentage, validado sin transformar valores anteriores.
- **Vistas invoker:** quotes_read ampliada; payments_read con importe textual; order_payment_summary con total, suma de pagos válidos, saldo, estado financiero, adelanto histórico, mínimo operativo e indicador cubierto. Aritmética numeric; navegador usa bigint para vista previa/validación, sin float monetario.

### RPC y seguridad

Wrappers públicos SECURITY INVOKER y cuerpos privados SECURITY DEFINER únicamente para mutaciones atómicas/lecturas acotadas; search_path vacío. Identidad desde auth.uid y perfil vigente, nunca metadata editable. Cada mutación bloquea perfil activo y pedido, comprueba expected_revision y aumenta revision. Conflictos PT409/HTTP 409; el formulario conserva entradas y obliga a recargar, sin sobrescritura silenciosa.

| RPC | Operación / permiso |
|---|---|
| confirm_order | Activo, quote, cliente existente, líneas activas y total recalculado. Admin: histórico, porcentaje especial y total cero con motivo. Colaborador: porcentaje habitual y total positivo. |
| register_payment | Activo; Confirmado/En producción/Listo/Entregado; monto positivo <= saldo bajo bloqueo; cliente histórico tomado del pedido. Histórico solo Admin. |
| void_payment | Admin, pago válido del mismo pedido, motivo. Conserva fila; recalcula saldo sin cambiar automáticamente estado productivo. |
| amend_order | Edición posterior con revisión; no reducir total bajo pagos válidos; no modificar composición comercial Entregado; nunca reescribe adelanto. Cliente solo Admin/motivo/sin pagos válidos; nueva composición cero exige nueva autorización. |
| transition_order | Flujo normal, gate de adelanto, excepción Admin con motivo, retrocesos de un paso, entrega/reapertura y cancelación según D-20/D-21. Cancelado terminal. |
| correct_order_dates | Admin con motivo; no futuro, cronología coherente, mismo año comercial; sin renumeración. |
| order_deposit_default | Activo: únicamente porcentaje habitual, sin costos/configuración financiera completa. |
| order_history | Activo: proyección permitida de eventos del pedido, actor, fecha, motivo y estados; no devuelve audit_log general ni metadata financiera restringida. |

Helpers internos sin EXECUTE de aplicación: lock_order, order_reason, order_effective_at, order_event y guard_payment. Authenticated solo ejecuta wrappers/cuerpos autorizados; anon sin EXECUTE. private permanece fuera de Data API (PGRST106 comprobado).

RLS de payments: payments_operational_read permite SELECT a activos con pedido legible. Único grant directo de aplicación: SELECT authenticated; no INSERT/UPDATE/DELETE directos, tampoco por service_role. order_counters: sin grants ni policies de aplicación; solo la operación definer accede. RLS/grants de orders/order_items/order_files conservados. payments_read/order_payment_summary mantienen security_invoker.

Triggers payment_audit y payment_immutable. Se reutiliza private.audit_catalog para before/after; order_event añade eventos explícitos: confirmación, porcentaje especial, cero, pago/anulación, cambios financieros/cliente, transición, override, retroceso, entrega/reapertura, cancelación y correcciones de fecha. Eventos anteriores no se modifican. El número asignado figura en el before/after del pedido y año/secuencia en order.confirmed.

Storage conserva bucket privado order-references y sus policies. register_order_file amplía la edición de referencias a pedidos no cancelados, manteniendo validación de actor/estado/bloqueo/ruta/versión, carga solo servidor y descarga con JWT. No buckets públicos, nuevas credenciales ni borrado de versiones.

## Matriz de reglas y pruebas

**Entornos:** L = PostgreSQL local PGlite con fixtures Auth/Storage mínimos; D = SQL ejecutado en PostgreSQL de Supabase DEV bajo roles/identidades de prueba y ROLLBACK; R = API con JWT Auth reales de cuentas existentes y UI Next.js contra DEV; S = fixture HTTP simulado o fallo de red inducido. D no se presenta como prueba del correo/Auth alojado. R no modifica contraseñas ni envía correos.

Archivos de prueba: tests/phase3b.test.mjs, phase3b-constraints.test.mjs, phase3b-real.mjs; tests/sql/phase3b-verification.sql, phase3b-history.sql, phase3b-schema.sql y preflight/postflight. Regresión: phase3a.test.mjs, phase3a-real.mjs y SQL de 3A.

| Requisito | Estado | Evidencia | Prueba | Observación |
|---|---|---|---|---|
| Confirmación atómica / total autoritativo | COMPLETO | confirm_order y orders before/after | L/D/R | Ningún total del navegador aceptado |
| Actor activo / estado quote / revisión | COMPLETO | lock_order, rechazos y revisión intacta | L/D/R | Perfil vigente, no metadata |
| Cliente válido / al menos una línea activa | COMPLETO | FKs y validación de confirmación | L/D | Cotización vacía se guarda pero no se confirma |
| Cronología / futuro rechazado | COMPLETO | order_effective_at, CHECKs | L/D/R | Zona Costa Rica |
| PED anual y único | COMPLETO | Índices únicos y counter UPSERT | L/D/R | Sin número durante quote |
| Primer consecutivo y cambio de año | COMPLETO | phase3b-history.sql, baseline anual | L/D | Año 2024/2025; primer contador vacío parte de 1 |
| Frontera UTC/Costa Rica | COMPLETO | 2025-01-01T01:00Z asigna año 2024 | L/D | Usa año local de confirmed_at |
| Dos confirmaciones simultáneas | COMPLETO | Sesiones Admin/Colaborador independientes | R | Números distintos y contiguos |
| Fallo de auditoría revierte confirmación/contador | COMPLETO | CHECK de fallo inyectado dentro de prueba revertida | L/D | Sin número, evento parcial ni incremento residual |
| Adelanto habitual / especial | COMPLETO | Porcentaje tomado al confirmar; override Admin auditado | L/D/R | Colaborador no impone porcentaje |
| Escala porcentual / HALF UP | COMPLETO | 1.00 × 12.50% = 0.13; rechaza 12.501 | L/D/R | numeric exacto |
| Adelanto histórico inmutable | COMPLETO | Cambio de settings y total no reescribe valor | L/D | Indicador operativo usa mínimo con total |
| Total cero Admin con motivo | COMPLETO | Actor/fecha/motivo/revisión y evento | L/D/R | Sin pago ficticio; financiero Pagado |
| Cero Colaborador / falta motivo | COMPLETO | Rechazo sin cambios | L/D/R | Nueva composición invalida autorización previa |
| Nuevos pagos solo estados permitidos | COMPLETO | RPC y pruebas quote/cancelled/delivered | L/D/R | Cobro tras entregar permitido |
| Pago >0 / escala / CRC | COMPLETO | Dominio, CHECK, RPC y rechazos | L/D/R | Cero, negativo y mayor escala rechazados |
| Sobrepago secuencial | COMPLETO | Saldo vigente bajo lock | L/D/R | PT409 |
| Dos pagos simultáneos | COMPLETO | Dos JWT sobre mismo saldo | R | Un éxito y un 409, sin pago parcial |
| Monto/fecha/pedido/cliente de pago inmutables | COMPLETO | Sin DML directo y trigger payment_immutable | L/D/R | Corrección por anulación + nuevo pago |
| Anulación Admin / motivo | COMPLETO | UI/API y auditoría | L/D/R | Colaborador rechazado |
| Saldo tras anular | COMPLETO | SUM solo valid en vista | L/D/R | No reescribe pedidos/pagos históricos |
| Estado financiero derivado | COMPLETO | no_deposit/partially_paid/paid, cero | L/D/R | No columna editable |
| Pagado/pendiente separado de adelanto | COMPLETO | Vista y tarjetas UI | L/D/R | Depósito histórico y operativo visibles |
| Editar financiero después de confirmar | COMPLETO | amend_order, revisión y auditoría | L/D/R | Total nunca menor que pagos válidos |
| Entregado bloquea modificación financiera | COMPLETO | Rechazo RPC y controles deshabilitados | L/D/R | Cobro permitido sin reapertura |
| Cliente posterior Admin sin pagos válidos | COMPLETO | Motivo, auditoría y rechazos | L/D | Cliente del pago anulado se conserva |
| Confirmado → En producción | COMPLETO | Gate min(deposit,total) | L/D/R | Ambos roles; excepción solo Admin |
| Override de adelanto | COMPLETO | Motivo/actor/fecha/evento | L/D | Rechazo sin motivo y a Colaborador |
| En producción → Listo → Entregado | COMPLETO | UI real y SQL | L/D/R | Sin exigir saldo cero |
| Retrocesos de un paso | COMPLETO | Tres transiciones Admin auditadas | L/D/R | Colaborador, saltos y quote rechazados |
| Reapertura y reentrega | COMPLETO | delivered_at NULL y nueva entrega | L/D/R | Ambas historias conservadas |
| Cancelación por rol/estado | COMPLETO | Admin posterior a quote; 3A conserva su flujo | L/D/R | Entregado requiere reapertura separada |
| Cancelación conserva pagos / terminal | COMPLETO | Conteo y sumas antes/después | L/D/R | Sin devolución ni anulación automática |
| Alertas entregado/cancelado ocultas | COMPLETO | deliveryAlert y regresión 3A | L/R | Reglas 7/6, <=5 y atraso conservadas |
| Históricos exclusivos Admin | COMPLETO | Confirmación, pago, entrega y correcciones | L/D/R | created_at real |
| Corrección de fechas sin renumeración | COMPLETO | Histórico dentro del año, rechazos cruzados y regresión ZT-01 | L/D | Corrección cero permitida conservando autorización original |
| Edición y confirmación simultáneas | COMPLETO | save_quote vs confirm_order | R | Un éxito / HTTP 409 |
| Transiciones simultáneas | COMPLETO | Dos sesiones, misma revisión | R | Un éxito / HTTP 409 |
| Pago y reducción de total simultáneos | COMPLETO | register_payment vs amend_order | R | pagos <= total después de ambos resultados |
| Anulación y nuevo pago simultáneos | COMPLETO | void_payment vs register_payment | R | Una operación gana, otra recarga |
| RLS / grants / private / search_path | COMPLETO | Catálogos PG y llamadas directas | L/D/R | Activos leen operación; anon e inactivo sin acceso |
| Inactivación con JWT vigente | COMPLETO | Se inactiva y restaura cuenta de prueba | R | Lecturas vacías, todas las RPC rechazadas, UI vuelve a login |
| Auditoría integral / Colaborador restringido | COMPLETO | before/after y eventos específicos | L/D/R | Historial operativo es proyección acotada |
| UI y responsive cinco tamaños | COMPLETO | Admin/Colaborador, 320/375/768/1024/1440 | R | Pagos como tarjetas en móvil; sin scroll de página |
| Conflicto y red en formulario | COMPLETO | Entrada del pago preservada | R/S | Conflicto real; fallo de red inducido, no caída real de Supabase |
| Loading/vacío/error de navegación | COMPLETO | E2E existente y pedidos sin pagos/eventos | S/R | Sin métricas inventadas |
| Regresión completa 3A | COMPLETO | SQL, cuatro pruebas locales, E2E y 92 verificaciones reales | L/D/S/R | Cotizaciones, imágenes privadas y cancelación intactas |
| Secretos y archivos temporales | COMPLETO | Escaneo de archivos Git y .next/static | Local | .env.local ignorado; sin claves privadas en assets |
| A51 protección de contraseñas filtradas | PENDIENTE | Security Advisors WARN heredado | DEV | Antes de producción; no bloquea DEV; Auth/plan sin cambios |
| RLS sin policies en order_counters | NO APLICA | Security Advisors INFO, aislamiento intencional | DEV | Sin grants de aplicación; no abrir acceso para silenciar aviso |
| 3C/3D/3E | NO APLICA | Tablas futuras ausentes y revisión de archivos | DEV/local | No ingresos manuales, gastos ni fases posteriores |

## Evidencia de ejecución y límites

- npm run lint y npm run typecheck: correctos.
- npm test: 19 pruebas locales correctas, incluyendo 3B y regresiones previas. PostgreSQL PGlite no sustituye las pruebas de Supabase.
- npm run build: correcto, rutas App Router compiladas.
- npm run test:e2e: 20 pruebas correctas contra fixture HTTP simulado de Fases 1/2/3A. La funcionalidad 3B se verifica adicionalmente mediante phase3b-real.mjs, no se atribuye a esos 20 casos.
- SQL 3B en DEV: reglas financieras/ciclo, históricos, frontera de año y rollback; pruebas revertidas completamente. SQL de regresión 3A correcto.
- UI/API 3A real: 92 verificaciones, resultado completado tras aplicar 3B.
- UI/API 3B real: 77 verificaciones aprobadas, ejecución completa guardada en test-results/phase3b-real-summary.json (ignorado); concurrencia real con JWT separados, capturas responsive ignoradas. La primera ejecución detectó una selección incorrecta del pago por orden visual en el test; se corrigió el selector para identificar el importe, sin alterar la regla ni los datos históricos.
- npm audit --omit=dev: cero vulnerabilidades de producción.
- Equivalencia local/DEV: huellas de columnas, constraints, funciones, policies e índices iguales; historial remoto al día. Grants, triggers y search_path verificados adicionalmente en catálogos.
- Security Advisors: A51 WARN heredado y un INFO por order_counters aislado. Sin nuevos avisos WARN/ERROR de BD. No cambios Auth/plan.
- Escaneo: valores privados de service_role y AUTH_FLOW_SECRET ausentes de archivos versionables y .next/static; .env.local ignorado; capturas/resultados/temporales fuera de Git. Sin nuevas dependencias ni variables.

Las pruebas reales crean registros VERIFICACION-F3B, mantienen sus pagos/auditoría, cancelan sus pedidos mediante RPC y desactivan su cliente al finalizar. No borran filas/usuarios ni hacen reset. Las sesiones de pruebas son aisladas; el Colaborador se restaura activo. Los consecutivos comprometidos de pruebas quedan consumidos conforme a la regla aprobada. Esta evidencia corresponde a desarrollo, no a certificación de producción ni pruebas de carga prolongadas.


## ZT-01 — Corrección de confirmación en pedido de total cero (RESUELTO)

La revisión final reprodujo en DEV mediante un caso aislado, ahora conservado como regresión en tests/sql/phase3b-zero-date.sql, con transacción revertida, un defecto del CHECK nuevo orders_3b_zero_time_check: compara zero_total_authorized_at >= confirmed_at. Un Admin que corrige confirmed_at a un instante posterior a la autorización original, pero no futuro, dentro del mismo año, sin pagos y con motivo, recibe check_violation. D-20/D-21 permiten esa corrección; no obligan a volver a autorizar el cero ni a falsear la fecha de autorización. No se modificó ningún dato para evitar el error.

La reparación conserva actor, fecha y motivo originales de autorización y mantener todas las otras validaciones de la RPC. Expresión aplicada: autorización NULL o (confirmación presente y fecha de autorización finita). La fecha de autorización sigue generándose en servidor y vinculada a commercial_revision; las validaciones de actor/motivo/cero permanecen en los otros CHECK y RPC.

El usuario autorizó expresamente esta excepción adicional. Migración nueva 20260924032507_phase3b_zero_authorization_chronology.sql, probada y aplicada a DEV después de dry-run exclusivo:

~~~sql
BEGIN;
ALTER TABLE public.orders
  DROP CONSTRAINT orders_3b_zero_time_check RESTRICT,
  ADD CONSTRAINT orders_3b_zero_time_check
    CHECK ((zero_total_authorized_at IS NULL OR
      (confirmed_at IS NOT NULL AND isfinite(zero_total_authorized_at))) IS TRUE) NOT VALID;
ALTER TABLE public.orders VALIDATE CONSTRAINT orders_3b_zero_time_check;
COMMIT;
~~~

Se obtuvo autorización adicional limitada a este CHECK nuevo; la excepción anterior enumeraba exclusivamente ocho nombres antiguos. No se editó ninguna migración aplicada. Preflight: cero filas incompatibles. Local y DEV: corrección exitosa, mismo número y misma evidencia de cero, con evento de corrección. Huellas antes/después de la migración: orders 6b8c4d1bd995a50f9a620acdc685fb30; audit_log e96b6bd71a984000a765a188e90a3ecc, ambas idénticas. CHECK validado. Sin UPDATE de historia ni cambios de Auth o fases siguientes. ZT-01 cerrado; A51 sigue pendiente exclusivamente antes de producción.


## Archivos de la entrega

- Aplicación: src/components/order-operations.tsx (nuevo); quote-form.tsx; src/features/orders/actions.ts, domain.ts, files.ts; src/app/(private)/pedidos/page.tsx y [id]/page.tsx; src/app/globals.css.
- Base: tres migraciones nuevas 20260923210849, 20260923211331 y 20260924032507. Ninguna migración anterior modificada.
- Pruebas nuevas: tests/phase3b.test.mjs, phase3b-constraints.test.mjs, phase3b-real.mjs; SQL preflight, constraints-postflight, verification, history, schema y zero-date.
- Documentación: README.md, docs/REQUIREMENTS.md, ARCHITECTURE.md, DATABASE.md, DECISIONS.md y este informe nuevo. AGENTS.md, DESIGN_SYSTEM.md y reference sin cambios.
- Sin cambios de dependencias/lockfile, Auth, plan de Supabase ni variables de entorno. Evidencia temporal y capturas ignoradas por Git. No commit automático realizado.

No surgieron decisiones funcionales nuevas. ZT-01 fue una corrección técnica de implementación, autorizada por separado para respetar la prohibición de DROP. El único pendiente de seguridad antes de producción sigue siendo A51; INFO order_counters documenta aislamiento intencional.

## Auditoría de cierre sobre f1c2e77

Las matrices anteriores conservan la evidencia de implementación provisional. La matriz de cierre de esta sección es la referencia para los conteos de la auditoría; no sumar matrices históricas. Alcance: D-19, D-20, D-21 y requisitos aplicables a 3B. No habilita 3C/3D/3E.

### Defectos técnicos y correcciones

| ID | Hallazgo reproducido | Corrección y regresión |
|---|---|---|
| AB-01 | Destino ausente/desconocido, revisión NULL/no positiva e identificador de pago ausente/ajeno podían responder PT409 sin ser conflictos de concurrencia. | Validación 22023/HTTP 400; permisos siguen 42501/403; revisión obsoleta, estado cambiado y saldo consumido conservan PT409/409. `phase3b-audit.sql` falla contra el esquema anterior y pasa después. |
| AB-02 | RF-PAG-01 y DATABASE.md incluyen tipo de pago; faltaba el campo en persistencia y formulario. | `payment_type text` opcional, 1..100 caracteres si se informa; UI/RPC/vista lo conservan. Es descriptivo, sin clasificación automática ni efecto sobre saldo. Filas anteriores quedan NULL, sin inventar información histórica. Se conserva al anular y queda protegido por inmutabilidad. |
| AB-03 | Cancelar/anular reutilizaban el color de confirmación ordinaria, sin distinción de peligro conforme al sistema visual. | Botones rojos, separación táctil y confirmación con nombre explícito de la acción. Motivo obligatorio se mantiene. |
| AB-04 | Error anunciado con role=alert pero sin llevar el foco al mensaje; porcentaje especial dependía de validación HTML/BD. | Foco programático en error y validación decimal/rango de porcentaje también en cliente, sin sustituir validación autoritativa. |

No se cambió una decisión funcional. El tipo descriptivo recupera el campo textual ya aprobado; no se añade un catálogo obligatorio ni se infiere si un pago es adelanto. La medición inicial de controles SweetAlert se corrigió en el test para esperar a que termine la animación de escala y excluir botones ocultos; no se presenta un fotograma intermedio como tamaño final del control.

### Migraciones y preservación de historia

| Migración | Propósito / objetos | Necesidad y alcance |
|---|---|---|
| 20260923210849 | Columnas comerciales de orders, ocho CHECKs, índices únicos y de fechas. | Retirar las prohibiciones temporales de 3A usando exclusivamente la excepción autorizada, en una transacción. No altera filas ni FKs/RLS/grants anteriores. |
| 20260923211331 | order_counters, payments, vistas, RPC públicas/privadas, triggers de pagos, CHECK de porcentaje de settings. | Operaciones atómicas de 3B y permisos mínimos; register_order_file admite referencias en pedidos no cancelados. Sin DROP. |
| 20260924032507 | Únicamente orders_3b_zero_time_check. | ZT-01: corregir confirmed_at hacia una hora posterior del mismo año no debe obligar a falsear la autorización original del cero. Excepción adicional expresa; RESTRICT, validación y transacción, sin actualizar datos. |
| 20260924034005 | payment_type y CHECK de longitud, payments_read, lock_order/transition_order/void_payment/amend_order/register_payment. | Correcciones AB-01/AB-02 de auditoría. CREATE OR REPLACE preserva firmas/grants; sin DROP, sin nuevas tablas ni fases, sin UPDATE de datos. |

La cuarta migración se probó localmente antes de aplicarse. El dry-run contenía únicamente ese archivo. Los 22 pagos previos conservaron todos sus campos: hash `69cf50c92a76ccf23d2d584db4bab671` idéntico antes/después excluyendo la columna nueva NULL. No se editaron migraciones aplicadas. Los datos etiquetados de las pruebas reales posteriores sí generan operaciones autorizadas y auditoría; se conservan, no se confunden con cambios de historia causados por la migración.

### Trazabilidad de las ocho restricciones

Las expresiones exactas anteriores y nuevas figuran al inicio de este documento. Esta tabla añade motivo y cobertura; la expresión vigente de ZT-01 es la del bloque SQL de su sección, no la comparación inicial sustituida.

| CHECK anterior | CHECK nuevo | Motivo | Cobertura de prueba |
|---|---|---|---|
| orders_production_status_check | orders_3b_status_check | Incorporar estados aprobados y conservar quote/cancelled. | 72 pares por rol en audit.sql; regresión 3A. |
| orders_order_number_check | orders_3b_number_check | Sin número en quote; identidad, año, secuencia y adelanto juntos al confirmar. | constraints.test; history.sql rollback/años; seis confirmaciones JWT. |
| orders_confirmed_at_check | orders_3b_confirmation_check | Confirmación requerida en estados productivos; cronología y cancelación histórica. | verification.sql, history.sql y 72 pares. |
| orders_delivered_at_check | orders_3b_delivery_check | Fecha vigente solo en delivered y posterior a confirmación. | Entrega/reapertura/reentrega SQL y UI real. |
| orders_zero_total_authorized_by_check | orders_3b_zero_actor_check | Autorización completa ligada a revisión comercial. | verification.sql, audit.sql con dos Admin distintos. |
| orders_zero_total_authorized_at_check | orders_3b_zero_time_check | Fecha finita de autorización con confirmación; ZT-01 conserva instante original. | zero-date.sql y audit.sql: original intacta tras corrección, notas y cancelación. |
| orders_zero_total_reason_check | orders_3b_zero_reason_check | Motivo de 1..1000 caracteres cuando hay autorización. | Rechazo sin motivo; nueva composición exige autorización nueva. |
| orders_check2 | orders_3b_cancellation_check | Antes limitaba implícitamente a quote/cancelled; ahora admite estados no cancelados sin evidencia de cancelación y exige evidencia completa al cancelar. | constraints.test reproduce fila inválida y rollback; verificación de 72 transiciones. |

Solo existen los ocho DROP CONSTRAINT RESTRICT autorizados en la primera migración y el reemplazo adicional autorizado ZT-01. No CASCADE, DROP de tablas/columnas, TRUNCATE ni borrado de historia. Los tests de DML denegado no conceden permisos para borrar.

### Matriz de cierre requisito por requisito

Pruebas: **V** = phase3b-verification.sql; **H** = phase3b-history.sql; **Z** = phase3b-zero-date.sql; **A** = phase3b-audit.sql; **C** = phase3b-constraints.test.mjs; **R** = phase3b-real.mjs; **R3A** = phase3a-real.mjs; **E** = test:e2e. V/H/Z/A ejecutados tanto localmente (L) como en PostgreSQL DEV con transacciones revertidas (D). R/R3A usan Auth/JWT, Data API y navegador contra DEV real. E usa fixture HTTP simulado (S). Las consultas de catálogos se indican como D; no sustituyen la matriz JWT.

| Requisito | Estado | Evidencia | Prueba | Observación |
|---|---|---|---|---|
| B01 Confirmación transaccional | COMPLETO | RPC única y locks de pedido/contador | V/H L/D | COMMIT o rollback completo |
| B02 Actor activo vigente | COMPLETO | Perfil bloqueado y autorización en BD | V L/D; R | No metadata editable |
| B03 Versión/concurrencia | COMPLETO | expected_revision y aumento tras éxito | V L/D; R | Obsoleto no sobrescribe |
| B04 Solo Cotización confirma | COMPLETO | Reconfirmaciones rechazadas | V/A L/D; R | Estado validado de nuevo |
| B05 Cliente válido y línea activa | COMPLETO | FK, lookup y rechazo de cotización vacía | V L/D | Snapshots históricos conservados |
| B06 Importes autoritativos | COMPLETO | Suma de líneas; total/número de navegador rechazados | A/V L/D | No acepta total suministrado al confirmar |
| B07 Cronología de confirmación | COMPLETO | Futuro, order_date y autorización histórica | V/H L/D | America/Costa_Rica |
| B08 Fallo tardío revierte todos los efectos | COMPLETO | Fallo del evento final inyectado; NULL número/fecha/adelanto, quote, revisión intacta, contador y auditoría iguales | H L/D | No queda confirmación parcial |
| B09 Número solo al confirmar | COMPLETO | Quotes sin número; confirmación lo asigna | C/V L/D; R | Cotización no consume contador |
| B10 Consecutivo anual y primer pedido | COMPLETO | Años 2024/2025 desde baseline anual | H L/D | Contador inexistente empieza en 1 |
| B11 Año desde confirmed_at | COMPLETO | Frontera 2025 UTC todavía 2024 CR | H L/D | Independiente de created_at |
| B12 Número único global | COMPLETO | Índices número y año/secuencia | D; R | No duplicados |
| B13 Varias confirmaciones simultáneas | COMPLETO | Seis llamadas de dos sesiones JWT | R | Números registrados sin asumir orden |
| B14 Número no se reasigna | COMPLETO | Reconfirmar/cancelar/corregir fecha no renumera | H/V L/D; R | Huecos comprometidos legítimos |
| B15 Contador sin acceso directo | COMPLETO | Grants mínimos, RLS sin policies | D; R | SELECT y DML de cuatro roles |
| B16 Sin MAX()+1 ni número elegible | COMPLETO | UPSERT anual bajo lock; payload no permite número | Código; A L/D | Generación en BD |
| B17 Adelanto habitual | COMPLETO | settings leído dentro de confirmación | V/H L/D | Valor vigente al confirmar |
| B18 Override solo Admin | COMPLETO | Porcentaje/evento y rechazo Colaborador | V L/D; R | Porcentaje máximo dos decimales |
| B19 Configuración no reescribe adelanto | COMPLETO | Cambio de settings posterior | V L/D | Porcentaje/importe fijados |
| B20 Total posterior no reescribe adelanto | COMPLETO | Reducción 10→2 mantiene 50% y 5.00 | A L/D | Sin recalcular histórico |
| B21 Mínimo operativo | COMPLETO | Adelanto 5, total 2, pago 2 permite producción | A L/D | min(histórico,total) |
| B22 HALF UP | COMPLETO | 1.00 × 12.50% = 0.13 | V L/D; R UI | Numeric, no float |
| B23 Cero solo Admin con motivo | COMPLETO | Rechazos y autorización válida | V/A L/D; R | Sin excepciones implícitas |
| B24 Cero conserva actor/fecha/motivo | COMPLETO | Campos y evento auditado | A/Z L/D | Vinculado a revisión comercial |
| B25 ZT-01 y autorizador original | COMPLETO | Segundo Admin corrige fecha/notas; cancelación conserva evidencia | A/Z L/D | No sustituye silenciosamente al primero |
| B26 Nueva composición cero | COMPLETO | Rechazo sin nueva autorización; dos eventos preservados | A/V L/D | Campos vigentes nuevos, historia anterior intacta |
| B27 Cero = Pagado sin pago ficticio | COMPLETO | Vista paid y cero filas de pagos | V/A L/D; R | No pago de monto cero |
| B28 Pago positivo, escala y CRC | COMPLETO | 0/negativo/tres decimales/NaN/Infinity/USD rechazados | V/A L/D; R | Dominio numeric y RPC |
| B29 Datos completos del pago | COMPLETO | Pedido/cliente/fecha/actor/método/tipo/referencia/notas/estado | A L/D; R UI | Tipo descriptivo, sin inferencias |
| B30 Estados que admiten pago | COMPLETO | Confirmado/Producción/Listo/Entregado; quote/cancelled rechazados | V/A L/D; R | Sin reapertura para cobrar |
| B31 Fecha de pago | COMPLETO | No futura, >= confirmación, zona explícita | A/H L/D | Puede ser posterior a entrega |
| B32 Pago histórico solo Admin | COMPLETO | Alta histórica Admin y rechazo Colaborador | V/H L/D | Colaborador día empresarial actual |
| B33 Pago inmutable / sin DELETE | COMPLETO | Trigger, grants y DML denegado | V/A L/D; R | No editar monto/fecha/pedido/cliente |
| B34 Anulación solo Admin motivada | COMPLETO | UI/RPC, actor/fecha/motivo preservados | V/A L/D; R | Fila permanece |
| B35 Anulación recalcula saldo | COMPLETO | SUM solo valid | V/A L/D; R UI | No cambia estado productivo automáticamente |
| B36 Sin sobrepago secuencial | COMPLETO | Saldo recalculado bajo lock | V L/D; R | No usa saldo del navegador |
| B37 Pagos simultáneos | COMPLETO | 7 + 7 contra total 10: uno aceptado | R | Otro HTTP 409; pagado final 7 |
| B38 Cuatro casos financieros | COMPLETO | Cero/ningún pago/parcial/completo | V/A L/D; R | Anulados excluidos |
| B39 Sin financial_status mutable | COMPLETO | Catálogo columns de orders | D | Derivado en vista invoker |
| B40 Semántica UI/API | COMPLETO | UI consume order_payment_summary | Código; R | Total/pagado/saldo/adelanto separados |
| B41 Edición comercial por roles aprobados | COMPLETO | Admin/Colaborador operan líneas y descuentos; RPC recalcula | V/A L/D; R | Entregado conserva bloqueo |
| B42 Nuevo total >= pagos válidos | COMPLETO | Rechazo de reducción y carrera real | V L/D; R | No reescribe pagos/adelanto |
| B43 Entregado bloquea cambios comerciales | COMPLETO | RPC rechaza edición financiera | V L/D; R | Cobro sí permitido |
| B44 Cambio de cliente posterior | COMPLETO | Admin, motivo, ausencia de pagos válidos | V/H/A L/D | Colaborador y pago válido bloquean |
| B45 Cliente histórico del pago | COMPLETO | Pago anulado conserva cliente previo tras cambio permitido | H L/D | No actualización retroactiva |
| B46 Matriz completa de estados | COMPLETO | 36 pares × dos roles = 72 | A L/D | Cada rechazo comprueba SQLSTATE |
| B47 Entrada a producción | COMPLETO | Gate de adelanto y override Admin motivado | V/H/A L/D; R | Colaborador no puede omitirlo |
| B48 Fecha de entrega | COMPLETO | Se asigna, no futura, >= confirmación | V/H L/D; R | Solo en delivered |
| B49 Entrega con saldo y cobro posterior | COMPLETO | Entrega con 0.87 pendiente; pago sin reapertura | V L/D; R UI | Sin exigir saldo cero |
| B50 Retrocesos administrativos | COMPLETO | Tres retrocesos de un paso con motivo | A/V L/D; R | Sin Confirmado→Cotización ni saltos |
| B51 Reapertura/reentrega | COMPLETO | delivered_at NULL y nueva entrega; dos eventos | A/V L/D; R UI | Historia no se borra |
| B52 Cancelación según rol | COMPLETO | Quote ambos; posteriores solo Admin; delivered requiere reapertura separada | A/V L/D; R | Motivo obligatorio |
| B53 Cancelado terminal | COMPLETO | Todas las salidas rechazadas | A/V L/D; R | Nuevo pedido para continuar |
| B54 Cancelar conserva pagos | COMPLETO | Mismos pagos válidos/anulados y suma | V L/D; R | Sin devolución ni DELETE |
| B55 Alertas por fecha | COMPLETO | 7/6 amarillo, <=5 rojo, atraso; delivered/cancelled sin alerta | Local dominio; R3A | No depende solo del color |
| B56 Corregir confirmación | COMPLETO | Mismo año y revalidación de pagos válidos/entrega vigente | H/Z/A L/D | Cambiar año se bloquea |
| B57 created_at real | COMPLETO | Histórico 2024/2025 con timestamp real | H L/D | Fecha efectiva no falsifica registro |
| B58 Medianoche Costa Rica | COMPLETO | Casos dominio y frontera SQL de año | H L/D; local 3A | UTC no define día comercial |
| B59 Edición vs confirmación | COMPLETO | Dos sesiones, una revisión | R | Un éxito / 409 |
| B60 Transición vs transición | COMPLETO | Dos sesiones, misma revisión | R | Un éxito / 409 |
| B61 Pago vs reducción del total | COMPLETO | Saldo/total consistentes tras carrera | R | Sin actualización perdida |
| B62 Anulación vs nuevo pago | COMPLETO | Una operación gana y otra recarga | R | Pagos válidos <= total |
| B63 Contrato HTTP 400/403/409 | COMPLETO | AB-01, entrada inválida vs permisos vs revisión obsoleta | A L/D; R | No convertir validación en conflicto |
| B64 Ocho CHECKs trazables | COMPLETO | Tabla anterior, expresiones catálogos | C local; D | Ocho antiguas ausentes; nuevas validadas |
| B65 Conservación de Cotización/Cancelado 3A | COMPLETO | Preservación y fila inválida revierte migración | C local; SQL 3A DEV | No reparación automática |
| B66 Excepciones DROP limitadas | COMPLETO | Ocho RESTRICT + ZT-01 autorizado | Inspección SQL/Git | Ninguna migración aplicada editada |
| B67 Eventos operativos completos | COMPLETO | Confirmación/número/adelanto/cero/pagos/edición/cliente/estados/override/retroceso/entrega/cancelación | A/V/H L/D; R | Eventos explícitos y snapshots |
| B68 Auditoría before/after/actor/fecha | COMPLETO | Assertions de snapshots y dos entregas | A L/D | Triggers de orders/items/payments |
| B69 Auditoría restringida | COMPLETO | Colaborador sin audit_log; order_history acotado | R; SQL | Sin costos/metadata general al navegador |
| B70 JWT reales cinco tablas/cuatro roles | COMPLETO | Matriz SELECT/INSERT/UPDATE/DELETE/RPC | R | No basta inspección de policies |
| B71 Inactivo con JWT vigente | COMPLETO | Inactivación seguida de API y UI | R | Perfil se restaura activo |
| B72 private fuera de Data API | COMPLETO | PGRST106 | R | Sin exposición del esquema |
| B73 service_role no es identidad comercial | COMPLETO | Seis RPC rechazan rol administrativo de infraestructura | R | Operaciones reales con JWT de usuario |
| B74 RLS y vistas invoker | COMPLETO | Catálogos, grants y search_path vacío | D y huellas local/DEV | Helpers sin EXECUTE de aplicación |
| B75 Regresión operativa 3A | COMPLETO | Edición/snapshots/personalizadas/Storage/409/alertas/archivos/permisos | R3A: 92 verificaciones | No se acredita por compilación |
| B76 Responsive ambos roles cinco anchos | COMPLETO | 320/375/768/1024/1440, pagos en tarjetas, modales y PED largo | R | Estrés de texto largo es DOM simulado |
| B77 Feedback y accesibilidad | COMPLETO | SweetAlert/Sonner/Lucide, peligro rojo, motivo, foco de error, reduced-motion | Código; R | Medición espera fin de animación |
| B78 Loading/vacío/error | COMPLETO | E2E simulado y formulario real | E S; R y UI-estados | Fallo de red inducido, no caída de Supabase |
| B79 Local/remoto equivalentes | COMPLETO | Ocho huellas y dry-run vacío | Local/D/CLI | Incluye vistas/triggers/grants |
| B80 Secretos y temporales | COMPLETO | Escaneo de valores privados/patrones y assets | Local | .env.local ignorado |
| B81 Herramientas de calidad | COMPLETO | Lint/typecheck/19 tests/build/20 E2E/audit | Local/S | 0 vulnerabilidades de producción |
| A51 Protección de contraseñas filtradas | PENDIENTE | Security Advisors WARN heredado | D | Solo antes de producción; no bloquea DEV |
| INFO order_counters sin policies | NO APLICA | Aislamiento deliberado, sin grants directos | D; B15 | No abrir tabla para silenciar INFO |
| 3C/3D/3E y módulos posteriores | NO APLICA | Tablas/rutas/código ausentes; dashboard shell | D/local | Fuera de alcance, no se implementan |

### Resultado de cierre y evidencia real

**Conteo de la matriz de cierre: 81 COMPLETO, 0 PARCIAL, 1 PENDIENTE, 2 NO APLICA (84 criterios).** El único PENDIENTE es A51, exclusivo de producción; cero pendientes funcionales de 3B. Ejecuciones de auditoría: 24 y 29 de septiembre de 2026. Checkpoint de implementación: f1c2e77.

Resultados de ejecución:

- Local: lint y typecheck correctos; 19 tests aprobados. Reejecuciones específicas de PostgreSQL local verificaron las extensiones de audit.sql y history.sql. Build de producción correcto, sin rutas de fases posteriores. No dependencias ni variables nuevas.
- Simulado: 20 E2E aprobados de Auth/catálogos/cotizaciones con fixture HTTP. Los logs de error de catálogo/listado son fallos inducidos esperados por esos casos. No se atribuye cobertura real de 3B a estos 20 tests.
- DEV PostgreSQL: V/H/Z/A y SQL de regresión de 3A aprobados con ROLLBACK; incluyen 72 pares de estados/roles, fallo tardío de auditoría, años y medianoche, autorización original entre dos Admin y trazabilidad completa. Los actores SQL aislados no se presentan como sesiones Auth reales.
- DEV Auth/API/UI: phase3b-real.mjs completado con **219 verificaciones**; phase3a-real.mjs completado con **92**; phase3b-ui-states.mjs completado con **14**. No mocks del backend. Los fallos de transporte y el estrés del texto PED se inducen explícitamente y son evidencia simulada de esos casos concretos, aunque la sesión/datos circundantes sean reales.
- Responsive: ambos roles, 320/375/768/1024/1440, sin desbordamiento de página, pagos como tarjetas en móvil, formularios y modales utilizables. Motivos requeridos en anulación/cancelación, controles visibles >=44 px al terminar animación, movimiento reducido, errores enfocados y formulario preservado. Texto PED largo se ensaya solo en DOM, sin falsificar números de BD. Vacío/guardando/error del pago se comprueban adicionalmente para ambos roles a 320 y 1440.
- Regresión 3A real: creación y edición, línea de catálogo y personalizada, snapshots tras modificar/inactivar catálogo, decimal y rechazo de valores inválidos, 409 conservando borrador, archivos por bytes/MIME, descarga privada, reemplazo conservando versión, permisos, cinco anchos y cancelación terminal. Además SQL 3A verifica rollback de asociación/auditoría. No se concluye por compilación.
- Temporales en test-results ignorado: phase3b-real-summary.json (incluye números y matriz), phase3a-real-summary.json, phase3b-ui-states-summary.json, capturas y huellas de esquema. No se incluyen capturas, cookies, enlaces Auth ni tokens en Git.

Seis confirmaciones de la ejecución completa, enumeradas en orden de fixtures y **no** de llegada:

| Pedido de prueba | Número obtenido |
|---|---|
| c7ccbb38-f9ef-4519-88d9-619c60ca491a | PED-2026-00070 |
| bb910a4e-807b-4525-ae2a-71ed7ea04f7b | PED-2026-00072 |
| c6e8926e-80af-4ad3-84d0-cbdbaeaf83e8 | PED-2026-00071 |
| ec1348a8-3dca-4ace-962c-d2b2e8228032 | PED-2026-00074 |
| f035cd04-1e59-4778-8e2d-42cd88883c56 | PED-2026-00075 |
| 120c2a34-ac27-4214-b8f9-0d16aa11f458 | PED-2026-00073 |

Todos distintos. Reintentar confirmación rechaza sin cambiar el número. Los pedidos de prueba posteriormente cancelados conservan sus números: no se reutilizan ni se consideran error los huecos de transacciones comprometidas. En las otras cinco carreras (pago/pago, edición/confirmación, transición/transición, pago/reducción y anulación/pago), una operación confirmó y la otra obtuvo HTTP 409. Se comprobaron saldos y revisiones después de ambas respuestas.

### Matriz de acceso directo con JWT reales

`Sí` significa SELECT autorizado; `Vacío` significa respuesta sin filas por RLS; `42501` significa denegación explícita por privilegios. Para Anónimo se usa la clave publicable sin sesión; para Inactivo se conserva el JWT obtenido antes de desactivar el perfil. Las mutaciones denegadas se prueban por Data API, no solo por ocultación UI. Las RPC aplican además la matriz de estado/rol anterior.

| Tabla | Actor | SELECT | INSERT | UPDATE | DELETE | RPC / camino autorizado |
|---|---|---|---|---|---|---|
| orders | Admin | Sí | 42501 | 42501 | 42501 | Confirmar/editar/transicionar/cancelar/corregir con validación |
| orders | Colaborador | Sí | 42501 | 42501 | 42501 | Operación normal; sin histórico/cero/retroceso/cancelación posterior |
| orders | Inactivo | Vacío | 42501 | 42501 | 42501 | Todas las mutaciones rechazadas |
| orders | Anónimo | 42501 | 42501 | 42501 | 42501 | Sin EXECUTE |
| order_items | Admin | Sí | 42501 | 42501 | 42501 | save_quote/amend_order atómicos |
| order_items | Colaborador | Sí | 42501 | 42501 | 42501 | save_quote/amend_order dentro de permisos |
| order_items | Inactivo | Vacío | 42501 | 42501 | 42501 | save_quote/amend_order rechazados |
| order_items | Anónimo | 42501 | 42501 | 42501 | 42501 | Sin EXECUTE |
| order_files | Admin | Sí | 42501 | 42501 | 42501 | RPC directa rechazada; carga vía servidor verifica actor |
| order_files | Colaborador | Sí | 42501 | 42501 | 42501 | RPC directa rechazada; carga autorizada vía servidor |
| order_files | Inactivo | Vacío | 42501 | 42501 | 42501 | Descarga/operación bloqueadas |
| order_files | Anónimo | 42501 | 42501 | 42501 | 42501 | Sin RPC ni archivo público |
| order_counters | Admin | 42501 | 42501 | 42501 | 42501 | Solo efecto interno de confirm_order |
| order_counters | Colaborador | 42501 | 42501 | 42501 | 42501 | Solo efecto interno de confirm_order |
| order_counters | Inactivo | 42501 | 42501 | 42501 | 42501 | confirm_order rechazado |
| order_counters | Anónimo | 42501 | 42501 | 42501 | 42501 | Sin EXECUTE |
| payments | Admin | Sí | 42501 | 42501 | 42501 | Alta y anulación motivada |
| payments | Colaborador | Sí | 42501 | 42501 | 42501 | Alta autorizada; anulación rechazada |
| payments | Inactivo | Vacío | 42501 | 42501 | 42501 | Alta/anulación rechazadas |
| payments | Anónimo | 42501 | 42501 | 42501 | 42501 | Sin EXECUTE |

Fuentes: R para 80 combinaciones tabla/actor/verbo y RPC 3B; R3A para RPC/Storage/archivos y save_quote/cancel_quote. Anon no tiene JWT de usuario por definición. `private` responde PGRST106 mediante Data API. Las seis RPC comerciales 3B rechazan también llamadas directas con service_role. El servidor usa ese rol solo como infraestructura (p. ej. Storage con actor autenticado verificado); las pruebas comerciales usan JWT de usuario. Inactivar bloquea lecturas/escrituras inmediatamente en la siguiente operación de BD, sin esperar renovación del JWT, y la UI retira acceso al revalidar perfil. La cuenta de prueba se restaura activa.

### Equivalencia, Advisors y límites

Ocho huellas local/DEV coinciden tras aplicar la migración de auditoría:

| Grupo | Huella común |
|---|---|
| columnas | f3896039f184500b7f614056a9c0df16 |
| constraints | 37c5aee8be56a3f6438bee13f5f5a0aa |
| funciones | 6a55ede41893979bd6e4741a11ed32c0 |
| policies | 7da412df7ff780ad80e00ba2ea7887e4 |
| índices | 0484a7cc7fed08246b26b67f71e9c2b6 |
| vistas | a0dd04c51c60ed266e686e2d89016d7f |
| triggers | e0873e0a93f292db946fa9c955c1e58c |
| grants de aplicación | d03f767119e53b286931597c3f05b020 |

Las huellas cubren objetos enumerados en phase3b-schema.sql, no todo Supabase. Se verifican además reloptions security_invoker, search_path, ACL de funciones y CHECKs validadas. Ocho CHECKs antiguas ausentes; ninguna CHECK pendiente de validar en orders/payments. Historial de migraciones al día y dry-run posterior sin pendientes.

Security Advisors, última consulta 2026-09-29: **0 ERROR, 1 WARN heredado A51 y 1 INFO**.

- [INFO RLS Enabled No Policy](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy): order_counters tiene RLS habilitado sin policies porque ningún rol de aplicación debe consultar ni modificar sus filas directamente. La matriz real demuestra SELECT/DML denegados incluso a Admin; confirm_order accede internamente bajo la autorización/bloqueo de su cuerpo privado. No es una autorización abierta ni se añade una policy para silenciarlo.
- [A51 Leaked Password Protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection): pendiente antes de producción, aceptado como no bloqueante DEV. No se modificó Auth ni el plan.

Esquema público inspeccionado: 16 tablas, limitadas a perfiles/auditoría/configuración/catálogos/tasas/orders/order_items/order_files/order_counters/payments. No manual_income, expenses, expense_categories, comprobantes de gastos, movimientos/consumo, sesiones de cronómetro, envíos ni tablas de rentabilidad/reportes. Rutas compiladas: Auth y módulos ya aprobados, sin rutas operativas futuras; los accesos «Próximamente» del shell no implementan esos módulos. No se avanzó a 3C/3D/3E.

Escaneo de archivos versionables y .next/static: sin coincidencias de valores privados de entorno ni patrones de tokens/claves privadas; .env.local ignorado. Auditoría almacenada sin patrones de JWT/claves secretas. Las pruebas conservan fixtures identificados y sus pagos/auditoría; no borran filas/usuarios ni reescriben historia. Se limitan a DEV, no son una prueba de carga prolongada ni certificación de producción.

Archivos de esta auditoría: README.md y este informe; globals.css, order-operations.tsx y domain.ts; migración nueva 20260924034005; phase3b-real.mjs, phase3b-ui-states.mjs, phase3b.test.mjs, SQL audit/history/schema; phase3a-real.mjs únicamente amplía la espera de aserciones para latencia real. Sin cambios de AGENTS.md, decisiones funcionales, referencias, dependencias, Auth o plan. `git diff --check` correcto y verificación de secretos/temporales previa al checkpoint `test: complete phase 3b audit and validation`. No push remoto solicitado.
