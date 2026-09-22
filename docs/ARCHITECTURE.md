# ARCHITECTURE.md

# Arquitectura del proyecto

> Este documento traduce los requerimientos aprobados a una estructura técnica para Codex.  
> Las decisiones de Next.js, TypeScript y Tailwind CSS forman parte del paquete de implementación acordado; Supabase y Vercel provienen directamente de los requerimientos funcionales.

Las decisiones aprobadas de V1 se registran en [DECISIONS.md](DECISIONS.md). Autorizada la implementación exclusivamente de Fase 1; fases siguientes requieren nueva aprobación.

## 1. Objetivos arquitectónicos

La solución debe priorizar:

- seguridad;
- mantenibilidad;
- responsive total;
- separación clara de responsabilidades;
- trazabilidad;
- consistencia visual;
- facilidad de despliegue;
- evolución gradual por módulos.

## 2. Stack

### Frontend / aplicación web

- Next.js
- TypeScript
- Tailwind CSS

### Backend / datos

- Supabase PostgreSQL
- Supabase Auth
- Supabase Storage
- Row Level Security

### Despliegue

- Vercel

### Correo

- Google SMTP configurado para recuperación de contraseña mediante el flujo de Supabase Auth.

## 3. Capas recomendadas

```text
UI / Pages
   │
   ├── Components
   ├── Forms
   ├── Responsive navigation
   └── Design system
   │
Application / Services
   │
   ├── Auth
   ├── Orders
   ├── Payments
   ├── Inventory
   ├── Work timer
   ├── Costing
   └── Reports
   │
Data access
   │
   └── Supabase client / server access
   │
Supabase
   ├── PostgreSQL
   ├── Auth
   ├── Storage
   └── RLS
```

Regla: la UI no debe contener lógica de negocio crítica duplicada que también deba garantizarse en la base de datos.

## 4. Organización sugerida del repositorio

```text
/
├── AGENTS.md
├── docs/
│   ├── REQUIREMENTS.md
│   ├── DESIGN_SYSTEM.md
│   ├── ARCHITECTURE.md
│   ├── DATABASE.md
│   └── DECISIONS.md
├── reference/
├── src/
│   ├── app/
│   ├── components/
│   │   ├── ui/
│   │   ├── layout/
│   │   ├── forms/
│   │   └── domain/
│   ├── features/
│   │   ├── auth/
│   │   ├── clients/
│   │   ├── products/
│   │   ├── orders/
│   │   ├── payments/
│   │   ├── expenses/
│   │   ├── inventory/
│   │   ├── timer/
│   │   ├── shipping/
│   │   ├── reports/
│   │   └── settings/
│   ├── lib/
│   │   ├── supabase/
│   │   ├── validation/
│   │   ├── formatting/
│   │   └── dates/
│   └── styles/
├── supabase/
│   ├── migrations/
│   └── seed/
└── public/
```

La estructura exacta puede ajustarse durante implementación sin perder la separación por responsabilidades.

## 5. Autenticación

Flujo esperado:

```text
Login
  │
  ├── credenciales válidas ──> Dashboard
  │
  └── olvidó contraseña
          │
          ▼
      Supabase Auth
          │
          ▼
      Google SMTP
          │
          ▼
   enlace temporal
          │
          ▼
  reset-password
          │
          ▼
        Login
```

### Reglas

- Rutas internas protegidas.
- Usuario inactivo no accede ni opera incluso con una sesión previa; verificar el estado vigente en las capas de autorización.
- Sesión expirada redirige a login.
- `service_role` solo servidor si alguna operación privilegiada la requiere.
- Credenciales SMTP nunca llegan al cliente.

Administrador tiene acceso completo sujeto a integridad e historial. Colaborador opera clientes, productos, pedidos, cronómetro, inventario y envíos; registra pagos/gastos y consulta saldo operativo. No administra usuarios, modifica configuración financiera, anula movimientos financieros, modifica sesiones históricas ni consulta auditoría, costos, márgenes o reportes financieros globales.

Alta V1 (D-17): registro público deshabilitado, primer Administrador provisionado manualmente una sola vez en Supabase. Después se invita por correo desde el sistema, solo por Administrador activo verificado en servidor. Usar Auth Admin exclusivamente en servidor con secreto no público; el nuevo perfil siempre inicia `collaborator`. Cambios de rol/estado son acciones administrativas explícitas; impedir cambios del propio rol también en base de datos. Cada usuario Auth dispone de profiles y el correo permite establecer/confirmar acceso.

