# ARCHITECTURE.md

# Arquitectura del proyecto

> Este documento traduce los requerimientos aprobados a una estructura técnica para Codex.  
> Las decisiones de Next.js, TypeScript y Tailwind CSS forman parte del paquete de implementación acordado; Supabase y Vercel provienen directamente de los requerimientos funcionales.

Las decisiones aprobadas de V1 se registran en [DECISIONS.md](DECISIONS.md). Fases 1 y 2 y auditoría de Fase 2 aprobadas para desarrollo (checkpoint 272bd0d). D-19/D-20/D-21 quedaron documentadas en f0dfc9b. La autorización posterior permite únicamente implementar 3A; 3B y siguientes requieren aprobación independiente.

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

Confirmación (D-19): una sola transacción valida el pedido y eventual autorización de total cero, toma el porcentaje, persiste el adelanto, fija confirmed_at y asigna el consecutivo de ese año. Cotización conserva UUID pero no consume número comercial. Históricos autorizados usan año de confirmed_at en America/Costa_Rica. Bloqueo del contador anual y protección frente a reintentos deben impedir números duplicados o una segunda confirmación del mismo pedido.

Ediciones de Cotización respetan validaciones generales. Cambios financieros tras confirmar se ejecutan con auditoría y recálculo de saldo, coordinados transaccionalmente con pagos para impedir total menor a lo recibido. Entregado bloquea cambios financieros normales del pedido; D-20 permite cobros posteriores sin reapertura y contempla Entregado → Listo por Admin con motivo/auditoría. La matriz definitiva está en D-21/C3-02; nada se implementa por esta autorización documental.

financial_status no se almacena como columna mutable. Una proyección autorizada deriva total pagado válido, saldo, Sin adelanto/Abonado/Pagado y cumplimiento del adelanto operativo por separado. Total cero autorizado deriva Pagado sin pago cero. El porcentaje especial previo requiere Admin/auditoría; confirmar fija deposit_percentage_applied y deposit_required_amount. Umbral operativo = min(adelanto histórico, total actual).

Autorización de total cero vinculada técnicamente a una revisión comercial del pedido: cualquier cambio de líneas/cantidades/precios/descuentos incrementa esa revisión e invalida evidencia anterior. En un confirmado que permanece en cero, edición y nueva autorización Admin con motivo deben ser atómicas; no dejar un confirmado gratuito sin evidencia vigente. Históricos y cambios de cliente posteriores a confirmar requieren Admin; ningún cambio de cliente con pagos válidos. Pagos anulados conservan cliente histórico, sin actualización en cascada.

### Pago
Representa dinero aplicado a un pedido.

`payments` es la única fuente de ingresos de pedidos; cada pago válido cuenta una vez, incluso si el pedido se cancela. Operaciones concurrentes deben proteger saldo y total.

Monto de pago CRC mayor a cero y máximo 2 decimales; inmutable después del alta. Admin/Colaborador registran en confirmed/in_production/ready/delivered. Quote/cancelled rechazan pagos nuevos. Solo Admin anula con motivo, actor, fecha y auditoría; corrección mediante nuevo pago sujeto a reglas vigentes. Sin DELETE físico ni devolución automática. Usar numeric/decimal y cálculo decimal exacto, nunca float como fuente de verdad. Validar escala antes de cualquier cast que redondee; etapas aprobadas y ROUND HALF UP a 2 decimales según D-21, coherente en servidor/BD.

### Ingreso
Representa dinero efectivamente recibido y su clasificación. `manual_income` contiene solo ingresos ajenos a pedidos. El reporte combina pagos válidos e ingresos manuales válidos mediante consulta/vista autorizada. No existe una segunda fila de ingreso por pago.

### Gasto
Representa egreso.

D-20: monto positivo CRC/USD; guardar original/moneda/tasa aplicada/fecha/procedencia/resultado CRC. Fecha efectiva define referencia cuando esté disponible; solo Admin proporciona tasa histórica faltante con motivo/auditoría. La caché exchange_rates nunca recalcula operaciones guardadas. Colaborador registra y consulta sus gastos y comprobantes, y únicamente modifica descripción/notas/comprobante propios mientras estén activos. Admin administra categorías y correcciones/anulaciones. manual_income positivo CRC exclusivo de Admin. Nunca borrar filas financieras.

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

D-19: Confirmado es venta comprometida; Cancelado no se incluye en ventas activas ni utilidad realizada, aunque conserva pagos válidos como ingresos. Fase 3 conserva hechos/fechas necesarios sin implementar el motor de utilidad ni reportes posteriores.

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

