# SIGCA V1 — notas del candidato

Base: v0.13-phase6-complete. Preparación Fase 7; **no es anuncio de producción desplegada**. Candidato v0.14-rc1 validado en DEV el 2026-10-18; v1.0.0 retenido por recursos/configuración de producción.

Incluye Auth privado y perfiles vigentes; clientes/catálogos; cotizaciones y ciclo productivo; pagos, ingresos y gastos con auditoría; inventario promedio histórico, consumos/devoluciones y compensaciones; horas persistentes; envíos independientes; costeo/rentabilidad Admin; Dashboard y R1–R8 con Excel/PDF. Next.js 16.3.8, TypeScript 6.0.3, Tailwind 4.3.3, Supabase Auth/PostgreSQL/Storage. Sin nuevos módulos ni reglas empresariales en Fase 7.

Límites: CRC comercial, USD donde está aprobado con evidencia de cambio; sin sobrepagos/reembolsos automáticos; un envío por pedido; exportación 5000 filas, no parcial; no stock/cartera históricos al cierre de rango; estimaciones históricas no inventadas; costo incompleto impide utilidad global fiable. No hay rollback de datos implícito al revertir frontend.

Pendientes externos: PROD separado, acceso Vercel correcto/origen, configuración y smoke, respaldo verificable y A51 en plan compatible. Tarifa NULL requiere decisión empresarial antes de usar Play; logo opcional. Cinco avisos altos de desarrollo en cadena braces y Performance INFO documentados; no vulnerabilidades runtime conocidas en audit final. Ver PHASE7_VERIFICATION para resultados, no usar notas como sustituto de evidencia.
