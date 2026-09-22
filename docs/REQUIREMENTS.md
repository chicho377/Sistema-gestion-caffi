# REQUIREMENTS.md

# Mini Sistema para Emprendimiento de Crochet

## 1. Objetivo

Desarrollar una aplicación web de gestión para un emprendimiento de crochet que permita administrar:

- clientes;
- productos;
- pedidos;
- pagos;
- ingresos;
- gastos;
- materiales;
- empaques;
- impresiones;
- envíos;
- horas de trabajo;
- costeo;
- rentabilidad.

La aplicación debe estar disponible mediante Internet, utilizar Supabase como plataforma de base de datos y servicios asociados, contar con autenticación segura y desplegarse mediante Vercel.

La persona administradora debe poder conocer en todo momento:

- qué pedidos existen;
- cuánto ha pagado cada cliente;
- cuánto falta por cobrar;
- cuánto dinero ha ingresado;
- cuánto se ha gastado;
- qué materiales están disponibles;
- cuánto tiempo se ha invertido en cada proyecto;
- costo real;
- margen;
- ganancia.

## 2. Alcance general

- Aplicación web 100 % responsive y mobile-first.
- Misma funcionalidad en celular, tablet y computadora.
- Acceso privado mediante login.
- Recuperación de contraseña por correo utilizando Google SMTP configurado para el proyecto.
- Supabase PostgreSQL para persistencia.
- Supabase Auth para autenticación.
- Supabase Storage para imágenes y comprobantes cuando corresponda.
- Despliegue con Vercel.
- Protección de credenciales y variables sensibles.
- Gestión integral del ciclo de cada pedido.

## 3. Arquitectura tecnológica requerida

| Componente | Tecnología / propósito |
|---|---|
| Aplicación web | Interfaz web 100 % responsive y mobile-first |
| Base de datos | Supabase PostgreSQL |
| Autenticación | Supabase Auth |
| Archivos | Supabase Storage |
| Correo | Google SMTP para recuperación de contraseña |
| Despliegue | Vercel |
| Seguridad | HTTPS, RLS, validaciones, protección de secretos |

## 4. Módulos

| Módulo | Función | Prioridad |
|---|---|---|
| Autenticación y usuarios | Login, sesión, recuperación, control de acceso | Crítica |
| Clientes | Registro, contacto e historial | Alta |
| Productos | Catálogo, fotografías, materiales | Alta |
| Pedidos / Ventas | Gestión completa del pedido | Alta |
| Pagos e Ingresos | Dinero efectivamente recibido | Alta |
| Gastos | Registro y clasificación | Alta |
| Control de horas | Cronómetro por pedido | Alta |
| Costeo y rentabilidad | Costo real, margen y ganancia | Alta |
| Configuración | Parámetros generales | Alta |
| Inventario | Materiales, empaques e insumos | Media |
| Envíos / Entregas | Entrega y seguimiento | Media |
| Dashboard | Resumen de negocio | Media |
| Reportes | Consultas y exportaciones | Media |
| Auditoría | Trazabilidad | Media |

## 5. Requerimientos funcionales

### 5.1 Autenticación y usuarios

**RF-AUT-01 — Inicio de sesión**  
Solicitar correo electrónico y contraseña antes de permitir acceso a módulos internos.

**RF-AUT-02 — Validación de credenciales**  
Validar mediante Supabase Auth. Si son correctas, redirigir al Dashboard. Si no, mostrar mensaje genérico de acceso inválido.

**RF-AUT-03 — Protección de rutas**  
Ninguna pantalla interna ni información empresarial puede quedar disponible para un usuario no autenticado.

**RF-AUT-04 — Manejo de sesión**  
Mantener la sesión mientras sea válida. Si expira o es invalidada, redirigir a login.

**RF-AUT-05 — Cerrar sesión**  
Permitir cerrar sesión desde la interfaz.

**RF-AUT-06 — Recuperación de contraseña**  
El login debe incluir “¿Olvidaste tu contraseña?”.

**RF-AUT-07 — Correo de recuperación**  
Supabase Auth inicia el proceso y Google SMTP envía el mensaje.

**RF-AUT-08 — Restablecimiento**  
El enlace dirige a una pantalla para ingresar y confirmar nueva contraseña.

**RF-AUT-09 — Vigencia**  
El enlace debe tener vigencia limitada y ser validado antes del cambio.

**RF-AUT-10 — Confirmación**  
Al actualizar la contraseña, mostrar confirmación y regresar al login.

**RF-USR-01 — Usuarios autorizados**  
Administrar nombre, correo, estado, rol, fecha de creación y, cuando sea posible, último acceso.

**RF-USR-02 — Estado**  
Activo / Inactivo. Usuario inactivo no puede ingresar.

