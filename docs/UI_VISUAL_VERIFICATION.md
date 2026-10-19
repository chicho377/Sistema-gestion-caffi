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
