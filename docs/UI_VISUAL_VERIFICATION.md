# Correcciones visuales — 2026-10-18

Alcance: Dashboard y presentación compartida de reportes, conforme a DESIGN_SYSTEM.md. No modifica consultas, datos, importes, permisos, migraciones ni configuración de Supabase.

- Etiquetas explícitas en español y moneda CRC, sin nombres internos ni referencias a fases en los títulos.
- Separación de bloques de 24 px, paneles de gráficos agrupados, métricas en una/dos/hasta cuatro columnas según ancho.
- Objetos y listas representados con campos y listas accesibles; los conjuntos vacíos muestran texto, no llaves o corchetes. Envíos vacíos: «Sin envíos pendientes»; con registros: cantidades por estado, traducidas.
- Filtro de fuentes con nombres legibles manteniendo los valores enviados al servidor.
- Reportes operativos sin panel de totales vacío; resultados, filtros y acciones conservados.
- Ausencia de valores permanece como «No disponible», sin asumir cero ni inventar métricas.

## Validación local

Lint, typecheck, build y 33 pruebas locales correctos. 28 E2E con Supabase simulado aprobados: incluye estado vacío y envíos agrupados para ambos roles en 320/375/768/1024/1440 px, ausencia de desbordamiento y de agregados financieros para Colaborador. Capturas revisadas en móvil y escritorio. Los errores de red deliberados pertenecen a escenarios simulados. Escaneo de secretos y git diff --check correctos; artefactos bajo test-results ignorado.

## Publicación

Destino autorizado: proyecto Vercel existente sistema-gestion-caffi, equipo chicho377s-projects, rama main. Production verificada contra Supabase PROD cvkfzzrflusvgcuyglco, separada de DEV. Este ajuste no declara cerrada la release v1.0.0 ni sustituye la prueba pendiente del Colaborador definitivo en PROD. No se crea tag final.


## Revisión transversal de secciones — 2026-10-18

Tras la captura del detalle de pedido, se corrigió la causa compartida: workspace-main ahora distribuye todos sus bloques en una columna con gap de 24 px. Mantiene contenedores internos y navegación, adapta botones largos al ancho móvil, evita que UUID/textos largos ensanchen encabezados y normaliza márgenes de paneles. El enlace de horas de pedidos Cancelados/Entregados dice «Ver horas», conservando destino y permisos. Adjuntos locales de Codex ignorados por Git.

Vista previa de CSS local sobre lecturas PROD: 44 rutas × 5 anchos = 220 comprobaciones sin overflow ni separación insuficiente entre bloques principales. Incluye módulos principales, altas y detalles existentes de cliente/producto/material/pedido/gasto/recepción, horas/envíos/costeo por pedido y los reportes principales. No se crearon registros para llenar pantallas vacías. Capturas en test-results/sections, no versionadas. Validación local: lint, typecheck, build y 28 E2E simulados correctos. No equivale a probar todas las acciones mutadoras o todos los estados empresariales en PROD. Colaborador cubierto por escenarios simulados; no se reactivó la cuenta descartada.
