# Cálculo Automático de SEG_GMM y SEG_VIDA

## Resumen de Cambios

Se implementó el cálculo automático de los campos `seg_gmm` y `seg_vida` en la tabla de candidatos, basándose en las pólizas reales del agente asociado, manteniendo la posibilidad de edición manual.

## Arquitectura

### Flujo de Datos

```
candidatos.email_agente → usuarios.email → usuarios.id_auth 
                           ↓
                      clientes.asesor_id
                           ↓
                      polizas.cliente_id
                           ↓
                producto_parametros.product_type_id
                           ↓
                     product_types.code
                           ↓
                  (GMM o VI) → puntos_actuales
```

### Lógica de Cálculo

- **SEG_GMM**: Suma de `puntos_actuales` de todas las pólizas GMM en vigor
- **SEG_VIDA**: Suma de `puntos_actuales` de todas las pólizas VI en vigor

**Filtros aplicados:**
- Solo pólizas con `estatus = 'EN_VIGOR'`
- Solo clientes con `activo = true`
- Solo usuarios con `activo = true`

**Formato de valores:**
- `seg_gmm`: Decimal con 1 decimal (permite 0.5)
- `seg_vida`: Entero (sin decimales)

## Archivos Modificados

### 1. `/src/app/api/candidatos/route.ts`

**Funciones añadidas:**

#### `enrichCandidatoWithPolizas(candidato)`
Enriquece un solo candidato con los conteos calculados desde las pólizas.

```typescript
// Ejemplo de uso interno (GET individual)
const enriched = await enrichCandidatoWithPolizas(candidato)
```

#### `enrichCandidatosWithPolizas(candidatos[])`
Enriquece múltiples candidatos de forma eficiente con una sola consulta a la BD.

```typescript
// Ejemplo de uso interno (GET lista)
const enriched = await enrichCandidatosWithPolizas(candidatos)
```

**Endpoints modificados:**

- `GET /api/candidatos` - Retorna todos los candidatos con valores calculados
- `GET /api/candidatos?ct=XXX` - Retorna candidato por CT con valores calculados
- `GET /api/candidatos?email_agente=XXX` - Retorna candidato por email con valores calculados

### 2. `/src/app/api/candidatos/[id]/route.ts`

**Cambios en `PUT /api/candidatos/:id`:**

Permite guardar valores manuales de `seg_gmm` y `seg_vida`:

```typescript
// Validación y normalización de valores manuales
if (typeof body.seg_gmm === 'number') {
  body.seg_gmm = Math.max(0, Number(body.seg_gmm.toFixed(1))) // GMM: decimales 0.5
}
if (typeof body.seg_vida === 'number') {
  body.seg_vida = Math.max(0, Math.round(body.seg_vida)) // VI: solo enteros
}
```

## Comportamiento

### Valores Calculados Automáticamente

Cuando se obtienen candidatos via GET:

1. Se busca el `email_agente` del candidato
2. Se obtiene el `id_auth` del usuario asociado
3. Se suman los puntos de pólizas GMM y VI en vigor
4. Se retornan los valores calculados en `seg_gmm` y `seg_vida`

**Ejemplo de respuesta:**

```json
{
  "id_candidato": 14,
  "candidato": "Jaime Orozco",
  "email_agente": "orozco.jaime25@gmail.com",
  "seg_gmm": 2.5,
  "seg_vida": 5,
  "..."
}
```

### Edición Manual

Los usuarios pueden editar manualmente estos valores desde el formulario de edición:

1. Se muestran los valores calculados automáticamente
2. El usuario puede ajustar con botones +/- 
3. Al guardar via PUT, se almacenan los valores editados
4. Los valores editados se mantienen en la BD
5. La próxima vez que se consulte via GET, se recalculan automáticamente

**Esto permite:**
- Ajustes manuales cuando sea necesario
- Correcciones de casos especiales
- Override temporal mientras se corrigen datos de pólizas

## Script de Prueba

Se creó el script `/scripts/test-candidato-seg-calculation.js` para verificar:

1. Candidatos con `email_agente` asignado
2. Usuarios activos asociados
3. Pólizas del agente
4. Cálculo correcto de SEG_GMM y SEG_VIDA
5. Comparación con valores en BD

**Ejecutar:**

```powershell
node scripts/test-candidato-seg-calculation.js
```

## Casos de Uso

### Caso 1: Candidato nuevo sin pólizas
```
email_agente: "nuevo@example.com"
Pólizas: 0
Resultado: seg_gmm = 0, seg_vida = 0
```

### Caso 2: Agente con pólizas GMM
```
email_agente: "agente@example.com"
Pólizas GMM: 3 pólizas × 0.5 puntos = 1.5
Resultado: seg_gmm = 1.5, seg_vida = 0
```

### Caso 3: Agente con pólizas VI
```
email_agente: "agente@example.com"
Pólizas VI: 2 pólizas (1 punto + 2 puntos) = 3
Resultado: seg_gmm = 0, seg_vida = 3
```

### Caso 4: Agente con ambos tipos
```
email_agente: "agente@example.com"
Pólizas GMM: 2 × 0.5 = 1.0
Pólizas VI: 3 puntos = 3
Resultado: seg_gmm = 1.0, seg_vida = 3
```

### Caso 5: Edición manual
```
1. GET candidato → seg_gmm = 1.5 (calculado)
2. Usuario edita → seg_gmm = 2.0 (manual)
3. PUT candidato → guarda 2.0 en BD
4. Próximo GET → recalcula automáticamente desde pólizas
```

## Ventajas de esta Implementación

1. **Cálculo automático**: No requiere intervención manual rutinaria
2. **Override manual**: Permite ajustes cuando sea necesario
3. **Rendimiento**: Optimizado para consultas masivas con JOINs eficientes
4. **Consistencia**: Siempre refleja el estado actual de las pólizas
5. **Auditable**: Los cambios manuales se registran en `logs_auditoria`
6. **Retrocompatible**: No rompe código existente que usa estos campos

## Limitaciones y Consideraciones

1. **Cache**: Los valores se calculan en cada GET. Para mejor rendimiento se podría:
   - Agregar cache en Redis
   - Materializar en tabla con trigger
   - Usar vista materializada

2. **Sincronización**: Si se crean/modifican pólizas, los valores se actualizan en el próximo GET

3. **Validación**: Los valores manuales se validan pero no se comparan con los calculados

4. **Permisos**: Cualquier usuario puede editar estos campos (según permisos de candidatos)

## Próximos Pasos (Opcional)

1. **Trigger automático**: Actualizar `seg_gmm` y `seg_vida` cuando cambien las pólizas
2. **Vista materializada**: Para consultas ultra-rápidas
3. **Histórico**: Registrar cambios de valores en tabla de auditoría
4. **Dashboard**: Mostrar evolución de puntos en el tiempo
5. **Alertas**: Notificar cuando los valores calculados difieran mucho de los manuales

## Testing

Para probar la funcionalidad completa:

```powershell
# 1. Verificar cálculo automático
node scripts/test-candidato-seg-calculation.js

# 2. Probar API directamente
# GET candidato con pólizas
curl http://localhost:3000/api/candidatos?email_agente=orozco.jaime25@gmail.com

# 3. Editar valores manualmente
# PUT candidato con nuevos valores
curl -X PUT http://localhost:3000/api/candidatos/14 \
  -H "Content-Type: application/json" \
  -d '{"seg_gmm": 5.5, "seg_vida": 10}'

# 4. Verificar que se guardaron
curl http://localhost:3000/api/candidatos/14
```

## Conclusión

La implementación permite que los campos `SEG_GMM` y `SEG_VIDA` se calculen automáticamente desde las pólizas reales del sistema, eliminando la necesidad de actualización manual, pero manteniendo la flexibilidad de edición cuando sea necesario.

Los valores se calculan en tiempo real basándose en:
- Pólizas GMM → `seg_gmm` (permite 0.5)
- Pólizas VI → `seg_vida` (solo enteros)

Esto garantiza que los datos siempre reflejen el estado actual del sistema de pólizas.
