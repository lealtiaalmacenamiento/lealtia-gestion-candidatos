# Políticas de Seguridad RLS - Fase 5

## Resumen de Políticas Implementadas

Este documento describe las políticas de Row Level Security (RLS) aplicadas a las tablas del módulo de campañas.

### Función Helper: `is_super_role()`

```sql
CREATE OR REPLACE FUNCTION is_super_role()
RETURNS boolean
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM usuarios
    WHERE id_auth = auth.uid()
      AND activo IS TRUE
      AND lower(rol) IN ('supervisor','admin')
  ) OR jwt_role() IN ('supervisor','admin');
END;
$$ LANGUAGE plpgsql;
```

**Propósito**: Verifica si el usuario actual tiene rol de `supervisor` o `admin` y está activo.

---

## Tabla: `segments`

### Políticas

1. **`segments_select_visible`** (SELECT)
   - **Permitido**: Todos los usuarios autenticados
   - **Condición**: Solo segmentos activos
   ```sql
   for select using (activo = true);
   ```

2. **`segments_manage_super`** (ALL)
   - **Permitido**: `supervisor` y `admin` únicamente
   - **Operaciones**: INSERT, UPDATE, DELETE
   ```sql
   for all
   using (public.is_super_role())
   with check (public.is_super_role());
   ```

### Justificación
- Lectura pública permite a todos los usuarios ver segmentos disponibles
- Solo supervisores pueden crear/modificar/eliminar segmentos

---

## Tabla: `user_segments`

### Políticas

1. **`user_segments_select_self`** (SELECT)
   - **Permitido**: Usuarios pueden ver sus propias asignaciones
   ```sql
   for select using (
     usuario_id = public.current_user_id() 
     OR public.is_super_role()
   );
   ```

2. **`user_segments_manage_super`** (ALL)
   - **Permitido**: `supervisor` y `admin` únicamente
   ```sql
   for all
   using (public.is_super_role())
   with check (public.is_super_role());
   ```

### Justificación
- Los usuarios ven sus propios segmentos
- Solo supervisores pueden asignar/quitar segmentos

---

## Tabla: `product_types`

### Políticas

1. **`product_types_select_all`** (SELECT)
   - **Permitido**: Todos los usuarios autenticados
   ```sql
   for select using (true);
   ```

2. **`product_types_manage_super`** (ALL)
   - **Permitido**: `supervisor` y `admin` únicamente
   ```sql
   for all
   using (public.is_super_role())
   with check (public.is_super_role());
   ```

### Justificación
- Catálogo de solo lectura para usuarios regulares
- Solo supervisores gestionan el catálogo

---

## Tabla: `campaigns`

### Políticas

1. **`campaigns_select_all`** (SELECT)
   - **Permitido**: Todos los usuarios autenticados
   ```sql
   for select using (true);
   ```
   - **Nota**: El filtrado por segmento se hace en la capa de aplicación

2. **`campaigns_manage_super`** (ALL)
   - **Permitido**: `supervisor` y `admin` únicamente
   ```sql
   for all
   using (public.is_super_role())
   with check (public.is_super_role());
   ```

### Justificación
- Todos pueden leer campañas (filtrado por segmento en API)
- Solo supervisores crean/modifican campañas

---

## Tabla: `campaign_rules`

### Políticas

1. **`campaign_rules_select_all`** (SELECT)
   - **Permitido**: Todos los usuarios autenticados
   ```sql
   for select using (true);
   ```

2. **`campaign_rules_manage_super`** (ALL)
   - **Permitido**: `supervisor` y `admin` únicamente
   ```sql
   for all
   using (public.is_super_role())
   with check (public.is_super_role());
   ```

### Justificación
- Lectura pública para mostrar requisitos
- Solo supervisores modifican reglas

---

## Tabla: `campaign_rewards`

### Políticas

1. **`campaign_rewards_select_all`** (SELECT)
   - **Permitido**: Todos los usuarios autenticados
   ```sql
   for select using (true);
   ```

2. **`campaign_rewards_manage_super`** (ALL)
   - **Permitido**: `supervisor` y `admin` únicamente
   ```sql
   for all
   using (public.is_super_role())
   with check (public.is_super_role());
   ```

### Justificación
- Todos ven los premios de las campañas
- Solo supervisores los definen

---

## Tabla: `campaign_segments`

### Políticas

1. **`campaign_segments_select_all`** (SELECT)
   - **Permitido**: Todos los usuarios autenticados
   ```sql
   for select using (true);
   ```

2. **`campaign_segments_manage_super`** (ALL)
   - **Permitido**: `supervisor` y `admin` únicamente
   ```sql
   for all
   using (public.is_super_role())
   with check (public.is_super_role());
   ```

### Justificación
- Lectura pública para saber qué segmentos aplican
- Solo supervisores asignan segmentos a campañas

---

