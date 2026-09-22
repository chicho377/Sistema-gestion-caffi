# AGENTS.md

## Proyecto

Este repositorio contiene una aplicación web de gestión para un emprendimiento de crochet.

La aplicación administra clientes, productos, pedidos, pagos, ingresos, gastos, inventario, envíos, control de horas, costeo, rentabilidad, reportes, configuración y auditoría.

La aplicación debe ser segura, 100 % responsive y mobile-first, utilizar Supabase como plataforma de datos/autenticación/archivos y desplegarse mediante Vercel.

## Fuente de verdad

Antes de escribir o modificar código, leer en este orden:

1. `docs/REQUIREMENTS.md`
2. `docs/DESIGN_SYSTEM.md`
3. `docs/ARCHITECTURE.md`
4. `docs/DATABASE.md`

Los PDF originales se conservan en `/reference` únicamente como respaldo y referencia visual.

Si una instrucción técnica entra en conflicto con un requerimiento funcional o regla visual, NO resolver el conflicto silenciosamente. Explicar el conflicto y pedir autorización antes de modificar el comportamiento esperado.

## Reglas obligatorias

- No inventar requerimientos.
- No eliminar, simplificar ni cambiar funcionalidades existentes sin autorización.
- No introducir reglas de negocio nuevas sin documentarlas.
- Si una decisión no está respaldada por los documentos, proponerla claramente como decisión técnica.
- Mantener trazabilidad entre requisito, interfaz y modelo de datos.
- Evitar borrados destructivos de información histórica o financiera.
- Mantener validación tanto en cliente como en servidor/base de datos cuando corresponda.
- Proteger secretos, credenciales y claves administrativas.
- No exponer `service_role` de Supabase en el navegador.
- Aplicar Row Level Security (RLS) en tablas sensibles.
- No almacenar contraseñas manualmente en tablas de la aplicación.
- No colocar credenciales SMTP en HTML, JavaScript cliente ni archivos públicos del repositorio.

## Stack acordado

- Next.js
- TypeScript
- Tailwind CSS
- Supabase PostgreSQL
- Supabase Auth
- Supabase Storage
- Vercel

Las librerías visuales permitidas/recomendadas están definidas en `docs/DESIGN_SYSTEM.md`.

## Responsive y UX

La aplicación es mobile-first y debe mantener la misma capacidad funcional en celular, tablet y computadora.

Requisitos mínimos:

- Funcionar desde aproximadamente 320 px de ancho.
- No generar scroll horizontal de página.
- Permitir scroll horizontal únicamente dentro de componentes excepcionales que realmente lo requieran.
- En móvil, transformar tablas complejas en tarjetas o filas apiladas.
- Acciones táctiles esenciales con área aproximada mínima de 44 × 44 px.
- Inputs con tamaño de fuente mínimo de 16 px en móvil.
- No depender de `hover` para acciones esenciales.
- Modales complejos deben adaptarse a bottom sheets o paneles de ancho completo en móvil cuando sea más usable.
- Probar móvil, tablet y escritorio antes de dar una funcionalidad por terminada.

## Diseño visual

Seguir estrictamente `docs/DESIGN_SYSTEM.md`.

Colores base:

- `#FFD6E4`
- `#DD0675`
- `#A70459`
- `#FFF0F6`
- `#FFF9FB`
- `#5C2441`
- `#342B31`
- `#746873`
- `#E9D5DF`
- `#2F9E6D`
- `#FFD166`
- `#D92D47`

Tipografías:

- Poppins: interfaz y contenido.
- Coiny: display/títulos especiales.
- Chewy: acento artesanal, uso moderado.

Iconografía:

- Usar Lucide Icons como familia principal.
- No usar emojis nativos como iconos de interfaz.
- Mantener consistencia de tamaño, stroke y color.

Scrollbar:

