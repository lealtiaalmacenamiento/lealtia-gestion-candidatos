type SupportedDateInput = Date | string | number | null | undefined

type FormatterOptions = Intl.DateTimeFormatOptions & {
  locale?: string
}

const DEFAULT_LOCALE = 'es-MX'
const DEFAULT_DATE_OPTIONS: Intl.DateTimeFormatOptions = { dateStyle: 'medium' }
const DEFAULT_DATETIME_OPTIONS: Intl.DateTimeFormatOptions = {
  dateStyle: 'medium',
  timeStyle: 'short'
}

function toDate(input: SupportedDateInput): Date | null {
  if (input == null) return null
  if (input instanceof Date) return Number.isNaN(input.getTime()) ? null : input
  const date = new Date(input)
  return Number.isNaN(date.getTime()) ? null : date
}

function resolveOptions(
  overrides: FormatterOptions | undefined,
  defaults: Intl.DateTimeFormatOptions
): { locale: string; options: Intl.DateTimeFormatOptions } {
  if (!overrides) {
    return { locale: DEFAULT_LOCALE, options: defaults }
  }
  const { locale, ...rest } = overrides
  const hasCustomFields = Object.keys(rest).length > 0
  return {
    locale: locale ?? DEFAULT_LOCALE,
    options: hasCustomFields ? rest : defaults
  }
}

export function formatDate(
  value: SupportedDateInput,
  options?: FormatterOptions
): string | null {
  const date = toDate(value)
  if (!date) return null
  const { locale, options: formatOptions } = resolveOptions(options, DEFAULT_DATE_OPTIONS)
  return new Intl.DateTimeFormat(locale, formatOptions).format(date)
}

export function formatDateTime(
  value: SupportedDateInput,
  options?: FormatterOptions
): string | null {
  const date = toDate(value)
  if (!date) return null
  const { locale, options: formatOptions } = resolveOptions(options, DEFAULT_DATETIME_OPTIONS)
  return new Intl.DateTimeFormat(locale, formatOptions).format(date)
}

type DateRangeValue = {
  start?: SupportedDateInput
  end?: SupportedDateInput
}

type DateRangeOptions = {
  start?: FormatterOptions
  end?: FormatterOptions
  separator?: string
  missingLabel?: string
}

export function formatDateRange(
  value: DateRangeValue,
  options?: DateRangeOptions
): string | null {
  const startLabel = formatDate(value.start ?? null, options?.start)
  const endLabel = formatDate(value.end ?? null, options?.end)
  if (!startLabel && !endLabel) return options?.missingLabel ?? null
  if (!startLabel) return endLabel
  if (!endLabel) return startLabel
  const separator = options?.separator ?? ' - '
  return `${startLabel}${separator}${endLabel}`
}

type CurrencyOptions = {
  locale?: string
  currency?: string
  minimumFractionDigits?: number
  maximumFractionDigits?: number
}

/**
 * Formatea un valor numérico como moneda usando Intl.NumberFormat.
 * Por defecto usa el locale 'es-MX' y la moneda 'MXN'.
 * 
 * @param value - Valor numérico a formatear (null/undefined retorna null)
 * @param options - Opciones de formateo (locale, currency, fractionDigits)
 * @returns String formateado como moneda o null si el valor es inválido
 * 
 * @example
 * formatCurrency(1234.56) // "$1,234.56"
 * formatCurrency(1000) // "$1,000.00"
 * formatCurrency(null) // null
 */
export function formatCurrency(
  value: number | null | undefined,
  options?: CurrencyOptions
): string | null {
  if (value == null || Number.isNaN(value)) return null
  
  const locale = options?.locale ?? DEFAULT_LOCALE
  const currency = options?.currency ?? 'MXN'
  
  const formatOptions: Intl.NumberFormatOptions = {
    style: 'currency',
    currency,
    minimumFractionDigits: options?.minimumFractionDigits ?? 2,
    maximumFractionDigits: options?.maximumFractionDigits ?? 2
  }
  
  return new Intl.NumberFormat(locale, formatOptions).format(value)
}
