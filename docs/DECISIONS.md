# DECISIONS.md

# Decisiones aprobadas para V1

Este registro incorpora las decisiones explícitas de la persona responsable del proyecto y la aprobación del plan general de implementación. Complementa REQUIREMENTS.md, ARCHITECTURE.md y DATABASE.md; no sustituye el sistema visual. Las propuestas técnicas y pendientes se distinguen de las reglas aprobadas.

## 1. Roles — D-01

Administrador tiene acceso completo conforme a las reglas de integridad e historial.
Colaborador puede trabajar con clientes, productos, pedidos, cronómetro, inventario y envíos; registrar pagos y gastos; consultar el saldo pendiente necesario para operar un pedido.
Colaborador no puede administrar usuarios, modificar configuración financiera, realizar anulaciones financieras, modificar sesiones históricas, consultar auditoría, costos, márgenes ni reportes financieros globales.
Registrar un gasto exige ingresar su monto; este permiso no concede consulta general de costos. Los datos de costeo incrustados en materiales, sesiones, movimientos o reportes deben protegerse también en la capa de datos.

D-20 concreta una excepción operativa de lectura: Colaborador consulta montos y comprobantes de sus propios gastos, no gastos ajenos ni costos agregados. Puede editar descripción/notas y comprobantes propios mientras el gasto esté activo; no sus datos financieros, fecha o vínculo al pedido. manual_income y administración de categorías de gastos son exclusivos de Admin.

## 2. Pagos e ingresos — D-02

`payments` es la fuente oficial de ingresos provenientes de pedidos. No se crea otra fila de ingreso por pago. `manual_income` representa exclusivamente ingresos ajenos a pedidos. El reporte combina pagos válidos e ingresos manuales válidos mediante vista o consulta segura, sin doble contabilización.

## 3. Costos históricos — D-03

Nunca recalcular costos históricos con valores actuales. Cada consumo conserva el costo unitario aplicado y cada sesión la tarifa por hora aplicada en ese momento. Cambiar parámetros actuales no modifica esos valores históricos.

## 4. Rentabilidad por producto — D-04

Sesiones, consumos y costos atribuibles pueden vincularse opcionalmente a `order_item_id`, además de `order_id`. La línea debe pertenecer al mismo pedido. No se ha aprobado una distribución automática de costos comunes entre líneas.

## 5. Descuentos, adelanto y sobrepagos — D-05

Orden de cálculo: suma de cantidad × precio unitario, menos descuentos de líneas = subtotal; subtotal menos descuento general = total final. El adelanto porcentual se calcula sobre el total final. Conservar además el monto originalmente solicitado en `deposit_required_amount` o equivalente. No permitir sobrepagos en V1.

Precisión y ciclo del pedido concretados por D-19: importes finales a dos decimales; porcentaje y monto de adelanto fijados al confirmar, sin actualización por cambios posteriores en Configuración. Pagos estrictamente positivos; total cero solo con autorización explícita auditada.

## 6. Cancelaciones — D-06

Se permite cancelar pedidos con pagos. Exigir motivo y conservar historial. Cancelar no anula pagos válidos: el dinero fue recibido. Reembolsos fuera de V1, documentados como funcionalidad futura, sin flujo de refund en esta etapa.

## 7. Inventario — D-07

No permitir stock negativo en operación normal. Cantidades decimales para unidades como gramos y metros. Devolución al inventario mediante movimiento explícito. Ajustes manuales con motivo y auditoría. No se aprueba una excepción operativa que permita stock negativo.

## 8. Envíos — D-08

Máximo un registro de envío/entrega por pedido en V1. Entregar el envío no cambia silenciosamente el pedido; la interfaz puede ofrecer una acción explícita para marcar también el pedido Entregado.

## 9. Proyectos — D-09

Proyecto y pedido son sinónimos en V1. No crear `projects`.

## 10. Fechas y reconocimiento — D-10

Zona horaria `America/Costa_Rica`; semana desde lunes. Ingresos según fecha efectiva de pago (fecha efectiva de recepción para ingresos manuales); gastos según fecha del gasto. La venta se confirma al pasar de Cotización a Confirmado. Ganancia realizada por período usa pedidos Entregados; ganancia estimada de pedidos activos se presenta separadamente. Conservar marcas de confirmación y entrega para estos cálculos.

D-19 precisa: Confirmado representa venta comprometida; Entregado se utiliza para resultado realizado. Cancelado conserva historia y pagos válidos, pero queda fuera de ventas activas y utilidad realizada. Esta clasificación no elimina ingresos efectivamente recibidos.

## 11. Consecutivo — D-11

Formato inicial `PED-AAAA-00001`, reinicio anual y generación atómica en servidor/base de datos, evitando duplicados concurrentes. El identificador asignado se mantiene estable.

Según D-19, se asigna al confirmar; Cotización no consume consecutivo. En registros históricos autorizados, el año corresponde a `confirmed_at`, interpretado en America/Costa_Rica, no al momento de creación técnica del registro.

## 12. Archivos — D-12

Almacenamiento privado por defecto. Fotos, referencias y comprobantes mediante mecanismos autorizados de Supabase Storage. Comprobantes nunca públicos.

## 13. Auditoría — D-13

Infraestructura desde las primeras operaciones trazables, aunque la interfaz de consulta llegue después. Historial no editable por usuarios ordinarios; consulta excluida para Colaborador.

## 14. Productos — D-14

Usar `is_active` en V1, sin duplicarlo con `status`, salvo futura necesidad funcional documentada y aprobada.

## 15. Exportaciones — D-15

Los reportes principales de V1 se exportan tanto a Excel como a PDF, respetando permisos.

## 16. Seguridad — D-16

RLS en todas las tablas empresariales. Vistas de reportes respetan permisos. Usuarios inactivos pierden capacidad de operar incluso con una sesión previa. Los secretos y claves privilegiadas permanecen fuera del navegador.

## 17. Alta de usuarios V1 — D-17

No habrá registro público. El primer Administrador se provisiona manualmente una sola vez en Supabase. Después, solo un Administrador puede crear o invitar usuarios desde el sistema, exclusivamente desde servidor mediante capacidades administrativas de Supabase. Nunca exponer `service_role` al frontend.

Los nuevos usuarios tienen inicialmente rol `collaborator`, salvo acción administrativa explícita autorizada, y un registro correspondiente en `profiles`. El invitado recibe correo para establecer/confirmar acceso. Solo Administrador modifica rol o estado; ningún usuario cambia su propio rol ni se eleva privilegios. La implementación V1 utilizará invitación por correo como flujo de alta.

## 18. Configuración y catálogos de Fase 2 — D-18

Fase 1 aprobada y cerrada para desarrollo; autorizada únicamente Fase 2. Negocio inicial: caffi crochet, teléfono 83639663, correo carolinaserranorodriguez@gmail.com, adelanto 50 %. Valor/hora pendiente, editable por Administrador. Logo aportado posteriormente por el usuario. Solo Administrador modifica toda la configuración, tanto general como financiera.

Productos y futuros pedidos se expresan en CRC. Materiales admiten costo actual en CRC o USD; las conversiones USD→CRC usan venta de referencia del BCCR desde Fase 2. El usuario autorizó sustituir BCR y conservar la última tasa obtenida ante fallos. Se consulta mediante el proveedor público tipodecambio.paginasweb.cr, identificándolo junto a la fecha del dato; una tasa guardada no se presenta como recién actualizada. Antes de la primera consulta exitosa no se inventa una tasa. Conservar monto y moneda originales; no implementar gastos ni valoración de inventario. El costo de un material creado por Colaborador queda pendiente (ausencia de costo), nunca cero supuesto, y lo completa Administrador. Colaborador no recibe ni modifica costos.

El consecutivo mantiene D-11; en Fase 2 se muestra su formato aprobado, sin generar pedidos. Sin movimientos ni existencias reales, sin datos ficticios en históricos dependientes de pedidos.

### Aclaración aprobada de D-18: tipo de cambio e historia

La consulta de tipo de cambio pertenece al alcance aprobado de Fase 2; no es una desviación. En V1 se mantiene el proveedor público actualmente implementado, tipodecambio.paginasweb.cr, que publica la referencia BCCR. No requiere claves ni secretos adicionales. Si falla una consulta, se conserva la última tasa válida con su fecha y procedencia.

Cualquier registro histórico que dependa de una conversión debe conservar la tasa aplicada originalmente, además del importe y moneda originales. Nunca se recalcula con tasas futuras. Un cambio de proveedor tampoco altera esos datos históricos. Esta obligación se aplicará al implementar las entidades históricas en su fase autorizada; el equivalente actual del catálogo es informativo, no un costo histórico ni un movimiento.

## 19. Decisiones previas a Fase 3 — D-19

Aprobación documental; **no autoriza escribir código ni migraciones de Fase 3**. Fase 2 y su auditoría están aprobadas, con checkpoint 272bd0d.