## 6. Separación de datos de negocio

No mezclar estas responsabilidades:

### Pedido
Representa la venta/encargo y su estado.

Proyecto es sinónimo de pedido en V1; no crear `projects`. Descuentos de líneas antes del descuento general; adelanto sobre total final, conservando monto originalmente solicitado. Sin sobrepagos. Cancelar exige motivo y conserva pagos válidos; reembolsos fuera de V1. Consecutivo `PED-AAAA-00001`, anual, estable y generado atómicamente en servidor/base de datos.

### Pago
Representa dinero aplicado a un pedido.

`payments` es la única fuente de ingresos de pedidos; cada pago válido cuenta una vez, incluso si el pedido se cancela. Operaciones concurrentes deben proteger saldo y total.

### Ingreso
Representa dinero efectivamente recibido y su clasificación. `manual_income` contiene solo ingresos ajenos a pedidos. El reporte combina pagos válidos e ingresos manuales válidos mediante consulta/vista autorizada. No existe una segunda fila de ingreso por pago.

### Gasto
Representa egreso.

### Costeo
Calcula costo real del proyecto.

Usa costo unitario histórico del consumo y tarifa histórica de la sesión. Sesiones, consumos y costos atribuibles admiten `order_item_id` opcional además de `order_id`, validando pertenencia. No asumir distribución de costos comunes ni duplicar compras/consumos o envío/gasto. Método de valoración e imputación pendientes antes de cerrar costeo.

### Inventario
Representa materiales y movimientos.

Cantidades decimales, devoluciones explícitas al stock y ajustes con motivo/auditoría. Comprobar y registrar salidas de forma atómica para impedir stock negativo en operación normal.

### Sesión de trabajo
Representa tiempo real trabajado.

Esta separación permite calcular correctamente:

- saldos;
- flujo de efectivo;
- rentabilidad;
- costo real;
- inventario;
- horas.

## 7. Cronómetro

El cronómetro no debe depender de un `setInterval` como fuente de verdad.

Fuente de verdad:

- `started_at`;
- estado de sesión;
- pausas registradas;
- marcas de tiempo persistidas en Supabase.

La UI puede mostrar un contador local, pero al recargar debe reconstruirse desde datos persistidos.

### Estado sugerido

```text
idle
  │
  ▼
running
  │
  ├── pause ──> paused
  │               │
  │               └── resume ──> running
  │
  └── finish ──> finished
```

Restricción:

- una sola sesión activa/pausada por usuario a la vez.

Garantizar unicidad en base de datos y transacciones de estado/pausas. Conservar tarifa aplicada al iniciar; no recalcular sesiones con configuración actual. Correcciones históricas solo por Administrador, con motivo y auditoría. El contador operativo no expone tarifa/costo al Colaborador.

## 8. Alertas de entrega

La fecha solicitada se interpreta como fecha calendario en `America/Costa_Rica`; semana desde lunes.

Estados visuales:

```text
> 7 días      neutral
7-6 días      warning
≤ 5 días      danger
vencido       overdue
entregado     sin alerta
cancelado     sin alerta
```

El cálculo debe reutilizarse en:

- listado;
- detalle;
- dashboard.

Evitar tres implementaciones independientes con reglas distintas.

Reconocimiento: ingresos por fecha efectiva del pago/recepción manual; gastos por fecha del gasto; ventas al confirmar la cotización (`confirmed_at`). Ganancia realizada por período solo de pedidos Entregados, usando `delivered_at`; ganancia estimada de pedidos activos separada. No mezclar flujo de efectivo con rentabilidad.

En V1 hay máximo un envío/entrega por pedido. Marcar envío Entregado no cambia silenciosamente el pedido; puede ofrecerse una acción explícita adicional.

## 9. Seguridad

### Cliente

- Nunca confiar únicamente en validación del navegador.
- No incluir secretos.
- No exponer service role.

### Supabase

- RLS en todas las tablas empresariales desde su creación; privilegios mínimos por operación.
- Políticas explícitas.
- Restricciones/constraints donde corresponda.
- Índices para relaciones y filtros frecuentes.

