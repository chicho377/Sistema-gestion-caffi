# Fase 3 — Cierre integral

Estado: validación integral terminada; Fase 3 queda aprobada por el usuario y cerrada para DEV. Sin tag final. 20 criterios completos, 0 parciales y 0 pendientes funcionales de DEV; A51 pendiente separado antes de producción.

| Subfase | Alcance |
|---|---|
| 3A | Cotizaciones, líneas de catálogo/personalizadas, snapshots, referencias privadas, revisión y alertas |
| 3B | Confirmación atómica, PED anual, adelanto histórico, ciclo productivo, pagos/anulación, saldo derivado y auditoría |
| 3C | Ingresos manuales externos, exclusivos Admin, inmutabilidad y anulación motivada |
| 3D | Gastos CRC/USD, tasa histórica/fallback, comprobantes versionados, categorías y reclasificación Admin |
| 3E | Regresión integral, permisos/Storage/concurrencia y correcciones técnicas dentro de decisiones aprobadas |

Nueve tablas: orders, order_items, order_files, order_counters, payments, manual_income, expense_categories, expenses, expense_files. Operaciones por RPC con perfil vigente, control de revisión/bloqueos y auditoría transaccional. No DML financiero directo. Vistas security_invoker con numeric transportado como texto.

Admin opera conforme a integridad y puede anular/reclasificar; Colaborador opera pedidos/pagos y sus gastos, sin ingresos manuales, configuración financiera o auditoría general. Inactivo y anónimo sin datos/operaciones. order_counters permanece interno sin grants/policies de acceso.

Storage: catalog-images, order-references y expense-receipts privados. Bytes mediante endpoints autenticados con metadatos autorizados por JWT/RLS; infraestructura administrativa solo en servidor. No URL pública ni borrado compensatorio; el fallo entre carga y asociación puede dejar un objeto privado huérfano para revisión, nunca una transacción distribuida ficticia.

A51 continúa pendiente antes de producción. Evidencia y matriz final en [PHASE3E_VERIFICATION.md](PHASE3E_VERIFICATION.md). Sin nuevas funcionalidades ni Fase 4; sin tag final hasta revisión del usuario.

## Migraciones de Fase 3

- `20260923055811_phase3a_quotes.sql`
- `20260923110205_phase3a_conflict_response.sql`
- `20260923210849_phase3b_order_constraints.sql`
- `20260923211331_phase3b_order_operations.sql`
- `20260924032507_phase3b_zero_authorization_chronology.sql`
- `20260924034005_phase3b_audit_validation.sql`
- `20260929201704_phase3c_manual_income.sql`
- `20260930070939_phase3d_expenses.sql`
- `20260930173242_phase3d_private_receipt_delivery.sql`
- `20260930230000_phase3d_rate_origin.sql`
- `20261001050309_phase3d_reclassify_expense.sql`
- `20261001235914_phase3e_private_image_delivery.sql`

## Operaciones públicas controladas

Pedidos: save_quote, cancel_quote, confirm_order, amend_order, correct_order_dates, transition_order, order_deposit_default y order_history. Pagos: register_payment y void_payment. Ingresos: register_manual_income y void_manual_income. Gastos: save_expense_category, expense_rate, register_expense, edit_expense_notes, reclassify_expense y void_expense. Infraestructura exclusiva de servidor: register_order_file, register_expense_file y store_expense_exchange_rate; revalidan actor/estado y no aceptan suplantación desde navegador. Implementaciones privadas fuera de Data API, search_path vacío y EXECUTE mínimo.

## Evidencia final

24 tests locales y 24 E2E simulados aprobados; 859 comprobaciones DEV reales y 16 casos inducidos/simulados separados, además de 36 combinaciones JWT tabla/rol y doce suites SQL DEV con rollback. Cinco anchos y ambos roles. Lint/typecheck/build correctos; npm audit producción en cero. Security: A51 WARN conocido + INFO contador aceptado. Performance: 23 INFO unused_index clasificados, sin eliminar índices. Diecisiete migraciones local/remoto iguales, dry-run vacío, huellas de Fase 3 y dependencias privadas iguales. Secretos y artefactos fuera de Git/bundle.

Corrección nueva: caché de descarga que sobrevivía a la inactivación en catálogo/referencias. Ambos buckets ahora siguen la entrega privada validada de comprobantes; se preservan permisos funcionales e historia. No hay decisiones funcionales nuevas ni pasos manuales DEV pendientes. El usuario autorizó el commit de cierre de auditoría y su push; no se creó tag. La tabla completa de evidencia, límites y diferencias previas fuera de Fase 3 está en PHASE3E_VERIFICATION.md.


Cierre Git autorizado: `test: complete phase 3 integration audit and closure`. Verificación previa: 17 migraciones local/DEV coincidentes, dry-run sin pendientes, huellas equivalentes, diff sin errores y ausencia de secretos/artefactos versionables. A51 permanece obligatorio antes de producción; order_counters conserva aislamiento intencional y los 23 INFO de Performance permanecen documentados sin eliminar índices. No se autoriza Fase 4.