| Punto aprobado | Regla | Relación con decisiones previas |
|---|---|---|
| 1 | Importes monetarios almacenados como numeric/decimal, nunca float; presentación e importes finales a 2 decimales. | Concreta precisión; D-20 fija entradas y etapas, ROUND HALF UP concretado en D-21. Conserva historia D-03/D-18. |
| 2 | Total final cero únicamente mediante decisión explícita autorizada y auditada. No existen pagos de monto cero. | D-20 concreta Admin, motivo, invalidación de autorización y estado Pagado. |
| 3 | Al pasar Cotización a Confirmado se toma el porcentaje de adelanto y se persiste deposit_required_amount. Cambios posteriores en Configuración no alteran ese adelanto histórico. | Concreta D-05. |
| 4 | Cotización editable libremente dentro de validaciones/permisos. Después de Confirmado, cambios de cantidades, precios o descuentos se auditan y recalculan saldo. Si hay pagos, el total nunca baja de lo recibido válido. | Concreta D-01/D-05/D-13; no permite violar integridad ni concurrencia. |
| 5 | Entregado bloquea modificaciones financieras normales. Una reapertura exige acción administrativa explícita, motivo y auditoría. | D-20 incorpora Entregado → Listo al alcance documental y permite cobrar saldo sin reabrir; todavía no autoriza implementación. |
| 6 | Sin sobrepagos en V1. | Ratifica D-05. |
| 7 | Cancelación permitida con pagos; exige motivo, conserva todos los pagos y no genera devolución automática. Reembolsos fuera de V1. | Ratifica D-06 y la fuente de ingresos D-02. |
| 8 | Número PED-AAAA-00001 asignado atómicamente al confirmar; Cotización no consume número; reinicio anual. | Concreta D-11; UUID interno disponible desde creación. |
| 9 | Registros históricos autorizados usan el año de confirmed_at para el consecutivo. | Resuelve selección de año pendiente en D-11; conserva D-10. |
| 10 | Confirmado = venta comprometida; Entregado = base de utilidad/resultado realizado; Cancelado conserva historia, sin integrar ventas activas ni utilidad realizada. | Concreta D-10, sin revertir pagos/ingresos de D-02/D-06. |

### Revisión de compatibilidad antes de editar

No hay contradicción funcional entre estas diez decisiones y D-01 a D-18. Ratifican reglas o resuelven pendientes. Se detectó y reportó antes de la edición una incompatibilidad en la **propuesta técnica**, no en una decisión aprobada: DATABASE proponía order_number NOT NULL desde creación y RF-PED-01 no distinguía UUID de consecutivo comercial. Se actualiza para permitir Cotización sin número, según los puntos 8/9. No existe tabla orders implementada que haya que migrar ahora.

Dos decimales de presentación/final no autorizan reescribir importes originales o tasas históricas de D-18 ni imponen escala 2 a tasas cambiarias. D-20 concreta cantidades, precios, porcentajes y etapas de cálculo. No se modifica código existente de Fase 2 en esta actualización documental.

## Trazabilidad actualizada

| Decisiones | Requisitos afectados | Modelo / arquitectura |
|---|---|---|
| D-01, D-16 | RF-USR, seguridad | profiles, RLS, proyecciones operativas y servicios autorizados |
| D-02, D-06 | RF-PAG, RF-ING, RF-PED-15 | payments, manual_income, orders, reporte de ingresos |
| D-03, D-04 | RF-HOR, RF-COS, reportes | work_sessions, inventory_movements, expenses, order_items |
| D-05, D-11 | RF-PED-01/02/08/09/10 | orders, order_items, transacciones y consecutivo |
| D-07 | RF-INV | materials, inventory_movements |
| D-08, D-09 | RF-ENV, RF-HOR | shipments, orders; sin projects |
| D-10 | RF-DAS, reportes | confirmed_at, delivered_at, fechas efectivas |
| D-12 | RF-PRO-05, RF-PED-11, RF-GAS-04 | files, Storage privado |
| D-13 | RF-AUD, RF-HOR-10 | audit_log desde fase inicial |
| D-14 | RF-PRO-01/02 | products.is_active |
| D-15 | reportes, RNF-009 | exportaciones Excel y PDF autorizadas |
| D-17 | RF-USR-05 | Auth Admin en servidor, profiles y administración de usuarios |
| D-18, D-19 | RF-CON-05/06, RF-PED-01/08/10/15/16/17, RF-PAG-01, RF-FIN-01 | Monedas e historia; orders/order_items/payments y transacciones de confirmación/modificación |
| D-20 | RF-PED-02/08/13/14/16/17/18, RF-PAG-01/04, RF-ING-04, RF-GAS-06/07, RF-FIN-01 | Matriz de transiciones, importes exactos, estado derivado, snapshots, RLS por autor y comprobantes privados |
| D-21 | RF-PED-13/15/18/19, RF-FIN-01/02, RF-PAG-01, RF-GAS-06 | HALF UP, transiciones por rol, entrega vigente, fechas y subfases 3A–3E |

## Decisiones pendientes y momento de resolución

No bloquean la base técnica; sí deben resolverse antes de implementar el comportamiento afectado:

- **Valoración de inventario:** cómo seleccionar el costo aplicado cuando hay compras a precios distintos y cómo valorar una devolución. Conservar el costo histórico está resuelto; promedio, lotes u otro método no está aprobado.
- **Costos compartidos y rentabilidad por producto:** atribución de gastos, consumos y envíos sin línea; distribución del descuento general entre productos para calcular su rentabilidad; vínculo entre gasto de compra y consumo para no contar el mismo costo dos veces. No inventar prorrateo ni presentar una rentabilidad parcial como completa.
- **Resueltos por D-19:** dos decimales finales, pagos de cero prohibidos, total cero excepcional, fijación del adelanto al confirmar, cambios auditados posteriores, bloqueo financiero de Entregado, exclusión de Cancelado de ventas activas/utilidad realizada y año del consecutivo por confirmed_at. No volver a tratarlos como decisiones abiertas.
- **Para fases posteriores:** corte de costos para utilidad realizada. La reapertura administrativa del pedido ahora forma parte de la preparación de Fase 3 por D-20, sin adelantar costeo/reportes.
- **Antes de producción:** retención/eliminación de archivos, plan de Supabase, ambientes y respaldo/recuperación de base y archivos.

## Estado de implementación

Fases 1 y 2 cerradas y aprobadas para desarrollo; auditoría de Fase 2 confirmada en commit 272bd0d. D-19/D-20/D-21 quedaron documentadas en f0dfc9b. Una autorización posterior permite exclusivamente 3A; 3B y siguientes siguen pendientes de autorización. Dashboard permanece como shell. AGENTS.md y reference permanecen intactos. Las prohibiciones de implementación consignadas en las entregas documentales siguientes describen su alcance histórico, sustituido únicamente para 3A por esa autorización.

## Seguimiento de B3-01 a B3-10

Resoluciones completas en D-20. La tabla conserva los identificadores originales, sin presentar preguntas ya contestadas como pendientes.

| ID | Estado tras D-20 |
|---|---|
| B3-01 | Resuelto por D-20/D-21: cantidades, escala, etapas y ROUND HALF UP |
| B3-02 | Resuelto: Admin/motivo, autorización invalidable, estado derivado y adelanto separado |
| B3-03 | Resuelto por D-20/D-21: flujo, retrocesos, cancelación por rol y entrega vigente |
| B3-04 | Resuelto: estados de alta, cobro tras entrega, importe inmutable y anulación Admin |
| B3-05 | Resuelto: porcentaje especial, cambio de cliente y mínimo de adelanto operativo |
| B3-06 | Resuelto: monedas, fecha de tasa, histórico Admin y copia inmutable |
| B3-07 | Resuelto por D-20/D-21: autoridad, created_at, año y cronología |
| B3-08 | Resuelto: pagos, ingresos y gastos positivos |
| B3-09 | Resuelto: gastos/comprobantes propios, edición limitada y categorías Admin |
| B3-10 | Resuelto: personalizadas, mínimo de línea activa, snapshots e inactivos en históricos Admin |

Los nombres físicos de tablas auxiliares, índices, bloqueo transaccional, mecanismos de idempotencia y separación de archivos con FKs son decisiones técnicas que se documentarán; no requieren inventar una regla de negocio. Tipos/tamaños de comprobantes se concretarán como propuesta técnica de seguridad antes de implementar su carga, conservando Storage privado; no se autoriza borrar archivos históricos.

## 20. Resoluciones de B3-01 a B3-10 — D-20

Decisiones aprobadas por el usuario en la resolución adjunta. **Solo documentación y comprobación de consistencia; implementar Fase 3 requiere la siguiente autorización expresa.**

