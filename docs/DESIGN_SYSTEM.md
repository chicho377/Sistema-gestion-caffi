# DESIGN_SYSTEM.md

# Estándares de Diseño UI/UX

## 1. Personalidad visual

La experiencia debe sentirse:

- cálida;
- artesanal;
- moderna;
- intuitiva;
- consistente;
- alegre;
- profesional.

Principios:

- La decoración nunca debe dificultar una acción.
- La identidad debe recordar un producto hecho a mano.
- Datos financieros y operativos deben verse claros y confiables.
- Toda pantalla se diseña primero para celular.
- Colores, radios, sombras, iconos, espaciados y animaciones deben mantener consistencia.
- La acción principal debe ser evidente rápidamente.
- No depender solo del color.
- Evitar saturación visual.
- Priorizar pedidos, fechas, saldos, tiempos y acciones sobre adornos.

## 2. Paleta

| Token | HEX | Uso |
|---|---|---|
| Soft | `#FFD6E4` | Fondos suaves, chips, áreas decorativas |
| Primary | `#DD0675` | Acción principal, selección, foco |
| Primary dark | `#A70459` | Hover, estados activos |
| Surface pink | `#FFF0F6` | Tarjetas suaves, fondos alternos |
| Background | `#FFF9FB` | Fondo general |
| Plum | `#5C2441` | Títulos secundarios |
| Text | `#342B31` | Texto principal |
| Muted | `#746873` | Texto secundario |
| Border | `#E9D5DF` | Bordes/separadores |
| Success | `#2F9E6D` | Estado positivo |
| Warning | `#FFD166` | 7-6 días |
| Danger | `#D92D47` | ≤5 días, error, atraso |

Reglas:

- No usar `#DD0675` como fondo dominante de páginas completas.
- Fondos principales: blanco o `#FFF9FB`.
- Amarillo = prevención.
- Rojo = urgencia/error/atraso.
- Texto pequeño sobre fucsia: blanco.
- Texto sobre rosa suave: `#342B31` o `#5C2441`.
- No usar rosa claro como texto informativo.

### Alertas de entrega

- `> 7 días`: neutral.
- `7-6 días`: `#FFD166`, “Próximo a entregar”.
- `≤ 5 días`: `#D92D47`, “Entrega próxima”.
- Vencido: rojo oscuro, “Atrasado X días”.

## 3. Tipografía

Google Fonts:

```css
@import url('https://fonts.googleapis.com/css2?family=Chewy&family=Coiny&family=Poppins:wght@300;400;500;600&display=swap');
```

### Uso

| Fuente | Rol |
|---|---|
| Coiny | Display, nombre del sistema, títulos especiales |
| Chewy | Acentos artesanales breves, uso moderado |
| Poppins | Interfaz, contenido, formularios, tablas, métricas, reportes |

Jerarquía sugerida:

- Display: Coiny 32-44 px.
- H1: Coiny o Poppins 28-32 px.
- H2: Poppins 22-26 px / 600.
- H3: Poppins 18-20 px / 600.
- Body: Poppins 15-16 px / 400.
- Metadata: Poppins 13-14 px / 400-500.
- Button: Poppins 14-16 px / 600.

Regla: Poppins domina la interfaz. No usar fuentes decorativas en tablas, formularios, montos o textos largos.

## 4. Responsive

La aplicación debe ser 100 % responsive y mobile-first.

| Breakpoint | Ancho | Comportamiento |
|---|---|---|
| XS | 320-479 px | 1 columna, navegación inferior, acciones primarias full-width |
| SM | 480-767 px | 1 columna amplia, tarjetas compactas |
| MD | 768-1023 px | Tablet, 2 columnas cuando ayude, menú colapsable |
| LG | 1024-1279 px | Sidebar persistente, 2-3 columnas, tablas completas |
| XL | 1280 px+ | Contenido centrado, hasta 4 columnas de métricas |

### Navegación

**Celular**

- Barra inferior.
- 4 accesos principales: Inicio, Pedidos, Clientes, Más.
- Acción “Nuevo” visible y fácil de alcanzar.

**Tablet**

- Menú lateral colapsable.
- Barra superior.
- Dos columnas cuando aporte claridad.

**Escritorio**

- Sidebar persistente de 220-260 px.
- Barra superior.
- Área de trabajo con máximo aproximado de 1440 px.

### Reglas obligatorias

- No scroll horizontal de página.
- Scroll horizontal local solo en tablas excepcionales.
- En móvil, tablas de pedidos/clientes se convierten en tarjetas o filas apiladas.
- Área táctil mínima aproximada: 44 × 44 px.
- Inputs en móvil: mínimo 16 px.
- Modales complejos: bottom sheet o panel ancho en móvil.
- No colocar destructivo pegado a primario en touch.

