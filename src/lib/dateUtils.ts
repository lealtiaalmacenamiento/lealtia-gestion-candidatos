// Utilidades para normalizar campos de fecha antes de insertar/actualizar en BD
// Evita errores Postgres: "invalid input syntax for type date: \"\"" cuando llega string vacío

const DATE_FIELD_NAMES = new Set([
  'fecha_tentativa_de_examen',
  'fecha_limite_para_presentar_curricula_cdp',
  'inicio_escuela_fundamental',
  'pre_escuela_sesion_unica_de_arranque',
  'fecha_eliminacion',
  'fecha_de_creacion',
  'ultima_actualizacion'
])

// Convierte dd/mm/aaaa -> aaaa-mm-dd si es válido
function normalizeFormat(v: string): string | null {
  if (!v) return null
  // Ya en formato ISO corto
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v
  // Formato dd/mm/aaaa
  const m = v.match(/^([0-3]?\d)\/([0-1]?\d)\/(\d{4})$/)
  if (m) {
    const [ , d, mo, y ] = m
    return `${y}-${mo.padStart(2,'0')}-${d.padStart(2,'0')}`
  }
  return v
}

export function normalizeDateFields(obj: Record<string, unknown>): Record<string, unknown> {
  if (!obj || typeof obj !== 'object') return obj
  for (const key of Object.keys(obj)) {
    if (!DATE_FIELD_NAMES.has(key)) continue
    const val = obj[key]
    if (val === '') {
      obj[key] = null
      continue
    }
    if (typeof val === 'string') {
      const norm = normalizeFormat(val.trim())
      obj[key] = norm
    }
  }
  return obj
}
