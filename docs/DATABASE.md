# DATABASE.md

# Modelo de datos propuesto para Supabase

Estado actual: Fases 1/2 implementadas; 3A implementada en DEV. La sección 12 distingue el esquema vigente de las propuestas para 3B–3E.

> Este documento es una propuesta de implementación derivada de los requerimientos aprobados.  
> Los nombres físicos pueden ajustarse durante las migraciones, pero no deben perderse las responsabilidades, relaciones ni reglas de negocio descritas aquí.

Decisiones aprobadas: [DECISIONS.md](DECISIONS.md). Este documento no constituye una migración. Las soluciones físicas marcadas como propuestas técnicas se concretarán durante implementación sin alterar las reglas aprobadas.

## 1. Principios

- PostgreSQL en Supabase.
- Importes/precios numeric/decimal, nunca float, máximo 2 decimales; porcentajes máximo 2 decimales (D-19/D-20). Líneas redondeadas, subtotal de esas líneas y descuento general antes de total final. Cantidad vendida entera positiva. ROUND HALF UP a 2 decimales según D-21. No truncar tasas cambiarias ni reescribir historia.
- UUID como identificadores internos.
- `created_at` y `updated_at` en entidades principales.
- Evitar borrado físico de información histórica/financiera.
- Usar `is_active`, `status`, `cancelled_at`, `voided_at` o equivalente según el dominio.
- RLS en todas las tablas empresariales y acceso restringido en vistas y funciones.
- FKs explícitas.
- Constraints para datos críticos.
- Índices para claves foráneas y filtros frecuentes.
- Timestamps con zona horaria para eventos.
- Fechas de entrega como `date` cuando no se requiera hora.
- Calendario del negocio: `America/Costa_Rica`, semana desde lunes.
- Proyecto equivale a pedido en V1; no existe tabla `projects`.

## 2. Entidades

### 2.1 profiles

Perfil adicional del usuario autenticado.

Campos sugeridos:

- `id uuid PK` → `auth.users.id`
- `full_name text`
- `email text`
- `role text`
- `status text`
- `last_access_at timestamptz nullable`
- `created_at timestamptz`
- `updated_at timestamptz`

Valores iniciales:

- role: `admin`, `collaborator`
- status: `active`, `inactive`

Solo Administrador administra usuarios/roles/estado. El acceso verifica el estado vigente del perfil incluso con una sesión anterior; no basta una comprobación al iniciar sesión.

Alta V1 (D-17): registro público deshabilitado en Supabase Auth; primer Administrador provisionado manualmente una sola vez. Después, invitación por correo solo desde servidor mediante Auth Admin, comprobando Administrador activo. Crear profiles por trigger confiable al insertar auth.users, siempre collaborator/active sin confiar en metadata del cliente para autorización. Promoción posterior solo por acción administrativa explícita. Prohibir que cualquier usuario cambie su propio rol; solo Administrador cambia rol/estado de usuarios. Clave administrativa nunca pública. El correo de invitación permite establecer/confirmar acceso.

### 2.2 clients

- `id uuid PK`
- `name text not null`
- `phone text nullable`
- `email text nullable`
- `address text nullable`
- `location text nullable`
- `notes text nullable`
- `is_active boolean default true`
- `created_at`
- `updated_at`

Regla: cliente con historial se desactiva, no se destruye.

### 2.3 product_categories

- `id uuid PK`
- `name text not null`
- `description text nullable`
- `is_active boolean default true`

### 2.4 products

- `id uuid PK`
- `sku text unique not null`
- `name text not null`
- `category_id uuid FK`
- `description text nullable`
- `base_price numeric not null`
- `estimated_minutes integer nullable`
- `is_customizable boolean default false`
- `main_image_path text nullable`
- `is_active boolean default true`
- `created_at`
- `updated_at`

### 2.5 product_materials

Relación entre producto y materiales normalmente utilizados.

- `id uuid PK`
- `product_id uuid FK`
- `material_id uuid FK`
- `estimated_quantity numeric`
- `notes text nullable`

Unique sugerido: `(product_id, material_id)`.

### 2.6 orders

Encabezado del pedido.

- `id uuid PK`
- `order_number text unique nullable` — sin asignar durante Cotización; asignado atómicamente al confirmar y conservado después.
- `client_id uuid FK not null`
- `order_date date not null`
- `requested_delivery_date date not null`
- `production_status text not null`
- `currency text` — CRC exclusivamente.
- `financial_status` — dato derivado de consulta, **no columna mutable**; véase order_payment_summary.
- `discount_amount numeric default 0`
- `subtotal numeric default 0`
- `total numeric not null`
- `deposit_percentage_override numeric nullable` — propuesta técnica: excepción previa a confirmar, solo Admin auditado, máximo 2 decimales y 0..100.
- `deposit_percentage_applied numeric nullable` — porcentaje fijado al confirmar, conservado históricamente, máximo 2 decimales y 0..100.
- `deposit_required_amount numeric nullable` — calculado/persistido al confirmar, importe final a 2 decimales; no cambia por Configuración posterior.
- `confirmed_at timestamptz nullable` — marca de confirmación de venta.
- `delivered_at timestamptz nullable` — marca de entrega para ganancia realizada por período.
- `notes text nullable`
- `cancel_reason text nullable`
- `cancelled_at timestamptz nullable`
- `commercial_revision bigint` — versión técnica incrementada al cambiar líneas/cantidades/precios/descuentos.
- `zero_total_authorized_revision bigint nullable`, `zero_total_authorized_by uuid FK profiles nullable`, `zero_total_authorized_at timestamptz nullable`, `zero_total_reason text nullable` — evidencia Admin de total cero vinculada a versión y auditoría; invalidada por cambio comercial.
- `client_snapshot jsonb` — propuesta técnica: datos comerciales/contacto aplicados, con estructura validada; no reemplaza FK ni guarda datos de autorización.
- `is_historical boolean`, `historical_recorded_by uuid FK profiles nullable` — marca de carga histórica autorizada; servidor valida Admin.
- `created_by uuid FK -> profiles.id`
- `created_at`
- `updated_at`

Estados productivos:

- `quote`
- `confirmed`
- `in_production`
- `ready`
- `delivered`
- `cancelled` — representación técnica propuesta de cancelación; coherente con `cancelled_at` y motivo obligatorio.

Estados financieros:

- `no_deposit`
- `partially_paid`
- `paid`

Estado financiero independiente del productivo, derivado de total y pagos válidos: no_deposit si total > 0 y recibido = 0; partially_paid (Abonado) si 0 < recibido < total; paid si recibido >= total, incluido total cero autorizado sin pago cero. No sobrepagos: recibido <= total. Cumplimiento de adelanto es indicador separado por min(deposit_required_amount,total). No aceptar financial_status de formularios/API.

