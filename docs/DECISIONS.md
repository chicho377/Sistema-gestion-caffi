# DECISIONS.md

# Decisiones aprobadas para V1

Este registro incorpora las decisiones explícitas de la persona responsable del proyecto y la aprobación del plan general de implementación. Complementa REQUIREMENTS.md, ARCHITECTURE.md y DATABASE.md; no sustituye el sistema visual. Las propuestas técnicas y pendientes se distinguen de las reglas aprobadas.

## 1. Roles — D-01

Administrador tiene acceso completo conforme a las reglas de integridad e historial.
Colaborador puede trabajar con clientes, productos, pedidos, cronómetro, inventario y envíos; registrar pagos y gastos; consultar el saldo pendiente necesario para operar un pedido.
Colaborador no puede administrar usuarios, modificar configuración financiera, realizar anulaciones financieras, modificar sesiones históricas, consultar auditoría, costos, márgenes ni reportes financieros globales.
Registrar un gasto exige ingresar su monto; este permiso no concede consulta general de costos. Los datos de costeo incrustados en materiales, sesiones, movimientos o reportes deben protegerse también en la capa de datos.

## 2. Pagos e ingresos — D-02

`payments` es la fuente oficial de ingresos provenientes de pedidos. No se crea otra fila de ingreso por pago. `manual_income` representa exclusivamente ingresos ajenos a pedidos. El reporte combina pagos válidos e ingresos manuales válidos mediante vista o consulta segura, sin doble contabilización.

## 3. Costos históricos — D-03

Nunca recalcular costos históricos con valores actuales. Cada consumo conserva el costo unitario aplicado y cada sesión la tarifa por hora aplicada en ese momento. Cambiar parámetros actuales no modifica esos valores históricos.

## 4. Rentabilidad por producto — D-04

Sesiones, consumos y costos atribuibles pueden vincularse opcionalmente a `order_item_id`, además de `order_id`. La línea debe pertenecer al mismo pedido. No se ha aprobado una distribución automática de costos comunes entre líneas.

## 5. Descuentos, adelanto y sobrepagos — D-05

Orden de cálculo: suma de cantidad × precio unitario, menos descuentos de líneas = subtotal; subtotal menos descuento general = total final. El adelanto porcentual se calcula sobre el total final. Conservar además el monto originalmente solicitado en `deposit_required_amount` o equivalente. No permitir sobrepagos en V1.

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

## 11. Consecutivo — D-11

Formato inicial `PED-AAAA-00001`, reinicio anual y generación atómica en servidor/base de datos, evitando duplicados concurrentes. El identificador asignado se mantiene estable.

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

## Trazabilidad

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

## Decisiones pendientes y momento de resolución

No bloquean la base técnica; sí deben resolverse antes de implementar el comportamiento afectado:

- **Valoración de inventario:** cómo seleccionar el costo aplicado cuando hay compras a precios distintos y cómo valorar una devolución. Conservar el costo histórico está resuelto; promedio, lotes u otro método no está aprobado.
- **Costos compartidos y rentabilidad por producto:** atribución de gastos, consumos y envíos sin línea; distribución del descuento general entre productos para calcular su rentabilidad; vínculo entre gasto de compra y consumo para no contar el mismo costo dos veces. No inventar prorrateo ni presentar una rentabilidad parcial como completa.
- **Montos y cambios de pedido:** precisión/redondeo, pagos de monto cero, caso de total cero, actualización de condiciones tras confirmar/cobrar y momento de fijación del adelanto original. Reducir el total por debajo de pagos válidos no puede generar un sobrepago.
- **Reportes históricos:** tratamiento de ventas confirmadas posteriormente canceladas, cambios/reaperturas posteriores a la entrega y corte de costos para ganancia realizada. No anular ingresos válidos por una cancelación.
- **Numeración e históricos:** año de emisión o año de `order_date` en cargas históricas; reglas para registros retroactivos. No se fija una restricción de fecha de entrega sin aprobación.
- **Antes de producción:** retención/eliminación de archivos, plan de Supabase, ambientes y respaldo/recuperación de base y archivos.

## Estado de implementación

Autorizada únicamente la Fase 1 — Base y seguridad, incluyendo proyecto, dependencias, autenticación, administración de usuarios, perfiles, RLS y auditoría inicial. Dashboard como shell sin métricas ficticias. No avanzar a Fase 2 sin aprobación. AGENTS.md y reference permanecen intactos; esta actualización de docs incorpora D-17.
