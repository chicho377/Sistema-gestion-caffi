# Fase 6 — Dashboard, reportes y exportaciones

Auditoría integral DEV, 2026-10-17 (America/Costa_Rica). D-26 incorpora la autorización y B6-01/B6-02/B6-03. No Fase 7. Proyecto exclusivo: `pysgfnwsycgoneaecgcl`.

## Matriz final

| Requisito | Estado | Evidencia / prueba | Entorno | Observación |
|---|---|---|---|---|
| Períodos empresariales | COMPLETO | phase6-period.test; SQL temporal | Local / DEV controlado | Hoy, lunes, mes, anterior, año, personalizado; límites Costa Rica |
| Ventas y ticket | COMPLETO | report_query orders, dashboard_query | DEV JWT / SQL | Delivered por entrega vigente; activos por confirmación; ticket de entregados |
| Caja separada de utilidad | COMPLETO | phase6-real + phase6-reconcile.sql | DEV JWT / SQL | payments + manual_income − expenses válidos |
| Rentabilidad autoritativa | COMPLETO | Comparación JSON con order_costing de 15 pedidos | DEV JWT | Fase 5 exclusivamente; sin KPI persistido |
| Costos incompletos B6-03 | COMPLETO | phase6-temporal.sql con sesión abierta | Local / DEV controlado | Global indeterminado; subconjunto completo y excluidos separados |
| Situación actual B6-02 | COMPLETO | R5, cartera, operación y Dashboard | DEV JWT / UI | No se presenta cierre histórico del rango |
| Alertas y estados | COMPLETO | Pedidos activos, textos días/atraso; regresión 3E | DEV JWT / UI | Sin alertas para entregados/cancelados |
| Gráficos útiles | COMPLETO | report_charts; reconciliación independiente | DEV SQL / UI | Caja mensual, gastos por categoría, ventas realizadas por producto |
| R1 ventas/pedidos | COMPLETO | API, filtros, exportación | DEV JWT / HTTP | Fechas y clasificación separadas |
| R2 pagos/cartera | COMPLETO | payments + balances | DEV JWT / HTTP | Cartera incluye pedidos sin pagos; saldos actuales no se suman por pago |
| R3 fuentes financieras | COMPLETO | cash; reconstrucción por fuente | DEV JWT / SQL | Conserva source_type, UUID, moneda original y tasa |
| R4 rentabilidad | COMPLETO | profit; detalle de Fase 5 | DEV JWT / HTTP | Excel incluye hojas de líneas y fuentes |
| R5 inventario/movimientos | COMPLETO | Proyecciones/diario y consulta independiente | DEV JWT / SQL | Sin valoración para Colaborador |
| R6 productividad | COMPLETO | Intersecciones, pausas y acumulados | Local / DEV SQL / JWT | Sin relleno desde catálogo; tarifa histórica |
| Segundos y centavos | COMPLETO | Subsegundos y pausa atravesando medianoche; dos importes de medio centavo | Local / DEV controlado | Diferencias de acumulados conservan duración y total monetario |
| R7 envíos | COMPLETO | Eventos vigentes, cumplimiento, gasto vinculado | DEV JWT / SQL | Una fila por evento; costo no se suma por evento |
| R8 auditoría | COMPLETO | Búsqueda/entidad/usuario/registro/acción, evidencia | DEV JWT / UI | Solo lectura Admin; sin DML nuevo |
| Filtros/paginación | COMPLETO | 57 comprobaciones API, página de una fila, UUID y rango vacío | DEV JWT | Filtrado y totales en PostgreSQL, URL preservada |
| Excel/PDF | COMPLETO | 20 archivos Admin + exportaciones operativas Colaborador | DEV HTTP / lectores independientes | Mismos filtros, zona y generación; ninguna fórmula inyectada |
| Acceso financiero | COMPLETO | RPC, Data API, URL conocida, archivo manipulado | DEV JWT / HTTP | No se confía en botones ocultos |
| Inactivo/anónimo | COMPLETO | phase6-security-real, JWT previo a inactivación | DEV JWT / HTTP | Estado del perfil restaurado al terminar |
| Responsive/accesibilidad | COMPLETO | Ambos roles, 320/375/768/1024/1440 | DEV UI | Tarjetas móvil, tabla con scroll local, labels y reduced-motion |
| Errores y recuperación | COMPLETO | Navegación abortada y recuperada; estado vacío | DEV UI / fallos inducidos | Dos casos inducidos separados de evidencia normal |
| Regresión y fuentes intactas | COMPLETO | 3E/4A/4B/4C/4D/5; sesión antes/después | DEV JWT / local | 513 comprobaciones; no mutación por reportes |
| Calidad y esquema | COMPLETO | lint/typecheck/tests/build/E2E, migraciones, fingerprint | Local / DEV | Sin DROP, nuevas tablas o snapshots alterados |

