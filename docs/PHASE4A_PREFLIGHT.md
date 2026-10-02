# Fase 4A — Preflight técnico documental

Fecha: 2026-10-02. Estado: diseño actualizado con P4A-01/02/03 aprobadas; implementación exclusiva 4A autorizada después del checkpoint documental. Este documento no acredita pruebas DEV.

## 1. Autoridad, alcance y puntos que aún requieren precisión

D-22 registra íntegramente B4-01 a B4-14. Los cuatro documentos principales incorporan su trazabilidad, sin reescribir D-01 a D-21. Fase 3 está cerrada para desarrollo. La autorización final exige checkpoint documental primero y permite después implementar exclusivamente 4A.

4A incluye existencias, compras/entradas, saldos iniciales valorados, promedio móvil, historial y alertas. Admin registra; Colaborador solo consulta información operativa. Consumos, devoluciones, ajustes y reversiones se implementan en 4B; se anticipa únicamente su compatibilidad estructural. No sesiones, envíos, costeo, rentabilidad ni reportes. No FIFO/lotes, conversiones de presentaciones, stock ficticio ni sincronizaciones automáticas compra/gasto.

No hay contradicción que impida documentar D-22. La precisión de ocho decimales es una concreción explícita para costos derivados; no altera entradas monetarias finales de D-21. customer_direct concreta el pagador client del antiguo esquema de envío. El permiso general de inventario de D-01 queda concretado por B4-06.

P4A-01/02/03 quedan resueltas por la resolución final incorporada a D-22: HALF UP interno a ocho, valor interno autoritativo separado del promedio, residuo de entrada explícito, rechazo de colapso a cero, contrato cambiario idéntico a gastos y rechazo de todo cero explícito. No quedan estas precisiones abiertas. Los nombres físicos siguen siendo propuestas técnicas.

Saldo inicial: una sola operación por material, únicamente sin movimientos previos. Tras checkpoint se autoriza solo 4A; no crear operaciones 4B.

## 2. Esquema exacto propuesto de 4A

Los nombres siguientes son propuestas, no objetos existentes. Tipos numeric sin escala coercitiva: validar finitud y escala antes de cualquier redondeo; evitar numeric(p,s) que redondee silenciosamente entradas inválidas. Numeric viaja como texto en JSON. UUID generados/verificados en servidor, sin confiar en actor aportado por navegador. Toda FK histórica con RESTRICT, sin borrado en cascada.

Convenciones: cantidad Q = numeric finito > 0 y escala <= 4; saldo numeric >= 0 y escala <= 4. Importe M = numeric finito > 0 aprobado (P4A-03), escala <= 2 para compra/saldo inicial valorado; no costo cero supuesto. Costo unitario U = numeric finito > 0, escala <= 8; rechazar colapso a cero según P4A-01. Tasa R = numeric finito > 0 sin reducir precisión. Fecha efectiva timestamptz finita/no futura; created_at real de BD. Nuevas cotas técnicas de texto propuestas: referencia/procedencia 300, notas 3000, motivo 1–1000.

### 2.1 public.inventory_receipts — cabecera inmutable

| Columna | Tipo / nulabilidad / regla |
|---|---|
| id | uuid PK; identidad estable de solicitud para evitar duplicados por reintento |
| receipt_kind | text NOT NULL, purchase / opening_balance |
| effective_at | timestamptz NOT NULL, fecha efectiva común a líneas |
| supplier_reference | text NULL; referencia operativa, no nuevo catálogo de proveedores |
| source_reference | text NOT NULL; procedencia declarada |
| reason | text NULL en compra, obligatorio en saldo inicial |
| notes | text NULL |
| created_by | uuid NOT NULL FK profiles; actor Admin vigente |
| created_at | timestamptz NOT NULL, reloj BD |

Compra = recepción explícita de una o más líneas; no ciclo nuevo de órdenes de compra, crédito, cuentas por pagar o recepción parcial. Sin estado draft/voided mutable: lo persistido ya fue contabilizado en movimientos. Antes de confirmar solo formulario local. No editar cabecera/líneas financieras registradas; correcciones 4B.