Regla: la alerta de fecha no se almacena como dato permanente; se deriva de `requested_delivery_date` y estado.

Reglas aprobadas y garantías técnicas:

- `subtotal = SUM(redondear_2(quantity × unit_price - descuento de línea))`; `total = redondear_2(subtotal - discount_amount)` del pedido. Descuentos monetarios aplicados una sola vez, sin nuevos tipos.
- Adelanto solicitado = redondear_2(total final × porcentaje / 100), ROUND HALF UP a 2 decimales según D-21. Capturar habitual vigente o excepción previa Admin, deposit_percentage_applied y deposit_required_amount al confirmar, atómicamente. No regenerarlos al cambiar Configuración o total. Umbral operativo = min(deposit_required_amount,total).
- Totales y estado financiero deben mantenerse coherentes mediante operaciones de base de datos; no aceptar valores arbitrarios calculados únicamente por el cliente.
- Suma de pagos válidos nunca mayor que el total en V1, incluso al editar líneas o descuentos y bajo concurrencia.
- Confirmación con total cero solo Admin con motivo y auditoría, incluyendo cero tras redondeo. Cambios comerciales invalidan autorización anterior; si un confirmado permanece en cero, nueva autorización Admin debe formar parte de la misma transacción. Cotización cero no implica confirmación automática. No basta CHECK total>=0.
- Cotización puede editarse dentro de validaciones/permisos. Tras confirmar, cambios de cantidades/precios/descuentos deben auditarse y recalcular saldo; bloquear pedido y coordinar con pagos para no reducir total por debajo de lo recibido válido.
- Entregado bloquea modificaciones financieras normales del pedido, pero permite cobrar saldo sin reapertura. Entregado → Listo solo Admin con motivo/auditoría; otros retrocesos permitidos exclusivamente Admin/un paso: in_production → confirmed y ready → in_production, siempre motivo/actor/timestamp/auditoría before/after. Sin otros saltos hacia atrás. Matriz ordinaria secuencial de ARCHITECTURE.md; gate de adelanto en confirmed → in_production con override Admin motivado; ready → delivered sin exigir saldo cero.
- Cancelación permitida con pagos; no cambia su validez ni su reconocimiento como ingresos. Motivo obligatorio y auditoría. Sin reembolsos en V1.
- D-21: Colaborador solo cancela quote; cancelar confirmed/in_production/ready exige Admin. delivered no pasa directamente a cancelled: Admin reabre a ready y luego cancela, ambas acciones con motivo y auditoría. Retrocesos permitidos solo un paso y Admin activo, con timestamp/actor/before-after. Cancelado terminal.
- `confirmed_at` al confirmar; `delivered_at` al entregar. Confirmado representa venta comprometida; Entregado base del resultado realizado; Cancelado queda fuera de ventas activas/resultado realizado, sin eliminar pagos. Created_at siempre instante real; históricos solo Admin. Corrección auditada de confirmed_at solo mismo año del número en operación normal; cambio de año bloqueado y reservado a excepción administrativa, sin renumeración automática. Cronología definitiva D-21 en sección 4. delivered_at solo existe si estado delivered; reapertura lo establece NULL, conserva anterior en auditoría; reentrega fija nueva fecha efectiva. Cobrar saldo no lo cambia.
- Cliente editable en Cotización; después de confirmar solo Admin con motivo y sin pagos válidos. Cambio conserva cliente histórico de pagos anulados. Cancelado terminal; no reactivar ni aceptar pagos nuevos. Sin reembolsos ni borrado financiero.
- Consecutivo inicial `PED-AAAA-00001`, anual, estable y asignado atómicamente en la confirmación. Cotización no consume número; un pedido cancelado que nunca se confirmó tampoco tuvo número asignado. Tras confirmar, conservarlo aun si se cancela. Históricos autorizados usan el año de confirmed_at en America/Costa_Rica, no el año técnico de created_at.
- Propuesta técnica: contador anual protegido por transacción, unicidad de order_number y operación idempotente que no confirme/asigne dos veces; nunca MAX+1 sin protección concurrente. UUID interno no cambia y existe antes del consecutivo.

### 2.6.1 order_counters — auxiliar técnico previsto

Propuesta, no tabla creada: año de confirmación como clave y último consecutivo asignado. Incremento y asignación de orders.order_number en la misma transacción de confirmación; sin escritura directa por cliente y sin consumo en Cotización. No representa una entidad comercial nueva.

### 2.7 order_items

Detalle del pedido.

- `id uuid PK`
- `order_id uuid FK not null`
- `product_id uuid FK nullable`
- `product_name_snapshot text not null`
- `quantity integer not null` — positiva; productos vendidos, no cantidades de material.
- `unit_price numeric not null`
- `discount_amount numeric default 0`
- `line_total numeric not null`
- `customization text nullable`
- `notes text nullable`
- `product_sku_snapshot text nullable`
- `description_snapshot text nullable`
- `is_active boolean not null`
- `created_at`, `updated_at`

Snapshot comercial obligatorio para conservar nombre/precio/descuento/personalización aplicados, con SKU/descripcion cuando existan. Línea personalizada admite product_id NULL, nombre/cantidad/precio obligatorios y descripción opcional. Confirmar exige al menos una línea activa. Desactivar una línea conserva historia y recalcula totales con las mismas garantías de autorización, revisión y saldo. Sin borrado destructivo.

`line_total = redondear_2(quantity × unit_price - discount_amount)`. Precios/importes máximo 2 decimales; precisión no permite descuentos mayores a la base ni totales negativos. Clientes/productos activos para nuevos registros normales; Admin admite inactivos en históricos, sin invalidar referencias existentes. Vínculo de gasto a línea valida mismo order_id mediante FK compuesta propuesta. No confundir líneas vendidas enteras con recetas de materiales decimales.

### 2.8 payments

Pagos aplicados a pedidos.

- `id uuid PK`
- `order_id uuid FK not null`
- `client_id uuid FK not null`
- `payment_date timestamptz not null`
- `amount numeric not null`
- `currency text not null` — CRC exclusivamente.
- `payment_type text`
- `payment_method text`
- `reference text nullable`
- `notes text nullable`
- `status text default 'valid'`
- `void_reason text nullable`
- `voided_at timestamptz nullable`
- `voided_by uuid nullable`
- `created_by uuid`
- `created_at`

Métodos:

- `cash`
- `sinpe_movil`
- `transfer`
- `card`
- `other`

Estados:

- `valid`
- `voided`

Saldo del pedido = total - SUM(payments.amount WHERE status='valid').

