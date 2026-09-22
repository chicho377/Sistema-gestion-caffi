# DATABASE.md

# Modelo de datos propuesto para Supabase

> Este documento es una propuesta de implementación derivada de los requerimientos aprobados.  
> Los nombres físicos pueden ajustarse durante las migraciones, pero no deben perderse las responsabilidades, relaciones ni reglas de negocio descritas aquí.

## 1. Principios

- PostgreSQL en Supabase.
- UUID como identificadores internos.
- `created_at` y `updated_at` en entidades principales.
- Evitar borrado físico de información histórica/financiera.
- Usar `is_active`, `status`, `cancelled_at`, `voided_at` o equivalente según el dominio.
- RLS en tablas sensibles.
- FKs explícitas.
- Constraints para datos críticos.
- Índices para claves foráneas y filtros frecuentes.
- Timestamps con zona horaria para eventos.
- Fechas de entrega como `date` cuando no se requiera hora.

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
- `status text`
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
- `cancelled` puede modelarse como estado especial o bandera consistente con los requerimientos.

Estados financieros:

- `no_deposit`
- `partially_paid`
- `paid`

Regla: la alerta de fecha no se almacena como dato permanente; se deriva de `requested_delivery_date` y estado.

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

### 2.9 income

Movimientos de dinero recibido.

- `id uuid PK`
- `order_id uuid FK nullable`
- `payment_id uuid FK nullable`
- `income_date timestamptz`
- `amount numeric not null`
- `income_type text`
- `payment_method text nullable`
- `description text nullable`
- `created_by uuid`
- `created_at`

Tipos iniciales:

- `deposit`
- `final_payment`
- `product_sale`
- `cards`
- `stickers`
- `other`

Nota de implementación: evitar duplicar impacto financiero entre `payments` e `income`. Definir en migración/servicio si un pago genera automáticamente un ingreso y cuál tabla se usa como fuente para cada reporte.

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
- `created_by uuid`
- `created_at`

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

### 2.13 inventory_movements

- `id uuid PK`
- `material_id uuid FK not null`
- `order_id uuid FK nullable`
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
- `return`

Stock actual = suma firmada de movimientos.

### 2.14 work_sessions

- `id uuid PK`
- `order_id uuid FK not null`
- `user_id uuid FK not null`
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

### 2.15 work_pauses

- `id uuid PK`
- `work_session_id uuid FK not null`
- `paused_at timestamptz not null`
- `resumed_at timestamptz nullable`
- `created_at`

Duración neta:

`finished_at - started_at - sum(pausas)`

Para sesión activa, la UI calcula tiempo transcurrido con marcas persistidas.

Restricción lógica crítica: máximo una sesión `running` o `paused` por usuario.

### 2.16 shipments

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
- `updated_at`

### 2.19 audit_log

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
         ├── income
         ├── expenses
         ├── work_sessions
         │      └── work_pauses
         ├── inventory_movements ──> materials
         ├── shipments
         └── files

products
   └── product_materials ──> materials
```

## 4. Reglas de integridad sugeridas

### Valores monetarios

`CHECK amount >= 0` cuando aplique.

Excepciones solo si existe una operación explícita y documentada.

### Cantidades

`CHECK quantity > 0` para líneas, pagos y movimientos donde aplique.

### Adelanto

`CHECK deposit_percentage BETWEEN 0 AND 100`.

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
- `income(order_id)`
- `expenses(order_id)`
- `inventory_movements(material_id)`
- `inventory_movements(order_id)`
- `work_sessions(order_id)`
- `work_sessions(user_id, status)`
- `shipments(order_id)`
- `audit_log(entity_type, entity_id)`
- `audit_log(user_id, created_at)`

## 6. RLS — intención

Las políticas exactas dependen de los permisos finales, pero como mínimo:

### Usuario autenticado activo

Puede leer/operar según su rol.

### Usuario inactivo

No debe poder operar.

### Anónimo

Sin acceso a información empresarial.

### Admin

Acceso completo conforme a reglas del sistema.

### Collaborator

Permisos operativos definidos por el proyecto.

No implementar políticas abiertas tipo “authenticated = full access” sin revisar qué acciones debe poder ejecutar cada rol.

## 7. Storage

Buckets o carpetas lógicas:

- `products/`
- `orders/`
- `receipts/`
- `business/`

Revisar si deben ser públicos o privados. Por defecto, comprobantes y documentos sensibles deben mantenerse privados.

## 8. Vistas / cálculos útiles

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

## 9. Decisiones que Codex no debe inventar

Antes de fijar la implementación final, pedir confirmación si se requiere decidir:

- permisos exactos del rol Colaborador;
- si `income` será una tabla independiente o una vista/derivación de pagos + otros ingresos;
- si un pedido puede tener más de un envío;
- si una sesión de trabajo puede ser editada por cualquier usuario o solo admin;
- política exacta de retención/eliminación de archivos;
- formato definitivo del consecutivo de pedido;
- políticas de respaldo según el plan de Supabase contratado.

## 10. Orden recomendado de migraciones

1. perfiles/roles;
2. clientes;
3. productos/categorías;
4. materiales;
5. pedidos;
6. detalle de pedido;
7. pagos/ingresos;
8. gastos/categorías;
9. movimientos de inventario;
10. sesiones/pausas;
11. envíos;
12. archivos;
13. configuración;
14. auditoría;
15. vistas/funciones;
16. RLS/policies;
17. seed inicial.