Concreción D-18: configuración solo Administrador; productos en CRC; materiales CRC/USD con costos separados en material_costs (RLS Admin). La venta de referencia del BCCR se obtiene desde servidor mediante tipodecambio.paginasweb.cr; exchange_rates conserva la última tasa válida ante fallos, con fecha y proveedor visibles. Se consulta al abrir Configuración/Materiales como Admin, con reutilización de una hora y actualización explícita. No se garantiza una cotización nueva si la fuente falla; se utiliza la guardada, nunca un valor inventado.

Imágenes en catalog-images privado. Carga exclusiva de servidor, validación de bytes y recodificación WebP; metadatos vinculados por FK. Descarga mediante ruta autorizada con JWT y RLS en cada solicitud, sin caché compartida. Duplicar producto conserva referencias al archivo privado y copia las cantidades estimadas, sin registrar consumo. Desactivar preserva filas e historial. Los listados usan páginas de 25 registros, tarjetas móviles y tablas desde 1024 px. Los importes originales se conservan en numeric; el equivalente CRC es informativo y no fija reglas de redondeo de pedidos.

Contrato aprobado de conversión (D-18 / RF-CON-06): el proveedor público V1 actual no requiere secretos adicionales. Cambiarlo en el futuro afecta únicamente nuevas consultas. Las futuras entidades históricas deben guardar una copia de la tasa aplicada junto al importe/moneda originales; sus lecturas no consultarán la tasa vigente para recalcular historia. exchange_rates es una caché persistente de referencias cambiarias, no la fuente mutable de cálculo histórico. Su uso y respaldo con la última tasa válida son alcance aprobado de Fase 2.

### Fase 3 — Pedidos y finanzas

Pedidos, líneas, descuentos, adelanto histórico, consecutivo, alertas, estados y marcas de confirmación/entrega. Pagos, ingresos manuales, gastos y anulaciones autorizadas. Validación concurrente de saldo y auditoría.

**Implementación autorizada únicamente para 3A.** Aplicar D-19/D-20/D-21; C3-01 a C3-03 resueltos, sin bloqueantes funcionales restantes. Implementados orders, order_items y order_files para Cotización/Cancelado; payments, manual_income, expense_categories, expenses, order_counters y expense_files siguen previstos para sus subfases. Reutilizar clients, products, profiles, settings, audit_log y exchange_rates. Sin sales ni ingresos duplicados de payments.

Confirmar/modificar/cobrar/anular/cancelar/reabrir deben hacer autorización por perfil vigente, validación, bloqueo de filas relevantes, cambios derivados y auditoría en una transacción. No usar UI como única barrera ni service_role como sustituto de permiso. RPCs especializadas controlan columnas, estados, propietario inmutable y consistencia de la suma de pagos. Toda operación de pago y edición/cancelación del pedido comparte bloqueo del pedido para evitar carreras. Lectura propia de gastos definida por D-20, no por ocultar campos del listado global.

Fases posteriores no se adelantan: sin movimientos de inventario, cronómetro, envíos, valoración, utilidad calculada ni reportes. FK opcional de expenses a order_items del mismo pedido sin prorrateos. Conservación de tasa aplicada según D-20. Dashboard continúa shell; alertas se implementarán en listado/detalle, dejando integración del dashboard para su fase.

#### Matriz definitiva de transiciones de Fase 3 (D-21)

| Origen → destino | Actor activo | Condición |
|---|---|---|
| Cotización → Confirmado | Admin / Colaborador | >=1 línea activa; validaciones; total cero solo Admin con motivo; snapshot adelanto y número atómicos |
| Confirmado → En producción | Admin / Colaborador | Pagos válidos cubren min(deposit_required_amount,total); excepción solo Admin con motivo/auditoría |
| En producción → Listo | Admin / Colaborador | Transición ordinaria explícita |
| Listo → Entregado | Admin / Colaborador | Sin exigir saldo cero; delivered_at = fecha/hora efectiva vigente, no futura y >= confirmed_at; histórico solo Admin |
| Cotización → Cancelado | Admin / Colaborador | Motivo obligatorio |
| Confirmado / En producción / Listo → Cancelado | Solo Admin | Motivo obligatorio; conservar pagos, sin devolución |
| En producción → Confirmado | Solo Admin activo | Motivo, timestamp, actor y auditoría before/after |
| Listo → En producción | Solo Admin activo | Motivo, timestamp, actor y auditoría before/after |
| Entregado → Listo | Solo Admin activo | Motivo, timestamp, actor y auditoría before/after; delivered_at pasa a NULL y la fecha anterior queda auditada |
| Entregado → Cancelado | Ninguno directamente | Reabrir primero a Listo por Admin con motivo, luego cancelar por Admin con motivo |
| Confirmado → Cotización | Ninguno | Prohibido explícitamente |
| Cancelado → cualquier estado | Ninguno | Terminal; crear nuevo pedido |
| Saltos del flujo ordinario | Ninguno | Prohibidos; no confundir carga histórica Admin con salto ordinario |