| Origen | Resolución aprobada |
|---|---|
| B3-01 | Cantidad vendida entera positiva. Precios/importes numeric/decimal, nunca float, y máximo 2 decimales; porcentajes máximo 2 decimales. UI/API rechazan importes de mayor escala. Calcular y redondear cada línea a 2 decimales, sumar líneas redondeadas para subtotal, aplicar descuento general una sola vez y obtener total final a 2 decimales. Mantener descuentos monetarios de línea/general ya documentados; no crear tipos nuevos. Modo exacto aprobado en D-21/C3-01: ROUND HALF UP. |
| B3-02 | Solo Admin confirma total cero con motivo obligatorio y auditoría. Cambios de líneas, cantidades, precios o descuentos invalidan la autorización anterior. Estado financiero siempre derivado: total > 0 y pagos válidos = 0 → Sin adelanto; 0 < pagos válidos < total → Abonado; pagos válidos >= total → Pagado; total cero → Pagado sin fila de pago cero. Cumplimiento del adelanto es indicador separado. |
| B3-03 | Flujo ordinario Cotización → Confirmado → En producción → Listo → Entregado, sin saltos ni Confirmado → Cotización. Cancelado terminal, sin reactivación; continuar operación exige nuevo pedido. Admin puede corregir/reabrir a estado anterior con motivo/auditoría cuando corresponda; Entregado → Listo explícitamente permitido solo Admin. Confirmado → En producción exige adelanto operativo cubierto o override Admin con motivo. Entrega no exige saldo cero. D-21/C3-02 cierra retrocesos y cancelación por rol. |
| B3-04 | Pagos CRC únicamente en Confirmado, En producción, Listo y Entregado; cobrar después de entregar no requiere reapertura. Sin pagos nuevos en Cotización ni Cancelado. Colaborador registra; solo Admin anula con motivo. Importe de pago inmutable; corrección = anulación + nuevo pago sujeto a las reglas de alta vigentes. Nunca DELETE físico. |
| B3-05 | Configuración aporta porcentaje habitual; antes de confirmar solo Admin puede fijar porcentaje especial auditado. Confirmar persiste deposit_percentage_applied y deposit_required_amount. No cambian por Configuración ni por total posterior. Adelanto operativo = min(deposit_required_amount, total_actual). Cliente libre en Cotización; tras confirmar solo Admin con motivo y únicamente sin pagos válidos. |
| B3-06 | Pedidos, pagos, ingresos manuales y productos en CRC; gastos CRC/USD; materiales conservan CRC/USD de D-18. Gasto USD guarda original, moneda, tasa aplicada, fecha de tasa y resultado CRC. Usar tasa de fecha efectiva cuando exista. Histórico sin tasa: solo Admin la proporciona con motivo/auditoría. Cambios en exchange_rates nunca recalculan operaciones guardadas. |
| B3-07 | Solo Admin crea históricos. created_at es el instante real de registro; fechas comerciales pueden ser anteriores y deben tener coherencia cronológica. Número asignado nunca se renumera automáticamente. Corrección auditada de confirmed_at dentro del mismo año; cambio de año bloqueado en operación normal, requiere tratamiento administrativo excepcional, sin inventar flujo de renumeración. Restricciones cronológicas cerradas por D-21/C3-03. |
| B3-08 | Pagos, ingresos manuales y gastos estrictamente positivos. Única excepción de monto final cero: total completo de pedido autorizado. No permitir registros financieros negativos ordinarios. |
| B3-09 | Admin lee, crea, corrige, anula y gestiona comprobantes/categorías. Colaborador registra gastos, lee únicamente los propios y sus comprobantes, sin listado global ni administración de categorías ni anulaciones. Después de registrar solo modifica descripción/notas y comprobante propios mientras gasto activo; no monto, moneda, tasa, fecha ni vínculo al pedido. Comprobantes privados. |
| B3-10 | Líneas de catálogo o personalizadas. Personalizada: product_id NULL, nombre/cantidad/precio obligatorios, descripción opcional. Confirmar exige >=1 línea activa. Sin seleccionar clientes/productos inactivos en altas normales; referencias y snapshots existentes permanecen aunque catálogo se inactive. Admin puede usar entidades inactivas en carga histórica autorizada. Snapshots comerciales impiden cambios retroactivos del catálogo. |

manual_income es exclusivamente de Administración: Colaborador no crea ni consulta estos ingresos. Pagos, ingresos y gastos se conservan; anulaciones preservan fila, actor, fecha y motivo. financial_status es un resultado calculado, no un campo editable independiente. La condición Pagado >= total no permite sobrepagos: la integridad sigue imponiendo pagos válidos <= total.

### Consistencia con D-01 a D-19

- D-01/D-16: acceso a gastos propios es una precisión explícita de permisos, no acceso a costos de materiales, márgenes ni finanzas globales. Se actualiza la redacción general para evitar interpretar la prohibición como impedimento de consultar su propio gasto.
- D-02/D-06: no duplicar ingresos; cancelar conserva pagos. Anular un pago de Cancelado no habilita registrar su reemplazo en ese mismo pedido. No se introduce devolución ni compensación automática.
- D-05/D-19: adelanto histórico permanece; el mínimo operativo evita exigir más que el total actual. Sin sobrepagos, tampoco al editar o bajo concurrencia.
- D-07: cantidades enteras corresponden a productos vendidos; no cambian cantidades decimales de materiales, recetas o inventario.
- D-10/D-11: fechas comerciales y número estable se conservan. Corrección de año no se resuelve renumerando.
- D-12/D-13: archivos privados y auditoría no editable; comprobantes se versionan/conservan, no sobrescriben ni eliminan historia.
- D-18: copia histórica de tasa y última tasa válida ante fallo permanecen. Si no hay tasa de la fecha, una tasa anterior se identifica con su fecha real; nunca se presenta como cotización de ese día. Para históricos sin referencia rige la autorización Admin explícita. No se redondean retroactivamente datos de Fase 2.
- D-19: la restricción anterior de posponer toda reapertura queda ampliada por esta decisión explícita: Entregado → Listo forma parte del alcance documental propuesto. Cobrar saldo tras entrega es permitido sin editar el total. No hay autorización para implementarlo en esta entrega.
- Propuesta técnica corregida: eliminar financial_status como columna mutable e índice directo, cambiar quantity vendida de numeric genérico a entero y sustituir campos de archivo genéricos por FKs tipadas. Son ajustes documentales; no hay tablas de Fase 3 creadas.

### Cierre de las preguntas C3

C3-01, C3-02 y C3-03 resueltas mediante D-21. No se identifican bloqueantes funcionales restantes para Fase 3. Cambios de año del consecutivo siguen bloqueados en operación normal; su tratamiento administrativo excepcional no habilita renumeración automática ni impide implementar el flujo ordinario. No se reabren decisiones de inventario/costeo/envíos/reportes.

## 21. Cierre funcional de Fase 3 — D-21

Aprobación de C3-01/C3-02/C3-03 y del plan de subfases 3A–3E. **Esta entrega es exclusivamente documental: no implementar ninguna subfase, crear migraciones ni modificar Supabase. Se requiere siguiente autorización.**

### C3-01 — Precisión y ROUND HALF UP

- Importes numeric/decimal, nunca float. Entradas monetarias y porcentajes máximo 2 decimales; rechazar mayor escala, no redondearla silenciosamente. Cantidad vendida de order_items entera positiva.
- Cálculo decimal de cada línea y ROUND HALF UP a 2 decimales; subtotal suma líneas ya redondeadas; aplicar descuento general aprobado y redondear total final HALF UP a 2. Sin tipos nuevos de descuento.
- deposit_required_amount = ROUND HALF UP(total final × porcentaje aplicado / 100, 2).
- Conversiones CRC/USD con precisión decimal usando tasa almacenada completa, sin reducir previamente su precisión; solo equivalente monetario final HALF UP a 2. Esto no cambia monedas autorizadas: pedidos/pagos/ingresos/productos CRC; gastos/materiales CRC o USD.
- Ejemplo de desempate: 1,00 × 12,50 % = 0,125 → 0,13. Mismo contrato en servidor y BD cuando corresponda, no solo JavaScript. No reescribir historia ni modificar datos/código de Fase 2 en esta entrega.

### C3-02 — Estados, cancelación y entrega vigente

Flujo ordinario Cotización → Confirmado → En producción → Listo → Entregado, conservando requisitos de confirmación y adelanto de D-20. Solo retrocesos administrativos de un paso: En producción → Confirmado, Listo → En producción, Entregado → Listo. Todos requieren Admin activo, motivo obligatorio, timestamp, actor y auditoría before/after.

Prohibidos Confirmado → Cotización, saltos hacia atrás de varios estados en una operación y cualquier salida de Cancelado. Colaborador cancela únicamente Cotización; Admin cancela Cotización/Confirmado/En producción/Listo. Toda cancelación exige motivo y conserva pagos, sin anulaciones ni devoluciones automáticas. Entregado no pasa directamente a Cancelado: primero Admin reabre a Listo con motivo, luego Admin cancela con motivo en otra acción explícita.

Listo → Entregado asigna delivered_at efectivo. Entregado → Listo deja delivered_at NULL; fecha anterior preservada en auditoría. Reentrega fija nueva fecha/hora efectiva. Por tanto delivered_at representa entrega vigente/más reciente y solo existe mientras estado sea Entregado. Cobrar saldo posterior sin reapertura no modifica delivered_at.

### C3-03 — Cronología definitiva

Zona empresarial America/Costa_Rica. created_at y timestamps internos reflejan el momento real del sistema; nunca se falsifican para históricos. Una fecha efectiva anterior al día empresarial actual exige Admin, salvo timestamps internos automáticos. Ninguna fecha efectiva futura, excepto requested_delivery_date. La distinción histórico se aplica al valor nuevo proporcionado/registrado; editar notas hoy no convierte por sí solo en prohibida una fila propia creada ayer ni obliga a actualizar su fecha efectiva.

