# PHASE4B_PREFLIGHT.md

Fecha: 2026-10-02. Base cerrada 4A: commit aec1fb6, 19 migraciones locales. DEV inspeccionado exclusivamente mediante SELECT: pysgfnwsycgoneaecgcl. Sin DDL, migraciones, código de aplicación ni datos de prueba nuevos.

## 1. Decisiones y precedencia

B4B-01..07 documentadas íntegramente como D-23 en DECISIONS.md. D-01..D-22 permanecen intactas. D-23 sustituye expresamente para salidas futuras el promedio restante constante de D-22 y precisa el retorno por valor interno asignado, no por multiplicación del snapshot redondeado. Esto no cambia el algoritmo ni las filas históricas de entradas 4A. No autoriza implementar 4B.

## 2. Algoritmos aprobados

- Consumo: q>0, escala<=4, q<=Q. Snapshot A anterior. Si q=Q: D=V; Q'=V'=0, promedio vigente sin existencia representado NULL conforme al preflight 4A. Parcial: D=HALF_UP(V*q/Q,8), Q'=Q-q, V'=V-D, A'=HALF_UP(V'/Q',8). Rechazar D<=0 o D>=V si queda cantidad. Evidencia allocation_delta=D-q*A.
- Devolución: consumo original q0/D0, acumulados qr/Vr, r>0 hasta q0-qr. Completa: R=D0-Vr. Parcial: R=HALF_UP((D0-Vr)*r/(q0-qr),8). Q'=Q+r, V'=V+R, A'=HALF_UP(V'/Q',8). Snapshot unitario original y return_allocation_delta=R-r*A_original. Bloqueo del origen y acumulados autoritativos.
- Subcentavos: valor/deltas hasta 8, residuos exactos hasta 12 (producto de escalas 4 y 8); no ampliar quote_money. Delta positivo que colapse a cero se rechaza; presentación administrativa menor a CRC 0,01 no significa gratuito. Futura agregación usa D/R internos, no importes visuales.
- Ajuste negativo Admin: mismo algoritmo de salida; sin pedido obligatorio. Positivo Q>0: R=HALF_UP(V*q/Q,8), Q'=Q+q, V'=V+R, promedio derivado del nuevo par. Sin nuevo costo/tasa. Q=0 exige valoración positiva explícita con contrato CRC/USD 4A y evidencia histórica.
- Corrección de cantidad: compensación/devolución ligada y eventual consumo nuevo a valoración vigente; posible transacción Admin conjunta, motivo/auditoría incluso en confirmed/delivered/cancelled, sin consumo arbitrario.
- Atribución: evidencia administrativa separada, sin devolver/reconsumir ni modificar movimiento; destino confirmado alguna vez, línea del mismo pedido, before/after, revisión y auditoría.
- Reversión de línea 4A: únicamente sin movimientos posteriores dependientes, restituye exactamente Q/V/A anteriores mediante nuevo movimiento; recepción completa opcional todas-o-ninguna. Con dependencias: ajuste actual, nunca reconstrucción histórica.

Estos algoritmos son documentación aprobada, no resultados de pruebas de una implementación 4B.

## 3. Inspección exacta de CHECK que necesitan sustitución

Fuente local cerrada: supabase/migrations/20261002160448_phase4a_inventory.sql. Nombres y expresiones normalizadas corroborados en pg_constraint mediante pg_get_constraintdef en DEV; coinciden con los CHECK de esa migración. No se ejecutó la migración local ni se reconstruyó una BD. Las expresiones siguientes son propuestas para revisión, no DDL ejecutado.

Se proponen exactamente seis reemplazos. Los nombres nuevos distinguen la futura versión; no abarcan otras restricciones.