D-20: amount > 0, numeric máximo 2 decimales, currency CRC. Alta Admin/Colaborador solo en confirmed/in_production/ready/delivered; cobro tras entrega sin reapertura. Quote/cancelled rechazan altas. Importe inmutable; corrección por anulación Admin motivada y nuevo pago que cumpla reglas de alta. No sobrepago concurrente ni DELETE físico. is_historical/actor histórico siguen autorización Admin; created_at real.

Fuente oficial de ingresos de pedidos, sin segunda fila de ingreso. payment_date es fecha efectiva. client_id corresponde al pedido al registrar y mientras pago esté válido. Un pago anulado conserva ese cliente aunque Admin cambie después cliente del pedido sin pagos válidos; por ello no usar una FK compuesta mutable que obligue a reescribirlo. Mantener FK simple a clients y validación transaccional. Registro/anulación/cambio de cliente/total/cancelación coordinados mediante bloqueo del pedido. Solo Admin anula con motivo, actor y fecha. Pagos válidos de Cancelado siguen como ingresos.

### 2.9 manual_income

Dinero recibido que no proviene de pedidos. No contiene `order_id` ni `payment_id`: si procede de un pedido se registra en `payments`.

- `id uuid PK`
- `income_date timestamptz not null` — fecha efectiva de recepción.
- `amount numeric not null`
- `currency text not null` — CRC exclusivamente.
- `income_type text`
- `payment_method text nullable`
- `description text nullable`
- `status text default 'valid'`
- `void_reason text nullable`
- `voided_at timestamptz nullable`
- `voided_by uuid FK -> profiles.id nullable`
- `created_by uuid`
- `created_at`

Tipos iniciales:

- `product_sale`
- `cards`
- `stickers`
- `other`

Las clasificaciones adelanto y pago final corresponden a pagos de pedidos. Los demás tipos solo se usan aquí cuando el ingreso no procede de un pedido. Correcciones conservan historial mediante anulación autorizada; no se concede gestión de ingresos manuales al Colaborador. No existe tabla `income` duplicando pagos. El reporte combina pagos válidos y `manual_income` válidos, identificando origen e ID.

Importes numeric estrictamente positivos, máximo 2 decimales; currency CRC. Solo Admin crea/lee/corrige/anula; nunca DELETE. Históricos solo Admin, created_at real. Anulación conserva fila/actor/fecha/motivo. Registro de Fase 3; reporte agregado en fase posterior.

### 2.10 expense_categories

- `id uuid PK`
- `name text not null`
- `is_active boolean default true`

Categorías iniciales:

- materiales
- empaques
- impresiones
- envíos
- herramientas
- publicidad
- comisiones bancarias
- otros

Administración exclusiva Admin. Colaborador lee las categorías necesarias para registrar sus gastos, sin crear/editar/desactivar categorías. Unicidad normalizada propuesta para evitar duplicados; conservar referencias al desactivar.

### 2.11 expenses

- `id uuid PK`
- `order_id uuid FK nullable`
- `order_item_id uuid FK nullable` — costo atribuible a una línea del mismo pedido.
- `category_id uuid FK not null`
- `expense_date timestamptz not null`
- `amount numeric not null` — monto original >0, máximo 2 decimales.
- `currency text not null` — CRC o USD.
- `exchange_rate_applied numeric nullable` — positiva y sin forzar escala 2, requerida en USD.
- `exchange_rate_date date nullable`, `exchange_rate_source text nullable` — requeridas en USD.
- `amount_crc numeric not null` — positivo, máximo 2 decimales; igual al original si CRC, conversión histórica si USD.
- `rate_override_reason text nullable`, `rate_provided_by uuid FK profiles nullable` — tasa histórica proporcionada solo por Admin con motivo/auditoría.
- `description text not null`
- `payment_method text nullable`
- `supplier text nullable`
- `notes text nullable` — comprobantes mediante expense_files, no ruta arbitraria editable.
- `status text default 'valid'`
- `void_reason text nullable`
- `voided_at timestamptz nullable`
- `voided_by uuid FK -> profiles.id nullable`
- `created_by uuid`
- `created_at`

Reconocimiento por `expense_date`. Colaborador puede registrar el gasto y su monto, sin obtener acceso general a costos ni reportes financieros. Anulación reservada a Administrador. La vinculación con una línea no implica por sí sola que todo egreso sea un costo adicional: definir la relación con compras/consumos y envíos antes de sumar rentabilidad, evitando duplicaciones.

D-20: usar tasa de fecha efectiva cuando exista; histórico sin tasa solo Admin aporta valor con motivo/auditoría. Nunca recalcular con exchange_rates vigente. Fallback conserva última tasa válida con fecha/procedencia reales; no presentarla como referencia de otra fecha. Colaborador lee únicamente gastos propios/comprobantes, y solo cambia descripción/notas/comprobante propios mientras status=valid. Resto de campos queda protegido; categorías, correcciones financieras y anulaciones solo Admin. Autor se deriva de identidad verificada y no es reasignable por cliente. Históricos solo Admin y created_at real.

La FK opcional a order_items debe comprobar pertenencia a order_id. No calcula consumo, inventario ni rentabilidad. Mantener historial de vínculos al corregir/anular; no cascadas destructivas sobre gasto o pedido.

### 2.12 materials

- `id uuid PK`
- `code text unique`
- `name text not null`
- `category text nullable`
- `unit_of_measure text not null`
- `unit_cost numeric default 0`
- `minimum_stock numeric default 0`
- `is_active boolean default true`
- `created_at`
- `updated_at`

No usar una edición directa de stock como fuente de verdad.

`unit_cost` es un parámetro actual, nunca fuente para recalcular consumos históricos. Es dato de costeo no consultable por Colaborador. Método de valoración pendiente; no asumir promedio ni FIFO.

### 2.13 inventory_movements

- `id uuid PK`
- `material_id uuid FK not null`
- `order_id uuid FK nullable`
- `order_item_id uuid FK nullable` — pertenece al mismo pedido.
- `movement_type text not null`
- `quantity numeric not null`
- `unit_cost numeric nullable`
- `reason text nullable`
- `created_by uuid`
- `created_at timestamptz`

Tipos:

- `entry`
- `consumption`
- `positive_adjustment`
- `negative_adjustment`
- `return` — devolución al inventario, incrementa stock; no representa devolución a proveedor.

Stock actual = suma firmada de movimientos.

Entradas, ajustes positivos y devoluciones suman; consumos y ajustes negativos restan. Cantidades positivas decimales. `unit_cost` guarda el costo aplicado histórico y es obligatorio en consumos; no se sustituye por `materials.unit_cost` al consultar. La forma de seleccionar ese costo y valorar devoluciones permanece pendiente.

No permitir stock negativo en operación normal: comprobar y registrar salidas atómicamente ante concurrencia. Ajustes manuales requieren motivo y auditoría. No editar existencias directamente ni otorgar al Colaborador lectura del costo unitario. Cuando corresponda, el consumo puede atribuirse a una línea del pedido.