### 2.2 public.inventory_receipt_items — líneas y evidencia de compra, acceso Admin

| Columna | Tipo / nulabilidad / regla |
|---|---|
| id | uuid PK |
| receipt_id | uuid NOT NULL FK inventory_receipts |
| position | integer NOT NULL > 0, UNIQUE(receipt_id,position) |
| material_id | uuid NOT NULL FK materials |
| material_code_snapshot, material_name_snapshot, unit_snapshot | text NOT NULL, capturados bajo bloqueo |
| quantity | Q NOT NULL, unidad base; sin factor de conversión |
| amount_original | M NOT NULL, total de esta línea informado, no precio de catálogo |
| currency | text NOT NULL, CRC / USD |
| exchange_rate_applied | R NULL para CRC; obligatorio USD |
| exchange_rate_date | date NULL para CRC; obligatorio USD |
| exchange_rate_source | text NULL para CRC; obligatorio USD |
| rate_origin | text NOT NULL: not_applicable / provider / admin_historical; último aprobado en P4A-02 |
| rate_is_fallback | boolean NOT NULL; false CRC, semántica temporal según P4A-02 aprobada |
| rate_provided_by, rate_provided_at, rate_override_reason | uuid FK profiles / timestamptz / text, NULL salvo aporte histórico aprobado |
| amount_crc | M NOT NULL, autoritativo servidor/BD |
| unit_cost_crc | U NOT NULL, derivado de amount_crc/quantity, P4A-01 |

CRC: amount_crc = amount_original, evidencia cambiaria NULL. USD: amount_crc = HALF_UP_2(amount_original × tasa completa); conservar todos los originales y evidencia. No leer tasa vigente al consultar historia. Actor/fecha/procedencia de alta se obtienen de cabecera inmutable. Moneda por línea permite preservar originales sin sumar CRC y USD como si fueran iguales. Cabecera no acepta un total monetario arbitrario: totales por moneda y total CRC se derivan de líneas para Admin. No prorratear una factura automáticamente: Admin aporta el importe real atribuible a cada material. Cargos adicionales/descuentos globales no se distribuyen por una regla inventada.

UNIQUE(id,material_id) como destino de FK compuesta del movimiento. Varias líneas del mismo material se procesan en orden position; no fusionar líneas ni perder documentos originales. Este orden se congela y es reproducible; su relación con redondeo se cubre en P4A-01.

### 2.3 public.inventory_receipt_expenses — vínculo financiero explícito

| Columna | Tipo / regla |
|---|---|
| receipt_id | uuid PK/FK inventory_receipts |
| expense_id | uuid NOT NULL FK expenses; índice, sin UNIQUE global |
| linked_by | uuid NOT NULL FK profiles, Admin activo |
| linked_at | timestamptz NOT NULL, momento real |

Vínculo opcional 0..1 gasto por recepción; un gasto puede vincular varias recepciones/materiales. Propuesta física basada en expense_id singular solicitado, sin imponer igualdad de importe: el gasto puede incluir otras líneas. Solo vinculación explícita por Admin, al registrar o posteriormente; no reemplazar/desvincular silenciosamente un vínculo existente. Si se necesita corregir el vínculo, definir operación auditada antes de habilitarla, no DML ordinario.

Anular expenses conserva esta fila y el inventario; la UI Admin indica el estado del gasto vinculado. Registrar la recepción nunca crea expenses, y el módulo Gastos nunca genera movimientos. El FK no cambia permisos de gastos/comprobantes. Colaborador no recibe expense_id, referencia de factura ni importes mediante esta tabla. No nueva carga de comprobantes: reutilizar Gastos solo con sus permisos actuales.

### 2.4 public.inventory_movements — diario operativo inmutable

| Columna | Tipo / regla |
|---|---|
| id | uuid PK |
| material_id | uuid NOT NULL FK materials |
| material_sequence | bigint NOT NULL > 0; UNIQUE(material_id,material_sequence) |
| movement_type | text NOT NULL; 4A solo purchase_entry / opening_balance |
| receipt_item_id | uuid NOT NULL UNIQUE; FK compuesta (receipt_item_id,material_id) a línea/material |
| quantity | Q NOT NULL; 4A siempre entrada positiva |
| unit_snapshot | text NOT NULL; coincide con material bloqueado y línea |
| effective_at | timestamptz NOT NULL, cabecera; orden no decreciente por material |
| created_by, created_at | uuid FK profiles / timestamptz NOT NULL, identidad y reloj reales |
| stock_before, stock_after | numeric NOT NULL >= 0, escala <= 4 |