## 5. Espaciado, radios y sombras

- Unidad base: 4 px.
- Espaciado compacto: 8 px.
- Espaciado estándar: 12-16 px.
- Separación de bloques: 24 px.
- Radio pequeño: 10 px.
- Radio estándar: 14-16 px.
- Radio de tarjeta: 18-22 px.
- Sombras: muy suaves, difusas.

### Tarjeta estándar

- Fondo blanco.
- Borde `#E9D5DF`.
- Radio 20 px.
- Sombra suave.
- Padding 16-20 px.

### Tarjeta destacada

- Fondo `#FFF0F6`.
- Acento fucsia discreto.
- Reservar para alertas informativas/resúmenes.

### Decoración

Se permiten, en zonas no críticas:

- formas orgánicas;
- líneas curvas;
- puntos;
- mini corazones;
- ovillos;
- motivos crochet.

Mantener baja opacidad y no competir con datos.

## 6. Componentes

### Botón principal

- Fondo `#DD0675`.
- Texto blanco.
- Poppins 600.
- Radio 14-16 px.
- Altura mínima 44 px.
- Hover `#A70459`.
- Press: escala breve 0.98.

### Botón secundario

- Blanco.
- Borde `#DD0675`.
- Texto `#A70459`.

### Botón destructivo

- `#D92D47` o outline rojo.
- Confirmación cuando la acción no sea reversible.

### Formularios

- Label siempre visible.
- Ayuda opcional.
- Foco fucsia.
- Error = borde rojo + mensaje textual.
- Placeholder nunca reemplaza label.

### Chips / badges

- Compactos.
- Forma píldora.
- Estado = color + texto.

### Estados vacíos

- Icono/ilustración amable.
- Título breve.
- Explicación.
- CTA.
- Puede usar Coiny/Chewy con más carga decorativa.

## 7. Pedidos y cronómetro

La tarjeta móvil de pedido prioriza:

1. Pedido + cliente.
2. Fecha solicitada + días restantes.
3. Estado.
4. Saldo.
5. Tiempo trabajado.

### Cronómetro

Acciones:

- Play → iniciar.
- Pausar.
- Reanudar.
- Finalizar.

Reglas visuales:

- Contador activo visible en ficha.
- Indicador global discreto al navegar.
- Pulso muy sutil del estado activo.
- Nunca parpadeo fuerte.
- En móvil, controles grandes y utilizables con una mano.
- Play/Pausa nunca junto a Eliminar.

## 8. Animaciones

Objetivo: sensación viva, no distracción.

| Interacción | Duración |
|---|---|
| Hover botón | 120-180 ms |
| Press/tap | 80-120 ms |
| Entrada tarjeta | 180-240 ms |
| Modal/SweetAlert | 180-240 ms |
| Toast | 200-300 ms |
| Cambio de estado | 180-220 ms |
| Pulso cronómetro | 1.6-2.2 s |
| Celebración | ≤ 900 ms |

### Reglas

- Respetar `prefers-reduced-motion`.
- No animaciones infinitas decorativas.
- No rebotes fuertes.
- No sonidos automáticos.
- No animar montos de forma que dificulte leer.
- No rojo pulsante permanente.
- Confetti solo en hitos puntuales.

## 9. Librerías visuales aprobadas

| Librería | Uso |
|---|---|
| SweetAlert2 | Confirmaciones y advertencias |
| Lucide Icons | Iconografía |
| Motion / Framer Motion | Animaciones en React/Next |
| Sonner | Toasts |
| Chart.js o Recharts | Dashboard/reportes |
| Tippy.js | Tooltips opcionales |
| canvas-confetti | Celebraciones puntuales |
| date-fns | Fechas y cálculos |

Regla: una herramienta principal por responsabilidad. No duplicar librerías para lo mismo sin necesidad.

## 10. Iconografía

Usar **Lucide Icons** como librería principal.

- No mezclar familias visuales sin justificación.
- No usar emojis nativos como iconos de interfaz.
- Acciones sin texto deben tener `aria-label`.
- Tooltip cuando ayude.
- Tamaños:
  - 16 px: ayudas;
  - 18-20 px: inputs/botones;
  - 22-24 px: navegación;
  - 28-32 px: estados vacíos/tarjetas destacadas.
- Stroke aproximado: 1.75-2 px.
- Heredar color del componente.
- Fucsia para primarios.
- Neutral para navegación inactiva.
- Rojo solo destructivo/crítico.
- Combinar icono + texto en acciones importantes.
- No usar iconos rasterizados.

## 11. Scrollbar