**RF-USR-03 — Roles**  
Como mínimo: Administrador y Colaborador.

### 5.2 Clientes

**RF-CLI-01 — Mantenimiento**  
Crear, editar, consultar y desactivar clientes.

**RF-CLI-02 — Datos**  
Nombre, teléfono/WhatsApp, correo, dirección, ubicación y notas.

**RF-CLI-03 — Validaciones**  
Validar formato de correo y teléfonos apropiados para el uso del emprendimiento.

**RF-CLI-04 — Historial**  
Consultar pedidos, total comprado, total pagado, saldo pendiente y última compra.

**RF-CLI-05 — Conservación**  
Clientes con historial no se eliminan físicamente; se desactivan.

### 5.3 Productos

**RF-PRO-01 — Catálogo**  
Crear, editar, consultar y desactivar productos.

**RF-PRO-02 — Información**  
Código/SKU único, nombre, categoría, descripción, precio base, tiempo estimado y estado.

**RF-PRO-03 — Personalización**  
Indicar si el producto puede personalizarse y registrar observaciones.

**RF-PRO-04 — Materiales**  
Relacionar materiales normalmente utilizados.

**RF-PRO-05 — Fotografías**  
Imagen principal y fotografías de referencia almacenadas de forma segura.

**RF-PRO-06 — Duplicación**  
Permitir duplicar un producto para crear variantes.

### 5.4 Pedidos / Ventas

**RF-PED-01 — Creación**  
Crear pedidos asociados a un cliente con número único, por ejemplo `PED-2026-00001`.

**RF-PED-02 — Detalle**  
Registrar:

- fecha del pedido;
- fecha de entrega solicitada por el cliente;
- producto;
- cantidad;
- personalización;
- precio unitario;
- descuentos;
- precio total.

**RF-PED-03 — Días restantes**  
Calcular automáticamente días calendario restantes a la fecha solicitada.

**RF-PED-04 — Advertencia preventiva**  
Cuando falten 7 o 6 días, mostrar amarillo con “Próximo a entregar” y días restantes.

**RF-PED-05 — Advertencia crítica**  
Cuando falten 5 días o menos, mostrar rojo con “Entrega próxima” y días restantes.

**RF-PED-06 — Pedido vencido**  
Si la fecha pasó y el pedido no está Entregado ni Cancelado, mostrar rojo, “Atrasado” y días de atraso.

**RF-PED-07 — Visualización de alertas**  
Mostrar alertas en:

- listado de pedidos;
- detalle del pedido;
- dashboard.

No depender solo del color. Incluir texto y/o icono. Ocultar alerta al Entregar o Cancelar.

**RF-PED-08 — Adelanto**  
Registrar porcentaje y monto de adelanto solicitado/recibido. Valor habitual configurable: 50 %.

**RF-PED-09 — Saldo**  
Saldo = total del pedido - pagos válidos recibidos.

**RF-PED-10 — Pagos posteriores**  
Permitir múltiples pagos hasta completar el total.

**RF-PED-11 — Notas y referencias**  
Notas, instrucciones especiales y fotografías.

**RF-PED-12 — Relaciones**  
Vincular con pagos, gastos, horas trabajadas, materiales y envío.

**RF-PED-13 — Estado productivo**  
Estados:

- Cotización
- Confirmado
- En producción
- Listo
- Entregado

**RF-PED-14 — Estado financiero**  
Estados independientes:

- Sin adelanto
- Parcialmente pagado
- Pagado

**RF-PED-15 — Cancelación**  
Permitir cancelar conservando historial y motivo.

### 5.5 Pagos e ingresos

**RF-PAG-01 — Registro de pago**  
Guardar pedido, cliente, fecha, monto, tipo, método, referencia y observaciones.

**RF-PAG-02 — Métodos**  
Efectivo, SINPE Móvil, Transferencia, Tarjeta y Otro.

**RF-PAG-03 — Múltiples pagos**  
Un pedido puede recibir varios pagos.

**RF-PAG-04 — Anulación**  
Un pago incorrecto se anula con motivo y trazabilidad; no se elimina definitivamente.

**RF-ING-01 — Ingresos**  
Registrar ingresos manuales y automáticos cuando se reciba dinero. Diferenciar ingreso de venta no cobrada.

**RF-ING-02 — Clasificación**  
Adelanto, pago final, venta de producto, tarjetas, stickers u otros.

**RF-ING-03 — Información**  
Fecha, monto, método, descripción y pedido relacionado cuando corresponda.

### 5.6 Gastos

**RF-GAS-01 — Registro**  
Fecha, monto, descripción, categoría, método de pago.

