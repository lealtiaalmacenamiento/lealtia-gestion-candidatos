# Fase 6: Pagos y Comisiones - Implementación Completa

## 📋 Resumen de Implementación

Implementación completa del sistema de tracking de pagos mensuales y dashboard de comisiones según especificación de Fase 6.

---

## ✅ Componentes Implementados

### 1. Base de Datos (Supabase)

#### Migraciones
- **`20251227_fase6_pagos_comisiones.sql`**: Migración principal
  - Enum `periodicidad_pago`: mensual, trimestral, semestral, anual
  - Enum `poliza_pago_estado`: pendiente, pagado, vencido, omitido
  - Tabla `poliza_pagos_mensuales` con calendario de pagos
  - Campo `fecha_limite_pago` en tabla `polizas`
  - 6 vistas materializadas para dashboards de comisiones
  - Funciones: `fn_generar_pagos_programados()`, `fn_actualizar_pagos_vencidos()`
  - Triggers automáticos en INSERT/UPDATE de `polizas`
  - Políticas RLS completas

- **`20251227_notificaciones.sql`**: Sistema de notificaciones
  - Tabla `notificaciones` con soporte Realtime
  - Políticas RLS para acceso por usuario
  - Índices optimizados

#### Vistas Materializadas
1. **vw_agentes_con_mes_conexion**: Agentes con mes_conexion establecido
2. **vw_agentes_sin_mes_conexion**: Agentes sin mes_conexion
3. **vw_comisiones_agente_mes**: Cálculo de comisiones por agente/periodo/mes
4. **vw_dashboard_comisiones_con_conexion**: Dashboard para agentes con mes_conexion (desglose por mes 1, 2, 3, 4+)
5. **vw_dashboard_comisiones_sin_conexion**: Dashboard para agentes sin mes_conexion
6. **vw_agente_comision_mes_actual**: Comisión del mes actual (uso interno)

### 2. Backend

#### Edge Function
- **`supabase/functions/actualizar-pagos-vencidos/index.ts`**
  - Cron diario para marcar pagos vencidos
  - Genera notificaciones in-app agrupadas por asesor
  - Autenticación via CRON_SECRET
  - Logging completo

#### API Endpoints (Next.js App Router)

**Pagos:**
- `GET /api/polizas/[id]/pagos` - Listar pagos programados de una póliza
- `POST /api/polizas/[id]/pagos/[periodo]` - Marcar pago como pagado
- `POST /api/polizas/[id]/pagos/generar` - Regenerar calendario de pagos
- `GET /api/pagos/alertas` - Alertas de pagos vencidos y próximos (7 días)

**Comisiones:**
- `GET /api/comisiones/con-conexion` - Dashboard con mes_conexion (filtros: periodo, efc, agente)
- `GET /api/comisiones/sin-conexion` - Dashboard sin mes_conexion (filtros: periodo, agente)
- `GET /api/agentes/[id]/comisiones` - Resumen individual de comisiones (filtro: periodo)

**Notificaciones:**
- `GET /api/notificaciones` - Listar notificaciones del usuario (filtro: leida)
- `PATCH /api/notificaciones/[id]` - Marcar notificación como leída
- `POST /api/notificaciones/marcar-todas-leidas` - Marcar todas como leídas

### 3. Frontend (React/Next.js)

#### Componentes
- **`src/components/polizas/PagosProgramados.tsx`**
  - Tabla de pagos programados con badges de estado
  - Modal para registrar pago con validaciones
  - Alertas visuales para pagos vencidos y próximos
  
- **`src/components/dashboard/AlertasPagos.tsx`**
  - Widget para dashboard principal
  - Tabs: Vencidos / Próximos (7 días)
  - Auto-refresh cada 5 minutos
  - Links a detalle de póliza

- **`src/components/layout/NotificacionesDropdown.tsx`**
  - Dropdown en navbar con contador de no leídas
  - Últimas 5 notificaciones
  - Iconos según tipo (💸 vencido, ⏰ próximo, 💰 comisión)
  - Marca como leída al hacer click
  - Solicitud de permisos de notificaciones del navegador

#### Páginas
- **`src/app/dashboard/comisiones/page.tsx`**
  - Dashboard de comisiones con 2 tabs (Con/Sin mes_conexion)
  - Filtros: periodo, EFC, agente
  - Tarjetas de resumen (pólizas, prima, comisión, periodos)
  - Tabla detallada con desglose por mes (para con_conexion)