### 2.14 work_sessions

- `id uuid PK`
- `order_id uuid FK not null`
- `order_item_id uuid FK nullable` — pertenece al mismo pedido.
- `user_id uuid FK not null`
- `hourly_rate_applied numeric not null` — tarifa histórica aplicada al iniciar la sesión.
- `activity text nullable`
- `status text not null`
- `started_at timestamptz not null`
- `finished_at timestamptz nullable`
- `manual_adjustment_reason text nullable`
- `created_at`
- `updated_at`

Estados:

- `running`
- `paused`
- `finished`

Cambios de tarifa configurada no recalculan esta sesión. Ajustes históricos solo por Administrador, con motivo y auditoría que conserve valores anteriores y nuevos. Colaborador opera el cronómetro sin consultar tarifas o costos de mano de obra. La duración alimenta costeo con `hourly_rate_applied`, nunca con la tarifa actual.

### 2.15 work_pauses

- `id uuid PK`
- `work_session_id uuid FK not null`
- `paused_at timestamptz not null`
- `resumed_at timestamptz nullable`
- `created_at`

Duración neta:

`finished_at - started_at - sum(pausas)`

Para sesión activa, la UI calcula tiempo transcurrido con marcas persistidas.

El cálculo debe descontar también la pausa abierta hasta el instante de consulta o finalización. La forma de finalizar desde pausa se documentará explícitamente en el flujo; no contar ese intervalo como trabajo. Propuestas técnicas: una pausa abierta por sesión, validación de intervalos sin solapamiento y transacciones para cambios de estado. Las correcciones deben mantener consistencia de sesión y pausas.

Restricción lógica crítica: máximo una sesión `running` o `paused` por usuario.

Garantizarla en base de datos mediante unicidad parcial, no solo con deshabilitar botones.

### 2.16 shipments

En V1 existe como máximo un registro por pedido. Marcarlo Entregado no modifica el pedido; la interfaz puede ofrecer una acción explícita adicional. El costo asumido por el negocio debe incluirse una sola vez en rentabilidad, aun si existe un gasto relacionado. Su atribución a líneas y vínculo con gastos quedan sujetos a la política de costos compartidos.

- `id uuid PK`
- `order_id uuid FK unique not null`
- `delivery_type text not null`
- `courier text nullable`
- `shipping_cost numeric default 0`
- `paid_by text`
- `delivery_address text nullable`
- `shipped_at timestamptz nullable`
- `tracking_number text nullable`
- `status text`
- `notes text nullable`
- `created_at`
- `updated_at`

Tipos:

- `pickup`
- `shipping`
- `personal_delivery`

Pagador:

- `client`
- `business`

Estados:

- `pending`
- `preparing`
- `shipped`
- `delivered`

### 2.17 files

Metadatos de archivos almacenados en Supabase Storage.

Acceso privado por defecto, autorizado según entidad y rol. `entity_type/entity_id` exige validación de existencia y autorización; no proporciona por sí solo una FK a todas las entidades. Definir protección contra referencias huérfanas y coherencia con rutas principales de productos/comprobantes. Retención pendiente; no borrar históricos por cascada.

- `id uuid PK`
- `entity_type text`
- `entity_id uuid`
- `bucket text`
- `path text`
- `file_name text`
- `mime_type text nullable`
- `uploaded_by uuid`
- `created_at`

Puede usarse para:

- producto;
- pedido;
- gasto/comprobante.

Para Fase 3 se propone concretamente order_files y expense_files con FKs tipadas a orders/expenses, en lugar de files polimórfico sin integridad. No mueve product_images ya implementado. Storage privado; comprobante hereda acceso de gasto padre (Admin o Colaborador autor del gasto), no permiso genérico por pedido. Ver esquema y matriz de sección 11.

### 2.18 settings

Parámetros del negocio.

Campos o esquema clave/valor.

Opción A, fila única tipada:

- `id uuid`
- `business_name text`
- `logo_path text nullable`
- `phone text nullable`
- `email text nullable`
- `currency text default 'CRC'`
- `default_deposit_percentage numeric default 50`
- `hourly_rate numeric`
- `order_number_format text`
- `business_timezone text default 'America/Costa_Rica'`
- `week_starts_on integer default 1` — lunes.
- `updated_at`

Zona horaria y semana representan la decisión aprobada; no implican una nueva opción de edición. Solo Administrador modifica configuración financiera. La tarifa actual se copia al iniciar sesiones, sin alterar las anteriores. Formato inicial aprobado `PED-AAAA-00001` con reinicio anual. Propuesta técnica: preferir fila única tipada, con unicidad garantizada.

### 2.19 audit_log

Disponible antes de la primera operación trazable. Registro generado por operaciones confiables, no editable por usuarios ordinarios; Colaborador no consulta auditoría. Propuesta técnica: captura transaccional de eventos y valores anteriores/nuevos relevantes, sin secretos en metadata.

- `id uuid PK`
- `user_id uuid nullable`
- `action text not null`
- `entity_type text not null`
- `entity_id uuid nullable`
- `reason text nullable`
- `metadata jsonb nullable`
- `created_at timestamptz not null`

Registrar al menos:

- creación/modificación de pedido;
- pago;
- anulación de pago;
- gasto;
- anulación de gasto;
- ajuste de inventario;
- ajuste manual de cronómetro;
- cambio de configuración.

## 3. Relaciones principales

```text
auth.users
   │
   └── profiles

clients
   │
   └── orders
         ├── order_items ──> products
         ├── payments
         ├── expenses
         ├── work_sessions
         │      └── work_pauses
         ├── inventory_movements ──> materials
         ├── shipments
         └── files

products
   └── product_materials ──> materials

order_items
   ├── work_sessions (opcional, mismo pedido)
   ├── inventory_movements (opcional, mismo pedido)
   └── expenses (opcional, mismo pedido)

manual_income (sin pedido) + payments válidos ──> reporte seguro de ingresos
```

## 4. Reglas de integridad sugeridas

### Valores monetarios

`CHECK amount >= 0` cuando aplique.

Excepciones solo si existe una operación explícita y documentada.

D-20: payments/manual_income/expenses.amount > 0; orders.total = 0 solo se confirma con autorización Admin, motivo y auditoría vigentes. Todos numeric/decimal; importes y precios máximo 2 decimales. Entrada debe validarse antes de cast/redondeo: propuesta técnica numeric sin escala coercitiva con CHECK de valor finito y escala monetaria <=2, más validación RPC/UI/API. Numeric(p,2) por sí solo podría redondear una entrada inválida. ROUND HALF UP final a 2 decimales según D-21; tasas de cambio conservan precisión y deben ser positivas/finitas.