| Campo | Regla aprobada |
|---|---|
| order_date | Fecha comercial no futura; alta normal hoy, anterior solo Admin |
| requested_delivery_date | >= order_date; admite futuro o pasado, sin exigir que sea posterior a confirmed_at; pasado activa atraso según estados/requisitos |
| confirmed_at | No futuro; su fecha local >= order_date; histórico/corrección histórica solo Admin; respetar año del número y nunca renumerar automáticamente |
| payment_date | No futuro y >= confirmed_at; puede ser posterior a delivered_at; Colaborador fecha empresarial actual, histórico solo Admin |
| delivered_at | No futuro y >= confirmed_at; solo mientras estado delivered; reapertura NULL con auditoría y reentrega nueva fecha efectiva; histórico solo Admin |
| income_date (manual_income) | No futura; registro exclusivo Admin, puede ser histórica |
| expense_date | No futura; Colaborador hoy, histórico solo Admin; puede anteceder a confirmed_at aun vinculada a pedido; determina referencia cambiaria si USD |

La frase del adjunto «Su fecha efectiva… solo Admin puede registrarlos» se incorpora a manual_income por su contexto y por D-01/D-02/D-20, que ya reservan ese registro a Administración; no limita los pagos o gastos actuales permitidos a Colaborador.

Validar servidor/BD cuando corresponda, no solo HTML. Las correcciones de fechas también revalidan relaciones ya existentes: una modificación de confirmed_at no puede dejar un pago válido o entrega vigente antes de la confirmación. Evidencia auditada previa no se reescribe.

### Compatibilidad y cambio explícito de permisos

D-01 a D-20 siguen vigentes con esta precisión: la matriz técnica anterior permitía a Colaborador cancelar pedidos confirmados por interpretación del permiso general de operar pedidos. D-21 **restringe expresamente esa acción a Admin**, dejando a Colaborador solo cancelar Cotización. Se reportó antes de editar; no se cambia por iniciativa técnica ni exige nueva aprobación porque esta resolución lo autoriza explícitamente.

El resto concreta pendientes: HALF UP conserva D-05, la entrega vigente implementa D-10/D-19 sin perder historia D-13 y la cronología mantiene D-11 y pagos posteriores D-20. Ninguna contradicción funcional pendiente. Cantidades de materiales continúan decimales; tasas no se limitan a dos decimales; Cancelado conserva pagos. Estado financiero sigue derivado.

### Subfases y dependencia técnica

Plan aprobado: 3A Pedidos/líneas/cotizaciones/estados; 3B Confirmación/consecutivos/adelantos/pagos; 3C Ingresos manuales; 3D Gastos/categorías/comprobantes; 3E Validación integral/permisos/auditoría/pruebas reales.

3A define el contrato de todos los estados, pero la confirmación operativa depende de la transacción de 3B. Hasta completar 3B no se habilita confirmar ni se permite escribir estados posteriores eludiendo consecutivo/adelanto/pagos. Pruebas de estados posteriores pueden utilizar fixtures locales aislados, identificados como simulados; nunca pedidos confirmados ficticios en DEV. Esta secuencia es una dependencia de implementación, no un bloqueo funcional ni una reducción del alcance final aprobado.


### Autorización posterior: implementación exclusiva de 3A

El usuario aprobó D-20/D-21 y autorizó 3A después del cierre documental f0dfc9b. No se alteran decisiones D-01 a D-21 ni se habilita 3B. Quote puede persistir provisionalmente sin líneas y con total cero; la validación de confirmación permanece para 3B. Cancelación quote → cancelled disponible a ambos roles activos, con motivo y terminalidad.

Decisiones técnicas implementadas: RPC transaccional con bloqueo y revisión optimista; importes numeric y transporte textual; vistas security_invoker; búsqueda cliente histórico/observaciones, filtro de estado y paginación; referencias de imágenes reutilizando validación de Fase 2 (5 MB, 25 MP, JPEG/PNG/WebP, sin animación, recodificación WebP), versionado sin borrado y descarga privada sin caché compartida. Archivos sin vínculo tras fallo de registro permanecen privados para revisión, nunca se borran automáticamente.

La verificación real detectó que usar 40001 para un conflicto de revisión provocaba reintentos automáticos de PostgREST. Se aplicó una migración adicional con PT409/HTTP 409; misma integridad, permisos y rechazo de edición obsoleta. Es una corrección técnica, no una nueva decisión funcional. Documentación oficial: https://supabase.com/docs/guides/troubleshooting/high-cpu-and-infinite-transaction-retries-when-using-custom-error-codes-in-rpc-functions-77326b

Estado/evidencia en PHASE3A_VERIFICATION.md. No se implementan confirmación, consecutivos, adelantos, pagos, ingresos manuales, gastos ni fases posteriores.

## Autorización vigente — Fase 3B

3A aprobada y cerrada para DEV en 9a73fcd. El usuario autoriza únicamente 3B: confirmación/consecutivo anual/adelanto histórico, total cero autorizado, ciclo productivo con retrocesos, pagos/anulaciones, saldo derivado, cancelación y auditoría según D-19/D-20/D-21. Esta autorización sustituye las menciones anteriores que limitaban la implementación a 3A; no modifica decisiones funcionales. No autoriza 3C/3D/3E ni fases posteriores. A51 pendiente antes de producción, sin bloquear DEV.

Excepción técnica expresa: sustituir únicamente las ocho CHECK de orders enumeradas en PHASE3B_VERIFICATION.md, con DROP CONSTRAINT ... RESTRICT y nuevas restricciones validadas en una misma transacción. Prohibición general de DROP, TRUNCATE, reset y borrados destructivos permanece. Ningún dato inválido se corrige automáticamente. Evidencia de avance y separación local/simulada/DEV en PHASE3B_VERIFICATION.md.

Excepción técnica adicional expresamente autorizada y aplicada en 20260924032507: sustituir únicamente orders_3b_zero_time_check con RESTRICT y validación en la misma transacción. Corrige ZT-01 sin modificar datos ni decisiones funcionales; conserva la autorización original de cero al corregir confirmed_at. La prohibición general de DROP continúa vigente. Evidencia en PHASE3B_VERIFICATION.md.

## Autorización vigente — Fase 3C

Fase 3B aprobada y cerrada para desarrollo. Se autoriza exclusivamente Ingresos manuales (D-02/D-20/D-21): ingresos independientes de pedidos, solo Admin activo, CRC positivo con máximo dos decimales, fecha efectiva actual/histórica no futura y creación real. Registro inmutable; corrección mediante anulación motivada y nuevo registro. No se autoriza edición de descripción/notas. Clasificaciones existentes: product_sale, cards, stickers, other; sin catálogo nuevo. Sin vínculo ni duplicación de payments, sin reportes, gastos ni Fases 3D/3E. A51 continúa pendiente para producción; aislamiento de order_counters aceptado sin nuevos grants/policies.

Concreción técnica 3C: alta/anulación por RPC transaccionales con identidad auth.uid() y perfil Admin activo bloqueado durante escritura; RLS administrativa y ausencia de DML directo. UUID de solicitud estable para detectar reintentos duplicados (HTTP 409). Vista security_invoker transporta numeric como texto. Campos opcionales documentados income_type/payment_method/description conservan NULL; límites técnicos de descripción 3000 y motivo 1000 caracteres. Marca histórica calculada por fecha empresarial America/Costa_Rica. Listado paginado con búsqueda en descripción y filtros de estado/clasificación, sin agregados contables. Historial de creación/anulación solo Admin. Evidencia y estado de ejecución en PHASE3C_VERIFICATION.md.

## D-20 — Aclaración aprobada para Fase 3D: tasa operativa e histórica

Para gastos USD con expense_date en la fecha empresarial actual (America/Costa_Rica), intentar obtener/usar la tasa válida de hoy mediante el proveedor aprobado. Si falla o devuelve datos inválidos, usar automáticamente la última tasa válida persistida, con su fecha/procedencia reales y advertencia visible cuando sea anterior. Colaborador puede usar este fallback, pero nunca elegir, introducir ni modificar tasas. Si no existe ninguna tasa válida previa, bloquear el gasto USD.

Para gastos históricos, usar exclusivamente la referencia correspondiente a expense_date. Si está en exchange_rates, utilizarla. Si falta, bloquear el registro normal; solo Admin puede aportar la tasa histórica faltante, con motivo, actor, timestamp y auditoría. No aplicar fallback de otra fecha a un histórico. Persistir original USD, moneda, tasa completa, fecha real, fuente y equivalente CRC HALF UP a dos decimales; actualizaciones posteriores de exchange_rates nunca recalculan gastos guardados. Esta aclaración preserva proveedor y decisiones D-18/D-20/D-21.

## Autorización vigente — Fase 3D

3C cerrada en a16cf3d. Autorizados únicamente expense_categories, expenses, expense_files y comprobantes privados, CRC/USD, permisos por autor/rol, corrección no financiera, anulación y auditoría. Colaborador solo edita descripción/notas/comprobantes propios de gastos válidos: category_id, proveedor, método, importes, moneda, fechas y vínculos no pertenecen a esa lista. Las correcciones financieras se realizan mediante anulación Admin y nueva alta; no reescribir historia. No 3E, inventario, cronómetro, envíos, costeo ni reportes. A51 pendiente de producción; order_counters mantiene su aislamiento intencional.

