# Fase 7 — preparación de producción

Inspecciones: 2026-10-17. Cierre del candidato: 2026-10-18, America/Costa_Rica. Base v0.13-phase6-complete. No nuevos módulos ni reglas de negocio. Esta matriz separa software validado de disponibilidad productiva; no declara v1.0.0 listo.

## Inventario del sistema

| Componente | Implementación / evidencia |
|---|---|
| Next.js / TypeScript / Tailwind | package.json, App Router, build y typecheck |
| Auth / usuarios / roles | Supabase Auth, profiles vigentes, requireProfile/requireAdmin, invitación servidor y cookie firmada de recuperación |
| PostgreSQL / RLS / RPC | 34 migraciones; operaciones transaccionales, search_path vacío, grants mínimos y auditoría |
| Storage | catalog-images, order-references, expense-receipts: privados, máximo 5MB; proxy autorizado por cada petición |
| Clientes / productos / materiales | Catálogos operativos, desactivación e historial, costos separados de acceso Colaborador |
| Pedidos / pagos | Quote y ciclo 3B, consecutivo atómico, adelanto snapshot, saldo derivado y anulaciones |
| Ingresos / gastos | Fuentes separadas, fechas efectivas, USD histórico, comprobantes y reclasificación Admin auditada |
| Inventario / consumo / devolución | Diario inmutable, promedio 8 decimales, proyecciones y reconstrucción, compensación administrativa |
| Horas | Sesión persistente, pausas, revisión, tarifa histórica; Play bloqueado sin tarifa configurada |
| Envíos | Registro único, estados independientes de pedido, vínculo financiero explícito |
| Costeo / rentabilidad | Lectura derivada Fase 5, snapshots y distribución conciliada; exclusivo Admin |
| Dashboard / reportes | R1–R8, rangos Costa Rica, actual separado, información incompleta explícita |
| Excel / PDF | Generación servidor, autorización nueva, filtros exactos, límite 5000 sin archivo parcial |

No se encontraron TODO/placeholder funcionales que deban presentarse terminados. Logo opcional no configurado; tarifa empresarial NULL no se inventa. Los textos de campos vacíos no equivalen a funcionalidades pendientes.

## Matriz de release

| Control | Estado | Evidencia / límite |
|---|---|---|
| Inventario y alcance | PASS | Módulos anteriores, sin funcionalidad nueva |
| Seguridad de esquema DEV | PASS | Cero tablas public sin RLS, cero definers sin search_path vacío; anon sin USAGE private |
| Auth DEV | PASS | Signup/anonymous false, email true, confirmación requerida; plantillas RedirectTo/TokenHash/confirm |
| Cookies y headers | PASS | Secure explícito en producción + SameSite=Lax, firma HttpOnly del flujo de contraseña conservada; nosniff/DENY/no-referrer |
| Secrets y entorno | PASS | .env* ignorados salvo ejemplo; scan de fuentes y assets cliente |
| Dependencias producción | PASS | npm audit --omit=dev sin vulnerabilidades |
| Dependencias desarrollo | POST-RELEASE | Cinco altos de una cadena sin parche compatible; no runtime |
| RLS/JWT/Storage/roles | PASS | Suites reales y tabla de pruebas; no permisos financieros añadidos |
| Precisión e historia | PASS | Regresión 3–6 y reconstrucciones; no migraciones Fase 7 |
| Calidad y UX DEV | PASS | Resultados finales abajo; no equivalen a smoke PROD |
| Exportaciones | PASS | Excel/PDF reales y rechazo >5000; filtros/privacidad |
| INFO order_counters | PASS | Aislamiento intencional, no se abren grants/policies |
| Performance | POST-RELEASE | Sin índices eliminados; clasificación y planes abajo |
| Documentación | PASS | Siete documentos finales, README enlazado |
| Supabase PROD | BLOCKER | PROD_SUPABASE_REQUIRED |
| Vercel PROD | BLOCKER | VERCEL_PROD_CONFIGURATION_REQUIRED |
| Configuración y correo PROD | BLOCKER | Depende de recursos/origen, no copiar DEV ni afirmar envío probado |
| A51 | BLOCKER | Free confirmado, no disponible; habilitar en plan compatible antes de producción |
| Backups y recuperación PROD | BLOCKER | No entorno/política/ensayo aislado verificados |
| Smoke PROD | BLOCKER | No desplegado; ningún dato real intervenido |
| Tarifa horaria | POST-RELEASE | Requisito operativo antes de Play, no bloqueo de otros módulos |
| Logo | POST-RELEASE | Opcional, nombre textual visible |

## Descubrimiento de entornos y seguridad

