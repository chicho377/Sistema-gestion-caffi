# DATABASE.md

# Modelo de datos propuesto para Supabase

> Este documento es una propuesta de implementación derivada de los requerimientos aprobados.  
> Los nombres físicos pueden ajustarse durante las migraciones, pero no deben perderse las responsabilidades, relaciones ni reglas de negocio descritas aquí.

Decisiones aprobadas: [DECISIONS.md](DECISIONS.md). Este documento no constituye una migración. Las soluciones físicas marcadas como propuestas técnicas se concretarán durante implementación sin alterar las reglas aprobadas.

## 1. Principios

- PostgreSQL en Supabase.
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
- `order_number text unique not null`
- `client_id uuid FK not null`
- `order_date date not null`
- `requested_delivery_date date not null`
- `production_status text not null`
- `financial_status text not null`
- `discount_amount numeric default 0`
- `subtotal numeric default 0`
- `total numeric not null`
- `deposit_percentage numeric nullable`
- `deposit_required_amount numeric` — monto originalmente solicitado, conservado históricamente.
- `confirmed_at timestamptz nullable` — marca de confirmación de venta.
- `delivered_at timestamptz nullable` — marca de entrega para ganancia realizada por período.
- `notes text nullable`
- `cancel_reason text nullable`
- `cancelled_at timestamptz nullable`
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

Regla: la alerta de fecha no se almacena como dato permanente; se deriva de `requested_delivery_date` y estado.

Reglas aprobadas y garantías técnicas:

- `subtotal = SUM(quantity × unit_price - descuento de línea)`; `total = subtotal - discount_amount` del pedido. Cada descuento se aplica una sola vez.
- Adelanto solicitado = total final × porcentaje / 100, conforme al redondeo por definir. Conservar el monto original; no regenerarlo silenciosamente al editar el pedido o la configuración.
- Totales y estado financiero deben mantenerse coherentes mediante operaciones de base de datos; no aceptar valores arbitrarios calculados únicamente por el cliente.
- Suma de pagos válidos nunca mayor que el total en V1, incluso al editar líneas o descuentos y bajo concurrencia.
- Cancelación permitida con pagos; no cambia su validez ni su reconocimiento como ingresos. Motivo obligatorio y auditoría. Sin reembolsos en V1.
- `confirmed_at` se registra al pasar de Cotización a Confirmado; `delivered_at` al entregar el pedido. La entrega del envío no asigna esta marca silenciosamente. Reaperturas y cambios históricos requieren la política pendiente en DECISIONS.md.
- Consecutivo inicial `PED-AAAA-00001`, reinicio anual, asignación atómica en servidor/base de datos e identificador estable. Propuesta técnica: contador por año protegido por transacción, además de unicidad de `order_number`; nunca `MAX + 1` sin protección concurrente.

### 2.7 order_items

Detalle del pedido.

- `id uuid PK`
- `order_id uuid FK not null`
- `product_id uuid FK nullable`
- `product_name_snapshot text not null`
- `quantity numeric not null`
- `unit_price numeric not null`
- `discount_amount numeric default 0`
- `line_total numeric not null`
- `customization text nullable`
- `notes text nullable`

Snapshot recomendado para conservar el nombre/precio histórico aunque el producto cambie.

`line_total = quantity × unit_price - discount_amount`. Un vínculo de sesión, consumo o costo a esta línea debe comprobar también pertenencia al mismo `order_id` (por ejemplo, mediante FK compuesta como solución técnica).

### 2.8 payments

Pagos aplicados a pedidos.

- `id uuid PK`
- `order_id uuid FK not null`
- `client_id uuid FK not null`
- `payment_date timestamptz not null`
- `amount numeric not null`
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

Fuente oficial de ingresos de pedidos. No genera fila adicional de ingreso. `payment_date` es la fecha efectiva de recepción. Garantizar que `client_id` corresponde al cliente del pedido. Registro y validación de saldo deben ser atómicos frente a pagos concurrentes. Solo Administrador puede anular; conservar motivo, actor y fecha. Pagos válidos de pedidos cancelados siguen contando como ingresos.

### 2.9 manual_income

Dinero recibido que no proviene de pedidos. No contiene `order_id` ni `payment_id`: si procede de un pedido se registra en `payments`.

- `id uuid PK`
- `income_date timestamptz not null` — fecha efectiva de recepción.
- `amount numeric not null`
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

### 2.11 expenses

- `id uuid PK`
- `order_id uuid FK nullable`
- `order_item_id uuid FK nullable` — costo atribuible a una línea del mismo pedido.
- `category_id uuid FK not null`
- `expense_date timestamptz not null`
- `amount numeric not null`
- `description text not null`
- `payment_method text nullable`
- `supplier text nullable`
- `receipt_path text nullable`
- `status text default 'valid'`
- `void_reason text nullable`
- `voided_at timestamptz nullable`
- `voided_by uuid FK -> profiles.id nullable`
- `created_by uuid`
- `created_at`

Reconocimiento por `expense_date`. Colaborador puede registrar el gasto y su monto, sin obtener acceso general a costos ni reportes financieros. Anulación reservada a Administrador. La vinculación con una línea no implica por sí sola que todo egreso sea un costo adicional: definir la relación con compras/consumos y envíos antes de sumar rentabilidad, evitando duplicaciones.

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

### Cantidades

`CHECK quantity > 0` para líneas y movimientos; permitir decimales. En pagos el campo es `amount`, no `quantity`; aceptación de monto cero pendiente.

### Adelanto

`CHECK deposit_percentage BETWEEN 0 AND 100`.

Descuentos no negativos ni superiores al importe correspondiente; totales no negativos. Monto de adelanto original conservado sin sobrescritura automática. Precisión y redondeo por definir antes de operaciones financieras.

### Fechas

No imponer que `requested_delivery_date >= order_date` sin confirmar la política con el usuario si se deben permitir registros históricos.

### Estados

Preferir enums PostgreSQL o constraints/checks explícitos si el equipo desea estados cerrados.

## 5. Índices sugeridos

- `orders(client_id)`
- `orders(requested_delivery_date)`
- `orders(production_status)`
- `orders(financial_status)`
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

Agrupar en `America/Costa_Rica`, semana desde lunes. Ventas se confirman en `confirmed_at`; gastos se reconocen por `expense_date`. Ganancia realizada usa pedidos Entregados por `delivered_at`; estimada de pedidos activos separada. Tratamiento de ventas luego canceladas y reaperturas pendiente.

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

Las 16 decisiones de DECISIONS.md ya están aprobadas; no volver a tratarlas como preguntas abiertas. Su sección de pendientes delimita valoración de inventario, costos comunes, redondeo/cambios históricos, numeración retroactiva, alta de usuarios, retención y respaldos. Esos puntos se resuelven antes de implementar el comportamiento afectado. Reembolsos fuera de V1.

## 10. Orden recomendado de migraciones

Este orden es planificación; no crear migraciones en la etapa documental actual.

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