| Constraint actual | Tabla | Expresión exacta actual | Por qué bloquea 4B | Constraint propuesta | Expresión propuesta |
|---|---|---|---|---|---|
| `inventory_balances_check` | `public.inventory_balances` | `CHECK (revision = 0 AND last_movement_id IS NULL AND last_effective_at IS NULL AND unit_locked IS NULL AND quantity_on_hand::numeric = 0::numeric OR revision > 0 AND last_movement_id IS NOT NULL AND last_effective_at IS NOT NULL AND unit_locked IS NOT NULL AND quantity_on_hand::numeric > 0::numeric)` | Prohíbe stock cero tras haber tenido movimientos. | `inventory_balances_4b_state_check` | `CHECK (((revision=0 AND last_movement_id IS NULL AND last_effective_at IS NULL AND unit_locked IS NULL AND quantity_on_hand=0) OR (revision>0 AND last_movement_id IS NOT NULL AND last_effective_at IS NOT NULL AND unit_locked IS NOT NULL AND quantity_on_hand>=0)) IS TRUE)` |
| `inventory_movement_costs_check` | `public.inventory_movement_costs` | `CHECK (value_after_crc::numeric = (value_before_crc::numeric + movement_amount_crc::numeric))` | Impone entrada de valor y solo usa importe de 2 decimales. | `inventory_movement_costs_4b_value_check` | `CHECK ((CASE WHEN valuation_version='moving_average_value_v1' THEN value_after_crc=value_before_crc+movement_amount_crc ELSE abs(value_after_crc-value_before_crc)=internal_amount_crc END) IS TRUE)` |
| `inventory_movement_costs_valuation_version_check` | `public.inventory_movement_costs` | `CHECK (valuation_version = 'moving_average_value_v1'::text)` | No permite identificar el algoritmo nuevo sin reinterpretar evidencia v1. | `inventory_movement_costs_4b_version_check` | `CHECK (valuation_version IN ('moving_average_value_v1','proportional_value_v2'))` |
| `inventory_movements_check` | `public.inventory_movements` | `CHECK (stock_after::numeric = (stock_before::numeric + quantity::numeric))` | Impone incremento de stock para todo movimiento. | `inventory_movements_4b_stock_check` | `CHECK (stock_after = stock_before + CASE WHEN movement_type IN ('purchase_entry','opening_balance','return','adjustment_positive') THEN quantity ELSE -quantity END)` |
| `inventory_movements_movement_type_check` | `public.inventory_movements` | `CHECK (movement_type = ANY (ARRAY['purchase_entry'::text, 'opening_balance'::text]))` | Solo admite entradas 4A. | `inventory_movements_4b_type_check` | `CHECK (movement_type IN ('purchase_entry','opening_balance','consumption','return','adjustment_positive','adjustment_negative','entry_reversal'))` |
| `inventory_valuations_check` | `public.inventory_valuations` | `CHECK (revision = 0 AND value_crc::numeric = 0::numeric AND average_unit_cost_crc IS NULL AND last_movement_id IS NULL OR revision > 0 AND value_crc::numeric > 0::numeric AND average_unit_cost_crc::numeric > 0::numeric AND last_movement_id IS NOT NULL)` | Prohíbe valor cero/promedio NULL tras agotamiento. | `inventory_valuations_4b_state_check` | `CHECK (((revision=0 AND value_crc=0 AND average_unit_cost_crc IS NULL AND last_movement_id IS NULL) OR (revision>0 AND last_movement_id IS NOT NULL AND ((value_crc=0 AND average_unit_cost_crc IS NULL) OR (value_crc>0 AND average_unit_cost_crc>0)))) IS TRUE)` |

El CHECK de valor de v2 valida magnitud; una nueva guarda diferida debe validar signo según movimiento, algoritmo D-23, relación 1:1 y coherencia completa de snapshots/proyecciones. No presentar ABS como validación suficiente del algoritmo. La rama v1 mantiene exactamente la suma original. La versión v2 se proporciona explícitamente solo en operaciones nuevas; el default v1 de recepción se conserva.

### Tres NOT NULL adicionales, sin nombre de CHECK sustituible

Verificados por pg_attribute.attnotnull=true. Requieren autorización separada para flexibilización futura; no quedan cubiertos por autorizar solo los seis nombres anteriores.