### Cantidades

order_items.quantity entero positivo; RPC/UI/API rechazan fracciones antes de conversión a integer. Materiales, recetas y futuros movimientos conservan cantidades decimales positivas. En pagos amount, nunca quantity; cero prohibido.

### Adelanto

Porcentajes de override/aplicado entre 0 y 100, máximo 2 decimales.

Descuentos monetarios no negativos ni superiores a su base; totales no negativos y cero confirmado solo autorizado según D-20. Adelanto fijado al confirmar y conservado; cumplimiento sobre min(histórico,total). Etapas aprobadas y finales con ROUND HALF UP a 2 decimales en servidor/BD, incluido adelanto y equivalente de conversión con tasa completa.

### Fechas

Contrato definitivo D-21/C3-03, con día empresarial en America/Costa_Rica:

| Campo | Invariante / autorización |
|---|---|
| created_at | Instante real del sistema, inmutable por cliente; no representa fecha histórica |
| order_date | <= hoy; normal hoy; histórico solo Admin |
| requested_delivery_date | >= order_date; única fecha comercial que admite futuro; puede ser pasada; sin comparación obligatoria con confirmed_at |
| confirmed_at | <= instante actual; fecha local >= order_date; histórico/corrección histórica solo Admin; año del consecutivo estable |
| payment_date | <= instante actual y >= confirmed_at; puede ser posterior a entrega; Colaborador fecha local de hoy; histórico solo Admin |
| delivered_at | <= instante actual y >= confirmed_at; no NULL únicamente con production_status=delivered; histórico solo Admin |
| income_date | <= instante actual; solo Admin registra manual_income, incluso histórico |
| expense_date | <= instante actual; Colaborador fecha local de hoy, histórico solo Admin; no exigir >= confirmed_at; fecha efectiva determina referencia de tasa USD |

Comparaciones entre timestamps preservan instantes; al comparar con order_date se convierte a fecha empresarial. Fechas efectivas anteriores al día empresarial actual exigen Admin, salvo timestamps internos generados automáticamente. Aplicar esa restricción al alta/cambio de fecha, no a una edición permitida de notas que conserve la fecha original. No aceptar futuros, excepto requested_delivery_date.

Propuesta técnica: constraints para relaciones estructurales de la fila, triggers/RPC para reglas dependientes de reloj, perfil y otras tablas; mismo control en servidor. No tratar un CHECK con reloj como sustituto de validar cada operación. Corrección de confirmed_at revalida pagos válidos y entrega vigente, sin reescribir historia auditada; solo mismo año del número en operación normal, sin renumeración. Retornos a ready ponen delivered_at NULL dentro de la misma transacción que audita fecha anterior; nueva entrega asigna nueva fecha. Cobrar saldo de delivered no modifica esa columna.

### Contrato decimal D-21

redondear_2 en este documento significa exclusivamente ROUND HALF UP a 2 decimales. Ejemplo 1,00 × 12,50 % = 0,125 → 0,13. Líneas se redondean individualmente; subtotal suma líneas activas redondeadas; descuento general se aplica una sola vez antes del total final HALF UP. deposit_required_amount usa total final y porcentaje aplicado, HALF UP a 2. Conversión usa precisión decimal y tasa aplicada completa; solo equivalente monetario final se redondea. Validación de entrada ocurre antes de redondear: precios/importes/porcentajes con más de 2 decimales se rechazan. Implementación futura coherente entre servidor/BD, nunca solo float/JavaScript. No se alteran originales/tasas históricos ni se crean tipos nuevos de descuento.

### Estados

Preferir enums PostgreSQL o constraints/checks explícitos si el equipo desea estados cerrados.

## 5. Índices sugeridos

- `orders(client_id)`
- `orders(requested_delivery_date)`
- `orders(production_status)`
- No índice orders(financial_status): estado calculado, sin columna mutable. Optimizar suma con payments(order_id,status).
- `payments(order_id, status)`
- `payments(payment_date)`
- `manual_income(income_date, status)`
- `orders(confirmed_at)`
- `orders(delivered_at)`
- `expenses(order_id)`
- `inventory_movements(material_id)`
- `inventory_movements(order_id)`
- `work_sessions(order_id)`
- `work_sessions(user_id, status)`
- unicidad parcial de `work_sessions(user_id)` para estados `running/paused`;
- índices de `order_item_id` en sesiones, consumos y gastos;
- `shipments(order_id)`
- `audit_log(entity_type, entity_id)`
- `audit_log(user_id, created_at)`

## 6. RLS y autorización

RLS en todas las tablas empresariales desde su creación, con privilegios mínimos y políticas por operación. Matriz aprobada en DECISIONS.md, D-01 y D-16; no basta ocultar controles en UI.

### Usuario autenticado activo

Puede leer/operar según su rol.

### Usuario inactivo

No debe poder acceder a datos empresariales ni operar incluso con sesión previa. Verificar estado vigente en operaciones de datos, funciones y acceso autorizado a Storage; no depender únicamente de claims antiguos.

### Anónimo

Sin acceso a información empresarial.

### Admin

Acceso completo conforme a reglas del sistema.

### Collaborator

Opera clientes, productos, pedidos, cronómetro, inventario y envíos; registra pagos/gastos y consulta saldo operativo. No administra usuarios ni configuración financiera, no realiza anulaciones financieras, no modifica sesiones históricas y no consulta auditoría, costos, márgenes ni reportes financieros globales.

RLS filtra filas, no oculta por sí sola columnas sensibles. Propuesta técnica: separar atributos financieros o restringir privilegios de columnas y exponer proyecciones/operaciones seguras para Colaborador. Esto aplica a tarifas de sesiones, costos de materiales/movimientos/envíos y resúmenes de trabajo. Registrar un gasto permite proporcionar su monto sin conceder lectura financiera general. Respuestas de escritura, errores, exportaciones y vistas tampoco deben filtrar datos restringidos.

El rol/estado no puede elevarse mediante edición del propio perfil. Servicios privilegiados verifican actor activo y permisos; no sustituir autorización con `service_role`. Vistas de reportes deben conservar RLS (por ejemplo, `security_invoker` cuando corresponda) y los privilegios por rol. Un resumen de tiempo para Colaborador no incluye costo de mano de obra.

No implementar políticas abiertas tipo “authenticated = full access” sin revisar qué acciones debe poder ejecutar cada rol.

## 7. Storage

Buckets o carpetas lógicas:

- `products/`
- `orders/`
- `receipts/`
- `business/`

Almacenamiento privado por defecto para productos, pedidos, comprobantes y negocio. Acceso mediante mecanismos autorizados de Supabase Storage, con políticas sobre objetos además de metadatos. Comprobantes nunca públicos. Política de retención/eliminación pendiente.

