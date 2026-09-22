# ARCHITECTURE.md

# Arquitectura del proyecto

> Este documento traduce los requerimientos aprobados a una estructura técnica para Codex.  
> Las decisiones de Next.js, TypeScript y Tailwind CSS forman parte del paquete de implementación acordado; Supabase y Vercel provienen directamente de los requerimientos funcionales.

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
│   └── DATABASE.md
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
- Usuario inactivo no accede.
- Sesión expirada redirige a login.
- `service_role` solo servidor si alguna operación privilegiada la requiere.
- Credenciales SMTP nunca llegan al cliente.

## 6. Separación de datos de negocio

No mezclar estas responsabilidades:

### Pedido
Representa la venta/encargo y su estado.

### Pago
Representa dinero aplicado a un pedido.

### Ingreso
Representa dinero efectivamente recibido y su clasificación.

### Gasto
Representa egreso.

### Costeo
Calcula costo real del proyecto.

### Inventario
Representa materiales y movimientos.

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

## 8. Alertas de entrega

La fecha solicitada se interpreta como fecha calendario.

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

## 9. Seguridad

### Cliente

- Nunca confiar únicamente en validación del navegador.
- No incluir secretos.
- No exponer service role.

### Supabase

- RLS activa.
- Políticas explícitas.
- Restricciones/constraints donde corresponda.
- Índices para relaciones y filtros frecuentes.

### Vercel

Variables de entorno separadas por ambiente.

### Archivos

Usar Supabase Storage con acceso acorde a sensibilidad del archivo.

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

### Fase 0 — Base

- Next.js + TypeScript.
- Tailwind.
- Design tokens.
- Layout responsive.
- Supabase client/server.
- Configuración de ambientes.

### Fase 1 — Seguridad

- Auth.
- Login.
- Logout.
- Recuperación.
- Reset de contraseña.
- Rutas protegidas.
- perfiles/roles.
- RLS base.

### Fase 2 — Catálogos

- Clientes.
- Productos.
- Configuración.

### Fase 3 — Operación principal

- Pedidos.
- Estados productivos/financieros.
- Pagos.
- Ingresos.
- Gastos.

### Fase 4 — Tiempo y costeo

- Cronómetro.
- Pausas.
- Historial.
- Costeo.
- Rentabilidad.

### Fase 5 — Inventario y entregas

- Materiales.
- Movimientos.
- Stock bajo.
- Envíos.

### Fase 6 — Dashboard/reportes

- KPIs.
- Gráficos.
- filtros.
- reportes.
- exportación.

### Fase 7 — Auditoría y pulido

- Auditoría completa.
- accesibilidad.
- responsive QA.
- rendimiento.
- estados vacíos/loading/error.
- revisión visual.

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
