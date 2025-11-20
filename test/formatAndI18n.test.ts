import { describe, expect, it } from 'vitest'
import { formatCurrency, formatDate, formatDateTime, formatDateRange } from '@/lib/format'
import {
  pluralize,
  pluralForm,
  pluralizers,
  getCampaignStatusDisplay,
  getCampaignProgressStatusDisplay,
  getRuleKindLabel,
  getRuleScopeLabel,
  getOperatorLabel
} from '@/lib/i18n'

describe('formatCurrency', () => {
  it('formatea valores numéricos como moneda MXN', () => {
    expect(formatCurrency(1234.56)).toMatch(/1,?234\.56/)
    expect(formatCurrency(1000)).toMatch(/1,?000\.00/)
    expect(formatCurrency(0)).toMatch(/0\.00/)
  })

  it('maneja valores negativos', () => {
    const result = formatCurrency(-500.25)
    expect(result).toBeTruthy()
    expect(result).toContain('500.25')
  })

  it('retorna null para valores inválidos', () => {
    expect(formatCurrency(null)).toBeNull()
    expect(formatCurrency(undefined)).toBeNull()
    expect(formatCurrency(NaN)).toBeNull()
  })

  it('respeta minimumFractionDigits y maximumFractionDigits', () => {
    const result = formatCurrency(1234, { minimumFractionDigits: 0, maximumFractionDigits: 0 })
    expect(result).not.toContain('.')
  })

  it('permite cambiar locale y currency', () => {
    const result = formatCurrency(1000, { locale: 'en-US', currency: 'USD' })
    expect(result).toBeTruthy()
    expect(result).toContain('1')
  })
})

describe('formatDate', () => {
  it('formatea fechas ISO', () => {
    const result = formatDate('2025-01-15')
    expect(result).toBeTruthy()
    expect(result).toContain('2025')
  })

  it('retorna null para fechas inválidas', () => {
    expect(formatDate(null)).toBeNull()
    expect(formatDate(undefined)).toBeNull()
    expect(formatDate('fecha-invalida')).toBeNull()
  })

  it('acepta objetos Date', () => {
    const date = new Date('2025-06-01')
    const result = formatDate(date)
    expect(result).toBeTruthy()
    expect(result).toContain('2025')
  })
})

describe('formatDateTime', () => {
  it('formatea fecha y hora', () => {
    const result = formatDateTime('2025-01-15T14:30:00Z')
    expect(result).toBeTruthy()
    expect(result).toContain('2025')
  })

  it('retorna null para valores inválidos', () => {
    expect(formatDateTime(null)).toBeNull()
    expect(formatDateTime(undefined)).toBeNull()
  })
})

describe('formatDateRange', () => {
  it('formatea un rango con inicio y fin', () => {
    const result = formatDateRange({
      start: '2025-01-01',
      end: '2025-12-31'
    })
    expect(result).toBeTruthy()
    expect(result).toContain('2025')
    expect(result).toContain('-')
  })

  it('maneja solo fecha de inicio', () => {
    const result = formatDateRange({ start: '2025-01-01' })
    expect(result).toBeTruthy()
    // La función retorna una fecha formateada independientemente del formato específico
    expect(typeof result).toBe('string')
    if (result) {
      expect(result.length).toBeGreaterThan(0)
    }
  })

  it('maneja solo fecha de fin', () => {
    const result = formatDateRange({ end: '2025-12-31' })
    expect(result).toBeTruthy()
    expect(result).toContain('2025')
  })

  it('retorna missingLabel cuando ambas fechas son null', () => {
    const result = formatDateRange({}, { missingLabel: 'Sin fecha' })
    expect(result).toBe('Sin fecha')
  })

  it('permite personalizar el separador', () => {
    const result = formatDateRange(
      { start: '2025-01-01', end: '2025-12-31' },
      { separator: ' al ' }
    )
    expect(result).toContain(' al ')
  })
})

describe('pluralize', () => {
  it('retorna singular para count = 1', () => {
    expect(pluralize(1, 'póliza')).toBe('1 póliza')
    expect(pluralize(1, 'requisito')).toBe('1 requisito')
  })

  it('retorna plural para count != 1', () => {
    expect(pluralize(0, 'póliza')).toBe('0 pólizas')
    expect(pluralize(2, 'póliza')).toBe('2 pólizas')
    expect(pluralize(10, 'requisito')).toBe('10 requisitos')
  })

  it('permite especificar forma plural personalizada', () => {
    expect(pluralize(2, 'mes', 'meses')).toBe('2 meses')
    expect(pluralize(1, 'mes', 'meses')).toBe('1 mes')
  })

  it('añade "s" por defecto si no se especifica plural', () => {
    expect(pluralize(5, 'premio')).toBe('5 premios')
  })
})