Entregado admite cobros sin transición y sin modificar delivered_at. La entrega vigente existe únicamente en estado delivered; reapertura la borra de la columna activa (NULL), no de auditoría; reentrega asigna nueva fecha efectiva. Otros saltos hacia atrás están prohibidos, incluso para Admin. Anulación Admin de pago conserva historia y recalcula resumen, sin transición productiva automática. Tampoco invalidar retroactivamente el paso a producción si un pago se anula después; recalcular indicador de adelanto y conservar auditoría del paso autorizado.

#### RLS, operaciones y archivos previstos

Cronología definitiva D-21: usar America/Costa_Rica para el día empresarial y reloj de servidor/BD para instantes. created_at real/inmutable; order_date hoy salvo histórico Admin; requested_delivery_date >= order_date, futura permitida y sin exigir posterioridad a confirmación. confirmed_at no futuro y fecha local >= order_date; payment_date no futuro y >= confirmed_at; delivered_at no futuro y >= confirmed_at, solo estado delivered. income_date/expense_date no futuras; manual_income exclusivo Admin; Colaborador paga/registra gasto con fecha empresarial actual. Cualquier fecha efectiva de un día anterior exige Admin; gastos preparatorios pueden anteceder a confirmed_at. Matriz completa RF-FIN-02 / DATABASE sección 4. No limitar permisos de editar notas propias por antigüedad de una fecha que no se cambia.

Propuesta de validación: constraints de estructura y funciones/triggers para condiciones de reloj/actor/otras filas, más validación de servidor. Correcciones revalidan relaciones existentes sin cambiar created_at ni año del número automáticamente. delivered_at NULL al reabrir y evidencia anterior en auditoría atómica. HALF UP decimal coherente para líneas/total/adelanto/equivalente de conversión; tasa preservada sin redondeo previo; nunca usar solo JavaScript o cast coercitivo para admitir entradas de mayor escala.

- Perfil activo consultado en cada operación; anónimo/inactivo sin datos, incluso con JWT anterior. Rol de profiles, nunca user_metadata editable.
- Pagos: lectura operativa vinculada al pedido accesible; alta por operación atómica para Admin/Colaborador. Sin UPDATE directo de importe ni DELETE. Anulación vía acción Admin; no proporcionar agregado financiero global a Colaborador.
- Gastos: SELECT Admin o created_by = auth.uid() para Colaborador activo. Altas atribuidas por servidor/BD; no aceptar autor arbitrario. Cambios por RPC con lista cerrada de campos y comparación anterior/nueva; RLS de filas sola no impide editar monto de una fila propia.
- manual_income: ninguna lectura/escritura para Colaborador. expense_categories: lectura operativa para registrar gastos, mantenimiento exclusivo Admin.
- Sin grants de escritura directa que evadan cálculo, inmutabilidad, auditoría o autorizaciones; funciones privilegiadas solo en private, search_path fijo/vacío, EXECUTE mínimo y controles explícitos de actor. Wrappers expuestos conforme al patrón de Fase 1/2. Vistas con RLS del invocador y permisos de columnas mínimos.
- Propuesta técnica: order_files y expense_files con FK real y metadatos privados; bucket privado para referencias y otro para comprobantes. Archivo de gasto autoriza según gasto padre, no solo uploaded_by/ruta. No permitir vincular archivo propio a gasto ajeno ni cambiar propietario/entidad para obtener acceso.
- Mantener patrón de descarga por servidor con JWT/RLS y verificación de perfil en cada solicitud, sin caché compartida ni URLs públicas; no emitir URL firmada reutilizable que mantenga acceso tras inactivación. Upload exclusivo servidor con tipo/tamaño/contenido verificados; rutas no reutilizables, sin overwrite/upsert destructivo. Reemplazo conserva objeto/metadatos anteriores, marca versión vigente y audita. Política de retención posterior no autoriza borrado ahora.