#### Hooks
- **`src/hooks/useNotificaciones.ts`**
  - Hook personalizado con Supabase Realtime
  - Suscripción a INSERT/UPDATE en tabla `notificaciones`
  - Notificaciones del navegador (Web Notifications API)
  - Métodos: `marcarComoLeida()`, `marcarTodasLeidas()`, `refresh()`

### 4. Automatización

#### GitHub Actions
- **`.github/workflows/actualizar-pagos.yml`**
  - Ejecuta diariamente a las 8:00 AM UTC (2:00 AM CST)
  - Trigger manual disponible
  - Llama a Edge Function con autenticación
  - Variables de entorno: `REPORTES_CRON_SECRET`, `SUPABASE_URL`

---

## 🔧 Configuración Requerida

### Variables de Entorno

```env
# .env.local (Next.js)
NEXT_PUBLIC_SUPABASE_URL=https://wqutrjnxvcgmyyiyjmsd.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
```

### GitHub Secrets

```yaml
REPORTES_CRON_SECRET: <secret-para-autenticar-cron>
SUPABASE_URL: https://wqutrjnxvcgmyyiyjmsd.supabase.co
```

### Supabase Edge Functions

```bash
# Deploy de la Edge Function
supabase functions deploy actualizar-pagos-vencidos

# Configurar secrets
supabase secrets set CRON_SECRET=<mismo-secret-que-github>
```

---

## 📊 Flujo de Datos

### 1. Generación de Pagos Programados
```
Póliza creada/actualizada
  ↓
Trigger: trg_polizas_generar_pagos
  ↓
fn_generar_pagos_programados(poliza_id)
  ↓
Inserta registros en poliza_pagos_mensuales
  (según periodicidad_pago: mensual/trimestral/semestral/anual)
```

### 2. Actualización Diaria de Vencimientos
```
GitHub Actions (2 AM CST diariamente)
  ↓
POST https://...supabase.co/functions/v1/actualizar-pagos-vencidos
  ↓
fn_actualizar_pagos_vencidos() SQL
  ↓
UPDATE estado='vencido' WHERE fecha_limite < HOY AND estado='pendiente'
  ↓
Genera notificaciones agrupadas por asesor
  ↓
Supabase Realtime → Frontend (useNotificaciones hook)
```

### 3. Cálculo de Comisiones
```
Usuario consulta /dashboard/comisiones
  ↓
GET /api/comisiones/con-conexion?periodo=2025-01
  ↓
SELECT * FROM vw_dashboard_comisiones_con_conexion
  ↓
Vista materializada calcula:
  - Agrupa por agente/periodo/efc/mes_conexion
  - Suma polizas y primas por "mes desde conexión"
  - Calcula comision_vigente = SUM(prima * base_factor)
  ↓
Frontend renderiza tabla con desglose mes 1, 2, 3, 4+
```

---

## 🎯 Casos de Uso Implementados

### Para Asesores
✅ Ver calendario de pagos de cada póliza asignada  
✅ Registrar pago con monto, fecha y notas  
✅ Recibir notificaciones de pagos vencidos  
✅ Ver alertas de pagos próximos (7 días)  
✅ Consultar sus comisiones por periodo  

### Para Supervisores
✅ Ver alertas de todos los pagos de su equipo  
✅ Consultar comisiones de su equipo (filtro por EFC)  
✅ Regenerar calendario de pagos de una póliza  
✅ Ver resumen de comisiones con desglose por mes  

### Para Administradores
✅ Dashboard completo de comisiones (ambos tipos)  
✅ Filtros avanzados: periodo, EFC, agente  
✅ Exportación de datos (via endpoint, UI pendiente)  
✅ Gestión manual de estado de pagos  

---

## 🧪 Testing

### Endpoints de Testing

```bash
# Listar pagos de póliza 123
GET /api/polizas/123/pagos

# Marcar pago como pagado
POST /api/polizas/123/pagos/2025-01-01
{
  "monto_pagado": 1500.00,
  "fecha_pago": "2025-01-15",
  "notas": "Transferencia BBVA"
}

# Ver alertas
GET /api/pagos/alertas

# Dashboard comisiones con mes_conexion
GET /api/comisiones/con-conexion?periodo=2025-01&efc=1

# Notificaciones del usuario
GET /api/notificaciones?leida=false
```