## 8. Vistas / cálculos útiles

Todas las vistas/consultas respetan rol y estado vigente. Los reportes financieros globales y costos son exclusivos de Administrador; los resúmenes operativos para Colaborador exponen únicamente datos permitidos.

### income_report

Combina pagos válidos por `payment_date` e ingresos manuales válidos por `income_date`, conservando origen e ID. No crea filas de ingreso por pago ni excluye pagos válidos porque el pedido fue cancelado.

### Períodos de negocio

Agrupar en America/Costa_Rica, semana desde lunes. Confirmado representa venta comprometida con confirmed_at; gastos por expense_date. Resultado realizado usa Entregados por delivered_at; Cancelado queda fuera de ventas activas/utilidad realizada, conservando pagos como ingresos. D-21: reapertura Entregado → Listo pone delivered_at NULL; auditoría conserva fecha anterior. Reentrega asigna nueva entrega vigente; cobro posterior no la altera. El modelo registra hechos, sin adelantar vistas de rentabilidad/reportes ni implementación actual.

### order_payment_summary

Por pedido:

- total;
- total pagado válido;
- saldo.

### material_stock

Por material:

- entradas;
- salidas;
- stock actual;
- mínimo;
- indicador de stock bajo.

### order_work_summary

Por pedido:

- minutos/segundos netos;
- costo de mano de obra.

### order_profitability

Por pedido:

- precio;
- materiales;
- empaque;
- impresiones;
- mano de obra;
- envío asumido;
- otros;
- costo total;
- ganancia;
- margen;
- ganancia/hora.

Mano de obra usa tarifa histórica por sesión y materiales costo histórico por consumo. Nunca sumar dos veces compra y consumo, ni envío y gasto equivalente. El modelo de imputación debe cerrarse antes de implementar esta vista.

### order_item_profitability

Costos y horas atribuibles mediante `order_item_id`, conservando `order_id`. No repartir automáticamente costos sin línea ni descuento general entre productos sin regla aprobada; señalar cobertura incompleta cuando corresponda. Reporte restringido a Administrador.

## 9. Decisiones aprobadas y pendientes

D-01 a D-21 aprobadas; no reabrirlas. B3-01 a B3-10 y C3-01/C3-02/C3-03 resueltos, sin bloqueantes funcionales restantes de Fase 3. Reembolsos fuera de V1. Inventario/costeo y otros pendientes posteriores no bloquean estas tablas. No implementar hasta siguiente autorización.

## 10. Orden recomendado de migraciones

Contrato de tipo de cambio aprobado (D-18 / RF-CON-06): en V1 se mantiene tipodecambio.paginasweb.cr, público y sin secretos adicionales. exchange_rates conserva referencias válidas ante fallos; puede actualizar la cotización del día y no representa una conversión histórica aplicada. Toda entidad histórica futura dependiente de conversión debe conservar importe, moneda y tasa aplicados originalmente, sin recalcular desde exchange_rates ni modificar historia al sustituir proveedor. No se crean esas entidades fuera de su fase autorizada.

Este orden es planificación general. Fases 1 y 2/auditoría cerradas y aprobadas para desarrollo; ahora solo se actualiza documentación. No crear migraciones/tablas/código de Fase 3 ni movimientos/stock real hasta autorización explícita.

Concreción técnica de Fase 2: `settings` de fila única con RLS de Administrador; catálogo `materials` sin columnas financieras; costos/moneda en `material_costs` con RLS exclusiva de Administrador y FK al material. Ausencia de fila de costo significa pendiente, según D-18. Esta separación impide filtrar costos mediante SELECT *, filtros o respuestas de escritura. Monto original numeric sin redondeo persistido; equivalente CRC calculado con venta de referencia del BCCR publicada por tipodecambio.paginasweb.cr. `exchange_rates` conserva tasa, fecha del dato y de consulta; solo servidor escribe y Admin consulta. Ante fallo se conserva la última tasa, sin reemplazar el importe original ni afectar históricos. `product_images` especializa los metadatos de archivos con FK real a products. No se crea el modelo polimórfico de archivos de fases posteriores.

La migración física añade `is_active` en asociaciones e imágenes para conservar historial. `product_images.is_main` tiene índice único parcial por producto; el cambio de principal es transaccional. La inserción de imágenes requiere RPC exclusivo de service_role tras validación del archivo en servidor y revalidación del actor activo en BD. No existen grants DELETE para roles de aplicación. Triggers registran antes/después en audit_log, únicamente legible por Admin. Las funciones SECURITY DEFINER residen en private con search_path vacío y EXECUTE restringido; wrappers públicos son SECURITY INVOKER.

La sincronización de exchange_rates usa store_exchange_rate exclusivo de service_role; verifica actor Admin activo en BD y lo atribuye en auditoría. No se permite escritura directa de cotizaciones desde la API cliente ni desde la tabla con service_role.

1. perfiles/roles y configuración;
2. infraestructura de auditoría antes de operaciones trazables;
3. clientes, categorías y materiales;
4. productos y product_materials;
5. pedidos, consecutivo atómico y detalle;
6. pagos e ingresos manuales;
7. categorías de gastos y gastos;
8. movimientos de inventario;
9. sesiones y pausas;
10. envíos;
11. metadatos y políticas de archivos;
12. vistas/funciones de reportes y costeo;
13. seed inicial autorizado.

Cada tabla se incorpora junto con sus constraints, índices, privilegios y RLS; cada operación, con autorización y auditoría cuando corresponda. No posponer toda la seguridad hasta la última migración. FKs históricas deben impedir borrados destructivos.

## 11. Tablas y relaciones de Fase 3 — modelo completo

| Tabla prevista | Función / relaciones principales |
|---|---|
| orders | Pedido y estado; client_id → clients, created_by → profiles; UUID desde creación y número al confirmar |
| order_items | Líneas → orders; products opcional y snapshots obligatorios; quantity entera positiva |
| payments | Pago → orders y clients coherentes; creadores/anuladores → profiles; fuente de ingresos de pedidos |
| manual_income | Ingreso sin pedido ni pago asociado; autor/anulador → profiles; solo Admin |
| expense_categories | Clasificación del gasto; mantenimiento solo Admin, lectura operativa |
| expenses | Categoría obligatoria → expense_categories; pedido opcional → orders; línea opcional → order_items del mismo pedido; autor/anulador → profiles |
| order_counters (auxiliar propuesto) | Consecutivo por año de confirmed_at, asignación exclusiva en transacción de confirmación |
| order_files (auxiliar técnico propuesto) | Referencias privadas con FK order_id → orders; uploaded_by → profiles |
| expense_files (auxiliar técnico propuesto) | Comprobantes privados con FK expense_id → expenses; uploaded_by → profiles; acceso heredado de gasto |