Fuentes técnicas revisadas: [RLS y grants](https://supabase.com/docs/guides/database/postgres/row-level-security), [Storage access control](https://supabase.com/docs/guides/storage/security/access-control). Esta es revisión de diseño; no prueba de RLS desplegada.

#### Plan aprobado de subfases (D-21), aún sin autorización de implementación

1. **3A — Pedidos, líneas, cotizaciones y estados.** Modelo de pedido/líneas, snapshots, cotización editable, cálculo decimal, lectura/listado/detalle, fechas/alertas y contrato de estados; RLS/auditoría/archivos de referencias del pedido. Confirmación operativa pendiente de 3B: no habilitar un camino incompleto que omita número/adelanto.
2. **3B — Confirmación, consecutivos, adelantos y pagos.** Confirmación atómica y anual, porcentaje/importe histórico, total cero autorizado, pagos/anulaciones, saldo/estado derivados y gate de adelanto; integración real de transiciones/reaperturas con pagos y delivered_at.
3. **3C — Ingresos manuales.** Registro CRC positivo exclusivo Admin, corrección/anulación histórica sin borrar ni duplicar pagos.
4. **3D — Gastos, categorías y comprobantes.** Categorías Admin, CRC/USD con tasa histórica, acceso propio de Colaborador, edición limitada, anulaciones y comprobantes privados versionados.
5. **3E — Validación integral, permisos, auditoría y pruebas reales.** Recorridos integrados y concurrencia; Admin/Colaborador/inactivo/anónimo, API/RLS/Storage reales, auditoría y Security Advisors; responsive 320/375/768/1024/1440; lint/typecheck/tests/build/E2E; evidencia local/simulada/real separada. No diferir la seguridad inicial hasta 3E.

Cada lote incluye pruebas locales y revisión de migración; antes de remoto: comprobar DEV conectado, comparar historial, db push --dry-run, revisar alcance, aplicar solo lote autorizado y validar RLS real/Advisors. No reset, DROP, TRUNCATE ni borrados compensatorios. No declarar pruebas reales si solo hubo simulación. Autorización vigente limitada a 3A; sin avance a 3B ni Fase 4.

#### Plan técnico detallado de 3A

- **Contrato:** tipos/validadores de encabezado, líneas, snapshots y matriz definitiva; numeric/decimal exacto y ROUND HALF UP coherente servidor/BD; entradas con escala excesiva rechazadas. Sin tipos nuevos de descuento, sin floats como fuente de cálculo.
- **Persistencia:** orders, order_items y order_files; UUID en Cotización, order_number/confirmed_at/adelanto sin asignar hasta confirmación 3B. Campos previstos para ciclo posterior pueden ser nullable bajo constraints por estado; financial_status no es columna mutable. Reutilizar clients/products/profiles/audit_log. Transacciones para edición del conjunto de líneas/totales y control de versión para evitar sobrescrituras concurrentes.
- **Operaciones:** crear/consultar/editar Cotización, líneas de catálogo/personalizadas, desactivar líneas conservando historial, cancelar Cotización con motivo. Validar activos o histórico Admin, fechas, precios/cantidades/descuentos, snapshots y propiedad de archivos. Preparar contrato de las transiciones posteriores y sus pruebas locales; no exponer confirmación, cobros ni cambio arbitrario de production_status antes de 3B.
- **Cronología y estados:** reglas RF-FIN-02 en servidor/BD; día empresarial desde America/Costa_Rica, created_at desde reloj del sistema. Metadatos de confirmación/entrega protegidos de edición directa. Tras 3B, reapertura limpia delivered_at en columna activa y audita valor anterior; retrocesos un paso/Admin; cancelación confirmada solo Admin. No insertar confirmados ficticios en DEV para probar 3A.
- **UI:** listado/búsqueda/detalle y formulario responsive, tarjetas móviles/tablas desktop, líneas personalizadas, totales, notas/referencias y alertas; loading/vacío/error, SweetAlert2 para cancelar y Sonner para guardar; Lucide, tokens, scrollbar, reduced-motion y controles táctiles del sistema visual. No dashboard de negocio.
- **Seguridad:** perfil activo en cada lectura/escritura/descarga; mutaciones por funciones autorizadas y grants mínimos; RLS sin acceso anónimo/inactivo; auditoría transaccional. Archivos de pedido privados con bytes/tamaño/tipo validados, sin sobrescritura ni borrado histórico; no crear comprobantes de gastos en 3A.

Dependencia explícita: 3A no puede validar confirmación/ciclo completo contra datos reales sin 3B. Se entregará verificable como cotizaciones y contrato de estados; los recorridos con pagos/consecutivos serán pruebas de integración de 3B y 3E. Esto no cambia reglas funcionales ni las simula en producción.

#### Migraciones y persistencia de 3A

- **Pedido y líneas:** orders/order_items, constraints/índices/FKs, validadores decimales/cronología, transacciones de Cotización, RLS/grants y triggers de auditoría. Estados definidos, escrituras directas a estados posteriores bloqueadas hasta operaciones completas de 3B.
- **Referencias privadas:** order_files y bucket/políticas para archivos de pedido, coherencia de metadatos/objeto, autorización por pedido y perfil activo, auditoría de cambios/versiones.
- Aplicadas `20260923055811_phase3a_quotes.sql` y `20260923110205_phase3a_conflict_response.sql` solo en SIGCA DEV. La segunda corrige la respuesta de revisión desactualizada a PT409/HTTP 409, sin alterar la migración anterior ni datos. order_counters/payments y confirmación pertenecen a 3B; manual_income a 3C; expenses/expense_categories/expense_files a 3D. Sin tablas de inventario, cronómetro, envíos, costeo o reportes.

Implementación: listado `/pedidos` con búsqueda por nombre histórico del cliente u observaciones, filtro Cotización/Cancelado/Todos y páginas de 25; `/pedidos/nuevo` y `/pedidos/[id]` para alta/detalle/edición. Opciones, líneas y referencias se leen por páginas para no truncar datos al límite de Data API. RPC save_quote/cancel_quote bloquean perfil/pedido, validan revisión y realizan cambios/auditoría en una transacción. Dinero como texto en JSON y bigint en vista previa; PostgreSQL numeric es autoritativo. No hay entrada ni escritura directa de totales.

Referencias JPEG/PNG/WebP hasta 5 MB y 25 megapíxeles, sin animación; validación de bytes y recodificación WebP reutilizada de Fase 2. Bucket privado order-references, rutas UUID, registro exclusivo de servidor y descarga autenticada sin caché compartida. Reemplazos conservan metadatos y objetos anteriores. Si falla el registro tras subir, el objeto queda privado sin vínculo y requiere revisión administrativa; no se elimina automáticamente. Evidencia y límites en [PHASE3A_VERIFICATION.md](PHASE3A_VERIFICATION.md).

#### Pruebas previstas para 3A

- Aritmética decimal: 0,125 → 0,13, líneas/subtotal/descuento general, límites, entradas >2 decimales rechazadas, cantidades fraccionarias/cero/negativas rechazadas. Adelanto y conversión: contrato unitario; integración real en 3B/3D.
- Cotización: creación/edición/cancelación motivada, línea personalizada, snapshots ante cambio de catálogo, entidades inactivas solo para histórico Admin, línea desactivada conserva historia y deja de sumar; sin número consumido ni pago permitido.
- Estados: matriz exhaustiva permitidos/denegados, cancelación por rol, retrocesos un paso y delivered_at; fixtures solo locales para estados posteriores, integraciones reales en 3B. Ninguna API de 3A permite eludir esa dependencia con una escritura de estado.
- Fechas: hoy/histórico/futuro, límite de medianoche Costa Rica frente a UTC, entrega solicitada pasada/futura y anterior al pedido, created_at no falsificable. Correcciones y cronología cruzada con pagos se completan realmente en 3B.
- Seguridad real: Admin/Colaborador/inactivo/anónimo en API/RLS, parámetros de actor/estado/totales manipulados, acceso a auditoría, FK/archivo ajeno o inexistente, tamaño/MIME/bytes y descarga después de inactivación. No registrar aprobaciones reales a partir de resultados con service_role que omitan RLS.
- Concurrencia y UX: ediciones simultáneas sin pérdida silenciosa, rollback y auditoría consistentes, errores/red/reintentos, loading/vacío, accesibilidad y responsive 320/375/768/1024/1440.
- Lint/typecheck/tests/build/E2E, verificación de secretos y regresión de Fases 1/2; revisión de grants/funciones/triggers/RLS/private no expuesto y Security Advisors después de aplicar el lote autorizado. Evidencia ejecutada de 3A por tipo en PHASE3A_VERIFICATION.md; pruebas de subfases posteriores continúan pendientes y fuera del alcance actual.

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

## Autorización vigente — Fase 3B

3A aprobada y cerrada para DEV en 9a73fcd. El usuario autoriza únicamente 3B: confirmación/consecutivo anual/adelanto histórico, total cero autorizado, ciclo productivo con retrocesos, pagos/anulaciones, saldo derivado, cancelación y auditoría según D-19/D-20/D-21. Esta autorización sustituye las menciones anteriores que limitaban la implementación a 3A; no modifica decisiones funcionales. No autoriza 3C/3D/3E ni fases posteriores. A51 pendiente antes de producción, sin bloquear DEV.

Excepción técnica expresa: sustituir únicamente las ocho CHECK de orders enumeradas en PHASE3B_VERIFICATION.md, con DROP CONSTRAINT ... RESTRICT y nuevas restricciones validadas en una misma transacción. Prohibición general de DROP, TRUNCATE, reset y borrados destructivos permanece. Ningún dato inválido se corrige automáticamente. Evidencia de avance y separación local/simulada/DEV en PHASE3B_VERIFICATION.md.


### Implementación efectiva de 3B

Pedidos conserva Server Components para lecturas con JWT y Server Actions con lista cerrada de operaciones para escrituras. confirm_order/register_payment/void_payment/amend_order/transition_order/correct_order_dates ejecutan la transacción en PostgreSQL; cliente nunca calcula el saldo autoritativo. Revisión compartida del pedido produce PT409 sin sobrescrituras silenciosas. order_history/order_deposit_default devuelven proyecciones acotadas. Interfaz: OrderOperations, tarjetas financieras móviles, SweetAlert2 y Sonner; detalle/listado existentes conservados. Evidencia local, simulada y DEV: PHASE3B_VERIFICATION.md. Ninguna implementación 3C/3D/3E.

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

Implementación 3D: `/gastos` aplica lectura global Admin/propia Colaborador; `/gastos/nuevo` y detalle con RLS; `/categorias-gastos` requiere Admin; `/api/expense-file/[id]` descarga autenticada y sin caché compartida. El pedido enlaza el listado filtrado, sin agregar costos ni informes. Server Actions comprueban perfil vigente; las RPC cierran transaccionalmente reglas monetarias, revisión, permisos y auditoría. Las credenciales administrativas se limitan a persistir la respuesta validada del proveedor, subir/asociar archivos validados y descargar bytes después de comprobar el permiso mediante JWT/RLS. No existen escrituras directas de negocio con service_role. Las pruebas y sus límites constan en PHASE3D_VERIFICATION.md.

### Endurecimiento técnico 3D: revocación de comprobantes
La prueba real detectó que una descarga directa del SDK podía responder desde CDN después de inactivar al usuario, aunque RLS de metadatos y el endpoint SIGCA ya denegaban acceso. Para asegurar la regla aprobada de inactivo sin acceso, los bytes de expense-receipts se sirven exclusivamente mediante /api/expense-file/[id]: perfil y metadatos con JWT/RLS vigentes, descarga de infraestructura desde servidor y respuesta no-store. La policy directa de Storage se restringe a false mediante ALTER POLICY en una migración nueva, sin DROP ni grants nuevos. Los permisos funcionales Admin/propietario no cambian. Se purga únicamente la caché de los comprobantes previos, sin eliminar ni reemplazar objetos. No se alteran otros buckets ni Auth.

## D-20 — Reclasificación administrativa aprobada (cierre de criterio 10, 3D)

Admin activo puede reclasificar un gasto `valid` mediante operación explícita con motivo obligatorio de 1–1000 caracteres. La categoría destino debe existir, estar activa y ser distinta de la actual. Colaborador no puede reclasificar. Gasto `voided`, revisión obsoleta y UPDATE directo del cliente se rechazan. RPC transaccional con bloqueo de gasto y control de revisión; evento `expense.category_changed` conserva before/after, actor, timestamp y motivo.

Solo cambia category_id y metadatos técnicos de actualización/revisión. Se conservan monto, moneda, tasa y su fecha/procedencia/evidencia, equivalente CRC, expense_date, pedido, línea, creador, created_at y comprobantes. No se recalcula una tasa ni se anula el gasto. Una categoría desactivada posteriormente conserva sus referencias históricas. Para futuros reportes se utilizará la categoría vigente corregida; la auditoría conserva todas las reclasificaciones. Esta decisión completa D-20: clasificación corregible solo por Admin, campos financieros inmutables. No autoriza reportes ni Fase 3E.


## Fase 3E — Auditoría integral y entrega privada de imágenes

El usuario autorizó validar 3A–3D como conjunto y corregir defectos técnicos dentro de reglas aprobadas, sin nuevos módulos ni Fase 4. Esto sustituye las limitaciones temporales de autorización de secciones anteriores. No modifica D-19/D-20/D-21.

La migración 20261001235914_phase3e_private_image_delivery.sql extiende a order-references y catalog-images el aislamiento de bytes aplicado en 3D a expense-receipts. Ambas policies SELECT de Storage quedan USING(false). Los endpoints /api/order-file/[id] y /api/catalog-image/[id] comprueban perfil y metadatos con JWT/RLS vigentes antes de descargar bytes mediante infraestructura exclusiva del servidor, cacheNonce único y fetch no-store. Se conservan permisos funcionales, metadatos, versiones y objetos; no se entregan URLs portadoras ni claves administrativas. Subidas con rutas nuevas, upsert=false y cacheControl=0. Se invalidó únicamente la caché anterior. Evidencia de la reproducción y pruebas en PHASE3E_VERIFICATION.md.


## D-22 — Arquitectura de Fase 4 y alcance documental vigente

Fase 3 cerrada para desarrollo. D-22 incorpora B4-01 a B4-14 sin reescribir D-01 a D-21. Esta entrega solo documenta y propone 4A; no autoriza código, migraciones ni cambios remotos. El detalle funcional íntegro está en DECISIONS.md; requisitos trazados en RF-INV-07/13, RF-HOR-13/16 y RF-ENV-06/09.

### Orden aprobado

1. **4A:** inventario base, compras/entradas, promedio ponderado móvil y existencias. Cabecera/líneas de recepción con valoración histórica y vínculo opcional a gasto; no generación financiera automática.
2. **4B:** consumos, devoluciones y correcciones por compensación. Depende del orden de movimientos y valoración de 4A; no editar historia. Consumos/devoluciones de Colaborador según D-22, costos inaccesibles.
3. **4C:** sesiones/pausas, varios trabajadores por pedido, una sesión abierta por usuario, tarifa al iniciar, correcciones históricas Admin. Integrar bloqueos de transiciones 3B cuando haya sesiones abiertas; no cierres automáticos.
4. **4D:** envío único, retiro con recorrido propio, snapshots de dirección/fechas, cancelación terminal y correcciones Admin. expenses como fuente del costo business; no pagos ni gastos automáticos ni entrega silenciosa del pedido.
5. **4E:** auditoría integral y cierre con evidencia local/simulada/DEV diferenciada.

### Separación de responsabilidades

- Diario inmutable de movimientos como fuente de verdad; saldo y promedio actuales como proyecciones reconstruibles bajo bloqueo transaccional. No FIFO/lotes. Snapshot de unidad desde primer movimiento y bloqueo de edición ordinaria.
- Cantidad decimal hasta cuatro posiciones; costo unitario derivado hasta ocho; monto final HALF UP a dos. Conversión conserva tasa completa y procedencia histórica; catálogo material_costs nunca revalora movimientos.
- Cabecera/líneas permiten varios materiales por factura. Referencia opcional expenses sin automatizar desembolso, stock, anulaciones ni compensaciones cruzadas. Identidad de fuentes disponible para Fase 5.
- Datos operativos separados físicamente de costos/tasas para impedir fugas a Colaborador por SELECT, filtros, vistas, RPC y errores. Admin exclusivo en entradas valoradas y saldos iniciales; Colaborador de 4A solo lectura operativa.
- Mutación autorizada en servidor/BD, RPC atómica, perfil vigente, bloqueo compartido por material y revisión/idempotencia. Auditoría dentro de la misma transacción. Migraciones nuevas, no editar aplicadas.
- Cronómetro usa instantes persistidos, segundos netos y tarifa congelada al inicio. Finalizar desde pausa descuenta intervalo abierto; acciones sin conexión no confirmadas. Históricos Admin no solapados, sin tarifa actual implícita.
- Envíos independientes del estado del pedido; avanzar/despachar/entregar valida D-22 y cualquier acción explícita sobre pedido valida 3B. Dirección snapshot; archivos específicos de envío no añadidos por esta decisión.

Esquema exacto propuesto, algoritmo, seguridad, UI, pruebas y migraciones futuras exclusivamente 4A en [PHASE4A_PREFLIGHT.md](PHASE4A_PREFLIGHT.md). Allí se distinguen precisiones pendientes de propuestas técnicas; no presentarlas como reglas aprobadas. A51, aislamiento de order_counters y observaciones Performance conservan el tratamiento del cierre de Fase 3.


## D-22 — Concreciones finales P4A y autorización exclusiva 4A

P4A-01/02/03 resueltas (texto íntegro en DECISIONS.md). Cantidad hasta 4 decimales; costos/promedio internos hasta 8 con HALF UP; importes de entrada/finales hasta 2; solo numeric/decimal. Mantener valor interno CRC hasta 8 decimales como base: valor_nuevo = valor_anterior + total_CRC_entrada; cantidad_nueva = cantidad_anterior + cantidad_entrada; promedio_nuevo = HALF_UP(valor_nuevo/cantidad_nueva,8). No reconstruir valor multiplicando promedio redondeado por cantidad. Costo unitario entrada = HALF_UP(total_CRC/cantidad,8). Residuo privado = total_CRC - cantidad × costo_unitario; evidencia decimal, nunca gasto/ingreso/movimiento ni cambio del original. Rechazar costo positivo que colapse a cero a ocho decimales.

Compra/saldo inicial: cantidad, total original, equivalente CRC y costo unitario estrictamente positivos; cero explícito/implícito y negativos prohibidos. Sin entradas gratuitas en V1. USD reutiliza exactamente contrato de gastos: referencia actual o fallback válido fechado/advertido; sin referencia previa se bloquea; histórico exige tasa exacta o aporte Admin con motivo/actor/timestamp/procedencia inequívoca. Snapshot completo inmutable; catálogo/tasa futura no recalculan historia.

Saldo inicial Admin/motivo, solo si no existe ningún movimiento previo del material; una sola operación inicial. Congelar unidad en servidor/BD; multilínea atómica con bloqueos determinísticos, revisión y UUID estable, sin actualizaciones perdidas. Separar costos de historial operativo. Auditoría completa y vínculo opcional expenses sin automatismos. Alerta stock <= mínimo derivada.

Tras commit documental se autoriza exclusivamente implementar 4A y sus pruebas locales/simuladas/DEV reales, sin 4B–4E ni tag final. Esquema actualizado en PHASE4A_PREFLIGHT.md; evidencia de ejecución se registrará en PHASE4A_VERIFICATION.md. No cambiar D-01 a D-21 ni historia.

### Implementación efectiva 4A (2026-10-02)

Ruta `/inventario`: listado paginado/búsqueda y mínimos; `/inventario/[id]`: diario operativo y valoración solo Admin; `/inventario/nueva`: compra/apertura multilínea; `/inventario/recepciones` y su detalle: evidencia financiera Admin. Server Actions en features/inventory validan sesión/permisos y delegan la transacción a register_inventory_receipt/link_inventory_expense. El resolver de tasas existente de gastos conserva su contrato y proveedor; no se replica una política cambiaria distinta.

La UI conserva UUID y campos después de errores, bloquea reenvío mientras recarga revisión y usa SweetAlert2/Sonner. RLS separa datos financieros de movimientos operativos antes de responder al navegador. El catálogo consulta si existe primer movimiento para explicar la unidad congelada; el trigger mantiene la restricción ante API directa.

Checkpoint 6679da3 y evidencia en [PHASE4A_VERIFICATION.md](PHASE4A_VERIFICATION.md). Sin dependencias nuevas, Auth/Storage nuevos ni funcionalidades 4B–4E. La implementación queda para revisión sin tag final.

## D-23 — Diseño técnico 4B, todavía sin implementación

Resolución íntegra en DECISIONS.md D-23; requisitos RF-INV-14..21. D-23 prevalece sobre las frases históricas D-22 relativas a promedio restante constante y devolución valorada solo como cantidad por costo unitario. 4A cerrada en aec1fb6; preservar sus snapshots/migraciones. Esta autorización es exclusivamente documental e inspección SELECT, sin DDL ni código de aplicación.

Reutilizar diario, costos privados y proyecciones de 4A. El delta interno D/R a 8 decimales es autoritativo; snapshot A y diferencia exacta hasta 12 posiciones son evidencia. Consumo parcial distribuye V*q/Q con HALF UP y recalcula promedio restante; agotamiento deja Q=V=0. Devolución reparte valor aún retornable y absorbe remanente al completar cantidad. Algoritmos completos en D-23 y PHASE4B_PREFLIGHT. No consultar material_costs para reconstruir historia.

RPC atómicas propuestas para consumir, devolver, ajustar, corregir cantidad, corregir atribución y revertir línea/recepción. Bloqueos compatibles con 4A/3B: perfil vigente, pedidos en orden UUID cuando haya varios, materiales en orden UUID, proyecciones y movimientos origen. Revalidar revisiones, estado actual, stock, acumulados retornables, UUID/idempotencia y cronología bajo bloqueo. Conflicto PT409; no reintento automático silencioso. Transiciones 3B y consumo comparten lock del pedido, sin inventar devolución automática al cancelar.

La corrección de atribución necesita evidencia relacional separada e inmutable, revisión y auditoría; no movimientos físicos ni alteración financiera. Vistas futuras resuelven atribución vigente, preservando cadena anterior. Retorno/corrección posterior referencia origen y motivo; no permiso general de consumo en estados cerrados. Reversión de recepción completa opcional requiere validar todas sus líneas antes de compensar cualquiera.

No ampliar inventory_actor() de 4A: permanece Admin para recepción y vínculo a gasto. Nuevo helper para operaciones autorizadas de Colaborador, perfil vigente; no metadata editable. Separación física de costos, grants mínimos, wrappers invoker y operaciones privadas cuando requieran privilegios, search_path vacío, RLS; sin datos financieros en HTML/RSC/payload operativo ni errores. Inactivo/anónimo cero acceso.

UI futura desde pedido/línea activa: consumo, remanente retornable, historial con atribución corregida; Admin ajustes/reversión y evidencia financiera separada. Loading/vacío/error/409/red, conservar formulario/UUID, SweetAlert2 crítico y Sonner éxito. Cinco anchos 320/375/768/1024/1440, tarjetas móviles, Lucide, tokens, controles 44 px y reduced-motion.

Inspección exacta de seis CHECK y tres NOT NULL, cambios aditivos, función de recepción y preflight DEV en [PHASE4B_PREFLIGHT.md](PHASE4B_PREFLIGHT.md). No autorización DROP CONSTRAINT ni migraciones. Mantener A51, aislamiento order_counters e INFO Performance; sin avance 4C/4D/4E.