- Cuando sea visible y el navegador lo permita, usar scrollbar personalizado coherente con la identidad.
- Thumb principal `#DD0675`, hover `#A70459`, track `#FFF0F6`.
- No ocultar scrollbars cuando su visibilidad ayude a descubrir contenido.

## Animaciones y feedback

La interfaz debe sentirse viva sin distraer.

- Animaciones breves y funcionales.
- Respetar `prefers-reduced-motion`.
- No usar animaciones decorativas infinitas en dashboards, tablas o formularios.
- Usar SweetAlert2 para confirmaciones/adventencias críticas.
- Usar toast para guardados y confirmaciones no bloqueantes.
- No usar modales para cada acción exitosa.

## Pedidos

Los pedidos son el centro operativo del sistema.

Todo pedido debe conservar:

- identificador único;
- cliente;
- fecha del pedido;
- fecha de entrega solicitada por el cliente;
- detalle de productos;
- cantidades;
- personalización;
- precios;
- descuentos;
- total;
- pagos;
- saldo;
- estado productivo;
- estado financiero;
- notas/referencias;
- relación con gastos, horas, materiales y envío.

Alertas por fecha solicitada:

- Más de 7 días: sin alerta.
- 7 o 6 días: amarillo, “Próximo a entregar”.
- 5 días o menos: rojo, “Entrega próxima”.
- Fecha vencida: rojo, “Atrasado X días”.
- Entregado o Cancelado: retirar alerta de vencimiento.

Las alertas deben aparecer en listado, detalle y dashboard y nunca depender únicamente del color.

## Cronómetro de trabajo

Cada pedido/proyecto en producción debe permitir:

- Iniciar.
- Pausar.
- Reanudar.
- Finalizar.

Reglas:

- El tiempo de pausa no cuenta como trabajo.
- El estado del cronómetro debe persistir en Supabase.
- Cambiar de página, bloquear el teléfono, cerrar el navegador o volver a iniciar sesión no debe perder el tiempo acumulado.
- Un usuario no puede tener dos cronómetros activos simultáneamente.
- Debe existir indicador global discreto cuando haya una sesión activa.
- Debe existir historial por pedido.
- Ajustes manuales deben exigir motivo y quedar en auditoría.
- El tiempo neto se utiliza para costear mano de obra.

## Datos financieros e históricos

- Venta no es lo mismo que ingreso recibido.
- Un pedido puede tener múltiples pagos.
- Saldo = total del pedido - pagos válidos recibidos.
- Pagos y gastos incorrectos deben anularse con trazabilidad, no borrarse sin registro.
- Estados productivo y financiero del pedido son independientes.
- El costo real puede incluir materiales, empaque, impresiones, mano de obra, envío asumido y otros gastos.

## Flujo de trabajo para Codex

Antes de modificar un módulo:

1. Leer el requisito relacionado.
2. Revisar las reglas UI/UX aplicables.
3. Revisar las tablas y relaciones afectadas.
4. Identificar riesgos de seguridad/RLS.
5. Proponer cambios de esquema si son necesarios.
6. Implementar.
7. Probar estados:
   - loading;
   - vacío;
   - éxito;
   - error;
   - permisos;
   - móvil;
   - tablet;
   - escritorio.
8. Verificar que no se rompió otro módulo.

## Criterio de terminado

Una funcionalidad NO se considera terminada hasta que:

- Cumple los requerimientos.
- Es 100 % responsive.
- Tiene validaciones.
- Maneja errores.
- Respeta el sistema visual.
- Tiene estados de carga y vacío cuando correspondan.
- Respeta RLS y seguridad.
- No expone secretos.
- Mantiene trazabilidad.
- Fue probada en tamaños representativos de celular, tablet y escritorio.

## Cambios de alcance

Si se solicita una función nueva:

1. Actualizar primero la documentación correspondiente.
2. Identificar cambios de base de datos.
3. Identificar cambios de seguridad/RLS.
4. Implementar después.

No convertir una sugerencia en requisito obligatorio sin aprobación explícita.
