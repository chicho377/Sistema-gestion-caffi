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