| Columna | Actual exacto | Propuesta y guarda sustitutiva |
|---|---|---|
| public.inventory_movements.receipt_item_id | uuid NOT NULL | Nullable para nuevos movimientos; CHECK de presencia solo en purchase_entry/opening_balance. Mantener UNIQUE y FK compuesta existentes. Reversión referencia movimiento origen, no reutiliza receipt_item_id. |
| public.inventory_movement_costs.movement_amount_crc | public.quote_money NOT NULL | Nullable solo en v2, donde internal_amount_crc es obligatorio positivo. v1 conserva importe original obligatorio. Sin cambiar tipo, dominio ni datos históricos. |
| public.inventory_movement_costs.average_cost_after_crc | public.inventory_value NOT NULL | Nullable únicamente cuando value_after_crc=0; positivo si value_after_crc>0. Su CHECK positivo existente se conserva, pues CHECK permite NULL; el nuevo CHECK condicional evita ausencia indebida. |

### CHECK nuevos aditivos complementarios

- inventory_movements_4b_receipt_check: CHECK ((CASE WHEN movement_type IN ('purchase_entry','opening_balance') THEN receipt_item_id IS NOT NULL ELSE receipt_item_id IS NULL END) IS TRUE).
- inventory_movement_costs_4b_amount_check: CHECK ((CASE WHEN valuation_version='moving_average_value_v1' THEN movement_amount_crc IS NOT NULL AND movement_amount_crc>0 AND internal_amount_crc IS NULL ELSE movement_amount_crc IS NULL AND internal_amount_crc IS NOT NULL AND internal_amount_crc>0 END) IS TRUE).
- inventory_movement_costs_4b_average_check: CHECK (((value_after_crc=0 AND average_cost_after_crc IS NULL) OR (value_after_crc>0 AND average_cost_after_crc>0)) IS TRUE).
- Nuevos CHECK de pedido obligatorio para consumo, línea no huérfana, origen obligatorio en devolución/reversión, motivo según operación, UUID/posición y revisión de atribución. Definición final en futura migración autorizada; no requieren quitar CHECK anteriores.
- Triggers diferidos cruzados: signo/cadena, stock y valor cero conjuntamente, promedio calculado, acumulados de retorno, costo 1:1, cronología, atribución y proyecciones. No CHECK que consulte otras tablas.

No reemplazar checks de cantidades positivas, finitud/escala, unit_cost_applied_crc>0, movement_amount_crc>0 (puede coexistir con NULL condicional), average_cost_after_crc>0, rounding_delta_crc finito/escala<=12, fechas, revisiones ni dominios. Mantener PK/FK/UNIQUE e índice inventory_opening_once. No permiso general de DROP.

## 4. Columnas, FKs, índices y objetos aditivos propuestos

- inventory_movements: order_id, order_item_id, source_movement_id, reason, request_id y request_position. Campos nuevos nullable para filas 4A, sin backfill ni reescritura. CHECK condicional de solicitud para movimientos v2; UNIQUE(request_id,request_position) permite compensación+consumo/multilínea en la misma solicitud sin duplicar una posición.
- FKs nuevas: order_id → orders(id); (order_id,order_item_id) → order_items(order_id,id), cuya unicidad ya existe; (source_movement_id,material_id) → inventory_movements(id,material_id). Todas RESTRICT. Preflight de relaciones nuevas sobre filas previas: campos NULL, sin relaciones ficticias.
- inventory_movement_costs.internal_amount_crc: public.inventory_value nullable, exclusivamente financiero, magnitud autoritativa D/R hasta 8 decimales. v1 no requiere backfill. rounding_delta_crc reutilizado con la definición correspondiente a cada versión.
- inventory_movement_attribution_corrections: id, movement_id, previous_order_id/item_id, corrected_order_id/item_id, created_by, reason, created_at, revision. PK, UNIQUE(movement_id,revision), FKs a movimiento/perfil y pares pedido/línea; RPC Admin, inmutable, auditoría. Estado operativo vigente derivado de última revisión; no reasignar física ni financieramente movimientos.
- inventory_adjustment_cost_evidence: evidencia privada 1:1 de ajuste positivo sin stock, con importe original, CRC/USD, equivalente, tasa/fecha/procedencia, fallback y aporte Admin. Necesaria porque los movimientos operativos no pueden contener costos y el snapshot cambiario de receipt_items representa recepciones, no ajustes.
- Índices en order_id/order_item_id/source_movement_id y todas las FKs nuevas, evaluando prefijos de índices UNIQUE para evitar redundancias. Índice parcial único de reversión por origen para impedir reversión repetida; devoluciones admiten múltiples filas, no unicidad por origen de retorno.
- Nuevas RPC, helpers, guards, RLS y vistas security_invoker operativas/financieras. Preferir nuevas vistas 4B sin cambiar tipos/orden de columnas de vistas 4A. Sin nuevos buckets ni cambios Auth/expenses.