**RF-GAS-02 — Categorías**  
Materiales, empaques, impresiones, envíos, herramientas, publicidad, comisiones bancarias y otros.

**RF-GAS-03 — Relación**  
Permitir relación con pedido.

**RF-GAS-04 — Proveedor / comprobante**  
Proveedor opcional y comprobante opcional.

**RF-GAS-05 — Anulación**  
Gastos históricos se anulan, no se destruyen.

### 5.7 Inventario

**RF-INV-01 — Existencias**  
Controlar hilo, lana, relleno, ojos de seguridad, accesorios, cajas, bolsas, stickers, tarjetas, etiquetas, papel de regalo y otros.

**RF-INV-02 — Material**  
Código, nombre, categoría, unidad, cantidad disponible, costo unitario y nivel mínimo.

**RF-INV-03 — Movimientos**  
Entradas, consumos, ajustes positivos, ajustes negativos y devoluciones.

**RF-INV-04 — Trazabilidad**  
Fecha, cantidad, costo cuando corresponda, motivo, pedido y usuario.

**RF-INV-05 — Actualización automática**  
El stock se calcula a partir de movimientos. No modificar existencias sin movimiento.

**RF-INV-06 — Stock bajo**  
Mostrar alerta cuando se llegue o baje del mínimo.

### 5.8 Envíos / Entregas

**RF-ENV-01 — Tipo**  
Retiro, envío o entrega personal.

**RF-ENV-02 — Mensajería**  
Registrar empresa o servicio cuando corresponda.

**RF-ENV-03 — Costo**  
Registrar costo e indicar si paga cliente o negocio.

**RF-ENV-04 — Seguimiento**  
Dirección, fecha, número de guía, observaciones.

**RF-ENV-05 — Estados**  
Pendiente, Preparando, Enviado, Entregado.

### 5.9 Control de horas

**RF-HOR-01 — Cronómetro por pedido**  
Todo pedido/proyecto en producción debe mostrar tiempo acumulado.

**RF-HOR-02 — Controles**  
Iniciar, Pausar, Reanudar y Finalizar. Botones grandes y táctiles.

**RF-HOR-03 — Inicio**  
Al iniciar, crear sesión vinculada al pedido con fecha, hora y usuario.

**RF-HOR-04 — Pausa**  
Tiempo de pausa no cuenta como trabajo.

**RF-HOR-05 — Finalización**  
Cerrar sesión, calcular duración neta, sumar al total del pedido.

**RF-HOR-06 — Persistencia**  
El tiempo no depende de mantener la pantalla abierta. Estado y marcas de tiempo persisten en Supabase.

**RF-HOR-07 — Sesión activa única**  
Un usuario no mantiene dos cronómetros activos simultáneamente.

**RF-HOR-08 — Indicador persistente**  
Mostrar pedido activo y tiempo transcurrido desde otras pantallas internas, especialmente en móvil.

**RF-HOR-09 — Historial**  
Fecha, hora inicio, hora final, pausas, duración neta, actividad y usuario.

**RF-HOR-10 — Ajuste manual**  
Permitir corrección con motivo y registro en auditoría.

**RF-HOR-11 — Actividad opcional**  
Ejemplos: tejido, ensamblaje, acabados, empaque.

**RF-HOR-12 — Costeo**  
Tiempo efectivo alimenta costo de mano de obra según valor/hora configurado.

### 5.10 Costeo y rentabilidad

**RF-COS-01** Valor de hora configurable.  
**RF-COS-02** Costo de mano de obra automático.  
**RF-COS-03** Considerar materiales, empaque, impresiones, mano de obra, envío asumido y otros.  
**RF-COS-04** Calcular costo total real.  
**RF-COS-05** `Ganancia = Precio de venta - Costo real`.  
**RF-COS-06** `Margen (%) = Ganancia / Precio de venta × 100`.  
**RF-COS-07** Ganancia por hora cuando existan datos.  
**RF-COS-08** Comparar tiempo estimado vs. tiempo real.

### 5.11 Dashboard

**RF-DAS-01 — Indicadores**

- ventas;
- ingresos recibidos;
- gastos;
- ganancia;
- saldo pendiente.

**RF-DAS-02 — Operación**

- pedidos en producción;
- próximos a entregar;
- atrasados;
- envíos pendientes;
- stock bajo.

Debe respetar alertas amarillas/rojas de Pedidos.

**RF-DAS-03** Horas trabajadas.  
**RF-DAS-04** Gráficos: ingresos vs. gastos, gastos por categoría, ventas por producto, evolución mensual.  
**RF-DAS-05** Filtros: Hoy, Semana, Mes, Año, rango personalizado.

### 5.12 Configuración

