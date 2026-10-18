# Checklist de producción

PASS significa comprobación realizada; BLOCKER impide declarar v1.0.0; POST-RELEASE identifica seguimiento o configuración sin afectar módulos no dependientes. No confundir candidato estable con producción desplegada.

| Control | Estado | Acción/evidencia |
|---|---|---|
| Supabase separado PROD | BLOCKER | PROD_SUPABASE_REQUIRED: ref inequívoco y acceso; no usar DEV |
| Vercel propietario y dominio | BLOCKER | VERCEL_PROD_CONFIGURATION_REQUIRED: conectar cuenta/equipo chicho377 del despliegue mencionado y confirmar origen/proyecto |
| Variables/migraciones/Auth/SMTP PROD | BLOCKER | Ejecutar DEPLOYMENT tras identificar recursos; no copiar fixtures |
| A51 | BLOCKER | Free actual no lo admite; habilitar en plan compatible antes de producción; no cambio de plan autorizado |
| Respaldo y recuperación PROD | BLOCKER | Verificar plan, punto recuperable o respaldo externo completo y ensayo aislado; no capacidad prometida |
| Smoke productivo | BLOCKER | Requiere despliegue autorizado, identidades y datos controlados |
| Esquema DEV/RLS/Storage | PASS | 34 migraciones, tablas protegidas y 3 buckets privados |
| Registro público/anónimo | PASS | Deshabilitados, email/confirmación activos |
| Secretos y permisos | PASS | Separación servidor/cliente; verificar nuevamente antes de desplegar |
| Límites exportación | PASS | 5000, sin parcial; guía de usuario |
| Tarifa horaria | POST-RELEASE | Configuración requerida antes de Play; no bloquea otros módulos |
| Logo | POST-RELEASE | Opcional; pendiente, fallback textual |
| Cinco avisos tooling | POST-RELEASE | Una cadena braces/ESLint; sin parche compatible publicado, no runtime |
| INFO order_counters | PASS | Aislamiento intencional, sin grants/policies abiertos |
| Performance INFO | POST-RELEASE | Clasificación en PHASE7_VERIFICATION; no eliminar índices para silenciar |

No crear v1.0.0 hasta cerrar BLOCKER. Candidato v0.14-rc1 solamente si validación del software pasa. Las acciones técnicas posteriores a proporcionar recursos quedan autorizadas por Fase 7, pero no creación cloud ni cambios destructivos supuestos.