## Tabla: `campaign_progress`

### Políticas

1. **`campaign_progress_select_all`** (SELECT)
   - **Permitido**: Todos los usuarios autenticados
   ```sql
   for select using (true);
   ```
   - **Nota**: El filtrado por usuario se hace en la capa de aplicación

2. **`campaign_progress_manage_super`** (ALL)
   - **Permitido**: `supervisor` y `admin` únicamente
   ```sql
   for all
   using (public.is_super_role())
   with check (public.is_super_role());
   ```

### Justificación
- Usuarios ven su propio progreso (filtrado en API)
- Sistema/supervisores actualizan el progreso

---

## Matriz de Permisos

| Tabla | Lectura (SELECT) | Escritura (INSERT/UPDATE/DELETE) |
|-------|-----------------|----------------------------------|
| `segments` | ✅ Todos (solo activos) | ⚠️ `supervisor`, `admin` |
| `user_segments` | ✅ Usuario (sus propios) + Supervisores | ⚠️ `supervisor`, `admin` |
| `product_types` | ✅ Todos | ⚠️ `supervisor`, `admin` |
| `campaigns` | ✅ Todos | ⚠️ `supervisor`, `admin` |
| `campaign_rules` | ✅ Todos | ⚠️ `supervisor`, `admin` |
| `campaign_rewards` | ✅ Todos | ⚠️ `supervisor`, `admin` |
| `campaign_segments` | ✅ Todos | ⚠️ `supervisor`, `admin` |
| `campaign_progress` | ✅ Todos | ⚠️ `supervisor`, `admin` |

---

## Capa de Aplicación (API Routes)

### Protección Adicional en Endpoints

Todos los endpoints `/api/admin/*` verifican permisos a nivel de aplicación:

```typescript
// src/lib/apiGuards.ts
export function requireSupervisor(usuario: UsuarioContext | null): void {
  if (!usuario?.activo) {
    throw new Error('Usuario no activo')
  }
  if (!['admin', 'supervisor'].includes(usuario.rol)) {
    throw new Error('Permisos insuficientes')
  }
}
```

### Endpoints Protegidos

- `/api/admin/segments` - CRUD de segmentos
- `/api/admin/segments/:id/assignments` - Asignación de usuarios a segmentos
- `/api/admin/campaigns` - CRUD de campañas
- `/api/admin/campaigns/:id` - Detalle y actualización
- `/api/admin/campaigns/:id/status` - Cambios de estado
- `/api/admin/product-types` - CRUD de tipos de póliza

---

## Auditoría

Todas las operaciones administrativas se registran en `registro_acciones`:

```typescript
await logAccion('campaign_created', {
  tabla_afectada: 'campaigns',
  registro_afectado_id: campaign.id,
  snapshot: campaign
})
```

---

## Verificación de Políticas

Para verificar que las políticas RLS están activas:

```sql
-- Verificar que RLS está habilitado
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'segments', 'user_segments', 'product_types',
    'campaigns', 'campaign_rules', 'campaign_rewards',
    'campaign_segments', 'campaign_progress'
  );

-- Listar políticas activas
SELECT tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename LIKE 'campaign%' OR tablename IN ('segments', 'user_segments', 'product_types')
ORDER BY tablename, policyname;
```

---

## Migraciones Relacionadas

- `20251111_phase5_campaigns_segments.sql` - Políticas iniciales
- `20251112_phase5_segment_utilities.sql` - Actualización de políticas de segmentos
- `20251113_phase5_roles_normalization.sql` - Normalización `superusuario` → `supervisor`
- `20250914_fase3_squash.sql` - Función `is_super_role()`

---

## Consideraciones de Seguridad

### ✅ Implementado

1. **Doble capa de seguridad**: RLS en BD + validación en API
2. **Principio de mínimo privilegio**: Lectura amplia, escritura restringida
3. **Auditoría completa**: Todas las operaciones se registran
4. **Roles normalizados**: Uso consistente de `supervisor` y `admin`

### ⚠️ Recomendaciones Futuras

1. **Políticas más granulares**: Considerar políticas específicas por estado de campaña
2. **Rate limiting**: Implementar límites de requests para endpoints admin
3. **Revisión periódica**: Auditar logs de `registro_acciones` regularmente
4. **Tests de seguridad**: Ampliar tests e2e para casos de acceso no autorizado

---

## Tests de Seguridad

Verificar con diferentes roles:

```bash
# Como agente - debe fallar en operaciones admin
curl -H "Authorization: Bearer <agente_token>" \
  -X POST https://app/api/admin/campaigns

# Como supervisor - debe permitir
curl -H "Authorization: Bearer <supervisor_token>" \
  -X POST https://app/api/admin/campaigns \
  -d '{"name":"Test","slug":"test",...}'

# Sin autenticación - debe redirigir a login
curl https://app/api/admin/campaigns
```
