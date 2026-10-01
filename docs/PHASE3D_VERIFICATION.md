# Fase 3D — Gastos, categorías y comprobantes privados

## Alcance y entorno

Solo Fase 3D, posterior a 3C cerrada en `a16cf3d`. Proyecto SIGCA DEV comprobado: `pysgfnwsycgoneaecgcl`. La aclaración aprobada de D-20 distingue fallback operativo de hoy y referencia exacta por fecha para históricos. No se cambió proveedor, Auth ni plan de Supabase. No 3E, inventario, cronómetro, envíos, rentabilidad, reportes ni reparto de costos.

## Migración y comprobación de esquema

`20260930070939_phase3d_expenses.sql`, una transacción BEGIN/COMMIT. El preflight encontró 12 migraciones, ninguna de las tres tablas nuevas y ningún bucket `expense-receipts`. El dry-run mostró exclusivamente este archivo, sin seeds ni roles externos. Aplicado a DEV sin DROP, TRUNCATE, reset, cambios de columnas anteriores ni borrados.

`tests/sql/phase3d-schema.sql` compara columnas, constraints, funciones, policies, índices, vista, opciones security_invoker, RLS, triggers, grants, permisos EXECUTE y bucket: local/DEV equivalentes. Las huellas de 3B y 3C antes/después permanecen idénticas. La migración inicial agrega una policy a Storage; la segunda restringe exclusivamente esa policy nueva de 3D. No altera policies de fases anteriores. Los archivos de evidencias operativas se guardan en `test-results/`, ignorado.

`20260930173242_phase3d_private_receipt_delivery.sql` restringe `expense_receipts_read` mediante ALTER POLICY en una transacción. Preflight de su expresión, prueba local, build y dry-run exclusivos de ese archivo antes de aplicar. No modifica datos ni grants. Tras aplicar, se invalidó la caché de los 12 comprobantes existentes mediante purgeCache; se conservaron los 12 objetos y la huella de sus metadatos.

### Tablas y referencias

- `expense_categories`: UUID, nombre, descripción opcional, is_active, revision, timestamps. Nombre único normalizado igual que categorías de productos. Ocho categorías iniciales: Materiales, Empaques, Impresiones, Envíos, Herramientas, Publicidad, Comisiones bancarias y Otros. Solo Admin mantiene el catálogo; desactivación conserva gastos históricos.
- `expenses`: UUID de solicitud; FK restrictivas a categoría, pedido opcional, línea opcional del mismo pedido, creador, actualizador, autorizador de tasa y anulador. FK compuesta `(order_id,order_item_id)` evita cruces. Importe original y equivalente CRC sobre dominio numeric `quote_money`, positivos y con hasta dos decimales; moneda CRC/USD; fecha efectiva finita, descripción/notas/método/proveedor; estado valid/voided; revisión; creación real; marca histórica; evidencia de tasa y anulación. Índices de fecha/estado/autor y todas las FKs.
- `expense_files`: UUID, FK restrictivas a gasto/autor/versión anterior, ruta única, caption, MIME WebP, tamaño, is_active, timestamps. Bucket fijo y rutas UUID, igual que el patrón implementado de `order_files`; no se conserva nombre local original ni URL pública. Índice por gasto y unicidad de reemplazo. Una versión reemplazada sigue siendo legible por quienes pueden consultar el gasto.
- `expenses_read`: vista security_invoker; importes y tasa como texto decimal exacto para evitar pérdida de precisión al transportar JSON.

Constraints verifican importes, moneda, finitud, cronología, relaciones, longitudes, estados, evidencia completa de tasas y anulación. CRC no inventa tasa. USD exige copia de tasa/fecha/fuente y `amount_crc=round(amount*exchange_rate_applied,2)`. Un histórico no puede usar fallback de fecha anterior.

### RPC y triggers

Operaciones authenticated: `save_expense_category`, `expense_rate`, `register_expense`, `edit_expense_notes`, `void_expense`. Wrappers públicos SECURITY INVOKER y funciones privadas SECURITY DEFINER donde necesitan escritura, todas con `search_path=''`. Helpers `expense_actor` y `lock_expense` no son invocables por roles de aplicación. `private` permanece fuera de Data API.

Infraestructura exclusivamente servidor: `store_expense_exchange_rate` persiste únicamente la respuesta validada del proveedor aprobado para hoy; `register_expense_file` asocia archivos previamente validados. El actor se obtiene del perfil autenticado por servidor y se vuelve a comprobar en BD; el formulario no aporta identidad comercial. Service role no recibe DML directo sobre tablas de gastos ni acceso a RPC comerciales.

`expense_guard` protege creación real, autor, estado vigente, datos originales y revisión. Descripción/notas y anulación autorizada cambian; importes, método, proveedor, tasa, fecha y vínculos son inmutables. La resolución posterior del criterio 10 permite además reclasificación administrativa controlada (ver cierre de auditoría). Corrección financiera: anular con motivo y nueva alta. `expense_audit` conserva before/after de creación, actualización y anulación. Categorías usan `audit_catalog`. Los archivos registran metadatos de versión anterior/nueva, sin binarios. El bloqueo de perfil y gasto evita escrituras por inactivos y pérdidas silenciosas; conflictos usan PT409/HTTP 409.

### Regla de cambio y evidencia histórica