En 4A stock_after = stock_before + quantity. Diario sin UPDATE/DELETE. No exponer campos libres de compras que puedan contener importes a Colaborador. Fecha/usuario/tipo/cantidad/unidad son el historial operativo. No crear ahora order_id/order_item_id ni RPC de consumo: se añadirán en 4B con FKs reales y constraints, conservando este diario. Tampoco compensaciones ficticias para probar DEV.

### 2.5 public.inventory_movement_costs — snapshot financiero, Admin

| Columna | Tipo / regla |
|---|---|
| movement_id | uuid PK/FK inventory_movements |
| unit_cost_applied_crc | U NOT NULL, costo de entrada; posteriormente costo aplicado al consumo |
| movement_amount_crc | numeric NOT NULL, importe final a dos; positivo en 4A |
| average_cost_before_crc, average_cost_after_crc | U NULL cuando stock correspondiente sea cero; ocho decimales máximo |
| rounding_delta_crc | numeric NOT NULL firmado, hasta 12 decimales: total histórico − cantidad × costo unitario aplicado |
| value_before_crc, value_after_crc | numeric NOT NULL >=0, hasta 8 decimales; valor interno histórico antes/después, no Q×promedio |
| valuation_version | text NOT NULL; identifica el algoritmo confirmado, no cambia historia |

Movimiento y costo se crean 1:1 en la misma transacción; validación diferida de integridad impide diario sin evidencia financiera o línea sin movimiento. Las conversiones/originales están en su línea inmutable; snapshot del promedio permite reproducir la evolución sin consultar material_costs. No se entrega esta tabla a Colaborador.

### 2.6 public.inventory_balances — proyección operativa reconstruible

| Columna | Tipo / regla |
|---|---|
| material_id | uuid PK/FK materials |
| quantity_on_hand | numeric NOT NULL >= 0, escala <= 4 |
| revision | bigint NOT NULL >= 0, incrementa por movimiento |
| last_movement_id | uuid NULL FK inventory_movements; validar mismo material |
| last_effective_at | timestamptz NULL antes de primer movimiento |
| unit_locked | text NULL antes de primer movimiento, fija después |
| updated_at | timestamptz NOT NULL |

Saldo = suma firmada del diario; esta fila es una proyección transaccional, no otro origen editable de existencias. Sin movimientos, consulta devuelve stock cero derivado, no crea saldo inicial ficticio. Regeneración técnica no modifica movimientos y debe comparar resultado antes de sustituir una proyección. No se implementa un botón de reconstrucción destructiva.

### 2.7 public.inventory_valuations — proyección financiera reconstruible, Admin

| Columna | Tipo / regla |
|---|---|
| material_id | uuid PK/FK inventory_balances |
| value_crc | numeric NOT NULL >=0, escala <=8; valor interno reconstruible desde totales autoritativos |
| average_unit_cost_crc | U NULL si no hay stock; tratamiento explícito al agotarse en 4B |
| revision | bigint NOT NULL, igual a proyección operativa |
| last_movement_id | uuid NULL FK inventory_movements, mismo material/revisión |
| updated_at | timestamptz NOT NULL |

Mantener valor interno como proyección autoritativa para obtener el promedio, nunca reconstruirlo con Q×promedio redondeado. No es editable por cliente. Proyecciones y snapshots se verifican transaccionalmente. No exposición de valoración agregada como reporte ni cálculo de rentabilidad.

## 3. Constraints, índices y cambios sobre objetos existentes