Concreción técnica de comprobantes según sección 19 de DECISIONS: reutilizar imágenes JPEG/PNG/WebP de hasta 5 MiB y 25 MP, sin animación, validar bytes/MIME y recodificar WebP. Bucket expense-receipts privado, rutas UUID y versiones conservadas; descargas autenticadas con RLS por gasto padre, sin URL pública ni caché compartida. La admisión de otros formatos no se presupone. Ningún archivo se elimina automáticamente tras un fallo.

### Endurecimiento técnico 3D: revocación de comprobantes
La prueba real detectó que una descarga directa del SDK podía responder desde CDN después de inactivar al usuario, aunque RLS de metadatos y el endpoint SIGCA ya denegaban acceso. Para asegurar la regla aprobada de inactivo sin acceso, los bytes de expense-receipts se sirven exclusivamente mediante /api/expense-file/[id]: perfil y metadatos con JWT/RLS vigentes, descarga de infraestructura desde servidor y respuesta no-store. La policy directa de Storage se restringe a false mediante ALTER POLICY en una migración nueva, sin DROP ni grants nuevos. Los permisos funcionales Admin/propietario no cambian. Se purga únicamente la caché de los comprobantes previos, sin eliminar ni reemplazar objetos. No se alteran otros buckets ni Auth.

## D-20 — Reclasificación administrativa aprobada (cierre de criterio 10, 3D)

Admin activo puede reclasificar un gasto `valid` mediante operación explícita con motivo obligatorio de 1–1000 caracteres. La categoría destino debe existir, estar activa y ser distinta de la actual. Colaborador no puede reclasificar. Gasto `voided`, revisión obsoleta y UPDATE directo del cliente se rechazan. RPC transaccional con bloqueo de gasto y control de revisión; evento `expense.category_changed` conserva before/after, actor, timestamp y motivo.

Solo cambia category_id y metadatos técnicos de actualización/revisión. Se conservan monto, moneda, tasa y su fecha/procedencia/evidencia, equivalente CRC, expense_date, pedido, línea, creador, created_at y comprobantes. No se recalcula una tasa ni se anula el gasto. Una categoría desactivada posteriormente conserva sus referencias históricas. Para futuros reportes se utilizará la categoría vigente corregida; la auditoría conserva todas las reclasificaciones. Esta decisión completa D-20: clasificación corregible solo por Admin, campos financieros inmutables. No autoriza reportes ni Fase 3E.


## 22. Resoluciones de Fase 4 — D-22

Aprobadas el 2026-10-02. Se incorpora íntegramente la resolución funcional de B4-01 a B4-14, sin reescribir D-01 a D-21. Las menciones previas a valoración pendiente quedan resueltas por esta decisión posterior. La precisión interna de costos derivados de inventario queda concretada en hasta ocho decimales; no cambia los importes finales HALF UP a dos decimales ni reescribe historia.

Estado: Fase 3 cerrada para desarrollo. Autorización actual exclusivamente documental y preflight técnico de 4A. No autoriza código, tablas, migraciones ni modificaciones de Supabase.