Se reutilizan clients, products, profiles, settings, audit_log y exchange_rates; no se crean de nuevo. La tasa aplicada es una copia histórica en el registro convertido, no una lectura posterior de la caché mutable. Puede conservarse referencia adicional de procedencia sin sustituir dicha copia.

No se prevén sales ni income duplicando orders/payments, projects, reembolsos ni entidades de inventario, cronómetro, envíos o reportes. Estados productivos quote/confirmed/in_production/ready/delivered/cancelled; financieros derivados no_deposit/partially_paid/paid, total cero autorizado → paid. Matriz definitiva D-21 en ARCHITECTURE.md, sin transiciones excepcionales implícitas.

### 11.1 Campos principales consolidados y constraints

Esquema objetivo de Fase 3; complementa las secciones 2.6–2.11. No autoriza subfases adicionales. Para entidades de Fase 2 prevalece el modelo implementado descrito en sección 10; para 3A prevalece el esquema efectivamente implementado en sección 12. Campos de confirmación/finanzas que no figuren allí siguen propuestos para subfases futuras.

| Tabla | Campos principales / garantías |
|---|---|
| orders | id UUID; order_number único nullable antes de confirmar; number_year y number_sequence como propuesta técnica para identidad estable; client_id FK y client_snapshot; order_date/requested_delivery_date; production_status; currency CRC; subtotal/discount_amount/total numeric; deposit_percentage_override/applied y deposit_required_amount; confirmed_at/delivered_at/cancelled_at/cancel_reason; commercial_revision y evidencia de autorización cero; notes; is_historical/historical_recorded_by; created_by/created_at/updated_at |
| order_items | id/order_id/product_id opcional; product_name_snapshot/SKU/description; quantity integer >0; unit_price/discount_amount/line_total numeric; customization/notes/is_active/timestamps. UNIQUE(order_id,id) auxiliar para FK compuesta desde expenses. Sin cascadas destructivas |
| payments | id/order_id/client_id histórico; amount >0/currency CRC; payment_date/type/method/reference/notes; status valid/voided; voided_by/at/reason; created_by/at y marca histórica. Importe inmutable; pagos válidos <= total en transacción |
| manual_income | id/income_date/amount >0/currency CRC/income_type/payment_method/description; status valid/voided; actor/fecha/motivo de anulación, created_by/at y marca histórica; sin order_id/payment_id |
| expense_categories | id/name/is_active/created_at/updated_at; unicidad normalizada propuesta y FK restrictiva desde gastos; mantenimiento Admin |
| expenses | id/category_id/order_id opcional/order_item_id opcional del mismo pedido; expense_date; amount original >0/currency CRC o USD/amount_crc >0; exchange_rate_applied/date/source y evidencia Admin de tasa histórica; description/notes/payment_method/supplier; status valid/voided y evidencia anulación; created_by/at/updated_at y marca histórica |
| order_counters | year PK y last_sequence; transacción de confirmación únicamente, no escrituras directas; incremento atómico, unicidad adicional de (number_year,number_sequence) |
| order_files | id/order_id FK; bucket/object_path únicos; original_name/mime_type/byte_size; uploaded_by/created_at; is_active/replaced_by opcional para conservar versiones; sin URL pública persistida |
| expense_files | id/expense_id FK; mismos metadatos de archivo/versionado; lectura por gasto padre, no por autor del archivo; modificaciones solo conforme permisos de comprobantes |

Propuesta técnica: UUID PK, FKs a profiles para actores, CHECKs de estados/monedas/escala/finitud/signos, consistencia de tripleta de anulación y evidencia de total cero. No permitir editar total/line_total/snapshots derivados saltando la transacción. Revisión comercial invalida autorización cero incluso si no varía numéricamente el total. Configuración habitual se lee de forma autorizada en confirmación; no dar acceso a toda settings al Colaborador.

Índices: todas las FKs; orders(client_id,order_date), production_status/requested_delivery_date, confirmed_at/delivered_at; payments(order_id,status), payment_date; expenses(created_by,expense_date), category_id/order_id/order_item_id; manual_income(income_date,status); rutas únicas y parent_id en archivos. Sin índice ni escritura de financial_status mutable. Totales financieros se calculan sobre filas válidas y líneas activas, con bloqueo común del pedido.

### 11.2 Matriz de acceso y RLS de Fase 3

Todos los permisos requieren perfil activo vigente. Anónimo/inactivo: ninguna operación ni descarga. RLS en cada tabla; privilegios mínimos independientes de las políticas. Admin tampoco puede violar integridad, borrar pagos/gastos/ingresos ni editar auditoría.

| Recurso | Admin | Colaborador | Protección técnica propuesta |
|---|---|---|---|
| orders/order_items | Operación; retroceso un paso y cancelación de confirmados con motivo | Operación ordinaria; cancelación solo quote; sin retrocesos | Matriz D-21 y cronología; mutaciones RPC autorizadas/auditadas, sin DML que eluda cálculo; 3A no expone confirmación antes de 3B |
| payments | Lectura/alta/anulación motivada | Lectura operativa por pedido/alta; sin anulación | Alta/anulación atómicas con pedido; importe inmutable; sin UPDATE/DELETE directos; no resumen global de ingresos |
| manual_income | Lectura/alta/corrección/anulación | Sin acceso | RLS exclusiva Admin, sin proyecciones/RPC que lo filtren; nunca DELETE |
| expenses | Lectura total/alta/corrección/anulación | Alta; SELECT solo created_by=auth.uid(); edición limitada propia activa | INSERT atribuido a actor; campos bloqueados vía RPC/validación OLD/NEW, RLS USING y WITH CHECK; no reasignación de autor |
| expense_categories | Alta/edición/desactivación/lectura | Solo lectura necesaria para registrar gastos | Sin escritura de Colaborador; referencias históricas conservadas |
| order_files | Acceso autorizado por pedido | Referencias de pedidos accesibles | Validación del padre y ruta; metadatos y Storage privados |
| expense_files | Comprobantes de gastos | Solo de gastos propios; cambios si gasto activo | Predicado sobre expenses.created_by, no uploaded_by. Revalidar al descargar/cambiar. No filtrar gastos ajenos en joins |
| order_counters | Sin edición directa | Sin edición directa | Operación interna en confirmación, no endpoint de asignación arbitraria |
| audit_log | Lectura | Sin acceso | Escritura confiable transaccional, sin edición ordinaria |