- PKs, FKs históricas RESTRICT, UNIQUE por secuencia/material, línea/movimiento, posición/recepción y vínculo de gasto/recepción.
- CHECK de positivos, finitos, escalas, tipos de movimiento de 4A, estados de evidencia CRC/USD, stock no negativo y razón de saldo inicial.
- RPC/triggers para condiciones entre tablas: actor vigente, línea/material/unidad iguales, snapshot/diario/proyección coherentes, secuencia, fecha <= ahora y no anterior al último movimiento consolidado. Comparación reloj en operación, no CHECK mutable como única protección.
- Registro completo debe tener al menos una línea y cada línea exactamente un movimiento/costo, dentro del COMMIT; rollback total ante fallo. Guardas diferidas donde sea necesario, además de RPC y grants.
- Índices en receipt_items(material_id), receipts(effective_at,id), receipts(created_by), receipt_expenses(expense_id), movements(material_id,effective_at,material_sequence), movements(created_by). PK/UNIQUE cubren receipt_id/position, movement_id y material_sequence; no índices duplicados por rutina.
- materials conserva sus campos actuales; nueva guarda de unidad bajo bloqueo del material rechaza cambiar unit si ya tiene movimiento. No renombrar ni reinterpretar unidades/cantidades existentes. Validar previamente catálogo/min_stock sin redondearlos o corregirlos automáticamente; discrepancias se reportan.
- Conservar edición de nombre/mínimo y permisos existentes salvo bloqueo aprobado de unidad. Una desactivación concurrente debe compartir el bloqueo de material con recepción para impedir nuevas compras ordinarias sobre inactivo.
- Saldo inicial solo Admin, motivo y valoración, cronología monotónica. Una sola operación inicial por material, exclusivamente sin movimiento previo; validar bajo lock, también entre líneas de la misma recepción.
- No nuevos buckets, no cambios de Auth ni de order_counters. No editar migraciones aplicadas ni eliminar constraints antiguas por iniciativa propia.

## 4. Algoritmo decimal y transaccional propuesto

Contrato P4A-01 aprobado. Sean Q la existencia anterior, V el valor interno anterior, q la cantidad de entrada y T su total CRC histórico a dos decimales. Calcular c = HALF_UP_8(T/q), V_nuevo = V+T, Q_nuevo = Q+q, A_nuevo = HALF_UP_8(V_nuevo/Q_nuevo). Rechazar c o A_nuevo positivos matemáticamente que colapsen a cero a ocho decimales. No usar Q×A como valor anterior. Persistir cantidad, valor y promedio antes/después.

Residuo de entrada: rounding_delta_crc = T − q×c, exacto decimal hasta doce posiciones. No afecta V_nuevo ni T; no es gasto/ingreso/movimiento ni se distribuye alterando cantidades. V conserva hasta ocho decimales; en 4A suma importes de entrada a dos sin pérdida.

Ejemplo: 100 gramos por CRC 1000, luego 50 por CRC 750: Q=150, V=1750 y A=11.66666667. El valor permanece 1750, no 1750.00000050. Entrada 3 unidades por CRC 10: c=3.33333333 y residuo=0.00000001, V aumenta exactamente 10. Los ejemplos son casos de prueba previstos, no evidencia ejecutada. Salidas/devoluciones corresponden a 4B; su algoritmo deberá conservar D-22 sin inferirlo de este algoritmo de entradas.

Transacción de recepción:

1. Servidor verifica sesión/perfil; obtiene referencia cambiaria validada sin mantener una transacción de inventario abierta durante la consulta HTTP. BD vuelve a autorizar Admin activo y valida evidencia; no acepta tasa/procedencia arbitraria enviada por navegador.
2. Bloquear perfil vigente compatible con patrón existente; validar UUID de solicitud. Reintento con ID ya registrado devuelve conflicto 409 sin duplicar compra, stock o auditoría. Fallo de red tras COMMIT se resuelve consultando ese ID, sin nueva solicitud automática.
3. Bloquear los materials implicados en orden UUID estable; este bloqueo existe incluso para el primer movimiento. Inicializar proyecciones vacías si faltan bajo el mismo bloqueo. No usar MAX()+1 sin bloqueo.
4. Si se aporta gasto, verificar autorización y existencia bajo bloqueo compatible. Mantener orden global de bloqueos documentado; una anulación de gasto no dispara cambios de inventario.
5. Comparar revisión esperada por material. Validar activo para compra ordinaria, unidad, cantidades, importes, tasas y cronología. No tocar datos existentes para hacer pasar una validación. Fecha histórica Admin no puede preceder al último movimiento consolidado; mismo instante se ordena con secuencia monotónica.
6. Por cada línea, en position estable, calcular T/c/V_nuevo/A_nuevo/rounding_delta_crc en numeric; incrementar secuencia/revisión; insertar línea, movimiento y costo; actualizar ambas proyecciones. No consumir revisiones/números de material fuera de la transacción.
7. Insertar cabecera, vínculo opcional y auditoría coherentes con FKs; la implementación puede insertar cabecera antes de líneas dentro de la transacción. Verificar invariantes completas antes del COMMIT.
8. Cualquier fallo, incluido auditoría, revierte la recepción completa, todos los materiales y proyecciones. Respuesta Admin con totales permitidos; endpoints operativos no devuelven costos.