Son aditivos las columnas nullable, tablas de evidencia, FKs/índices/CHECK nuevos y nuevas funciones/vistas/policies. No son exclusivamente aditivos los seis reemplazos CHECK, tres flexibilizaciones NOT NULL ni CREATE OR REPLACE de la función siguiente. Nada se ejecutó.

## 5. Funciones y triggers 4A

| Objeto existente | Necesidad propuesta | Firma/grants |
|---|---|---|
| private.inventory_receipt_complete() RETURNS trigger | CREATE OR REPLACE necesario: las comparaciones pc.average_cost_after_crc=c.average_cost_before_crc fallan ante ambos NULL después de agotar stock. Usar IS NOT DISTINCT FROM para cadena y comparaciones null-safe de proyecciones; preservar validación de recepción v1. | Mismo nombre, cero parámetros, retorna trigger; SECURITY DEFINER, search_path vacío. Conservar ACL actual solo postgres. Trigger inventory_receipt_complete, diferido tras INSERT de receipt, permanece unido al mismo objeto. |
| private.register_inventory_receipt(uuid,jsonb,jsonb) | No requiere reemplazo con esta propuesta: ya suma desde Q/V=0 y calcula nuevo promedio; sigue escribiendo v1. Comprobar regresión tras agotamiento. | Firma/grants actuales intactos, authenticated ejecuta wrapper/operación controlada Admin. |
| private.inventory_actor() | Sin reemplazo. No ampliar a Colaborador; protege recepción y vínculo a gasto. | Admin activo y grants intactos. Helper operativo 4B nuevo separado. |
| private.inventory_decimal(text,integer), private.inventory_unit_guard(), private.inventory_audit() | Reutilizar sin reemplazo; nuevo registro de atribución con id/actor/motivo es compatible con auditoría genérica. | Firmas/grants intactos. |
| private.inventory_immutable() | No requiere cambio funcional: sigue rechazando UPDATE/DELETE. Su mensaje «correcciones fuera de 4A» puede mejorarse después, pero no es necesario para integridad ni se propone como reemplazo obligatorio. | Firma/grants intactos. |
| public.register_inventory_receipt(uuid,jsonb,jsonb), public.link_inventory_expense(uuid,uuid), private.link_inventory_expense(uuid,uuid) | Sin reemplazo. | Conservar firmas, permisos y validación Admin. |

Los nuevos guardas de movimientos 4B validarán también recepción posterior a salida y cualquier composición atómica; no basta el trigger de receipt porque solo se dispara al insertar cabecera. No conceder DML directo ni acceso de Colaborador a private helpers, costos o auditoría.

## 6. Locks, cronología y atribución

Perfil vigente → pedidos UUID ordenados → materiales UUID ordenados (mismo lock 4A) → balances/valuations → movimientos origen ordenados. Estados/revisión revalidados dentro de transacción; no lock de material seguido por lock de pedido que invierta este orden. Retornos bloquean mismo origen y calculan acumulados desde evidencia inmutable; no saldo enviado por UI. UUID estable y conflicto PT409 para duplicados/revisión obsoleta.

Admin/Colaborador consumo ordinario solo in_production/ready. Línea opcional activa del pedido. Colaborador puede devolver consumos accesibles ajenos en esos estados con motivo, incluido material inactivo; otros estados solo Admin vinculado. Sin costos en requests/responses/HTML/RSC operativos.