MCP lista SIGCA DEV pysgfnwsycgoneaecgcl y otro proyecto ajeno; ninguno PROD identificable. Organización oqeuepieopqeiizyxfxb plan Free. Vercel MCP solo permite equipo davidmorag1095-8816s-projects (team_2DghlDZfPfHPobDaMhm5Ixkh), sin proyectos. Auth DEV apunta a sistema-gestion-caffi-chicho377s-projects.vercel.app y contiene retorno localhost y comodines de ese dominio. El endpoint /login responde 302 a la protección SSO de Vercel, con HSTS. Es configuración existente y despliegue protegido, no prueba de PROD separado. No se cambió porque el despliegue propietario no puede verificarse. PROD requiere origen/retornos exactos sin comodines innecesarios. CORS no se amplió.

Management API confirmó SMTP Gmail 587 con remitente utclaboratorio@gmail.com y plantillas de invitación/recuperación con variables correctas. No se imprimieron/guardaron claves ni contraseñas. No se envió correo nuevo ni se probaron enlaces PROD en esta fase. La entrega real histórica de Fase 1 no sustituye ese smoke.

Security Advisors final conserva exactamente A51 WARN y order_counters INFO; sin hallazgos nuevos de esquema. [Referencia de aislamiento](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).

A51: [Supabase requiere Pro o superior](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). Riesgo de acceso por contraseña comprometida/reutilizada; el proyecto Free no permite resolverlo. No se simula solución ni se cambia plan. Sigue bloqueando declaración de producción completamente lista según aprobación previa.

Se corrigió un defecto visual comprobado a 1024 px en Costeo: los importes y encabezados se partían entre líneas. Regla CSS de escritorio conserva cada cifra y scroll local; no cambia cálculos ni tarjetas móviles.

Cookies: cambio técnico mínimo en client/server/proxy; Secure con NODE_ENV=production, SameSite=Lax explícito. No HttpOnly para sesión compartida por cliente SSR; sí para autorización firmada de cambio de contraseña. Autorización sigue perfil vigente, no metadata editable. No reintentos automáticos nuevos de escrituras. Errores transaccionales controlados usan mensajes previstos/409; errores inesperados no exponen stack de servidor al cliente de producción.

## Dependencias y performance

npm audit registra braces → micromatch → fast-glob → @next/eslint-plugin-next → eslint-config-next (cinco nodos altos). [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm): agotamiento de pila con patrones profundamente anidados. npm registry consultado: braces latest=3.0.3 sigue afectado; eslint-config-next 16.4.2 conserva fast-glob en plugin. La propuesta audit es downgrade a 14.2.35, mayor incompatible con la base; no aplicada. Alcance tooling, patrones controlados del repositorio, sin endpoint productivo que ejecute lint. Revisar actualización cuando exista parche; no ejecutar tooling contra repositorios no confiables con secretos disponibles.

45 INFO unused_index también en la revisión final de Advisors (sin WARN/ERROR de Performance): índices de actor/creador/anulador/atribución y FKs se conservan intencionalmente; índices de búsqueda/categoría/fecha con uso cero corresponden al dataset y consultas observadas, no evidencia de inutilidad. Recomendable antes de escalar: medir percentiles y planes representativos con RLS, especialmente auditoría global y agregados de rentabilidad. Ningún INFO exige eliminación inmediata; no se creó/eliminó índice para silenciarlo.

EXPLAIN ANALYZE DEV (mediciones, no SLA): Dashboard mensual 515.153 ms; caja anual 22.034 ms; rentabilidad anual 134.627 ms; audit_log últimas 25 por fecha 719.877 ms con secuencial/top-N; movimientos 0.979 ms; horas 0.303 ms; orders 1.204 ms usando orders_created_idx; pagos 0.148 ms usando payments_date_idx; expenses 0.137 ms usando expenses_date_status_idx. No bloques temporales en agregados. Auditoría global requiere revisión antes de mayor volumen; añadir índice solo tras medir el acceso real filtrado y beneficio, sin tocar integridad. Aproximadamente 13 mil eventos, 370 pedidos y 166 sesiones al medir; suites posteriores añaden fixtures explícitos. No pruebas de carga sobre PROD.

Backups: Free, API sin copias recuperables y PITR false; walg interno no implica retención contratada. Procedimiento y límites en BACKUP_RECOVERY. No restore ejecutado.

## Evidencia de pruebas

Calidad ejecutada: lint y typecheck sin errores, 33 tests locales/PGlite aprobados, build de producción correcto, 26 E2E simulados aprobados después del endurecimiento de cookies. npm audit completo devuelve cinco altos de desarrollo descritos arriba; npm audit --omit=dev devuelve cero. Secret scan y git diff --check limpios. 34 migraciones local/DEV coincidentes y dry-run sin pendientes; no migración nueva de Fase 7.