El servidor usa la referencia válida persistida de hoy o consulta `https://tipodecambio.paginasweb.cr/api`, el proveedor ya aprobado. Valida fecha y respuesta; conserva el lexema decimal completo y almacena numeric. Si falla y existe una referencia válida anterior, la RPC elige automáticamente la más reciente: fecha real, fuente y `rate_is_fallback`, con aviso visible. Sin referencia previa, se bloquea USD. Colaborador nunca envía ni elige tasa.

Para históricos: fecha exacta en exchange_rates; si falta, únicamente Admin aporta la referencia para ese gasto, con procedencia, motivo, actor y timestamp. No sobrescribe la caché ni gastos anteriores. La tasa queda copiada en el gasto; el redondeo HALF UP se realiza una sola vez sobre el equivalente CRC final.

### Storage

Bucket `expense-receipts` privado, máximo 5 MiB, solo WebP almacenado. La entrada permite JPEG/PNG/WebP reales sin animación, hasta 25 MP; Sharp valida bytes/MIME y recodifica. No se confía en extensión. Subida UUID con upsert=false; no sobrescritura ni eliminación automática, tampoco ante error al asociar metadatos. Un posible objeto huérfano queda privado y sin acceso de aplicación.

Policy `expense_receipts_read`: USING(false), sin descarga directa con JWT de aplicación ni policies INSERT/UPDATE/DELETE. Descarga `/api/expense-file/[id]` con perfil vigente y metadatos autorizados mediante JWT/RLS; solo después descarga bytes desde servidor mediante infraestructura service_role, cacheNonce único y fetch no-store. La respuesta tiene private/no-store/nosniff; no entrega URL de Storage ni tokens reutilizables. Subidas cacheControl=0. Anulación conserva todas las versiones.