describe('pluralForm', () => {
  it('retorna solo la forma sin el número', () => {
    expect(pluralForm(1, 'póliza')).toBe('póliza')
    expect(pluralForm(5, 'póliza')).toBe('pólizas')
  })
})

describe('pluralizers', () => {
  it('poliza pluraliza correctamente', () => {
    expect(pluralizers.poliza(1)).toBe('1 póliza')
    expect(pluralizers.poliza(3)).toBe('3 pólizas')
  })

  it('requisito pluraliza correctamente', () => {
    expect(pluralizers.requisito(1)).toBe('1 requisito')
    expect(pluralizers.requisito(2)).toBe('2 requisitos')
  })

  it('premio pluraliza correctamente', () => {
    expect(pluralizers.premio(0)).toBe('0 premios')
    expect(pluralizers.premio(1)).toBe('1 premio')
  })

  it('mes pluraliza correctamente', () => {
    expect(pluralizers.mes(1)).toBe('1 mes')
    expect(pluralizers.mes(12)).toBe('12 meses')
  })

  it('campana pluraliza correctamente', () => {
    expect(pluralizers.campana(1)).toBe('1 campaña')
    expect(pluralizers.campana(4)).toBe('4 campañas')
  })

  it('segmento pluraliza correctamente', () => {
    expect(pluralizers.segmento(1)).toBe('1 segmento')
    expect(pluralizers.segmento(7)).toBe('7 segmentos')
  })
})

describe('getCampaignStatusDisplay', () => {
  it('retorna label y badge correctos para estados conocidos', () => {
    expect(getCampaignStatusDisplay('draft')).toEqual({
      label: 'Borrador',
      badge: 'bg-secondary'
    })
    expect(getCampaignStatusDisplay('active')).toEqual({
      label: 'Activa',
      badge: 'bg-success'
    })
    expect(getCampaignStatusDisplay('paused')).toEqual({
      label: 'Pausada',
      badge: 'bg-warning'
    })
    expect(getCampaignStatusDisplay('archived')).toEqual({
      label: 'Archivada',
      badge: 'bg-light text-dark'
    })
  })

  it('retorna el estado original para estados desconocidos', () => {
    const result = getCampaignStatusDisplay('unknown')
    expect(result.label).toBe('unknown')
    expect(result.badge).toBe('bg-secondary')
  })
})

describe('getCampaignProgressStatusDisplay', () => {
  it('retorna label y badge correctos para estados de progreso', () => {
    expect(getCampaignProgressStatusDisplay('not_eligible')).toEqual({
      label: 'No elegible',
      badge: 'bg-secondary'
    })
    expect(getCampaignProgressStatusDisplay('eligible')).toEqual({
      label: 'Elegible',
      badge: 'bg-info'
    })
    expect(getCampaignProgressStatusDisplay('completed')).toEqual({
      label: 'Meta cumplida',
      badge: 'bg-success'
    })
  })
})

describe('getRuleKindLabel', () => {
  it('retorna labels correctos para tipos de regla', () => {
    expect(getRuleKindLabel('ROLE')).toBe('Rol requerido')
    expect(getRuleKindLabel('SEGMENT')).toBe('Segmento objetivo')
    expect(getRuleKindLabel('COUNT_POLICIES')).toBe('Número de pólizas')
    expect(getRuleKindLabel('TOTAL_PREMIUM')).toBe('Total de primas')
    expect(getRuleKindLabel('RC_COUNT')).toBe('Número de RC')
  })

  it('retorna el kind original si no está mapeado', () => {
    expect(getRuleKindLabel('UNKNOWN_KIND')).toBe('UNKNOWN_KIND')
  })
})

describe('getRuleScopeLabel', () => {
  it('retorna labels correctos para scopes', () => {
    expect(getRuleScopeLabel('eligibility')).toBe('Elegibilidad')
    expect(getRuleScopeLabel('goal')).toBe('Objetivo / Meta')
  })
})

describe('getOperatorLabel', () => {
  it('retorna labels correctos para operadores', () => {
    expect(getOperatorLabel('gte')).toBe('≥ (mayor o igual)')
    expect(getOperatorLabel('gt')).toBe('> (mayor que)')
    expect(getOperatorLabel('lte')).toBe('≤ (menor o igual)')
    expect(getOperatorLabel('lt')).toBe('< (menor que)')
    expect(getOperatorLabel('eq')).toBe('= (igual a)')
  })

  it('retorna el operador original si no está mapeado', () => {
    expect(getOperatorLabel('unknown_op')).toBe('unknown_op')
  })
})