Cuando sea visible y el navegador lo permita:

- Track: `#FFF0F6` o `#FFD6E4` suave.
- Thumb: `#DD0675`.
- Hover: `#A70459`.
- Radio píldora.
- Escritorio: ancho sugerido 8-10 px.
- No ocultar cuando indique contenido adicional.
- En móvil respetar comportamiento nativo.

CSS de referencia:

```css
* {
  scrollbar-width: thin;
  scrollbar-color: var(--color-primary) var(--color-surface-pink);
}

*::-webkit-scrollbar {
  width: 10px;
  height: 10px;
}

*::-webkit-scrollbar-track {
  background: var(--color-surface-pink);
  border-radius: 999px;
}

*::-webkit-scrollbar-thumb {
  background: var(--color-primary);
  border: 2px solid var(--color-surface-pink);
  border-radius: 999px;
}

*::-webkit-scrollbar-thumb:hover {
  background: var(--color-primary-dark);
}
```

## 12. Modales y notificaciones

### SweetAlert2

Usar para:

- eliminación/anulación;
- cancelación;
- acciones sensibles.

Contenido:

- título claro;
- consecuencia;
- verbos específicos.

Botón confirmación:

- fucsia: acción normal;
- rojo: destructiva.

No usar modal para cada guardado exitoso.

### Toasts

Ejemplos:

- “Pedido actualizado”.
- “Cronómetro pausado”.
- “No se pudo guardar. Intente nuevamente”.

Duración normal: 3-4 s. Permitir cierre manual.

## 13. Dashboard y datos

- Primeras métricas:
  - cuánto vendí;
  - cuánto cobré;
  - cuánto gasté;
  - cuánto gané;
  - cuánto falta cobrar.
- Móvil: 1-2 métricas/fila.
- Tablet: 2.
- Escritorio: hasta 4.
- No saturar con gráficos.
- Priorizar 3-4 visualizaciones útiles.
- No usar 3D.
- Series con colores suficientemente diferenciados.

### Tablas

- Encabezados Poppins 600.
- Fondo rosa pálido o blanco.
- Numéricos a la derecha.
- Texto a la izquierda.
- En móvil convertir filas en tarjetas.
- Filtro/búsqueda sin recarga completa cuando sea posible.
- Paginación/carga progresiva para listas grandes.

## 14. Estados de carga

- Skeletons suaves para estructura conocida.
- Spinner compacto dentro de botones para acciones puntuales.
- Desactivar doble clic mientras procesa.
- No bloquear toda la interfaz por operaciones pequeñas.
- Estado vacío con CTA relevante.

## 15. Accesibilidad

- Contraste equivalente a WCAG AA cuando sea posible.
- Focus visible.
- Orden lógico de tabulación.
- Preferir controles HTML nativos.
- Estado = color + icono/texto.
- Controles táctiles mínimo 44 × 44 px.
- Alt text en imágenes funcionales.
- `aria-live` para mensajes dinámicos importantes cuando corresponda.
- Evitar texto sobre fondos complejos.

## 16. Tokens CSS

```css
:root {
  --color-primary: #DD0675;
  --color-primary-dark: #A70459;
  --color-soft: #FFD6E4;
  --color-surface-pink: #FFF0F6;
  --color-background: #FFF9FB;
  --color-plum: #5C2441;
  --color-text: #342B31;
  --color-muted: #746873;
  --color-border: #E9D5DF;
  --color-success: #2F9E6D;
  --color-warning: #FFD166;
  --color-danger: #D92D47;

  --radius-sm: 10px;
  --radius-md: 16px;
  --radius-card: 20px;

  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-6: 24px;

  --font-ui: 'Poppins', sans-serif;
  --font-display: 'Coiny', cursive;
  --font-accent: 'Chewy', cursive;
}
```

## 17. Checklist visual

Antes de cerrar una pantalla:

- [ ] Funciona desde 320 px.
- [ ] No hay scroll horizontal de página.
- [ ] Tipografía decorativa no invade datos.
- [ ] Botones/cards/inputs/modales respetan tokens.
- [ ] Alertas de entrega usan 7-6 amarillo / ≤5 rojo.
- [ ] Cronómetro usable en móvil.
- [ ] Animaciones breves y con reduced-motion.
- [ ] Éxitos usan toast.
- [ ] Críticos usan modal.
- [ ] Iconografía usa Lucide.
- [ ] No hay emojis como iconos.
- [ ] Scrollbar visible respeta colores definidos.
- [ ] Identidad consistente entre módulos.

## Meta visual

Una herramienta de gestión que se sienta tan cuidada y artesanal como el producto que representa, con claridad y velocidad de una herramienta profesional.