La prueba real inicial detectó una respuesta CDN HIT de un objeto previamente descargado después de inactivar al usuario, aunque RLS y el proxy ya denegaban acceso. Se corrigió mediante esta segunda migración y entrega exclusiva por servidor, preservando los permisos funcionales. La invalidación de caché no elimina archivos. Referencia técnica: [Supabase Smart CDN](https://supabase.com/docs/guides/storage/cdn/smart-cdn).

## Matriz de permisos

Los INSERT/UPDATE/DELETE siguientes se refieren a DML directo. No se ejecutan borrados para probar su denegación: se inspeccionan grants efectivos, incluido TRUNCATE, mediante `phase3d-permissions.sql`.

| Tabla | Actor | SELECT | INSERT | UPDATE | DELETE | RPC |
|---|---|---|---|---|---|---|
| expense_categories | Admin activo | Todas | No | No | No | Alta/edición/activar/desactivar |
| expense_categories | Colaborador | Activas y categorías históricas de gastos propios | No | No | No | Sin mantenimiento |
| expense_categories | Inactivo | 0 filas | No | No | No | No |
| expense_categories | Anónimo | No | No | No | No | No |
| expenses / expenses_read | Admin activo | Todos | No | No | No | Alta actual/histórica; notas; anulación |
| expenses / expenses_read | Colaborador | Solo propios | No | No | No | Alta hoy; descripción/notas propias válidas |
| expenses / expenses_read | Inactivo | 0 filas | No | No | No | No |
| expenses / expenses_read | Anónimo | No | No | No | No | No |
| expense_files | Admin activo | Todos autorizados | No | No | No | Servidor, gasto válido |
| expense_files | Colaborador | Solo gastos propios, aun versión anterior | No | No | No | Servidor, propio válido |
| expense_files | Inactivo | 0 filas | No | No | No | No |
| expense_files | Anónimo | No | No | No | No | No |

No hay listado global enviado al navegador del Colaborador. Gastos vinculados se consultan desde el pedido mediante filtro, manteniendo el mismo RLS; no se calcula costo final ni rentabilidad.

## Matriz de verificación

Implementación y validación de Fase 3D terminadas para revisión en DEV. Los pendientes de producción aceptados se mantienen separados; no se autorizó ni implementó 3E.

| Requisito | Estado | Evidencia | Prueba | Observación |
|---|---|---|---|---|
| D01 Categorías Admin y unicidad normalizada | COMPLETO | RPC, índice, RLS | PostgreSQL local/DEV y JWT DEV | Sin borrado |
| D02 Moneda original CRC/USD y numeric positivo | COMPLETO | Dominio, CHECKs, whitelist | Local/SQL DEV/API DEV | Cero, negativo, tres decimales, NaN, Infinity y exponentes rechazados |
| D03 CRC sin tasa inventada | COMPLETO | Evidencia nullable y amount_crc=amount | Local/DEV | Transporte decimal textual |
| D04 USD precisión completa y HALF UP | COMPLETO | 0.01 × 500.5000000000000000001 = 5.01 | Local y JWT DEV | Solo equivalente final redondeado |
| D05 Históricos por fecha y aporte Admin | COMPLETO | RPC y evidencia actor/motivo/fuente | Local/SQL DEV/API DEV | Colaborador rechazado; sin referencia normal bloqueado |
| D06 Fallback hoy automático con fecha real | COMPLETO | RPC DEV conserva fecha/tasa anterior; resolver ante caída y respuesta inválida | SQL local/DEV con ROLLBACK; proveedor simulado; alta USD UI DEV | La UI usó la referencia vigente persistida; la caída del proveedor y su aviso se simulan explícitamente |
| D07 Sin tasa previa bloquea USD | COMPLETO | Sin referencias elegibles en transacción aislada | PostgreSQL local y DEV con ROLLBACK | Huellas antes/después idénticas; no se borra la caché |
| D08 Actualizar caché no recalcula gasto | COMPLETO | Comparación de snapshot tras actualizar caché | PostgreSQL local y DEV, transacción revertida | Gastos y caché originales idénticos después de ROLLBACK |
| D09 Fechas empresariales y creador confiable | COMPLETO | Trigger/RPC | Local/DEV | Created_at real; histórico/futuro Colaborador rechazado |
| D10 Pedido/línea válidos y mismo padre | COMPLETO | FK compuesta y validación RPC | Local y JWT DEV con pedidos existentes | No modifica el pedido |
| D11 RLS propio/global y UUID ajeno | COMPLETO | Tabla, vista y HTML/RSC | JWT/API/UI DEV | Datos ajenos no enviados al Colaborador |
| D12 Inactivo/anónimo | COMPLETO | JWT vigente: cero filas, RPC denegada, descarga 401 y salida UI | SQL/API/Storage/navegador DEV real | Sesión abierta durante inactivación; perfil restaurado al finalizar |
| D13 DML/grants mínimos y private no expuesto | COMPLETO | Inspección grants; API negativas | Local/DEV y JWT | Sin permisos DELETE; service role solo infraestructura |
| D14 Edición propia limitada y revisión | COMPLETO | Whitelist y trigger | Local/DEV | Monto y autor falsos rechazados; revisión vieja 409 |
| D15 Anulación Admin y conservación | COMPLETO | Motivo/actor/timestamp; segunda anulación rechazada; archivos conservados | SQL/API/UI DEV y edición/anulación simultáneas | Una operación gana y la otra devuelve 409 |
| D16 Comprobantes privados por padre | COMPLETO | Metadata JWT/RLS; proxy autorizado; Storage directo bloqueado | UI/API/Storage DEV | UUID ajeno 404, inactivo 401, anon y ruta directa denegados |
| D17 Bytes/MIME/tamaño y recodificación | COMPLETO | normalizeImage y upload real | Tests locales y archivos falso/mayor a 5 MiB enviados al servidor conectado a DEV | Solo imágenes de formatos permitidos |
| D18 Reemplazo conserva versiones | COMPLETO | Dos metadatos y objetos descargables | Local y UI/Storage DEV | No compensación destructiva |
| D19 Auditoría y rollback | COMPLETO | Before/after y fallo inyectado de auditoría | PostgreSQL local y DEV con ROLLBACK | Sin binarios/secretos |
| D20 UI alta/detalle/lista/categorías | COMPLETO | Alta USD, recibos, anulación y desactivación UI | Navegador conectado a DEV | Rutas Admin y datos propios comprobados |
| D21 Responsive cinco anchos | COMPLETO | 25 combinaciones pantalla/ancho y controles | Navegador conectado a DEV | 320/375/768/1024/1440, sin scroll de página |
| D22 Loading/vacío/red/reduced-motion | COMPLETO | Vacío DEV; carga/error E2E; fallo inducido conserva campos y foco | UI DEV y errores simulados identificados | No se afirma una caída real del proveedor |
| D23 Regresión 3B/3C | COMPLETO | Huellas idénticas, tests SQL locales y 31 verificaciones reales | JWT/API/UI DEV: confirmaciones/pagos concurrentes, saldo, ciclo e ingresos | Ningún contrato previo modificado |
| D24 Advisors | COMPLETO | CLI DEV | Security Advisors real | Solo A51 WARN e INFO order_counters aceptado |
| D25 Secretos y artefactos | COMPLETO | verify-secrets.mjs | Archivos versionables y assets cliente | .env.local ignorado; sin secretos privados encontrados |
| D26 Sin fases posteriores | COMPLETO | Diff/migración/inventario | Revisión de alcance | No 3E ni módulos excluidos |

## Evidencia y límites

- Local: `npm test`, PostgreSQL PGlite real con todas las migraciones; tasas vacías/fallback/histórico, precisión, RLS y Storage simulado por esquema local. `expense-rate.test.mjs` prueba respuestas inválidas del proveedor sin llamadas externas.
- Simulado: Playwright E2E contra fixture HTTP, separado del servidor conectado a DEV. Fallos de red inducidos por interception no son incidentes reales de Supabase.
- DEV real: `phase3d-verification.sql`, `phase3d-permissions.sql` y `phase3d-rates-dev.sql` (esta última desplaza tasas solo dentro de una transacción revertida; huellas antes/después idénticas); `phase3d-real.mjs` usa JWT de cuentas existentes autorizadas, BD/RLS/Storage y navegador. No cambia contraseñas, no envía correos y no crea usuarios. Conserva gastos de prueba y los anula con motivo; conserva comprobantes; desactiva su categoría. La prueba de inactivo restaura al Colaborador al terminar. No ejecutar simultáneamente con otras pruebas que cambien su estado.
- Se corrigieron dos selectores del test: el anunciador de Next.js también usa role=alert y la etiqueta envolvente del select incluye sus opciones. La captura confirmó que el formulario estaba cargado durante el timeout del selector. No se añadieron reintentos automáticos de lecturas ni escrituras para ocultar errores.
- No hay pruebas de correo real nuevas en 3D: no aplica al módulo y Auth permanece intacto.
- A51 continúa PENDIENTE antes de producción; no bloquea DEV. El INFO `order_counters` es aislamiento intencional y no recibe grants/policies.

## Mantenimiento de seguridad durante la validación

La última consulta npm audit detectó GHSA-vcvr-r3jv-pc5j en Next.js 16.3.5. Se actualizó únicamente Next.js y eslint-config-next a 16.3.6, versión corregida según el [aviso oficial](https://github.com/vercel/next.js/security/advisories/GHSA-vcvr-r3jv-pc5j). SIGCA no contiene importaciones de next/og ni ImageResponse; aun así se elimina la dependencia afectada. Es un parche técnico, sin reglas funcionales nuevas, sin cambio mayor ni dependencias funcionales adicionales. Lockfile actualizado y verificaciones repetidas sobre el parche.

## Regresión real de fases anteriores

`tests/phase3d-regression-real.mjs`: 31 comprobaciones correctas sobre DEV, posteriores a la actualización de Next.js. Dos cotizaciones se confirman en paralelo por Admin/Colaborador con números distintos. Dos pagos contra el mismo saldo permiten uno y rechazan el otro con 409. Saldo, adelanto, producción/listo/entregado, anulación, cobro posterior a entrega y rechazo de sobrepago conservan el comportamiento anterior. Ingresos manuales: alta histórica Admin, invisibilidad/prohibición Colaborador, montos inválidos, anulación y auditoría. UI de pedido/ingreso a 320 y 1440 px. Se cancelan únicamente los pedidos de prueba, preservando pagos; ingreso de prueba anulado y cliente desactivado, sin eliminar registros. Huellas de los contratos 3B/3C coinciden entre local y DEV.

## Comandos y resultados finales

| Comando | Resultado | Entorno |
|---|---|---|
| npm run lint | Correcto | Local |
| npm run typecheck | Correcto | Local |
| npm test | 23 pruebas correctas | PostgreSQL local y dobles explícitos para proveedor |
| npm run build | Correcto, Next.js 16.3.6 | Build de producción local |
| npm run test:e2e | 22 correctas | Supabase simulado mediante fixture HTTP |
| npm audit --omit=dev | 0 vulnerabilidades | Registro npm consultado al finalizar |
| node tests/phase3d-real.mjs | 150 comprobaciones correctas; incluye 2 de red inducida identificadas | JWT/API/Storage/UI sobre Supabase DEV |
| node tests/phase3d-regression-real.mjs | 31 correctas | Supabase DEV real |
| node tests/verify-secrets.mjs | Correcto | Archivos versionables y assets cliente del build |
| supabase migration list / db push --dry-run | 14 migraciones equivalentes, ninguna pendiente | Supabase DEV real |
| supabase db advisors --type security | A51 WARN e INFO order_counters; sin hallazgos nuevos | Supabase DEV real |

Las pruebas HTTP de red y proveedor fallidos están simuladas expresamente. Las comprobaciones de RLS, permisos, integridad monetaria y Storage también se ejecutaron contra DEV real; sus resultados no se infieren de los mocks. No se realizaron pruebas de correo porque esta fase no modifica Auth.

## Archivos de implementación

- Dos migraciones nuevas `supabase/migrations/20260930*_phase3d_*.sql`; no se modificaron migraciones aplicadas.
- `src/features/expenses/{domain,rates,actions,files}.ts`.
- `src/app/(private)/gastos/`, `src/app/(private)/categorias-gastos/page.tsx` y `src/app/api/expense-file/[id]/route.ts`.
- `src/components/expense-form.tsx`, `expense-category-form.tsx`, navegación app-shell/Más y enlace desde detalle de pedido; ajustes visuales acotados en globals.css.
- Pruebas `tests/phase3d*.mjs`, `tests/expense-rate.test.mjs`, `tests/sql/phase3d-*.sql`, `tests/e2e/phase3d.spec.ts`, fixture HTTP y `tests/verify-secrets.mjs`.
- README, REQUIREMENTS, ARCHITECTURE, DATABASE, DECISIONS y esta matriz; package.json/package-lock.json por parche de seguridad.
- Sin nuevas variables, credenciales, dependencias funcionales ni pasos manuales de Supabase. Capturas, logs y resultados permanecen ignorados.

### Resultado del recorrido 3D y responsive

El recorrido final en Next.js 16.3.6 completó 150 comprobaciones. Dos son de carga/fallo de red inducidos en el navegador y no se presentan como incidentes externos reales; el resto incluye JWT/RLS/API, RPC, Storage privado y UI de SIGCA contra DEV. Se probaron 25 combinaciones de cinco pantallas y anchos 320, 375, 768, 1024 y 1440: sin overflow horizontal de página y controles esenciales de al menos 43 px medidos (aproximación de 44 px). Capturas de móvil/escritorio inspeccionadas; se evitó partir las etiquetas de estado y se distingue Anulado con texto y color de peligro. Se mantuvieron tarjetas móviles, tabla de escritorio, SweetAlert2, Sonner y reduced-motion.

El acceso a comprobantes pasa para Admin/autor activo por proxy, rechaza UUID ajeno (404), usuario inactivo (401), anónimo y descargas JWT directas. El bloqueo de usuario se probó conservando su JWT abierto. El reemplazo conserva dos versiones y la anulación mantiene ambas. Imágenes de bytes falsos y archivo mayor de 5 MiB se rechazaron sin crear metadatos. Finalizada la prueba, se restauró el Colaborador, se anularon los gastos de prueba y se desactivó su categoría; no se eliminó ningún dato ni archivo.

Comprobación final adicional: la prueba visual simulada de fallback muestra la advertencia y la fecha real anterior con precisión completa, sin afirmar una consulta real al proveedor. La prueba 3D ampliada se repitió correctamente después de los 22 E2E de la batería completa. Consulta final de fixtures: ambos perfiles activos; cero gastos/ingresos de prueba válidos, cero categorías de prueba activas y cero pedidos de regresión sin cancelar. Objetos, pagos e historial conservados. Lint, typecheck, build, audit y escaneo de secretos finales correctos; git diff --check sin errores. Los cambios de 3D quedan sin commit para revisión; no se hizo push ni se avanzó a 3E.

## Registro de pausa de auditoría — 2026-09-30 (antecedente)

Esta sección conserva el estado observado antes de la resolución posterior del criterio 10; sus pendientes no constituyen el resultado final. Esta sección distingue la auditoría posterior del resultado de implementación registrado arriba. La implementación fue confirmada en `0c18daa`; los cambios de auditoría todavía no tienen commit. No se declara cerrada la auditoría.

### Punto de decisión: criterio 10

`category_id` es inmutable para ambos roles en el contrato implementado. D-20/B3-09 limita expresamente al Colaborador a descripción/notas/comprobante, pero para Admin enumera corrección y categorías sin resolver expresamente la reclasificación posterior de un gasto. La inmutabilidad para Admin fue una interpretación de implementación, no una aprobación funcional explícita demostrada. Se solicita resolver entre mantener anulación + nuevo registro o permitir reclasificación administrativa con motivo y auditoría. No se ha modificado ese comportamiento durante la auditoría.

| Requisito | Estado | Evidencia | Prueba | Observación |
|---|---|---|---|---|
| 1: ocho categorías aprobadas | COMPLETO | RF-GAS-02 y DATABASE 2.10 ya presentes en 6e6b9aa | Inspección documental y Git | Materiales, Empaques, Impresiones, Envíos, Herramientas, Publicidad, Comisiones bancarias, Otros |
| 2: procedencia inequívoca | COMPLETO | Nueva columna derivada expenses_read.rate_origin y etiqueta UI | SQL local/DEV y JWT/UI DEV | admin_historical se deriva de evidencia administrativa inmutable; una referencia escrita por Admin no se presenta como proveedor automático |
| 10: autoridad sobre categoría posterior | PENDIENTE | D-20/B3-09 y contrato RPC | Revisión de aprobación original | Requiere decisión del usuario para Admin; no se inventa permiso |
| Reejecución completa y consolidación de criterios restantes | PARCIAL | Resultados parciales descritos abajo | Local y DEV, con E2E adicionales aún sin ejecutar | Auditoría detenida ante la decisión funcional; no trasladar automáticamente los resultados previos como nueva ejecución |

### Evidencia obtenida antes de la pausa

- `npm test`: 23 pruebas correctas. SQL adicional verifica payload cerrado, snapshot, HALF UP, cambios/desactivaciones de relaciones sin alterar gastos y rollback de asociación/versionado ante fallo de auditoría. Ejecutado también en DEV dentro de transacción con ROLLBACK.
- Lint, typecheck y build correctos antes de las últimas incorporaciones a los archivos de pruebas; falta repetirlos sobre el estado final. Build con Next.js 16.3.6.
- `tests/phase3d-audit-real.mjs`: 149 comprobaciones, matriz JWT de 12 combinaciones tabla/actor; incluye concurrencia, autorización, comprobantes y ambos roles a 320/375/768/1024/1440. La prueba restaura el perfil temporalmente inactivo. Sus fixtures se conservan con anulación/desactivación, sin borrado.
- Una asociación deliberadamente fallida deja un objeto privado sin vínculo; no deja revisión ni metadatos parciales del gasto. El objeto no es descargable por JWT operativo y se conserva sin eliminación automática. Su ruta está en evidencia local ignorada. No se afirma atomicidad entre Storage y PostgreSQL.
- Migración nueva `20260930230000_phase3d_rate_origin.sql`: únicamente amplía la vista de lectura con origen derivado. Pruebas locales, dry-run y aplicación DEV realizados; hashes de gastos y tasas antes/después idénticos. Comparación de esquema local/DEV correcta.
- Advisors: A51 continúa pendiente antes de producción; INFO order_counters aceptado por aislamiento intencional. Sin nuevos hallazgos.
- La actualización previa 16.3.5 → 16.3.6 afecta Next.js, eslint-config-next y sus paquetes @next relacionados. No se añadieron actualizaciones de dependencias durante esta auditoría.
- Las dos nuevas pruebas E2E simuladas de fallback para ambos roles todavía no se ejecutaron. Tampoco se ha repetido en esta auditoría la batería completa de regresión real de pedidos/pagos/ingresos; se conserva separada la evidencia anterior.
- `git diff --check` correcto. Logs, capturas y resultados se guardan en test-results ignorado. Escaneo final de secretos y verificaciones globales pendientes antes del cierre.
- Sin tag final, sin push y sin trabajo de Fase 3E.

## Auditoría de cierre — 2026-10-01

La resolución humana del criterio 10 completa D-20: categoría corregible por Admin activo mediante RPC con motivo y auditoría, sin alterar originales financieros. Se implementó después de documentar la decisión en DECISIONS, REQUIREMENTS, ARCHITECTURE y DATABASE. La pausa anterior queda conservada como antecedente. Esta matriz se consolida con las ejecuciones finales descritas debajo.

### Matriz de los 18 criterios solicitados

| Requisito | Estado | Evidencia | Prueba | Observación |
|---|---|---|---|---|
| 01 Ocho categorías aprobadas | COMPLETO | RF-GAS-02, DATABASE 2.10; commit original 6e6b9aa anterior a 3D | Revisión documental/Git y semillas SQL | Materiales, Empaques, Impresiones, Envíos, Herramientas, Publicidad, Comisiones bancarias, Otros; no inventadas durante 3D |
| 02 Procedencia de tasas | COMPLETO | expenses_read.rate_origin; rate_provided_by/at y rate_override_reason | SQL local/DEV, RPC/UI real con fuente manual escrita igual al nombre del proveedor | El texto libre no decide el origen; UI distingue aporte administrativo de referencia automática |
| 03 USD actual y fallback | COMPLETO | Resolver validado, expense_rate y snapshot | Test local de respuesta válida/fallo/inválida; SQL DEV sin referencia/con fallback como Colaborador; UI real y E2E visual específico | No se presenta una caída inducida como incidente externo; consulta directa actual rechazó fecha no vigente |
| 04 USD histórico | COMPLETO | Fecha exacta; aporte Admin solo si falta; cache separada | SQL DEV y alta histórica con JWT, motivo/actor/auditoría | Actualizar cache no recalcula gastos; Colaborador no aporta tasa |
| 05 Snapshot USD | COMPLETO | Numeric exacto, constraints e inmutabilidad | SQL y JWT DEV; HALF UP 0.01 × 500.50000000000000001 = 5.01; comparación integral tras reclasificar | Conserva importe, moneda, tasa completa, fecha, fuente y equivalente |
| 06 CRC | COMPLETO | Sin tasa ni evidencia USD; equivalente igual al original | SQL y RPC JWT DEV | Rechaza evidencia de tasa artificial |
| 07 Pedido/línea | COMPLETO | FKs restrictivas y compuesta | Alta sin pedido/con pedido/con línea; rechazos cruce/sin padre; SQL DEV cambia/desactiva padres y compara fila | No modifica gasto histórico |
| 08 Permisos | COMPLETO | RLS/grants y matriz JWT de 12 combinaciones | Admin/Colaborador/inactivo/anónimo × tres tablas y cinco operaciones | Colaborador solo gastos/archivos propios; catálogo necesario; ningún DML directo |
| 09 Edición posterior | COMPLETO | RPC notas con allowlist description/notes | 19 campos prohibidos en SQL; payloads directos JWT | category_id tampoco pasa por edición de notas |
| 10 Reclasificación | COMPLETO | D-20 resuelto por usuario; reclassify_expense y guard | SQL/DEV/JWT/UI; simultáneas, obsoleta, rol, estado, destino, motivo, DML, before/after e invariantes | No requiere anulación; futuros reportes usan categoría vigente; referencias conservadas al desactivar |
| 11 Anulación | COMPLETO | void_expense, estado terminal y conservación | Regresión completa 3D final correcta | Futuras proyecciones deben filtrar status=valid; no se implementan reportes ni devoluciones |
| 12 Comprobantes | COMPLETO | Bucket privado, proxy autorizado, validación bytes y versiones | Batería final original y ampliación correctas; se probó límite exacto de 5 MiB, MIME discordante y asociación fallida | No hay URLs públicas ni borrado automático |
| 13 Atomicidad/concurrencia | COMPLETO | Bloqueo de gasto/revisión y auditoría transaccional | Dos anulaciones, UUID duplicado, tasas simultáneas y reclasificaciones aprobadas; edición/anulación simultáneas correctas en batería final | Fallos de auditoría revierten alta/asociación/reclasificación; objeto sin vínculo queda privado, sin parcialidad del gasto |
| 14 Auditoría | COMPLETO | audit_log before/after/user_id/created_at/reason; evento expense.category_changed | SQL local/DEV y lectura Admin con JWT; Colaborador rechazado | Conserva eventos anteriores; sin secretos ni archivos binarios |
| 15 Next.js y dependencias | COMPLETO | Next y eslint-config-next 16.3.5 → 16.3.6; lock correspondiente | Diff de dependencias; regresión real pedidos/ingresos correcta; baterías finales 3D y E2E correctas | Solo paquetes relacionados @next; sin actualizaciones adicionales durante auditoría |
| 16 Regresión DEV | COMPLETO | Auth getUser/perfiles, Dashboard, settings/catalog, pedidos/pagos/ingresos, order_files | 31 comprobaciones reales de regresión y accesos base en batería ampliada | Sesiones Auth reales mediante enlaces administrativos de prueba en memoria, sin cambiar contraseñas; no se repitió correo ni login por contraseña |
| 17 Responsive/accesibilidad | COMPLETO | Ambos roles a 320/375/768/1024/1440; USD, archivos, reclasificación, motivo | Ampliación real, E2E fallback y batería original correctas | Sin overflow, controles y fuentes medidos; sin dependencia de hover |
| 18 Alcance | COMPLETO | Diff de implementación/auditoría limitado a gastos | Revisión Git, huellas previas 3B/3C y recorridos | Sin inventario/consumo/cronómetro/envíos/rentabilidad/reportes/costos compartidos ni 3E |

### Defectos y resolución

- Procedencia: el snapshot manual ya conservaba actor/fecha/motivo, pero la UI no diferenciaba claramente una referencia escrita por Admin del origen automático. Se añadió la proyección derivada rate_origin y etiquetas explícitas; no se reescribieron datos históricos. Probado incluso usando como texto manual el nombre canónico del proveedor.
- Criterio 10: la inmutabilidad de categoría para Admin había sido una interpretación sin aprobación explícita; se detuvo la auditoría. La decisión del usuario ahora está documentada e implementada con RPC, UI, autorización vigente, revisión, motivo y auditoría específica.
- No se cambian reglas de tasas, permisos de Colaborador ni campos financieros. No se modifica Auth ni el plan.

### Reclasificación: evidencia específica

Migración nueva `20261001050309_phase3d_reclassify_expense.sql`, BEGIN/COMMIT, reemplaza únicamente la función guard existente y añade wrapper/implementación RPC; sin DROP, borrado, nueva tabla ni edición de migraciones aplicadas. Prueba local anterior al dry-run; dry-run exclusivamente de este archivo; aplicación solo a pysgfnwsycgoneaecgcl. Se conservan RLS/grants de tablas y buckets. Admin/Colaborador comparten authenticated a nivel PostgreSQL; la autorización de negocio consulta el perfil activo y rechaza Colaborador con 42501 antes de leer/modificar el gasto. service_role y anon sin EXECUTE.

Admin válido y UI real: correctos. Colaborador/anónimo/inactivo: rechazados. Gasto anulado: PT409. Categoría inexistente/inactiva/igual, motivo vacío/nulo/espacios/más de 1000: rechazados. Revisión obsoleta y dos sesiones simultáneas: un éxito, un conflicto PT409/HTTP 409 y un solo evento específico. UPDATE directo Admin/Colaborador: 42501. Comparación antes/después excluye únicamente categoría y metadatos técnicos (revision/updated_by/updated_at); originales CRC, USD histórico y comprobantes idénticos. Desactivar una categoría mantiene referencias existentes. Fallo inyectado del evento category_changed revierte la fila y revisión en SQL DEV con ROLLBACK.

### Notas de operación y límites de evidencia

Una interrupción terminó procesos locales durante una batería. Se verificaron ambos perfiles activos y se anularon por RPC los fixtures identificados de esa ejecución con motivo; categoría de prueba desactivada y archivos conservados. La ejecución final completa sustituyó ese intento como evidencia. Un intento anterior tuvo TransportError de CLI/timeout de navegación; se conservan logs locales y no se lo cuenta como prueba aprobada.

La prueba deliberada de asociación fallida sube un objeto privado y rechaza después el registro por revisión obsoleta. PostgreSQL no deja revisión/metadatos parciales y el objeto no es legible por usuarios; el objeto de infraestructura se conserva para revisión, sin eliminación automática. No se afirma que Storage y PostgreSQL compartan una transacción. Sus rutas y evidencia operacional permanecen en test-results ignorado.

Para proveedor: éxito/fallo/respuesta inválida se ejercitan de forma controlada en tests locales; las ramas de selección de tasa y snapshots se prueban en PostgreSQL DEV, con fixtures revertidos. La consulta directa al proveedor durante el cierre rechazó una referencia con fecha distinta de hoy. No se afirma que el proveedor estuvo disponible con tasa vigente cuando no lo estuvo.

### Matriz JWT real de acceso directo

Todas las escrituras directas siguientes fueron rechazadas con 42501. SELECT de inactivo/anónimo devolvió cero filas o denegación. RPC indica autorización de negocio, no solo disponibilidad del endpoint; las de infraestructura de archivos son exclusivas del servidor después de validar actor y padre.

| Tabla | Actor | SELECT | INSERT | UPDATE | DELETE | RPC |
|---|---|---|---|---|---|---|
| expense_categories | Admin activo | Catálogo global | Denegado | Denegado | Denegado | Mantenimiento autorizado |
| expense_categories | Colaborador | Activas/históricas necesarias propias | Denegado | Denegado | Denegado | Mantenimiento denegado |
| expense_categories | Inactivo | Sin acceso | Denegado | Denegado | Denegado | Denegado |
| expense_categories | Anónimo | Sin acceso | Denegado | Denegado | Denegado | Denegado |
| expenses | Admin activo | Global | Denegado | Denegado | Denegado | Alta/notas/anulación/reclasificación controladas |
| expenses | Colaborador | Solo propios | Denegado | Denegado | Denegado | Alta/notas propias; anulación/reclasificación denegadas |
| expenses | Inactivo | Sin acceso | Denegado | Denegado | Denegado | Denegado |
| expenses | Anónimo | Sin acceso | Denegado | Denegado | Denegado | Denegado |
| expense_files | Admin activo | Por gasto global | Denegado | Denegado | Denegado | Registro directo denegado; servidor autorizado |
| expense_files | Colaborador | Por gasto propio | Denegado | Denegado | Denegado | Registro directo denegado; servidor valida propiedad |
| expense_files | Inactivo | Sin acceso | Denegado | Denegado | Denegado | Denegado |
| expense_files | Anónimo | Sin acceso | Denegado | Denegado | Denegado | Denegado |

Las pruebas DELETE emplean un predicado contradictorio (id=X AND id<>X) para comprobar privilegios sin posibilidad de borrar filas, incluso si existiera una regresión de grants. Las mutaciones de negocio sí se probaron con JWT contra RPC. No se deduce autorización de un botón oculto.

### Hallazgo del entorno de pruebas

Playwright usaba test-results como carpeta que limpia al comenzar, compartida con evidencias independientes y logs abiertos en Windows. Se cambió únicamente outputDir a test-results/playwright. La limpieza previa eliminó artefactos locales ignorados de ejecuciones ya observadas como correctas; no datos de Supabase. Los conteos de esas ejecuciones se conservan en esta matriz y en los resultados de herramientas de la auditoría, con sus pruebas reproducibles versionables. Además se ajustó el fixture HTTP de categorías para distinguir respuesta singular de listado, conforme al contrato de Supabase usado por la nueva UI. Ninguno de estos ajustes cambia código de negocio, Auth o permisos.

### Conteos y resultados finales

La matriz final solicitada contiene **18 COMPLETO, 0 PARCIAL, 0 PENDIENTE y 0 NO APLICA**. Son los 18 criterios de auditoría 3D, separados del pendiente de producción A51 y del registro histórico de la pausa.

| Validación | Resultado | Tipo de evidencia |
|---|---|---|
| npm test | 23 pruebas correctas | Local/PGlite; incluye SQL de invariantes, permisos y rollback; proveedor simulado identificado |
| npm run test:e2e | 24 correctas en repetición completa | Fixture HTTP simulado; incluye cinco anchos, ambos roles y fallback |
| tests/phase3d-audit-real.mjs | 175 comprobaciones correctas | Auth/JWT/API/Storage/UI contra DEV; incluye reclasificación y matriz completa |
| tests/phase3d-real.mjs | 149 comprobaciones correctas | Recorrido DEV original; 147 sobre sistema real y 2 estados de red inducidos explícitos |
| tests/phase3d-regression-real.mjs | 31 comprobaciones correctas | DEV real: cotización, confirmación/consecutivo concurrente, pago/saldo, producción/entrega y manual_income |
| SQL adicional DEV | Correcto | phase3d-audit.sql y phase3d-rates-dev.sql; transacciones revertidas, sin datos financieros de prueba persistidos |
| Esquema local/remoto | Equivalente en 12 dimensiones | Columnas, constraints, funciones, policies, índices, vista/opciones, RLS, triggers, grants, EXECUTE y bucket |
| Migraciones / dry-run final | 16 equivalentes; ninguna pendiente | Solo SIGCA DEV pysgfnwsycgoneaecgcl |
| npm audit --omit=dev | 0 vulnerabilidades | Dependencias de producción; Next.js 16.3.6 conservado |

Los tres recorridos con conexión DEV suman **355 comprobaciones**, de las cuales **353 son reales y 2 de red inducida**. No se suman a este total los E2E simulados ni las aserciones SQL internas. La batería original puede contar una comprobación adicional si gana la edición en la carrera edición/anulación y exige una anulación posterior; esta ejecución obtuvo 149 y no se reutiliza el conteo anterior de 150.

Responsive: 320/375/768/1024/1440, ambos roles; detalle USD, comprobantes y motivo de anulación. Reclasificación visible solo Admin y validada con persistencia real. Capturas móvil/escritorio inspeccionadas; sin overflow horizontal de página, controles aproximados de 44 px y fuentes de entrada mínimas de 16 px. Fallback visual se verifica adicionalmente con ambos roles y cinco anchos en E2E simulado.

Consulta de estado posterior a pruebas: ambos perfiles activos; cero gastos de auditoría/verificación válidos, cero categorías de prueba activas, cero ingresos de regresión válidos y cero pedidos de regresión sin cancelar. Originales, pagos, archivos y auditoría conservados. Ningún usuario eliminado ni contraseña modificada.

Security Advisors: **0 nuevos hallazgos**. Permanece [A51 auth_leaked_password_protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection) como pendiente antes de producción, sin bloquear DEV. El [INFO order_counters](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy) permanece aceptado por aislamiento intencional; no se añadieron grants ni policies para silenciarlo.

### Archivos de esta auditoría

- Documentación: README y docs/{DECISIONS,REQUIREMENTS,ARCHITECTURE,DATABASE,PHASE3D_VERIFICATION}.md.
- Migraciones nuevas: 20260930230000_phase3d_rate_origin.sql y 20261001050309_phase3d_reclassify_expense.sql; ambas aplicadas, ninguna migración aplicada editada.
- Aplicación: src/features/expenses/{domain,actions}.ts, src/components/expense-form.tsx y src/app/(private)/gastos/[id]/page.tsx.
- Pruebas: tests/phase3d-audit-real.mjs, tests/sql/phase3d-audit.sql, tests/sql/phase3d-schema.sql, tests/phase3d.test.mjs, tests/e2e/phase3d.spec.ts, tests/support/supabase-fixture.mjs y playwright.config.ts.

No se implementó Fase 3E ni se creó tag final, commit o push durante la auditoría. El checkpoint previo de implementación permanece en 0c18daa. No quedan decisiones funcionales abiertas de 3D después de resolver el criterio 10.

Verificación final posterior a los 24 E2E: lint, typecheck y build correctos (Next.js 16.3.6). El escaneo de secretos pasó para archivos versionables y assets de cliente; .env.local permanece ignorado y no hay artefactos temporales/capturas versionables. git diff --check correcto. Git conserva 15 archivos modificados y 4 nuevos, todos de esta auditoría/documentación/pruebas y reclasificación aprobada. Sin cambios pendientes en package.json/package-lock.json ni en next-env.d.ts.