Conteo: **25 COMPLETO, 0 PARCIAL, 0 PENDIENTE funcional DEV, 0 NO APLICA**. Los pendientes de producción siguen separados de este cierre.

## Fuentes, fechas y precisión

R1 usa entrega vigente para Delivered, confirmación para confirmados y fecha del pedido para cotización. Cancelado conserva clasificación e importes de referencia, pero no integra ventas realizadas/activas ni R4. Caja filtra cada fuente por su fecha efectiva y conserva anulaciones visibles con contribución cero. Saldo y stock son actuales, independientemente del período.

Horas: `F(b)=FLOOR(tiempo neto acumulado desde inicio hasta b)`. El segmento es `F(fin_rango)-F(inicio_rango)`, con pausa intersectada y límites semiabiertos. Esto evita perder subsegundos por truncamiento repetido y suma exactamente worked_seconds. Las sesiones abiertas se identifican provisionales. El costo temporal usa tarifa congelada × segundos / 3600; el total se redondea HALF UP al final. La presentación por sesión usa diferencias de límites monetarios acumulados después del filtro, de modo que filas y total concilian. La desviación de línea corresponde a la línea completa, no se suma repetidamente entre trabajadores/sesiones.

Los costos/beneficios por pedido mantienen el contrato de Fase 5. Un pedido incompleto impide utilidad/margen globales; el subtotal completo se identifica expresamente y nunca se denomina global. Los gráficos usan numeric SQL; la conversión numérica en UI solo dimensiona barras, no calcula importes autoritativos.

## Esquema y permisos

Cuatro migraciones nuevas, aplicadas después de pruebas locales y su dry-run individual:

- `20261016212845_phase6_reporting.sql`: consultas autorizadas y límite temporal neto.
- `20261016214031_phase6_dashboard_series.sql`: agregados gráficos.
- `20261016214241_phase6_balance_report.sql`: cartera actual incluso sin pagos.
- `20261016214344_phase6_hourly_reconciliation.sql`: conciliación monetaria visible del tiempo filtrado.

34 migraciones equivalentes local/DEV; dry-run vacío. Ocho funciones: cinco privadas (`report_work_boundary`, `report_rows`, `report_query`, `dashboard_query`, `report_charts`) y tres wrappers públicos invoker. Funciones privadas de entrada verifican perfil vigente; search_path vacío; sin EXECUTE anon/service_role. Los helpers de filas/tiempo no tienen EXECUTE autenticado. No nuevas tablas, triggers, policies, buckets, índices o modificaciones de RLS/grants de fuentes existentes.

| Actor | Dashboard | Reportes/exportaciones | Auditoría |
|---|---|---|---|
| Admin activo | Financiero + operativo | R1–R7, cartera y movimientos | Lectura/exportación |
| Colaborador activo | Exclusivamente operación | Inventario/movimientos sin valoración, horas sin tarifa/costo, envíos sin finanzas, pedidos activos | Denegado |
| Inactivo | Denegado con JWT vigente | Denegado | Denegado |
| Anónimo | Denegado | Denegado | Denegado |