### B4-01 — Valoración del inventario
Se aprueba PROMEDIO PONDERADO MÓVIL para V1.
No usar FIFO ni selección manual de lotes.
Reglas:
- cada entrada valorada actualiza el costo promedio del stock disponible;
- cada consumo congela el costo promedio vigente en ese instante;
- consumos históricos nunca se recalculan posteriormente;
- una salida normal no cambia el costo promedio de las unidades restantes;
- cuando el stock llega a cero, no utilizar un costo actual futuro para reinterpretar el historial;
- la siguiente entrada valorada establece nuevamente el promedio de la existencia disponible;
- una devolución de consumo se reincorpora utilizando el costo unitario que fue aplicado originalmente a ese consumo, no el promedio actual;
- al reincorporarse, participa como una entrada valorada en el nuevo promedio disponible;
- toda valoración debe ser reproducible a partir de movimientos y snapshots históricos.
No implementar FIFO/lotes en V1.
### B4-02 — Unidad y precisión
Cada material tendrá una única unidad base operativa.
Ejemplos:
- gramos;
- metros;
- unidades.
En V1 no implementar presentaciones convertibles como:
1 ovillo = 100 gramos
ni
1 paquete = 20 unidades.
Si físicamente se compra en paquetes/ovillos, antes de persistir el movimiento se registra su equivalente en la unidad base.
Cantidades:
- positivas;
- numeric/decimal;
- hasta 4 decimales;
- nunca float.
La unidad unidad también puede manejar fracciones técnicamente; no crear reglas diferentes por unidad en V1.
Una vez que un material tenga movimientos de inventario, su unidad base no puede cambiarse mediante edición ordinaria.
Cambiarla requeriría una migración/conversión administrativa futura, fuera de V1.
Costos unitarios derivados:
- conservar hasta 8 decimales internos;
- no redondear a 2 decimales el costo unitario calculado;
- importes monetarios finales sí siguen HALF UP a 2 decimales.
Por ejemplo, puede conservarse internamente:
₡3.33333333 por gramo
aunque el costo total aplicado al movimiento se presente/redondee monetariamente a 2 decimales.
### B4-03 — Entradas, compra y existencia inicial
Una entrada de compra debe conservar:
- cantidad en unidad base;
- importe original total;
- moneda CRC/USD;
- tasa histórica aplicada cuando corresponda;
- importe equivalente CRC;
- costo unitario CRC derivado con precisión interna;
- fecha efectiva;
- actor;
- procedencia.
Para una compra:
unit_cost_crc = total_crc / quantity
usando decimal de alta precisión.
No usar automáticamente material_costs como costo histórico de una entrada.
material_costs continúa siendo referencia/costo actual de catálogo.
Existencia inicial
Solo Admin puede crear un movimiento de saldo inicial.
Debe indicar:
- cantidad;
- valoración;
- moneda;
- tasa si USD;
- fecha;
- motivo.
No permitir stock inicial sin valoración.
No asumir costo cero.
Material con costo pendiente
Puede existir en catálogo, pero no se puede registrar una entrada de inventario valorada ni consumir stock inexistente utilizando costo cero.
La entrada debe contener su propia valoración histórica.
### B4-04 — Compra ↔ gasto
No generar automáticamente un gasto al registrar una compra de inventario.
Inventario y desembolso financiero son conceptos relacionados pero distintos.
Implementar trazabilidad para que una compra/entrada pueda vincularse opcionalmente a un expense_id.
Una misma compra puede incluir varios materiales, por lo que la arquitectura puede utilizar:
- cabecera de compra/recepción;
- líneas de compra;
- movimientos derivados.
Un gasto puede representar una factura con múltiples materiales.
Reglas:
- ninguna entrada crea expenses automáticamente;
- ningún expense crea stock automáticamente;
- si se vinculan, preservar el vínculo;
- anular el gasto no revierte inventario automáticamente;
- corregir inventario no anula el gasto automáticamente;
- cualquier corrección de ambos requiere operaciones explícitas separadas.
Para futura rentabilidad, la compra no se sumará además del consumo del mismo material. La identidad de ambas fuentes debe quedar preservada para que Fase 5 evite doble contabilización.
### B4-05 — Devoluciones y correcciones
Un return de material consumido debe referenciar obligatoriamente el consumo original.
Permitir devolución parcial.
La suma devuelta nunca puede superar la cantidad neta originalmente consumida.
La devolución usa exactamente el costo unitario aplicado al consumo original.
No usar el promedio actual para valorar la devolución.
Movimientos de inventario son inmutables.
Las correcciones se hacen mediante movimientos compensatorios vinculados al original, nunca editando cantidad/costo histórico.
Entrada incorrecta
Si una entrada aún no tiene movimientos posteriores que dependan de ella, Admin puede revertirla mediante operación compensatoria completa con motivo.
Si ya existen consumos/movimientos posteriores del material, no se permite reescribir retroactivamente esa entrada ni recalcular los consumos históricos.
Admin deberá realizar un ajuste compensatorio actual con motivo/auditoría.
No implementar devolución a proveedor en V1.
### B4-06 — Permisos de inventario
Admin:
- consultar existencias;
- registrar compras/entradas;
- saldos iniciales;
- ajustes positivos/negativos;
- reversiones;
- devoluciones;
- ver costos;
- consultar historial completo.
Colaborador:
- consultar existencias y alertas sin costos;
- registrar consumo ordinario para pedidos;
- registrar devolución vinculada a un consumo autorizado;
- consultar historial operativo necesario sin columnas financieras.
Colaborador NO puede:
- registrar compras/entradas valoradas;
- saldo inicial;
- ajustes manuales;
- reversiones administrativas;
- ver costo promedio;
- ver costos aplicados;
- introducir moneda/tasa/costo.
Inactivo/anónimo: cero acceso.
### B4-07 — Consumos
Todo movimiento de tipo consumption exige order_id.
Una salida que no corresponde a un pedido debe ser otro tipo explícito, por ejemplo ajuste negativo, reservado a Admin; no llamarla consumo.
order_item_id continúa siendo opcional.
Si se informa, debe pertenecer al mismo pedido.
Estados
Colaborador puede consumir únicamente cuando el pedido esté:
- in_production;
- ready.
No consumo ordinario nuevo en:
- quote;
- confirmed;
- delivered;
- cancelled.
Admin puede realizar correcciones/devoluciones posteriores con motivo y auditoría, sin reescribir historia.
En Cancelado no registrar consumo nuevo; únicamente movimientos correctivos/devoluciones autorizadas.
Material inactivo
Un material inactivo con existencia positiva puede continuar consumiéndose para agotar stock existente.
No permitir nuevas compras/entradas ordinarias de material inactivo.
Los movimientos históricos permanecen intactos.
Históricos
Para V1 no permitir insertar un movimiento retroactivo que se coloque antes de movimientos ya valorados y obligue a recalcular su costo.
Admin puede registrar movimientos históricos únicamente si no rompen el orden cronológico ya consolidado del material.
No recalcular consumos históricos.
product_materials continúa siendo receta/estimación y no genera consumo automáticamente.
### B4-08 — Varios trabajadores
Se permite que varios trabajadores trabajen simultáneamente en el mismo pedido.
Cada usuario conserva la restricción:
máximo una sesión running o paused a la vez en todo SIGCA.
Por tanto:
- Usuario A puede trabajar Pedido X;
- Usuario B también puede trabajar Pedido X;
- Usuario A no puede simultáneamente trabajar Pedido Y.
Colaborador puede consultar historial operativo de sesiones del pedido:
- trabajador;
- actividad;
- inicio;
- pausas;
- fin;
- duración.
No puede ver:
- tarifa;
- costo de mano de obra.
Admin puede ver todo.
Admin puede pausar/finalizar una sesión activa de otro trabajador mediante acción explícita, motivo obligatorio y auditoría.
### B4-09 — Sesiones abiertas y pedido
Solo puede iniciarse/reanudarse cronómetro cuando el pedido esté:
in_production.
Si existe cualquier sesión running o paused, bloquear:
- En producción → Listo;
- cancelación;
- retroceso En producción → Confirmado.
Primero deben cerrarse explícitamente las sesiones.
No cerrar sesiones automáticamente por transición de pedido.
Si un trabajador se vuelve inactivo:
- su tiempo registrado se conserva;
- no puede reanudar/operar;
- una sesión que hubiera quedado abierta debe ser finalizada por Admin mediante acción explícita con motivo;
- no borrar ni ajustar silenciosamente tiempo.
### B4-10 — Pausa, desconexión y olvidos
Se permite finalizar directamente desde paused.
El intervalo de pausa abierto se cierra en el momento de finalización y no cuenta como tiempo trabajado.
Pérdida de conexión:
- el cronómetro no se reinicia;
- la sesión persiste en servidor;
- una acción de pausa/reanudación/finalización que no logra llegar al servidor se considera no confirmada;
- UI debe indicar fallo;
- no aceptar timestamps retroactivos proporcionados silenciosamente por el cliente.
Al reconectar, reconstruir estado desde Supabase.
Sesiones olvidadas:
- sin autocierre;
- sin corte arbitrario;
- Admin corrige/finaliza con motivo y auditoría.
### B4-11 — Corrección y precisión de tiempo
Persistir timestamps exactos y calcular duración efectiva en segundos enteros.
No redondear cada sesión a minutos.
La presentación puede mostrar horas/minutos, pero la fuente autoritativa conserva segundos.
Para futuros costos:
horas = segundos / 3600
y el cálculo monetario utilizará decimal; el monto final se redondeará HALF UP cuando corresponda.
No permitir solapamientos de sesiones del mismo usuario, incluso después de correcciones históricas.
Corrección:
- solo Admin;
- sesión cerrada;
- motivo;
- before/after;
- auditoría;
- validar pausas e intervalos;
- validar no solapamiento.
Puede corregir marcas de inicio/fin/pausas mediante operación administrativa controlada. No UPDATE directo.
La tarifa histórica aplicada no cambia durante una corrección temporal.
Sesión histórica creada manualmente
Solo Admin.
Debe proporcionar explícitamente:
- intervalo;
- tarifa aplicada;
- motivo.
Nunca usar silenciosamente la tarifa actual como si hubiera sido histórica.
Tarifa para sesiones actuales
Para iniciar una sesión debe existir una tarifa por hora válida en Configuración.
Si falta, bloquear inicio del cronómetro.
Colaborador no necesita conocer su valor: servidor la congela sin exponerla.
### B4-12 — Ciclo de envío
Mantener los tipos aprobados:
- pickup;
- shipping;
- personal_delivery.
Para shipping y personal_delivery:
pending → preparing → shipped → delivered
Para pickup:
pending → preparing → delivered
pickup no pasa por shipped.
Pedido
Crear registro de envío desde pedido Confirmado en adelante.
Despachar (shipped) solo cuando el pedido esté ready.
Marcar envío/retirada delivered requiere pedido ready o delivered.
Marcar envío Entregado no cambia automáticamente el pedido a Entregado.
La UI puede ofrecer una segunda acción explícita para entregar el pedido respetando 3B.
Roles
Admin y Colaborador: transiciones normales hacia delante.
Retrocesos/correcciones: solo Admin, motivo obligatorio y auditoría.
El tipo/método puede editarse mientras esté pending/preparing.
Después de shipped, para cambiarlo Admin debe retroceder explícitamente a preparing con motivo.
Cancelación
Agregar estado cancelled para envío.
Solo Admin puede cancelar, con motivo.
Cancelado es terminal.
Usarlo cuando el pedido se cancela o el envío definitivamente deja de realizarse.
No crear un segundo registro para el mismo pedido.
Si antes de despachar el cliente cambia de envío a retiro, editar el mismo registro, no cancelarlo y recrearlo.
### B4-13 — Dirección y cronología
La dirección se copia como snapshot al crear el envío.
Puede corregirse mientras esté:
- pending;
- preparing.
Al pasar a shipped queda congelada.
shipping y personal_delivery requieren dirección antes de despachar.
pickup no requiere dirección de entrega.
Para shipping:
- transportista/mensajería obligatorio antes de shipped;
- guía opcional.
Para personal_delivery:
- transportista externo y guía no son obligatorios.
Para pickup:
- no requiere transportista, guía ni shipped_at.
Persistir:
- shipped_at;
- delivered_at.
No futuras.
Para shipping/personal_delivery:
delivered_at >= shipped_at >= confirmed_at.
Para pickup:
delivered_at >= confirmed_at.
requested_delivery_date continúa siendo compromiso/alerta; no bloquea despacho ni entrega.
Históricos/correcciones de fechas: Admin con motivo, respetando cronología.
### B4-14 — Costo de envío
En V1, el costo operativo del envío será CRC únicamente.
No implementar USD para envío en Fase 4.
El importe representa costo efectivo, no estimado.
Colaborador no consulta ni modifica costo.
Admin registra/corrige costo mediante operación controlada con motivo/auditoría cuando corresponda.
Pagador
Valores:
- business;
- customer_direct.
Si customer_direct:
- SIGCA no registra el monto como gasto propio del envío;
- no crea payment;
- no modifica el total del pedido.
Si business y existe costo:
la fuente financiera oficial debe ser expenses.
El envío puede conservar expense_id como vínculo operativo y mostrar el costo al Admin, pero no convertirse en una segunda fuente financiera.
No crear el gasto automáticamente.
Admin debe vincular un gasto existente o registrarlo explícitamente mediante el módulo Gastos.
En futuros cálculos, si existe vínculo a expense_id, no sumar shipping_cost además del gasto.
Cobro de envío al cliente
No implementar un campo de cobro al cliente dentro de shipment.
Si SIGCA cobra el envío al cliente, ese cobro debe formar parte del total del pedido mediante una línea comercial explícita conforme a las reglas de 3B.
El módulo de envío nunca aumentará silenciosamente el total ni generará un pago.

### Secuencia aprobada y alcance de esta entrega

4A — Inventario base, compras/entradas, valoración promedio y existencias → 4B — Consumos, devoluciones y correcciones → 4C — Control de horas → 4D — Envíos → 4E — Auditoría integral y cierre de Fase 4. Cada implementación requiere la autorización correspondiente; aprobar el orden no autoriza implementarlo ahora.

El preflight exclusivo de 4A se conserva en [PHASE4A_PREFLIGHT.md](PHASE4A_PREFLIGHT.md). Sus nombres físicos y contratos técnicos son propuestas, no decisiones funcionales adicionales. Las precisiones allí identificadas no reabren la elección de promedio móvil ni los permisos aprobados. Costeo/rentabilidad/reportes permanecen en Fases 5/6. A51 permanece obligatorio antes de producción; se mantienen el aislamiento intencional de order_counters y las observaciones de Performance documentadas en el cierre de Fase 3.


## D-22 — Resolución final P4A-01/P4A-02/P4A-03 y autorización exclusiva 4A