**RF-CON-01** Nombre del negocio, logo, teléfono, correo, moneda.  
**RF-CON-02** Porcentaje habitual de adelanto y formato de número de pedido.  
**RF-CON-03** Valor/hora y otros parámetros de costeo.  
**RF-CON-04** Stock mínimo por material.

### 5.13 Reportes

- Ventas por período.
- Ingresos.
- Gastos y categorías.
- Ganancias y margen.
- Pedidos por estado.
- Saldos pendientes.
- Horas por período/pedido/producto.
- Rentabilidad por producto/proyecto.
- Inventario y stock bajo.
- Exportación prioritaria a Excel y/o PDF.

### 5.14 Auditoría

**RF-AUD-01** Registrar acciones relevantes.  
**RF-AUD-02** Como mínimo: creación/modificación de pedidos, pagos, anulaciones, gastos, ajustes de inventario, cambios de configuración.  
**RF-AUD-03** Guardar usuario, fecha/hora, acción y registro afectado.

## 6. Reglas de negocio

- Saldo pendiente = total del pedido - suma de pagos válidos.
- Adelanto configurable; 50 % inicial habitual.
- Ingreso significa dinero efectivamente recibido.
- Diferenciar envío pagado por cliente vs. asumido por negocio.
- Horas asociadas a pedido/proyecto.
- Valor por hora configurable.
- Costo real incluye componentes aplicables.
- Movimientos de inventario actualizan existencias.
- Estado productivo y financiero se manejan por separado.
- Registros financieros/históricos deben anularse o desactivarse cuando corresponda.
- Montos negativos no permitidos salvo operación explícita y controlada.
- Cada pedido conserva identificador único y estable.

## 7. Ejemplo de cálculo

Pedido: ₡35.000  
Adelanto 50 %: ₡17.500  
Saldo: ₡17.500  
Materiales: ₡6.000  
Empaque: ₡1.000  
Impresiones: ₡500  
Tiempo: 6 h 30 min  
Valor/hora: ₡3.000  
Mano de obra: ₡19.500  
Costo total: ₡27.000  
Ganancia: ₡8.000  
Margen aproximado: 22,86 %  
Ganancia por hora aproximada: ₡1.230,77

## 8. Seguridad

- RLS en tablas sensibles.
- Usuario anónimo no consulta, modifica ni elimina datos empresariales.
- `service_role` nunca en frontend.
- Secretos en variables de entorno.
- Contraseñas gestionadas por Supabase Auth.
- Credenciales SMTP nunca en frontend/repositorio público.
- Validación de formularios.
- Producción mediante HTTPS.

## 9. Requerimientos no funcionales

**RNF-001** Usabilidad sencilla e intuitiva.  
**RNF-002** 100 % responsive, misma capacidad funcional.  
**RNF-003** Cálculos automáticos.  
**RNF-004** Mantener historial.  
**RNF-005** Integridad de datos.  
**RNF-006** Acceso por Internet sujeto a disponibilidad de servicios.  
**RNF-007** Rendimiento fluido para volumen de emprendimiento pequeño.  
**RNF-008** Documentar respaldo/recuperación antes de producción.  
**RNF-009** Exportación prioritaria Excel/PDF.  
**RNF-010** Parámetros frecuentes configurables, no hardcodeados.  
**RNF-011** Mobile-first.  
**RNF-012** Reflujo desde aproximadamente 320 px.  
**RNF-013** Interacción táctil, no depender de hover.  
**RNF-014** Componentes adaptativos.  
**RNF-015** Pruebas responsive en celular/tablet/escritorio y orientaciones cuando corresponda.

## 10. Despliegue

- Vercel con URL pública protegida por autenticación.
- Variables de entorno fuera del repositorio.
- Exponer al cliente solo variables públicas estrictamente necesarias.
- Secretos privilegiados solo en servidor.
- Configurar correctamente URLs de autenticación para desarrollo y producción.
- Mantener separación desarrollo/pruebas vs. producción cuando sea posible.

## 11. Flujo de recuperación de contraseña

1. Usuario selecciona “¿Olvidaste tu contraseña?”.
2. Ingresa correo.
3. Supabase Auth valida y genera enlace.
4. Google SMTP envía correo.
5. Usuario abre enlace.
6. Ingresa nueva contraseña y confirmación.
7. Sistema valida, actualiza y confirma.
8. Usuario vuelve al login.

## 12. Resultado esperado

Una sola aplicación web segura y 100 % responsive, con misma capacidad funcional desde celular, tablet y computadora, autenticación, recuperación por correo, datos centralizados en Supabase y despliegue en Vercel.

Al finalizar la primera versión funcional, la persona administradora debe conocer con claridad pedidos, avance, pagos, saldos, ingresos, gastos, inventario, horas, costo, margen y ganancia real.
