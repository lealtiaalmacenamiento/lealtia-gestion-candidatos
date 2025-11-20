# Guía de Uso - Formatos e Internacionalización

Esta guía documenta las nuevas utilidades de formato e internacionalización implementadas para el módulo de campañas.

## Formatos de moneda, fechas y números

### `formatCurrency(value, options?)`

Formatea valores numéricos como moneda MXN usando `Intl.NumberFormat`.

```typescript
import { formatCurrency } from '@/lib/format'

// Uso básico
formatCurrency(1234.56)  // "$1,234.56"
formatCurrency(1000)     // "$1,000.00"
formatCurrency(null)     // null

// Personalizar formato
formatCurrency(1500, { 
  minimumFractionDigits: 0,
  maximumFractionDigits: 0 
})  // "$1,500"

// Cambiar locale/moneda
formatCurrency(1000, { 
  locale: 'en-US', 
  currency: 'USD' 
})  // "$1,000.00"
```

### `formatDate(value, options?)`

Formatea fechas con estilo 'medium' por defecto.

```typescript
import { formatDate } from '@/lib/format'

formatDate('2025-01-15')           // "15 ene 2025"
formatDate(new Date('2025-06-01')) // "1 jun 2025"
formatDate(null)                   // null
```

### `formatDateRange(value, options?)`

Formatea rangos de fechas con separador personalizable.

```typescript
import { formatDateRange } from '@/lib/format'

formatDateRange({
  start: '2025-01-01',
  end: '2025-12-31'
})  // "1 ene 2025 - 31 dic 2025"

formatDateRange(
  { start: '2025-01-01', end: '2025-12-31' },
  { separator: ' al ' }
)  // "1 ene 2025 al 31 dic 2025"
```

## Internacionalización y Pluralización

### Helpers de pluralización

```typescript
import { pluralize, pluralForm, pluralizers } from '@/lib/i18n'

// pluralize() incluye el número
pluralize(1, 'póliza')   // "1 póliza"
pluralize(5, 'póliza')   // "5 pólizas"
pluralize(2, 'mes', 'meses')  // "2 meses"

// pluralForm() solo retorna la forma
pluralForm(1, 'requisito')  // "requisito"
pluralForm(3, 'requisito')  // "requisitos"

// Casos comunes predefinidos
pluralizers.poliza(3)      // "3 pólizas"
pluralizers.requisito(1)   // "1 requisito"
pluralizers.premio(2)      // "2 premios"
pluralizers.mes(12)        // "12 meses"
pluralizers.campana(4)     // "4 campañas"
pluralizers.segmento(7)    // "7 segmentos"
```

### Labels y badges de estado

```typescript
import {
  getCampaignStatusDisplay,
  getCampaignProgressStatusDisplay,
  getRuleKindLabel,
  getRuleScopeLabel,
  getOperatorLabel
} from '@/lib/i18n'

// Estado de campaña
const { label, badge } = getCampaignStatusDisplay('active')
// label: "Activa", badge: "bg-success"

// Estado de progreso
const progress = getCampaignProgressStatusDisplay('eligible')
// label: "Elegible", badge: "bg-info"

// Labels de reglas
getRuleKindLabel('COUNT_POLICIES')  // "Número de pólizas"
getRuleScopeLabel('goal')           // "Objetivo / Meta"
getOperatorLabel('gte')             // "≥ (mayor o igual)"
```

### Strings externalizadas

Todas las constantes están disponibles para uso directo:

```typescript
import {
  CAMPAIGN_STATUS_LABELS,
  VALIDATION_MESSAGES,
  SUCCESS_MESSAGES,
  ERROR_MESSAGES,
  GENERAL_LABELS,
  WIZARD_STEP_LABELS
} from '@/lib/i18n'

// Ejemplo en componentes
<span className={`badge ${CAMPAIGN_STATUS_BADGES[status]}`}>
  {CAMPAIGN_STATUS_LABELS[status]}
</span>

// Mensajes de validación
if (!slug) {
  return VALIDATION_MESSAGES.required.slug
}

// Notificaciones
onNotify(SUCCESS_MESSAGES.campaignCreated, 'success')
```

## Validaciones de Formularios

### Esquemas Zod con documentación

Los esquemas en `src/lib/validation/campaignSchemas.ts` incluyen documentación completa y ejemplos:

```typescript
import { 
  campaignWizardSchema,
  createCampaignWizardDefaultValues,
  type CampaignWizardFormValues 
} from '@/lib/validation/campaignSchemas'

// Uso con react-hook-form
const form = useForm<CampaignWizardFormValues>({
  resolver: zodResolver(campaignWizardSchema),
  defaultValues: createCampaignWizardDefaultValues()
})
```

### Validaciones asíncronas (TODO)

Los esquemas documentan cómo implementar validaciones asíncronas:

```typescript
// Ver comentarios en campaignSchemas.ts para:
// - Validación de slug único
// - Verificación de solapamiento de fechas
// - Validaciones customizadas

// Ejemplo de implementación:
slug: z.string()
  .refine(async (value) => {
    const response = await fetch(`/api/admin/campaigns/check-slug?slug=${value}`)
    const { available } = await response.json()
    return available
  }, { message: "Este slug ya está en uso" })
```

## Tests Unitarios

Todos los helpers tienen cobertura de tests en `test/formatAndI18n.test.ts`:

```bash
npm test -- formatAndI18n.test.ts
```

Los tests cubren:
- ✅ Formateo de moneda (valores válidos, inválidos, opciones)
- ✅ Formateo de fechas y rangos
- ✅ Pluralización (singular, plural, casos especiales)
- ✅ Labels y badges de estados
- ✅ Helpers de reglas y operadores

## Migración de Código Existente

Para actualizar componentes existentes:

### 1. Reemplazar strings hardcoded

**Antes:**
```typescript
const statusLabel = status === 'active' ? 'Activa' : 'Pausada'
```

**Después:**
```typescript
import { CAMPAIGN_STATUS_LABELS } from '@/lib/i18n'
const statusLabel = CAMPAIGN_STATUS_LABELS[status]
```

### 2. Usar formatCurrency

**Antes:**
```typescript
const formatted = `$${amount.toFixed(2)}`
```

**Después:**
```typescript
import { formatCurrency } from '@/lib/format'
const formatted = formatCurrency(amount)
```

### 3. Usar pluralización

**Antes:**
```typescript
const text = count === 1 ? `${count} póliza` : `${count} pólizas`
```

**Después:**
```typescript
import { pluralizers } from '@/lib/i18n'
const text = pluralizers.poliza(count)
```

## Próximos Pasos

- [ ] Migrar componentes existentes a usar `i18n.ts`
- [ ] Implementar validaciones asíncronas en schemas
- [ ] Añadir Storybook para documentar props de componentes
- [ ] Considerar integración de `next-intl` si se requiere multi-idioma
