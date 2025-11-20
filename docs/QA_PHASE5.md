# Plan de QA Manual - Fase 5: Campaigns & Segments

## Objetivo
Validar el flujo completo del sistema de campañas desde la perspectiva del administrador y del usuario final (agente/promotor).

---

## Prerequisitos

- ✅ Base de datos con migraciones de Phase 5 aplicadas
- ✅ Seeds básicos ejecutados (`seed-segments`, `seed-campaigns`, `seed-custom-metrics`)
- ✅ Al menos 2 usuarios creados:
  - Usuario **supervisor** (ej: `admin@test.com`)
  - Usuario **agente** (ej: `agente@test.com`)
- ✅ Tipos de producto configurados (`vida`, `autos`, `diversos`)

---

## Escenario 1: Configuración de campaña (Admin/Supervisor)

### Paso 1.1: Crear segmento
1. Login como supervisor
2. Navegar a `/admin/segments` (pendiente UI en Fase 5.1)
3. Crear segmento "Equipo Norte" con:
   - `name`: "Equipo Norte"
   - `code`: "NORTE"
   - `description`: "Equipo de la región norte"
4. Verificar que aparece en la lista

**Resultado esperado**: Segmento creado exitosamente con `id` asignado.

### Paso 1.2: Crear campaña en borrador
1. Navegar a `/admin/campaigns`
2. Crear campaña "Promoción Q1 2025":
   - `name`: "Promoción Q1 2025"
   - `slug`: "promo-q1-2025"
   - `status`: `draft`
   - `activeRangeStart`: "2025-01-01"
   - `activeRangeEnd`: "2025-03-31"
   - Asociar segmento "Equipo Norte"
3. Guardar

**Resultado esperado**: Campaña creada en estado `draft`, no visible para agentes.

### Paso 1.3: Configurar métricas personalizadas
1. Editar campaña "Promoción Q1 2025"
2. Agregar dataset `ventas_mensuales` con columnas:
   - `producto_tipo` (string)
   - `ventas` (number, agg: sum)
   - `objetivo` (number, agg: sum)
3. Guardar configuración

**Resultado esperado**: Métricas almacenadas en `campaign_custom_metrics`.

### Paso 1.4: Activar campaña
1. Cambiar `status` de `draft` a `active`
2. Guardar

**Resultado esperado**: Campaña visible en `/api/campaigns` para usuarios del segmento "Equipo Norte".

---

## Escenario 2: Usuario no elegible → elegible (Agente)

### Paso 2.1: Usuario fuera de segmento
1. Login como agente **no** asignado al segmento "Equipo Norte"
2. Navegar a `/campaigns` o llamar `GET /api/campaigns`

**Resultado esperado**: La campaña "Promoción Q1 2025" **NO** aparece en la lista.

### Paso 2.2: Asignar usuario a segmento
1. Login como supervisor
2. Agregar al agente a `user_segments` con `segment_code = 'NORTE'`
3. Logout y volver a login como agente

**Resultado esperado**: Ahora la campaña "Promoción Q1 2025" **SÍ** aparece en `/api/campaigns`.

### Paso 2.3: Verificar detalles de campaña
1. Como agente, navegar a `/campaigns/promo-q1-2025`
2. Ver métricas personalizadas y fechas de vigencia

**Resultado esperado**: Detalle de campaña visible con métricas configuradas.

---

## Escenario 3: Campaña fuera de rango de fechas

### Paso 3.1: Campaña futura
1. Login como supervisor
2. Crear campaña "Promoción Q2 2025":
   - `activeRangeStart`: "2025-04-01" (futuro)
   - `activeRangeEnd`: "2025-06-30"
   - `status`: `active`
   - Asociar segmento "Equipo Norte"
3. Login como agente del segmento

**Resultado esperado**: Campaña **NO** aparece en `/api/campaigns` porque la fecha actual está fuera del rango.