## 5. Stock negativo y concurrencia

CHECK de saldo >= 0 más bloqueo por material en toda operación que lo cambie. 4A solo agrega existencias; no afirmar que ya se probaron consumos simultáneos. En 4B la salida tendrá que validar q <= Q bajo el mismo bloqueo y nunca basarse en stock enviado por UI. Devoluciones además bloquearán origen y validarán acumulado retornable.

Dos entradas al mismo material se serializan; con revisión obsoleta, una falla PT409/HTTP 409 y debe releer. No pérdida silenciosa de actualización ni repetición automática de operación que ya hizo COMMIT. Una recepción con varios materiales bloquea en orden determinista para evitar interbloqueos. Compras frente a desactivación/cambio de unidad deben compartir bloqueo material; verificar guardas de save_material existente, no sustituir lógica de catálogo sin revisión. El usuario inactivo pierde permiso con JWT previo según patrón vigente.

La suma del diario debe coincidir con balance y la reproducción secuencial con valuation/snapshots. Un fallo en una línea no deja otras aplicadas. Pruebas reales con sesiones independientes obligatorias antes de declarar consistencia concurrente.

## 6. CRC/USD y vínculo con expenses

CRC no requiere tasa; USD copia tasa completa, fecha real y fuente. Antes de la primera referencia válida no inventar tasa. Cambios de exchange_rates, proveedor o material_costs nunca recalculan recepción/movimiento. Contrato temporal confirmado en P4A-02: actual con fallback persistido/fecha real, histórico por fecha exacta o aporte Admin motivado, sin cambiar proveedor.

La referencia expense_id vincula hechos, no implica que cantidades/importes de compra sean iguales al gasto ni que se reconozca dos veces el costo. Un gasto puede cubrir factura con varios materiales/cargos. No crear prorrateo, distribución de gasto, gasto automático ni ingreso. Anular gasto conserva stock, compras y vínculo; revertir inventario en 4B conserva gasto. Futuro cálculo de Fase 5 distingue desembolso de consumo y evita sumar ambos; no implementarlo ahora.

## 7. RLS, grants, RPC y auditoría

| Objeto | Admin activo | Colaborador activo | Inactivo / anónimo |
|---|---|---|---|
| balances y movements operativos | Lectura | Lectura sin columnas financieras | Ningún acceso |
| receipts / receipt_items / receipt_expenses | Lectura; altas solo RPC Admin | Ningún acceso | Ningún acceso |
| movement_costs / valuations | Lectura | Ningún acceso | Ningún acceso |
| audit_log | Patrón Admin existente | Ningún acceso | Ningún acceso |
| Escritura directa de tablas nuevas | No desde cliente | No | No |

RLS en todas las tablas nuevas; revocar grants implícitos antes de otorgar SELECT y EXECUTE mínimos. Columnas financieras físicamente separadas, no una tabla mixta protegida solo por ocultación UI. No conceder UPDATE/INSERT/DELETE al cliente. Roles técnicos authenticated compartidos: cada RPC verifica perfil Admin vigente, no confundir EXECUTE con permiso funcional. Anon sin EXECUTE y wrappers sin privilegios PUBLIC heredados. No user_metadata como autoridad.

Propuestas de contratos, no funciones creadas:

- register_inventory_purchase(request_id, payload, expected_material_revisions): cabecera/líneas/entrada/snapshots/auditoría atómicos; Admin.
- register_inventory_opening_balance(request_id, payload, expected_material_revisions): misma integridad, exige motivo/valoración; Admin.
- link_inventory_receipt_expense(receipt_id, expense_id): vínculo opcional explícito inmutable, Admin; ya vinculado a otro destino → conflicto, no sustitución.
- Lecturas inventory_stock_read / inventory_movements_read mediante proyecciones security_invoker con RLS vigente, paginación y numeric textual; información financiera solo en lecturas Admin separadas. No agregados financieros globales.

Wrappers públicos SECURITY INVOKER hacia operaciones privadas con SECURITY DEFINER únicamente cuando la operación atómica necesita escribir tablas sin DML directo. search_path vacío, objetos cualificados, funciones privadas no expuestas por Data API; grants de invocación estrictamente a operaciones necesarias, helpers internos sin acceso cliente. Autorizar también dentro de la implementación privada. No service_role para sustituir autorización de negocio.

Auditoría propuesta: inventory.purchase_registered, inventory.opening_balance_registered, inventory.movement_registered y inventory.expense_linked. Cabecera, IDs relacionados, actor real, timestamp, razón, solicitud, cantidades y snapshots anteriores/nuevos; costos solo en evidencia Admin. Operación y auditoría misma transacción. No log de tokens, credenciales ni payload sensible en consola. No editar/borrar eventos. Proyecciones no generan ruido duplicado que aparente dos compras.

## 8. UI prevista, solo 4A

- Inventario: material, unidad, existencia derivada, mínimo y alerta textual/color. Cero movimientos se muestra como estado vacío y stock cero derivado, no dato ficticio. Búsqueda y filtros de catálogo reutilizados; no dashboard/reportes nuevos.
- Admin: nueva compra con varias líneas, cantidades base, total original/moneda, tasa/fecha/procedencia y equivalente calculado; saldo inicial con motivo; referencia a gasto opcional. Confirmación crítica SweetAlert2 antes de registrar movimiento inmutable, éxito Sonner.
- Detalle Admin: líneas, evidencia de valoración, promedio y diario. Historial operativo Colaborador sin moneda, costo, promedio, factura/gasto ni respuestas financieras. No controles de consumo/corrección 4B aún.
- Advertencia de tasa anterior según P4A-02; falta de referencia bloquea USD, no inventa valor. Conflicto 409 conserva formulario y exige recargar revisión; no reenvío silencioso.
- Unidad bloqueada en edición de catálogo tras primer movimiento, explicación visible sin impedir editar otros campos autorizados.
- Mobile-first 320/375/768/1024/1440: tarjetas/listas en móvil y tablas desktop; táctiles ~44 px, inputs >=16 px, Lucide, scrollbar/tokens/tipografías existentes, reduced-motion. Loading/vacío/error/sin permiso y conectividad. No imágenes nuevas ni requisitos de comprobantes inventados.

## 9. Pruebas previstas y criterio de terminado

Nada de esta matriz se ha ejecutado en esta entrega. No confundir prueba planificada con resultado.

