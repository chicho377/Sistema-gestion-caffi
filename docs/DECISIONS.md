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