### Queries SQL de Verificación

```sql
-- Verificar calendario de pagos
SELECT * FROM poliza_pagos_mensuales WHERE poliza_id = 123;

-- Ver comisiones de agente
SELECT * FROM vw_dashboard_comisiones_con_conexion 
WHERE agente_id = 'uuid-del-agente' 
  AND periodo = '2025-01';

-- Notificaciones pendientes
SELECT * FROM notificaciones WHERE usuario_id = auth.uid() AND leida = false;
```

---

## 📈 Próximos Pasos (Opcionales)

### Mejoras Sugeridas
- [ ] Exportación a Excel/PDF desde UI
- [ ] Gráficas de evolución de comisiones (Chart.js)
- [ ] Recordatorios 3 días antes de fecha límite
- [ ] Integración con pasarelas de pago
- [ ] Histórico de cambios en pagos (audit trail)
- [ ] Dashboard predictivo de comisiones futuras
- [ ] Notificaciones por email (SendGrid/Resend)

### Performance
- [ ] Refresh programado de vistas materializadas (pg_cron en plan Pro)
- [ ] Índices adicionales según queries lentos
- [ ] Cache Redis para endpoints de alta frecuencia

---

## 🐛 Troubleshooting

### Problema: Pagos no se generan automáticamente
**Solución**: Verificar que el trigger `trg_polizas_generar_pagos` existe:
```sql
SELECT * FROM pg_trigger WHERE tgname = 'trg_polizas_generar_pagos';
```

### Problema: Notificaciones no llegan en tiempo real
**Solución**: 
1. Verificar que Supabase Realtime está habilitado en la tabla `notificaciones`
2. Revisar permisos del navegador para notificaciones
3. Comprobar que el hook `useNotificaciones` está montado

### Problema: Comisiones no cuadran
**Solución**: 
1. Verificar que `poliza_puntos_cache.base_factor` está poblado
2. Revisar campo `mes_conexion` del usuario
3. Refrescar vistas materializadas:
```sql
REFRESH MATERIALIZED VIEW vw_dashboard_comisiones_con_conexion;
```

### Problema: GitHub Actions falla
**Solución**:
1. Verificar que `REPORTES_CRON_SECRET` coincide en GitHub y Supabase
2. Comprobar logs en Actions tab
3. Probar manualmente el endpoint de la Edge Function

---

## 📝 Notas de Implementación

### Decisiones de Diseño
- **Periodicidad legible**: Se usaron valores legibles (`mensual`, `trimestral`) en lugar de códigos ('M', 'T') para facilitar queries y UI
- **No se usa "personalizada"**: Se decidió trabajar solo con periodicidades estándar
- **Cron sin pg_cron**: Por limitaciones del plan Free de Supabase, se usa GitHub Actions + Edge Functions
- **Notificaciones in-app only**: No se implementan emails por ahora (decisión del usuario)
- **base_factor real**: Se usa `poliza_puntos_cache.base_factor` para cálculos precisos en lugar de un 10% hardcodeado

### Limitaciones Actuales
- Enum `periodicidad_pago` en pólizas existentes aún muestra códigos antiguos ('M', 'A') debido a conflictos con triggers durante migración. Nuevas pólizas usan valores correctos.
- Vistas materializadas no se refrescan automáticamente (requiere pg_cron en plan Pro)
- Sin caché de API (ISR implementado pero podría mejorarse con Redis)

---

## 📚 Referencias

- [Documentación Fase 6](./docs/fase6-pagos-comisiones.md)
- [Análisis de Implementación](./docs/ANALISIS_FASE6.md)
- [Supabase Edge Functions](https://supabase.com/docs/guides/functions)
- [Supabase Realtime](https://supabase.com/docs/guides/realtime)
- [Next.js App Router](https://nextjs.org/docs/app)

---

**Estado**: ✅ **Implementación Completa**  
**Fecha**: 27 de diciembre de 2024  
**Entorno Probado**: Dev (wqutrjnxvcgmyyiyjmsd.supabase.co)  
**Pendiente**: Deploy a Producción