### P4A-01 — Precisión interna, HALF UP y residuos
Confirmado:
- cantidades de inventario: máximo 4 decimales;
- costos unitarios derivados y promedio ponderado: máximo 8 decimales internos;
- importes monetarios de entrada/finales: máximo 2 decimales;
- aritmética exclusivamente numeric/decimal, nunca float;
- cuando sea necesario persistir un valor derivado a 8 decimales, utilizar ROUND HALF UP.
Regla autoritativa
Para una entrada:
- el importe histórico CRC total de la entrada es la referencia monetaria autoritativa;
- unit_cost_crc = HALF_UP(total_crc / quantity, 8).
Para el inventario vigente, además del promedio, mantener una valoración interna CRC con precisión suficiente para evitar reconstruir el valor únicamente multiplicando cantidades por un promedio redondeado.
El promedio nuevo debe derivarse de:
new_value_crc = old_value_crc + entry_total_crc
new_quantity = old_quantity + entry_quantity
new_average_crc = HALF_UP(new_value_crc / new_quantity, 8)
La valoración interna puede conservar hasta 8 decimales.
Diferencia de precisión
Sí, conservar evidencia explícita cuando:
quantity × unit_cost_crc
no coincida exactamente con el total histórico de la entrada por efecto de la cuantización a 8 decimales.
Puede almacenarse como un rounding_delta_crc o equivalente privado de evidencia:
total_crc - (quantity × unit_cost_crc)
usando precisión decimal.
Este residuo:
- no es un gasto;
- no es un ingreso;
- no es otro movimiento;
- no altera el importe original;
- sirve únicamente para trazabilidad/reconstrucción matemática;
- solo Admin puede consultarlo si contiene información de costos.
No repartir ni “esconder” el residuo modificando arbitrariamente cantidades o importes.
Costo positivo que se vuelve cero
Si un costo unitario matemáticamente positivo, después de representarlo a 8 decimales, resultara 0.00000000, rechazar la operación.
No almacenar costo cero por pérdida de precisión.
Debe devolverse un error de validación indicando que cantidad/importe exceden la precisión admitida por V1.
No aumentar silenciosamente la precisión más allá de 8 decimales.
### P4A-02 — Tipo de cambio en compras y saldos iniciales
Confirmado: utilizar exactamente el mismo contrato de referencia cambiaria aprobado para gastos, adaptado al snapshot del inventario.
Entrada USD con fecha empresarial actual
1. utilizar referencia válida de hoy si existe;
2. intentar obtener la referencia del proveedor aprobado cuando corresponda;
3. si el proveedor falla o devuelve datos inválidos y existe una referencia válida anterior, utilizar la última persistida;
4. conservar su fecha real, no hacerla pasar por tasa de hoy;
5. conservar indicador de fallback;
6. si nunca existe referencia válida, bloquear la entrada USD.
Entrada histórica USD
Debe utilizar referencia correspondiente exactamente a la fecha efectiva de la recepción.
Si existe en exchange_rates, utilizarla.
Si no existe:
- únicamente Admin puede aportar la referencia histórica;
- motivo obligatorio;
- actor;
- timestamp;
- procedencia inequívoca;
- auditoría.
Una referencia histórica aportada por Admin no debe mostrarse como si hubiera sido obtenida automáticamente del proveedor.
Saldo inicial
Si el saldo inicial se expresa/origina en USD, aplicar exactamente las mismas reglas.
Snapshot
Cada línea USD debe congelar:
- importe original;
- moneda original;
- tasa aplicada completa;
- fecha real de la tasa;
- origen/procedencia;
- indicador fallback cuando corresponda;
- actor/motivo si fue aporte histórico Admin;
- equivalente CRC HALF UP a 2 decimales.
Cambiar posteriormente exchange_rates, proveedor o configuración nunca recalcula una entrada ya registrada.
Colaborador no selecciona, introduce ni modifica tasas.
### P4A-03 — Valoración cero
Confirmado: se rechaza también una valoración cero introducida expresamente.
Para cualquier entrada valorada, compra o saldo inicial:
- cantidad > 0;
- importe histórico total > 0;
- costo unitario derivado > 0;
- equivalente CRC > 0.
No permitir:
- costo implícito cero;
- costo explícito cero;
- saldo inicial gratuito;
- entrada gratuita;
- monto negativo.
La razón es que una entrada con existencia física positiva y valor cero contaminaría el promedio ponderado y los futuros costos aplicados.
Si en el futuro SIGCA necesita manejar muestras, donaciones o material recibido gratuitamente, eso requerirá una decisión funcional específica con su tratamiento contable. No forma parte de V1.

### Concreciones operativas y autorización posterior

Después del checkpoint documental se autoriza únicamente 4A. Saldo inicial: una sola operación por material y únicamente sin movimiento previo, Admin/motivo. Recepción multilínea atómica; bloqueos determinísticos, revisión, UUID estable/idempotencia, snapshots y auditoría; rollback completo. Congelar unidad en servidor/BD desde primer movimiento. Sin entradas ordinarias de material inactivo. Vínculo opcional a gasto sin modificarlo ni automatizar altas/anulaciones. Alerta derivada stock <= min_stock, sin push/email.

Admin consulta cantidades, compras, moneda, tasas, valor, promedio, costos y vínculos; Colaborador solo material/unidad/stock/mínimo/alerta e historial operativo sin importes. RLS, grants mínimos, search_path vacío, private no expuesto, actor auth.uid/perfil vigente. Inactivo bloqueado con JWT previo. No datos financieros en HTML/RSC ni payloads indirectos. Auditoría de cabecera/líneas/snapshot/movimiento/balance/valor/vínculo con actor/fecha/motivo; sin secretos ni binarios.

Pruebas reales DEV obligatorias de concurrencia (dos entradas, orden inverso multimaterial, revisión obsoleta, UUID repetido, saldo inicial simultáneo, gasto concurrente), RLS e integridad monetaria, más regresión real suficiente de Fase 3. Responsive 320/375/768/1024/1440, estados y diseño vigentes. Ejecutar lint/typecheck/tests/build/E2E/audit/Advisors. Evidencia en PHASE4A_VERIFICATION.md con COMPLETO/PARCIAL/PENDIENTE/NO APLICA y local/simulado/DEV real diferenciados.

No 4B/4C/4D/4E, consumos/devoluciones/ajustes, horas, envíos, rentabilidad ni reportes. Sin tag final; esperar revisión. Ante nueva decisión funcional, detener comportamiento afectado y consultar. Mantener protocolo de migraciones nuevas, pruebas locales, dry-run y revisión antes de DEV; sin DROP/TRUNCATE/reset ni borrados compensatorios.

## D-23 — Consumos, devoluciones y correcciones de inventario

Aprobado el 2026-10-02 como continuación de D-22. Se conserva íntegro D-01 a D-22. Alcance actual: documentación e inspección de solo lectura, sin implementación 4B ni autorización de DROP CONSTRAINT.

Precedencia explícita: B4B-01 sustituye para las futuras salidas la frase de D-22 «una salida normal no cambia el costo promedio de las unidades restantes»: se recalcula el promedio restante desde el valor interno proporcional. B4B-02 precisa/sustituye la valoración de devolución por costo unitario multiplicado: retorna el valor interno asignado al consumo, preservando también el costo unitario snapshot como evidencia. No reinterpreta movimientos 4A existentes ni cambia sus entradas.