Las vistas de reportes respetan políticas y roles. Propuestas técnicas: vistas con `security_invoker` cuando corresponda, proyecciones operativas y separación/restricción de columnas financieras. RLS por filas no basta para ocultar tarifas/costos dentro de registros operativos. No enviar datos prohibidos al navegador para simplemente ocultarlos. Registrar un gasto permite ingresar su monto, sin conceder consulta general de costos. Revisar también respuestas de escritura y exportaciones. El rol/estado del perfil no es editable para elevar privilegios.

Auditoría desde la primera operación trazable, preferentemente transaccional; historial protegido contra edición ordinaria. Su interfaz completa puede implementarse después.

### Vercel

Variables de entorno separadas por ambiente.

### Archivos

Supabase Storage privado por defecto. Fotografías, referencias y comprobantes se acceden mediante mecanismos autorizados y políticas sobre objetos/metadatos. Comprobantes nunca públicos. Retención y recuperación se definen antes de producción.

## 10. Manejo de errores

Toda operación debe contemplar:

- loading;
- success;
- error;
- empty;
- unauthorized/forbidden cuando corresponda.

Errores técnicos no deben revelar secretos ni detalles internos innecesarios al usuario final.

## 11. Responsive

Arquitectura de componentes:

- componentes fluidos;
- sin widths rígidos de página;
- tarjetas en móvil;
- tablas en escritorio;
- acciones táctiles;
- navegación adaptativa.

Los componentes de dominio deben soportar render adaptativo sin duplicar lógica de negocio.

## 12. Fases de implementación

### Fase 0 — Decisiones y documentación

Registrar decisiones aprobadas, matriz de permisos, fórmulas y trazabilidad requisito → interfaz → datos → prueba. Resolver pendientes antes de implementar su módulo; no fijar reglas funcionales por inferencia.

### Fase 1 — Base y seguridad

Next.js App Router, TypeScript, Tailwind, tokens, layout responsive, acceso Supabase cliente/servidor y ambientes. Auth, login/logout, recuperación/reset, perfiles y roles, rutas protegidas, RLS y permisos. Invitación privada y administración de roles/estado según D-17. Infraestructura de auditoría antes de primeras operaciones trazables. Dashboard únicamente como shell visual sin métricas de negocio ficticias.

### Fase 2 — Configuración y catálogos

Configuración, clientes, categorías, materiales, productos y product_materials. Imágenes privadas. Materiales antes de sus relaciones con productos; productos usan is_active sin status duplicado.

### Fase 3 — Pedidos y finanzas

Pedidos, líneas, descuentos, adelanto histórico, consecutivo, alertas, estados y marcas de confirmación/entrega. Pagos, ingresos manuales, gastos y anulaciones autorizadas. Validación concurrente de saldo y auditoría.

### Fase 4 — Producción y entregas

Cronómetro, pausas, historial, tarifa aplicada y correcciones autorizadas. Movimientos, costos históricos de consumo, stock bajo y envíos. Vínculos opcionales a líneas cuando corresponda.

### Fase 5 — Costeo y rentabilidad

Integrar fuentes completas sin duplicaciones, usando valores históricos. Comparar tiempos estimados/reales y calcular rentabilidad por pedido/producto según imputación aprobada. No cerrar esta fase con valoración o costos comunes sin definir.

### Fase 6 — Dashboard y reportes

KPIs, gráficos, filtros, consultas y exportación de reportes principales tanto a Excel como a PDF. Dashboard adaptado al rol: Colaborador recibe información operativa permitida, sin métricas financieras globales/costos/márgenes. Completar interfaz de auditoría solo para Administrador.

### Fase 7 — Validación y producción

Pruebas integrales, accesibilidad, responsive, rendimiento, revisión visual y configuración Vercel. Documentar y comprobar respaldo/recuperación antes de producción.

Todas las fases verifican carga, vacío, éxito, error, permisos y tamaños de celular/tablet/escritorio. Seguridad, auditoría y responsive no se posponen al final. El plan conserva todo el alcance funcional aprobado.

## 13. Definition of Done técnica

Una feature está terminada cuando:

- pasa validaciones;
- respeta RLS;
- maneja errores;
- es responsive;
- usa design system;
- no contiene secretos;
- mantiene trazabilidad;
- no rompe relaciones históricas;
- cumple los criterios específicos del requisito.