Colaborador usa hora servidor. Admin histórica no futura, >= confirmed_at y último instante del material; retorno/corrección >= origen. material_sequence resuelve empates. Corrección de atribución bloquea origen/revisión y pedidos implicados, valida destino confirmado alguna vez; la línea histórica puede estar inactiva. No modifica fecha/costo/cantidad originales.

## 7. Preflight de datos existentes: DEV real, solo lectura

Lecturas ejecutadas el 2026-10-02 exclusivamente contra pysgfnwsycgoneaecgcl. No prueba funcional 4B ni aplicación de constraints. Al no existir internal_amount_crc, un SELECT proyecta NULL::numeric, exactamente el valor que tendrían filas anteriores al añadir columna nullable sin default; no se modificó tabla.

| Comprobación | Filas | Incumplimientos |
|---|---:|---:|
| Tipo de movimiento ampliado | 44 | 0 |
| Signo/stock propuesto | 44 | 0 |
| Valor interno: expresión propuesta, rama v1 | 44 | 0 |
| Versiones admitidas | 44 | 0 |
| Balance: estado ampliado | 20 | 0 |
| Valoración: estado ampliado | 20 | 0 |
| Contrato v1/importe nuevo NULL | 44 | 0 |
| Promedio/valor posterior | 44 | 0 |
| Presencia de receipt_item_id | 44 | 0 |
| Coherencia de las dos proyecciones y promedio | 20 | 0 |

44 movimientos tienen su costo, recepción e importe/promedio v1 presentes; cero faltantes/versiones inesperadas. Nuevas relaciones y tablas de evidencia no tienen filas todavía. No hubo fila que reparar/eliminar. Estos resultados no validan branches nuevos con movimientos 4B inexistentes.

Consulta exacta para los seis CHECK (ejecutada como SELECT):

```sql
SELECT 'inventory_balances_check' AS criterion,count(*) AS rows_checked,count(*) FILTER(WHERE (((revision=0 AND last_movement_id IS NULL AND last_effective_at IS NULL AND unit_locked IS NULL AND quantity_on_hand=0) OR (revision>0 AND last_movement_id IS NOT NULL AND last_effective_at IS NOT NULL AND unit_locked IS NOT NULL AND quantity_on_hand>=0)) IS TRUE) IS NOT TRUE) AS violations FROM public.inventory_balances
UNION ALL
SELECT 'inventory_movement_costs_check' AS criterion,count(*) AS rows_checked,count(*) FILTER(WHERE ((CASE WHEN valuation_version='moving_average_value_v1' THEN value_after_crc=value_before_crc+movement_amount_crc ELSE abs(value_after_crc-value_before_crc)=internal_amount_crc END) IS TRUE) IS NOT TRUE) AS violations FROM (SELECT c.*,NULL::numeric AS internal_amount_crc FROM public.inventory_movement_costs c) projected
UNION ALL
SELECT 'inventory_movement_costs_valuation_version_check' AS criterion,count(*) AS rows_checked,count(*) FILTER(WHERE (valuation_version IN ('moving_average_value_v1','proportional_value_v2')) IS NOT TRUE) AS violations FROM (SELECT c.*,NULL::numeric AS internal_amount_crc FROM public.inventory_movement_costs c) projected
UNION ALL
SELECT 'inventory_movements_check' AS criterion,count(*) AS rows_checked,count(*) FILTER(WHERE (stock_after = stock_before + CASE WHEN movement_type IN ('purchase_entry','opening_balance','return','adjustment_positive') THEN quantity ELSE -quantity END) IS NOT TRUE) AS violations FROM public.inventory_movements
UNION ALL
SELECT 'inventory_movements_movement_type_check' AS criterion,count(*) AS rows_checked,count(*) FILTER(WHERE (movement_type IN ('purchase_entry','opening_balance','consumption','return','adjustment_positive','adjustment_negative','entry_reversal')) IS NOT TRUE) AS violations FROM public.inventory_movements
UNION ALL
SELECT 'inventory_valuations_check' AS criterion,count(*) AS rows_checked,count(*) FILTER(WHERE (((revision=0 AND value_crc=0 AND average_unit_cost_crc IS NULL AND last_movement_id IS NULL) OR (revision>0 AND last_movement_id IS NOT NULL AND ((value_crc=0 AND average_unit_cost_crc IS NULL) OR (value_crc>0 AND average_unit_cost_crc>0)))) IS TRUE) IS NOT TRUE) AS violations FROM public.inventory_valuations
```