### Paso 3.2: Campaña expirada
1. Crear campaña "Promoción Q4 2024":
   - `activeRangeStart`: "2024-10-01" (pasado)
   - `activeRangeEnd`: "2024-12-31" (pasado)
   - `status`: `active`
2. Verificar como agente

**Resultado esperado**: Campaña **NO** aparece porque ya expiró.

---

## Escenario 4: Completar campaña

### Paso 4.1: Marcar como completada
1. Login como supervisor
2. Cambiar estado de "Promoción Q1 2025" a `completed`
3. Guardar

**Resultado esperado**: Campaña desaparece de `/api/campaigns` para agentes.

### Paso 4.2: Verificar histórico
1. Como supervisor, verificar que la campaña sigue visible en `/admin/campaigns` con estado `completed`

**Resultado esperado**: Campaña archivada pero accesible para reportes.

---

## Escenario 5: Cancelar campaña

### Paso 5.1: Cancelar en medio de vigencia
1. Login como supervisor
2. Cambiar estado de "Promoción Q1 2025" a `cancelled`
3. Guardar

**Resultado esperado**: Campaña inmediatamente deja de aparecer en `/api/campaigns` incluso si la fecha está dentro del rango.

---

## Escenario 6: Múltiples segmentos en campaña

### Paso 6.1: Crear segunda campaña multiregional
1. Crear segmento "Equipo Sur" (`code: 'SUR'`)
2. Crear campaña "Promoción Nacional":
   - Asociar **ambos** segmentos: "Equipo Norte" y "Equipo Sur"
   - `status`: `active`
   - Rango de fechas vigente

**Resultado esperado**: Usuarios de cualquiera de los dos segmentos ven la campaña.

### Paso 6.2: Usuario en múltiples segmentos
1. Agregar agente a **ambos** segmentos ("NORTE" y "SUR")
2. Verificar `/api/campaigns`

**Resultado esperado**: Usuario ve campañas de ambos segmentos sin duplicados.

---

## Verificaciones de seguridad

### Test 1: Usuario sin permisos intenta crear campaña
- Login como **agente** (no supervisor)
- Intentar `POST /api/admin/campaigns`

**Resultado esperado**: `403 Forbidden`.

### Test 2: Usuario inactivo
- Marcar usuario como `activo = false` en BD
- Intentar acceder a `/api/campaigns`

**Resultado esperado**: `403 Forbidden`.

### Test 3: Usuario viewer intenta editar
- Login como usuario con rol `viewer`
- Intentar `PATCH /api/admin/campaigns/[id]`

**Resultado esperado**: `403 Forbidden`.

---

## Checklist de validación

- [ ] Campaña en `draft` no es visible para agentes
- [ ] Campaña `active` dentro de rango de fechas es visible
- [ ] Campaña fuera de rango de fechas no es visible
- [ ] Usuario no elegible (fuera de segmento) no ve la campaña
- [ ] Usuario elegible (en segmento) ve la campaña
- [ ] Cambio de estado `active` → `completed` oculta campaña
- [ ] Cambio de estado `active` → `cancelled` oculta campaña
- [ ] Métricas personalizadas se cargan correctamente
- [ ] Múltiples segmentos en una campaña funcionan (OR)
- [ ] Permisos RLS bloquean acceso no autorizado
- [ ] Rol `agente` no puede crear/editar campañas
- [ ] Rol `supervisor` puede crear/editar/eliminar campañas

---

## Notas adicionales

- **Browser testing**: Probar en Chrome, Firefox, Safari
- **Mobile responsive**: Verificar UI en viewport móvil
- **Performance**: Medir tiempo de carga de `/api/campaigns` con 10+ campañas
- **Edge cases**: 
  - Campaña sin segmentos (no debe ser elegible para nadie)
  - Usuario sin segmentos (no debe ver ninguna campaña)
  - Fechas de vigencia con zona horaria (`America/Mexico_City`)