Resolución aprobada, transcrita a continuación. Los nombres físicos adicionales y restricciones propuestos se inspeccionan en PHASE4B_PREFLIGHT.md y todavía no están implementados.
B4B-01 — Valor interno de un consumo
Se aprueba separar:
1. promedio histórico snapshot del movimiento;
2. valor interno realmente retirado del inventario.
El valor interno autoritativo NO será q × promedio_redondeado.
Con:
- Q = cantidad antes;
- V = valor interno antes;
- q = cantidad consumida;
- A = promedio vigente snapshot de 8 decimales.
Si q = Q:
D = V
Es decir, agotar existencias debe dejar exactamente:
Q' = 0
V' = 0
sin residuo.
Si q < Q:
D = HALF_UP(V × q / Q, 8)
luego:
Q' = Q - q
V' = V - D
A' = HALF_UP(V' / Q', 8)
Esto distribuye proporcionalmente el valor interno real existente.
El movimiento conserva además A como promedio snapshot previo al consumo.
Si por precisión una salida parcial produce:
- D <= 0, o
- D >= V quedando Q' > 0,
rechazar la operación por precisión insuficiente.
Nunca corregirla aumentando silenciosamente la precisión.
Registrar además la diferencia:
allocation_delta = D - (q × A)
o evidencia equivalente.
Esa diferencia:
- no es ingreso;
- no es gasto;
- no es movimiento adicional;
- no modifica el snapshot A;
- sirve únicamente para trazabilidad de valoración.
Para futura rentabilidad, el valor interno asignado D es la fuente autoritativa del costo total del consumo. q × A es evidencia del promedio snapshot, no la fuente para reconstruir el valor retirado.
B4B-02 — Devoluciones y residuos
Cada devolución debe recuperar parte del valor interno D0 realmente asignado al consumo original, no simplemente r × A.
Para un consumo original:
- cantidad original q0;
- valor asignado original D0;
- cantidad ya devuelta qr;
- valor ya reintegrado Vr;
- nueva devolución r.
Si la nueva devolución completa toda la cantidad restante:
R = D0 - Vr
Así, devolver el consumo completo siempre reintegra exactamente todo D0.
Para una devolución parcial:
R = HALF_UP((D0 - Vr) × r / (q0 - qr), 8)
De esta manera los residuos de redondeo se distribuyen entre devoluciones y la última devolución absorbe exactamente el remanente.
Luego:
Q' = Q + r
V' = V + R
A' = HALF_UP(V' / Q', 8)
La devolución conserva también el promedio/costo unitario snapshot del consumo original como evidencia.
Registrar:
return_allocation_delta = R - (r × costo_unitario_snapshot_original)
o equivalente privado.
Dos devoluciones concurrentes deben bloquear el mismo consumo original y revalidar cantidad y valor ya devueltos.
Nunca:
cantidad_devuelta_acumulada > cantidad_consumida_original.
B4B-03 — Subcentavos
El delta interno de inventario se conserva a 8 decimales.
No ampliar quote_money globalmente ni cambiar contratos monetarios de fases anteriores.
Un costo interno positivo puede presentarse monetariamente como ₡0,00 al redondear a dos decimales; eso no significa material gratuito.
En vistas administrativas debe distinguirse cuando sea necesario, por ejemplo:
Menor a ₡0,01
o mostrando la precisión interna autorizada.
Colaborador no recibe estos datos.
La valoración y futuras agregaciones de costo utilizan el delta interno de 8 decimales y redondean el resultado monetario final cuando corresponda; no reconstruyen costos sumando únicamente valores visuales de dos decimales.
Si un delta matemáticamente positivo colapsa a 0.00000000, rechazar la operación.
B4B-04 — Ajustes administrativos
Solo Admin.
Siempre requieren motivo y auditoría.
Ajuste negativo
Usa exactamente el mismo algoritmo proporcional de salida que un consumo:
- limitado por stock disponible;
- sin pedido obligatorio;
- snapshot del promedio;
- valor interno proporcional;
- agotamiento exacto a cero.
Ajuste positivo con stock existente
Si Q > 0, se valora manteniendo el promedio económico vigente:
R = HALF_UP(V × q / Q, 8)
y:
Q' = Q + q
V' = V + R
No se solicita una nueva tasa, moneda o costo.
Ajuste positivo con stock cero
Si Q = 0, no existe promedio vigente utilizable.
Admin debe proporcionar una valoración positiva explícita, usando el mismo contrato CRC/USD histórico aprobado en 4A:
- importe original;
- moneda;
- tasa/procedencia cuando USD;
- equivalente CRC;
- motivo.
Cero no permitido.
Ajustes solo de valor
No permitir en V1 movimientos que cambien valor sin cambiar cantidad.
No implementar revaluaciones contables.
B4B-05 — Correcciones y reversión
Los movimientos continúan inmutables.
Corrección de cantidad
Se realiza mediante:
devolución/compensación del movimiento incorrecto
y, si corresponde:
nuevo consumo
Pueden ejecutarse en una única RPC/transacción administrativa.
El nuevo consumo es un movimiento nuevo y utiliza la valoración vigente en el momento de la corrección, no reescribe el costo histórico anterior.
Admin puede realizar una corrección vinculada incluso si el pedido actualmente está Delivered/Cancelled/Confirmed, siempre:
- referenciando el movimiento original;
- con motivo;
- auditoría;
- sin convertirlo en permiso para registrar consumos arbitrarios nuevos en esos estados.
Corrección solamente de pedido/línea
No devolver/reconsumir material únicamente para corregir atribución porque eso modificaría innecesariamente la valoración.
Implementar una evidencia administrativa separada de corrección de atribución, manteniendo inmutable el movimiento original.
Puede ser una tabla auxiliar como:
inventory_movement_attribution_corrections
o una solución relacional equivalente.
Debe conservar:
- movimiento original;
- order_id anterior;
- order_item_id anterior;
- order_id corregido;
- order_item_id corregido;
- actor;
- motivo;
- timestamp;
- revisión.
Las vistas futuras utilizan la atribución vigente corregida, mientras el historial conserva todas las anteriores.
El pedido destino debe haber sido confirmado alguna vez.
Si se informa línea, debe pertenecer al pedido destino.
Reversión de entrada 4A
La unidad mínima reversible es la línea de recepción.
Puede revertirse solo cuando no exista ningún movimiento posterior del mismo material dependiente de esa línea/secuencia.
La compensación debe restaurar exactamente:
- cantidad anterior;
- valor anterior;
- promedio anterior.
Una recepción multilínea puede tener una acción “revertir recepción completa”, pero debe ser atómica:
- todas las líneas son reversibles, o
- ninguna se revierte.
Si existe cualquier movimiento posterior dependiente, no reconstruir el pasado; usar ajuste actual conforme D-22.
No borrar la recepción original.
B4B-06 — Devoluciones por Colaborador
Colaborador activo puede registrar devolución vinculada a cualquier consumo operativo del pedido al que tiene acceso, no solamente consumos creados por él.
Esto evita depender de quién realizó materialmente el registro anterior.
Para Colaborador:
- pedido debe estar actualmente in_production o ready;
- devolución siempre ligada a consumo original;
- motivo obligatorio;
- no costos en request/response/UI;
- cantidad dentro del remanente retornable.
En otros estados:
- Colaborador no puede devolver;
- Admin puede realizar devolución/corrección posterior con motivo y auditoría.
Un material actualmente inactivo sí puede recibir una devolución ligada a un consumo anterior.
Eso no habilita nuevas compras ordinarias del material.
B4B-07 — Líneas y cronología
Consumo ordinario nuevo
Si order_item_id se informa:
- debe pertenecer al mismo pedido;
- debe ser una línea actualmente válida/activa para operación.
No permitir consumo ordinario nuevo contra una línea desactivada/retirada.
Si la línea se desactiva posteriormente, los consumos históricos conservan su referencia.
Una corrección administrativa histórica puede referirse a una línea inactiva existente cuando sea necesario preservar la atribución real.
Fecha efectiva
Colaborador:
- fecha/hora efectiva del servidor;
- no backdating.
Admin puede indicar fecha histórica únicamente si:
- no es futura;
- effective_at >= confirmed_at del pedido;
- effective_at >= last_effective_at del material;
- no obliga a insertar el movimiento antes de historia ya valorada.
Para movimientos con igual effective_at, material_sequence define orden inequívoco.
Un consumo ordinario, incluso histórico Admin, requiere que el pedido esté actualmente in_production o ready.
Para pedidos cerrados u otros estados, únicamente se permiten correcciones/devoluciones vinculadas a un movimiento existente, no nuevos consumos arbitrarios.
Correcciones/devoluciones deben tener effective_at >= effective_at del movimiento origen y respetar también la secuencia consolidada del material.

### Aclaración matemática D-23 — precisión en devoluciones parciales

Con q_rem=q0-qr y v_rem=D0-Vr: si r<q_rem, R=HALF_UP(v_rem*r/q_rem,8) y debe cumplirse 0<R<v_rem. Rechazar R<=0 o R>=v_rem por precisión insuficiente; nunca dejar cantidad retornable positiva con valor retornable cero. Si r=q_rem, R=v_rem exacto. No es una nueva política de valoración: conserva D-23, precisión e historia. Ejemplo q_rem=2,v_rem=0.00000001: devolver 1 se rechaza y devolver 2 juntas se permite. Pruebas obligatorias de ambos límites, total directa, parciales válidas/final exacta y concurrencia alrededor del límite.

Autorizada implementación exclusivamente 4B después del checkpoint 06cfacd, con los seis CHECK y tres NOT NULL exactos del preflight y adaptación exclusiva de inventory_receipt_complete(). No otras excepciones DROP ni avance 4C/4D/4E ni tag final.


### Implementación efectiva 4B (2026-10-03)

D-23 y su aclaración de precisión están implementadas exclusivamente para consumos, devoluciones y correcciones. Se reutilizan diario/costos/proyecciones 4A; evidencia aditiva de atribución y ajustes sin stock, RPC transaccional inventory_operation, vistas operativas sin costos y vista financiera Admin. Consumo/devolución proporcionales a 8 decimales, final exacto, movimientos inmutables, revisión e idempotencia, lock compartido con pedidos 3B y auditoría atómica. No cambia ninguna política de valoración aprobada.

Migraciones nuevas 20261003040656, 20261003042715 y 20261003092616 aplicadas solo a SIGCA DEV; 22 locales/remotas coincidentes. Se ejercieron únicamente las excepciones de seis CHECK y tres NOT NULL autorizadas; la función 4A inventory_receipt_complete conserva contrato con comparación nullable. Detalle de objetos, permisos, pruebas locales/DEV/inducidas y limitaciones en [PHASE4B_VERIFICATION.md](PHASE4B_VERIFICATION.md). Pantalla de operaciones desde inventario/pedido, historial paginado y evidencia de atribuciones. Sin nuevas dependencias, variables, buckets ni cambios de Auth. A51 permanece pendiente para producción. No implementa 4C/4D/4E ni crea tag final.