Consultas adicionales (ejecutadas como SELECT):

```sql
WITH costs AS (SELECT c.*, NULL::numeric AS internal_amount_crc FROM public.inventory_movement_costs c)
SELECT 'cost_contract_v1' AS criterion,count(*) AS rows_checked,count(*) FILTER(WHERE (valuation_version='moving_average_value_v1' AND movement_amount_crc IS NOT NULL AND movement_amount_crc>0 AND internal_amount_crc IS NULL) IS NOT TRUE) AS violations FROM costs
UNION ALL
SELECT 'average_value_pair',count(*),count(*) FILTER(WHERE ((value_after_crc=0 AND average_cost_after_crc IS NULL) OR (value_after_crc>0 AND average_cost_after_crc>0)) IS NOT TRUE) FROM costs
UNION ALL
SELECT 'receipt_presence',count(*),count(*) FILTER(WHERE (receipt_item_id IS NOT NULL AND movement_type IN ('purchase_entry','opening_balance')) IS NOT TRUE) FROM public.inventory_movements
UNION ALL
SELECT 'projection_pair',count(*),count(*) FILTER(WHERE (v.material_id IS NOT NULL AND b.quantity_on_hand>0 AND v.value_crc>0 AND v.average_unit_cost_crc=round(v.value_crc/b.quantity_on_hand,8) AND b.revision=v.revision AND b.last_movement_id=v.last_movement_id) IS NOT TRUE) FROM public.inventory_balances b LEFT JOIN public.inventory_valuations v USING(material_id);
```

Antes de una futura migración autorizada repetir preflight sobre datos vigentes y detenerse ante cualquier incumplimiento. No se ejecutó dry-run/apply ni pruebas de escritura porque la tarea prohíbe crear/aplicar migraciones.

## 8. Pruebas futuras; ninguna marcada como ejecutada

- Consumo parcial, fraccionario, total a cero; promedio 8; caso Q=3,V=10; caso extremo Q=200000000,V=1; rechazo de precisión y subcentavos, sin reconstruir desde material_costs.
- Devoluciones parciales con costos distintos y últimas que absorben residuo; agotamiento del valor retornable por precisión; rechazo de delta cero; nunca superar cantidad/valor original.
- Nueva recepción tras agotamiento; retorno tras compras posteriores; ajustes con/sin stock; reversión línea y recepción completa todas-o-ninguna; posteriores bloquean reversión.
- Corrección de cantidad compuesta rollback; atribución sin variación física/financiera, revisiones y destino/línea/historia.
- Dos consumos que exceden juntos stock; dos válidos; consumo/recepción; retorno/retorno; retorno/consumo; ajuste/consumo; misma revisión y UUID; lock de transición 3B contra consumo. Cuando revisión esperada queda obsoleta, conflicto claro, no pérdida de actualización.
- Admin/Colaborador/inactivo/anon, API directa y RLS, no costos indirectos, operaciones sobre material inactivo, líneas inactivas y estados cerrados.
- Cinco anchos, estados UI/red/409; regresión 4A y 3B. Local/simulado/DEV diferenciados al implementar.

## 9. Estado y límites

D-23 documentada, seis CHECK y tres NOT NULL identificados para autorización limitada futura. A51 sigue pendiente antes de producción; order_counters INFO intencional y Performance documentados sin eliminar índices.

Cero modificaciones de BD (local/remota), cero migraciones nuevas y cero código de aplicación 4B. No avance 4C/4D/4E. Git estaba limpio al iniciar; al finalizar quedan cuatro documentos modificados y este archivo nuevo, exclusivamente documentación solicitada. No afirmar Git limpio ni crear commit no solicitado para ocultar esa diferencia.