| Área | Local/unitaria/integración | DEV real antes de cierre |
|---|---|---|
| Decimales | Cantidades 4 posiciones, rechazo de 5, NaN/Infinity/negativos/cero, costos 8, HALF UP, residuo y límites P4A-01 | Entradas RPC textuales, persistencia/snapshots y rechazo de manipulación |
| Promedio | Primera/segunda entrada, precios diferentes, mismo material en varias líneas, reconstrucción, cero previo simulado, ejemplos de futura devolución aislados | Recepciones autorizadas con promedio verificado y catálogo posterior sin alterar historia |
| Compras | CRC/USD, tasa completa, snapshots, inicial con motivo, material sin costo catálogo pero entrada valorada, unidad/material inactivo | Referencias reales y contrato P4A-02 sin simular proveedor como evidencia de fuente real |
| Integridad | FK, una línea/movimiento/costo, unidad bloqueada, fechas no futuras/orden consolidado, rollback por error/auditoría | API directa, manipulación de actor/importe/promedio/unidad y verificación transaccional |
| Seguridad | Matriz Admin/Colaborador/inactivo/anon, DML/grants/views | JWT reales, filtros/SELECT/joins/RPC sin fuga de costos, perfil inactivo con JWT previo, private fuera Data API |
| Concurrencia | Recepciones multi-material, revisión, idempotencia | Dos sesiones independientes mismo material; primer movimiento simultáneo; compra frente a cambio de unidad/inactivación; reintento tras respuesta perdida |
| Gasto | Vínculo opcional, FK, no automatismos, historial conservado | Vincular, anular gasto de prueba autorizado sin cambiar stock; no borrados compensatorios |
| UI | Loading/vacío/error/red/409, formularios por rol | Recorrido Admin/Colaborador y responsive en cinco anchos |
| Regresión | Fases 1–3, catálogo y cambio de unidad | RLS/Advisors y límites existentes intactos |

No crear ficticios en DEV sin plan de datos autorizado ni eliminarlos como limpieza automática. Pruebas destructivas/rollback en entorno aislado; evidencia local, simulada y DEV diferenciada. Consumos/devoluciones reales corresponden a 4B, no marcar COMPLETO en 4A por simulación.

Al implementar: lint, typecheck, tests, build, E2E, npm audit --omit=dev; Security Advisors tras migraciones autorizadas, secretos/bundle/grants/funciones/triggers. Mantener A51 pendiente de producción, INFO order_counters por aislamiento, observaciones Performance sin eliminar índices solo para silenciarlas.

## 10. Migraciones previstas, no creadas

1. phase4a_inventory_receipts: siete tablas propuestas, FKs/constraints/índices, guardas inmutabilidad/unidad/proyecciones, RLS y revokes. Denegación por defecto desde nacimiento.
2. phase4a_inventory_operations: RPC, algoritmo confirmado, evidencia cambiaria, lecturas seguras, grants mínimos y auditoría. Sin operaciones 4B ni cambio funcional de expenses.

Nombres descriptivos sin timestamp: se generarán con CLI solo después de autorización. No aplicar lote incompleto al cliente. Antes de remoto: pruebas locales, inspección del proyecto DEV pysgfnwsycgoneaecgcl y migraciones, dry-run, revisión de alcance 4A, aplicación autorizada, equivalencia y pruebas RLS/Advisors. No se ejecutaron esos pasos en esta entrega. No DROP/TRUNCATE/reset, borrados ni edición de migraciones aplicadas.

## 11. Validación de esta entrega documental

Solo se modifican DECISIONS.md, REQUIREMENTS.md, ARCHITECTURE.md y DATABASE.md, y se crea este preflight. D-01 a D-21 preservadas; resoluciones B4-01 a B4-14 incorporadas íntegramente. Verificar diff/check y enlaces locales. Sin pruebas runtime ni acceso remoto: no hay implementación que validar. Checkpoint requerido: docs: define phase 4 inventory decisions and preflight, exclusivamente documental y sin tag.

Referencias técnicas consultadas para la propuesta, sin convertirlas en requisitos funcionales:

- [Supabase RLS: grants, policies y vistas](https://supabase.com/docs/guides/database/postgres/row-level-security).
- [PostgreSQL: bloqueos explícitos y orden de adquisición](https://www.postgresql.org/docs/current/explicit-locking.html).

El índice oficial de changelog se leyó con un lector compatible después de que el navegador rechazara su formato Markdown. Se identificó el aviso de cambios de PostgreSQL 15.19/17.11 del 2026-09-25; antes de implementar debe comprobarse compatibilidad con la versión real de DEV. No se asume que esta revisión documental verifica herramientas/configuración remotas ni autoriza actualizarlas.


## Resolución final y checkpoint

Esta actualización sustituye las expresiones históricas de autorización exclusivamente documental: primero commit documental, después implementación exclusiva 4A. No habilita 4B–4E. P4A-01..03 resueltas. Las propuestas de tablas, RLS y RPC deben implementar el valor interno separado y la evidencia aprobada; no persistir el algoritmo anterior Q×promedio como base.