Regresión DEV ejecutada secuencialmente: catálogos/Storage Fase 2 = 135 comprobaciones; 3E = 117; 4A = 57; 4B = 71; 4C = 65; 4D = 130; integración 4E = 36; Fase 5 = 73; reportes Fase 6 = 57; seguridad Fase 6 = 15; UI/exportaciones Fase 6 = 141. Los dos últimos casos de esta suite son fallos de red inducidos, no servicio real caído. Fase 2 también induce desconexión/bloqueo de request y verifica recuperación. Inactivo con JWT previo y accesos denegados sí se prueban contra Supabase real. Reconstrucción de 182 sesiones en 4C sin diferencias. No se repitió envío real de correo: la evidencia de Fase 1 sigue siendo histórica y PROD pendiente.

Recorrido adicional tests/phase7-preprod.mjs: 360 comprobaciones aprobadas contra DEV real; verifica 19 rutas Admin y 14 Colaborador en cinco anchos, foco/teclado, reduced-motion, headers, sesión, private Data API y límite de exportación. No modifica datos empresariales. Las capturas se toman después de networkidle, no durante loading. Logs/capturas/descargas se conservan únicamente en test-results ignorado. Las suites reales están protegidas por SIGCA_REAL_TESTS=1 y project ref DEV; sesiones en memoria, sin correo masivo ni contraseñas guardadas. Inactivaciones y tarifa temporal se restauran; fixtures conservan historia, no DELETE compensatorio. Pruebas de concurrencia y escrituras solo DEV.

## Acciones externas mínimas

1. Proporcionar ref/acceso de Supabase PROD separado o autorizar su creación con organización/plan/región; confirmar plan compatible con A51 y respaldo/política de recuperación.
2. Conectar Vercel al equipo propietario y confirmar proyecto y origen HTTPS canónico; si no existe, autorizar creación. No enviar secretos en el chat.
3. Proporcionar acceso seguro a SMTP PROD e identidad del primer Admin si difieren de los autorizados. El titular establece personalmente contraseña. Con recursos disponibles, aplicar despliegue/configuración y smoke descritos, sin repetir decisiones funcionales.

La tarifa y el logo se configuran cuando el negocio los determine; no son credenciales técnicas ni requisitos para publicar módulos ajenos al cronómetro. No crear v1.0.0 hasta resolver los BLOCKER; Pruebas finales aprobadas: candidato v0.14-rc1; no despliegue ni declaración de producción lista.

### Clasificación de índices INFO observados

| Grupo | Clasificación | Índices |
|---|---|---|
| Referencias de actores/historia | Intencional | orders_creator_idx, orders_canceller_idx, order_files_actor_idx, order_files_replaces_idx, payments_creator_idx, payments_voider_idx, manual_income_creator_idx, manual_income_voider_idx, inventory_receipts_actor, inventory_items_rate_actor, inventory_expenses_actor, inventory_movements_actor, expenses_updater_idx, expenses_voider_idx, expenses_rate_actor_idx, expense_files_uploader_idx, inventory_attribution_actor, inventory_adjustment_actor, work_session_rates_actor, work_sessions_creator, work_sessions_editor, work_session_requests_actor, shipment_finances_actor, shipments_creator, shipments_editor, shipment_requests_actor |
| Integridad/relaciones/proyecciones | Intencional | orders_client_idx, product_materials_material_idx, inventory_valuations_last_material, inventory_balances_last, expenses_line_idx, inventory_4b_order, inventory_4b_line, inventory_attribution_previous, inventory_attribution_previous_line, inventory_attribution_corrected, inventory_attribution_corrected_line, work_session_requests_session, shipment_requests_shipment |
| Búsqueda/filtros todavía poco utilizados | Dataset pequeño; revisar al escalar | clients_name_idx, clients_active_idx, materials_active_name_idx, products_category_idx, products_active_name_idx, inventory_receipts_date |

45 índices conservados. Ninguno clasificado como acción inmediata solo por unused_index. Optimizar auditoría global/rentabilidad antes de escalar requiere mediciones representativas; la consulta exploratoria no autoriza eliminar índices existentes.

## Cierre del candidato — 2026-10-18

Conteo de la matriz: 12 PASS, 6 BLOCKER externos de producción, 4 POST-RELEASE. Build final aprobado después del ajuste CSS; comprobación focalizada de Costeo en 320/375/768/1024/1440 contra DEV aprobada, sin overflow de página y con cifras de escritorio indivisibles. Captura de 1024 px revisada visualmente. Las 360 comprobaciones adicionales y las regresiones anteriores finalizaron; no se sustituyen por simulaciones. Escaneo final de secretos/artefactos y git diff --check limpios. No se modificaron dependencias, migraciones, planes ni configuración remota en este cierre.

Versión candidata v0.14-rc1. Commit: chore: prepare sigca v1 production release. Sin push automático para evitar activar un despliegue Git del equipo Vercel no accesible. Los seis BLOCKER deben verificarse antes de v1.0.0; las acciones externas mínimas están arriba.