No autorizar todo UPDATE de una fila propia: RLS no restringe columnas. Propuesta de mutaciones mediante RPC específicas, campos admitidos explícitos y propiedad inmutable. Rutinas SECURITY DEFINER necesarias solo en private, search_path vacío, grants EXECUTE mínimos y comprobación de identidad/rol/estado; wrappers seguros según patrón de Fase 1/2. No confiar en user_metadata ni actor enviado por cliente. service_role no sustituye autorización. Resumen de pagos autorizado deriva estado/saldo/adelanto sin exponer manual_income/gastos ajenos. Vistas con seguridad del invocador y revisión de grants.

### 11.3 Storage privado y evidencia de verificación futura

Propuesta: buckets privados separados order-references y expense-receipts, FKs de metadatos y rutas únicas verificadas en servidor. Carga valida tamaño, MIME y bytes; no confiar en extensión. Cliente no obtiene permisos generales de upload/overwrite/delete. Descarga mediante endpoint autenticado que revalida perfil y acceso al padre usando JWT/RLS, sin caché compartida. Mantiene el patrón de Fase 2 y evita una URL firmada persistente que sobreviva a la inactivación del usuario. Políticas sobre storage.objects también deben impedir lectura por ruta adivinada.

Reemplazar comprobante conserva archivo y metadatos previos y audita la nueva versión; no borrar ni sobrescribir. Colaborador solo actúa en gasto propio activo, aunque otro actor haya subido una versión. Operación servidor vuelve a comprobar padre/estado al registrar metadatos; fallo de subida/registro no habilita borrado automático compensatorio. Objetos incompletos no son legibles sin vínculo autorizado.

Pruebas previstas, no ejecutadas ahora: Admin/Colaborador propio/ajeno/inactivo/anónimo; lecturas y escrituras API directas; falsificación de created_by; cambios prohibidos en gasto propio; anulación por Colaborador; lectura manual_income; sobrepagos concurrentes; gastos con línea de otro pedido; URL/ruta de comprobante ajeno; acceso tras inactivación; revisión de grants, funciones, triggers, private no expuesto y Security Advisors. Diseño contrastado con documentación oficial de [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security) y [Storage](https://supabase.com/docs/guides/storage/security/access-control); no constituye validación remota.


## 12. Esquema implementado de Fase 3A

Migraciones: 20260923055811_phase3a_quotes.sql y 20260923110205_phase3a_conflict_response.sql. Aplicadas únicamente a SIGCA DEV pysgfnwsycgoneaecgcl. Sin alterar migraciones aplicadas de Fases 1/2.

| Objeto | Modelo vigente de 3A |
|---|---|
| orders | UUID; client_id FK restrictiva y client_snapshot nombre/teléfono/correo; order_date/requested_delivery_date; production_status solo quote/cancelled; moneda CRC; subtotal/discount_amount/total; notes; revision; created_by/updated_by/cancelled_by; timestamps y cancel_reason. order_number/confirmed_at/delivered_at y autorización de cero reservados pero obligatoriamente NULL. Sin columnas de adelanto, pagos, estado financiero mutable ni consecutivo. |
| order_items | UUID, order_id FK restrictiva; product_id nullable; SKU/nombre/descripción snapshot; quantity integer positivo; unit_price/discount_amount/line_total; customization/notes/is_active; timestamps; UNIQUE(order_id,id). La omisión de una línea guardada se rechaza: desactivar explícitamente. |
| order_files | UUID, order_id FK restrictiva, path único, caption, mime_type webp, byte_size, uploaded_by, is_active, replaces_id FK restrictiva, timestamps. Bucket fijo order-references, sin nombre original o URL pública persistida. |
| quote_money | Dominio numeric no negativo, finito y escala <=2; rechaza NaN/Infinity. Sin float ni redondeo silencioso de entrada. |
| quotes_read / quote_items_read | Vistas security_invoker que transportan importes como texto exacto, con RLS subyacente. |
| quote_products_read | Proyección comercial del catálogo; precio como texto, sin costos/materiales/márgenes. |

CHECKs mantienen coherencia de totales, cantidades, moneda, fechas relativas, estado y tripleta de cancelación. RPC valida fecha no futura y permiso histórico con America/Costa_Rica. FKs de actores, cliente, producto, pedido y versión anterior con índices y ON DELETE RESTRICT. Índices adicionales de entrega/estado y creación. revision es control técnico de edición concurrente; no habilita la autorización financiera de cero de 3B.

RLS orders_read/order_items_read/order_files_read: SELECT authenticated con private.is_active(). Grants de tablas: únicamente SELECT authenticated; ni anon ni service_role tienen DML directo sobre estas tablas. No policies INSERT/UPDATE/DELETE generales. Cada mutación se hace por una función autorizada:

- public.save_quote → private.save_quote: wrapper invoker, implementación definer con search_path vacío, EXECUTE authenticated. Identidad desde auth.uid(), bloqueo de perfil/pedido, revisión optimista y recálculo numeric dentro de la misma transacción. Snapshots de catálogo se toman de BD y se conservan al editar. Rechaza columnas de totales/estado/actores suministradas por cliente y líneas de otro pedido.
- public.cancel_quote → private.cancel_quote: mismo patrón, motivo obligatorio, actor/fecha confiables y terminalidad. Revisión obsoleta/estado cambiado devuelve PT409 (HTTP 409), no 40001, para evitar reintentos de serialización de PostgREST.
- public.register_order_file → private.register_order_file: EXECUTE exclusivo service_role, usado solo tras autorización y validación de bytes en servidor. Revalida actor activo y padre quote bajo bloqueo; verifica objeto, ruta y versión del mismo pedido. No admite actor desde formularios del navegador.
- private.quote_input_money: validador interno sin EXECUTE para roles de aplicación. Importe textual de hasta 100 caracteres; cantidad dentro del rango positivo integer de PostgreSQL. Límites técnicos, no reglas financieras nuevas.

Trigger quote_audit AFTER INSERT/UPDATE en las tres tablas reutiliza private.audit_catalog con before/after. quote.cancelled añade motivo y actor; quote.file_registered atribuye explícitamente al actor de la carga de servidor. Sin contraseñas, tokens o binarios en auditoría. Colaborador no lee audit_log.

Storage: bucket privado order-references, 5 MiB, image/webp. Policy order_references_read permite SELECT a usuario activo solo si existe order_files con esa ruta, protegido por RLS. Las versiones previas mantienen acceso autorizado. Sin policies de carga/sobrescritura/borrado para authenticated. La descarga usa JWT del usuario mediante /api/order-file/[id], vuelve a validar acceso y devuelve Cache-Control: private, no-store. Un objeto subido sin registro asociado queda inaccesible al cliente; requiere revisión administrativa, sin DELETE automático.

La sección 11 sigue definiendo el modelo objetivo de subfases posteriores, no objetos existentes. No hay order_counters, payments, manual_income, expenses ni expense_files de Fase 3 en este lote. Ver evidencia en PHASE3A_VERIFICATION.md.