Exportar revalida identidad/rol antes de consultar y antes de generar. Cache-Control private/no-store. Una consulta exporta una instantánea coherente con sus totales. Límite técnico de 5000 filas por archivo: si se excede responde 422 y solicita acotar filtros; **nunca entrega un archivo parcial**. UI usa 25 filas. Importes XLSX son texto decimal para preservar precisión; los totales se calculan en PostgreSQL, no mediante fórmulas del archivo. PDF paginado en servidor sin servicios externos.

## Evidencias ejecutadas

- Local: 33 pruebas en suite completa; escenarios PGlite con todas las migraciones y pruebas de calendario puras.
- Simulado: 26 E2E. Se actualizó el fixture del antiguo shell de Dashboard a la respuesta operacional vacía; sigue siendo simulación explícita.
- DEV JWT/API: 57 verificaciones de reportes; 15 adicionales de seguridad, incluida inactivación con el mismo JWT, Data API restringida y HTML/RSC de Dashboard y horas sin campos financieros para Colaborador.
- DEV UI/HTTP: 141 verificaciones totales, de las cuales 139 reales y 2 de red inducida; ambos roles/cinco anchos. Incluye 20 exportaciones Admin (diez consultas × dos formatos) y tres XLSX operativos de Colaborador.
- DEV SQL controlado: `phase6-temporal.sql` crea escenarios dentro de transacción y termina ROLLBACK; verifica pausa, medianoche, segundos, centavos e incompletitud. No se presenta como ingreso de usuario por UI. `phase6-reconcile.sql` compara contra fuentes independientes caja, existencias, valoración, duración, eventos, auditoría y series.
- Regresión real secuencial: 3E 117, 4A 57, 4B 71, 4C 65, 4D 130, Fase 5 73 = 513. Reconstrucción de horas en 4C: 166 sesiones, cero diferencias. Fixtures se conservan; no hay borrados compensatorios.
- Lectores independientes: openpyxl abrió las hojas XLSX; pypdf abrió/extrajo texto de PDF; pypdfium2 renderizó una página para revisión visual. Artefactos y capturas permanecen ignorados en test-results.

Para reproducir: ejecutar build e iniciar `npm run start -- --port 3011 --hostname localhost`. Configurar las variables de prueba DEV ya documentadas (`SIGCA_REAL_TESTS=1`, cuentas autorizadas, `SIGCA_UI_URL=http://localhost:3011`). Ejecutar secuencialmente phase6-real, phase6-security-real y phase6-ui-real. Nunca ejecutar inactivación/regresiones simultáneas. Scripts SQL controlados terminan ROLLBACK; no crean cuentas ni contraseñas. `phase6-schema.sql` compara cuerpos, ACL, search_path y tipo de función.

## Rendimiento, dependencias y seguridad

EXPLAIN ANALYZE DEV: agregado payments del mes usa payments_date_idx (0.244 ms en la observación); reporte de rentabilidad anual 271.821 ms, sin bloques temporales. Son mediciones DEV, no garantías de carga de producción. No hay consultas HTTP por fila: el agregado opera en PostgreSQL y reutiliza el cálculo autoritativo por pedido en una consulta estable. No descarga datasets al navegador para sumar. Sin índices eliminados ni agregados para silenciar INFO.

Dependencias de producción nuevas: write-excel-file 4.1.1 y PDFKit 0.20.2; @types/pdfkit solo desarrollo. ExcelJS se evaluó y retiró porque incorporaba dos avisos moderados transitivos. Resultado final `npm audit --omit=dev`: cero vulnerabilidades. Los cinco avisos altos previos de herramientas de desarrollo siguen documentados; no se degradaron dependencias.

Security Advisors: A51 WARN pendiente obligatorio antes de producción ([referencia](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)); order_counters INFO intencional ([referencia](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)). Performance: 45 INFO unused_index en la consulta final, sin WARN/ERROR; frente a los 48 anteriores hay más uso observado, no índices eliminados ([referencia](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index)).

Tarifa empresarial permanece NULL como dato pendiente; no es fallo funcional de Fase 6. Sin secretos ni credenciales en archivos versionables/assets, .env.local ignorado. Ningún cambio de Auth/plan. No Fase 7.
