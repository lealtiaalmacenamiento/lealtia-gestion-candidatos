// Utilidades para calcular proceso y días desde CT
// Se intenta interpretar rangos con formato "dd/mm/aaaa - dd/mm/aaaa" o una sola fecha.
// Fechas almacenadas en snapshot vienen como strings (posiblemente dd/mm/aaaa o yyyy-mm-dd).

export interface SnapshotFechas {
  periodo_para_registro_y_envio_de_documentos?: string
  capacitacion_cedula_a1?: string
  periodo_para_ingresar_folio_oficina_virtual?: string
  periodo_para_playbook?: string
  pre_escuela_sesion_unica_de_arranque?: string
  fecha_limite_para_presentar_curricula_cdp?: string
  inicio_escuela_fundamental?: string
  fecha_tentativa_de_examen?: string
  fecha_creacion_ct?: string
}

export interface Range { start: Date; end: Date }

const MS_PER_DAY = 86400000

// Mapa de meses en español (formas largas y abreviadas aceptadas)
const MESES: Record<string, number> = {
  enero:1, ene:1,
  febrero:2, feb:2,
  marzo:3, mar:3,
  abril:4, abr:4,
  mayo:5, may:5,
  junio:6, jun:6,
  julio:7, jul:7,
  agosto:8, ago:8,
  septiembre:9, setiembre:9, sept:9, sep:9,
  octubre:10, oct:10,
  noviembre:11, nov:11,
  diciembre:12, dic:12
}

// Devuelve índice de mes (1-12) desde un texto como "enero", "ene", o dentro de una cadena compuesta.
export function monthIndexFromText(text?: string): number | null {
  if (!text) return null
  const t = text.toLowerCase()
  // Buscar primera coincidencia de palabras separadas que estén en el mapa de meses
  const tokens = t.split(/[^a-záéíóúñ]+/i).filter(Boolean)
  for (const tok of tokens) {
    const mi = MESES[tok]
    if (mi) return mi
  }
  return null
}

export function parseOneDate(raw?: string): Date | null {
  if (!raw) return null
  const t = raw.trim()
  // yyyy-mm-dd
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) {
    const [y,m,d] = t.split('-').map(Number)
    return new Date(Date.UTC(y, (m||1)-1, d||1))
  }
  // dd/mm/aaaa o dd/mm/aa
  const m1 = t.match(/^(\d{1,2})[\/](\d{1,2})[\/](\d{2,4})$/)
  if (m1) {
  const [ , d, m, yRaw ] = m1
  const yFull = yRaw.length === 2 ? '20'+yRaw : yRaw
  const yi = Number(yFull), mi = Number(m), di = Number(d)
    if (yi && mi && di) return new Date(Date.UTC(yi, mi-1, di))
  }
  // Formatos con nombre de mes: "1 septiembre 2025", "1 sep 25", "1 de septiembre", "1 septiembre"
  const m2 = t.match(/^(\d{1,2})(?:\s+de)?\s+([a-zA-Záéíóúñ]+)(?:\s+(\d{2,4}))?$/i)
  if (m2) {
    const [, dStr, mesStrRaw, yRaw] = m2
    const mesKey = mesStrRaw.toLowerCase()
    const mi = MESES[mesKey]
    if (mi) {
      let year: number
      if (yRaw) {
        year = Number(yRaw.length === 2 ? '20'+yRaw : yRaw)
      } else {
        // Si el mes ya pasó y estamos cerca de fin de año quizá sea el próximo? Mantener año actual por simplicidad
        year = new Date().getUTCFullYear()
      }
      const di = Number(dStr)
      if (di >=1 && di <=31) return new Date(Date.UTC(year, mi-1, di))
    }
  }
  return null
}

export function parseRange(raw?: string): Range | null {
  if (!raw) return null
  const t = raw.trim()
  // Rango tipo "1 al 5 septiembre 2025" o "1-5 sep" (año opcional)
  const rg = t.match(/^(\d{1,2})\s*(?:-|al)\s*(\d{1,2})\s+([a-zA-Záéíóúñ]+)(?:\s+(\d{4}))?$/i)
  if (rg) {
    const [, d1, d2, mesStrRaw, yRaw] = rg
    const mesKey = mesStrRaw.toLowerCase()
    const mi = MESES[mesKey]
    if (mi) {
  const year = yRaw ? Number(yRaw) : new Date().getUTCFullYear()
      const di1 = Number(d1), di2 = Number(d2)
      if (di1>=1 && di1<=31 && di2>=1 && di2<=31) {
        const start = new Date(Date.UTC(year, mi-1, di1))
        const end = new Date(Date.UTC(year, mi-1, di2))
        if (end.getTime() < start.getTime()) return { start:end, end:start }
        return { start, end }
      }
    }
  }
  // Rango de un solo día expresado como "1 septiembre (2025)"
  const singleNamed = t.match(/^(\d{1,2})(?:\s+de)?\s+([a-zA-Záéíóúñ]+)(?:\s+(\d{4}))?$/i)
  if (singleNamed) {
    const [, dStr, mesStrRaw, yRaw] = singleNamed
    const mesKey = mesStrRaw.toLowerCase()
    const mi = MESES[mesKey]
    if (mi) {
  const year = yRaw ? Number(yRaw) : new Date().getUTCFullYear()
      const di = Number(dStr)
      if (di>=1 && di<=31) {
        const dt = new Date(Date.UTC(year, mi-1, di))
        return { start: dt, end: dt }
      }
    }
  }
  const parts = raw.split(/\s*-\s*|\sal\s/i).map(s=>s.trim()).filter(Boolean)
  if (parts.length === 2) {
    const a = parseOneDate(parts[0])
    const b = parseOneDate(parts[1])
    if (a && b) return { start: a, end: b }
  }
  const single = parseOneDate(raw)
  if (single) return { start: single, end: single }
  return null
}

// Extrae múltiples rangos/fechas de un solo string cuando vienen concatenados (tabs o múltiples espacios)
export function parseAllRanges(raw?: string): Range[] {
  if (!raw) return []
  const chunks = raw
  // Cortamos por separadores comunes de múltiples segmentos sin romper fechas tipo dd/mm/aaaa
  // Incluye: tabs, saltos de línea, pipes, comas, punto y coma, viñeta • y el conector " y "
  .split(/[\r\n]+|\t+|\s\|\s|,|;|\s{1}\u2022\s|\s+y\s+/i)
    .map(s=>s.trim())
    .filter(Boolean)
  const out: Range[] = []
  for (const c of chunks) {
    const r = parseRange(c)
    if (r) out.push(r)
  }
  if (!out.length) {
    const r = parseRange(raw)
    if (r) out.push(r)
  }
  return out
}

// =====================
// Anclaje de año/mes
// =====================
export interface Anchor { anchorMonth: number; anchorYear: number }

function pickYearClosest(monthIndex: number, anchor: Anchor): number {
  // Elegimos entre Y-1, Y, Y+1 el que deja el mes más cercano al ancla (en meses absolutos)
  const candidates = [anchor.anchorYear - 1, anchor.anchorYear, anchor.anchorYear + 1]
  let bestYear = anchor.anchorYear
  let bestAbs = Number.POSITIVE_INFINITY
  for (const y of candidates) {
    const diffMonths = (y - anchor.anchorYear) * 12 + (monthIndex - anchor.anchorMonth)
    const abs = Math.abs(diffMonths)
    if (abs < bestAbs) { bestAbs = abs; bestYear = y }
  }
  return bestYear
}

export function parseOneDateWithAnchor(raw?: string, anchor?: Anchor): Date | null {
  if (!raw) return null
  const t = raw.trim()
  // Mantener comportamientos con año explícito
  const iso = parseOneDate(t)
  if (iso) return iso
  // Formatos con nombre de mes sin año
  const m2 = t.match(/^(\d{1,2})(?:\s+de)?\s+([a-zA-Záéíóúñ]+)(?:\s+(\d{2,4}))?$/i)
  if (m2) {
    const [, dStr, mesStrRaw, yRaw] = m2
    const mesKey = mesStrRaw.toLowerCase()
    const mi = MESES[mesKey]
    if (!mi) return null
    let year: number
    if (yRaw) {
      year = Number(yRaw.length === 2 ? '20' + yRaw : yRaw)
    } else {
      year = anchor ? pickYearClosest(mi, anchor) : new Date().getUTCFullYear()
    }
    const di = Number(dStr)
    if (di >= 1 && di <= 31) return new Date(Date.UTC(year, mi - 1, di))
  }
  return null
}

export function parseRangeWithAnchor(raw?: string, anchor?: Anchor): Range | null {
  if (!raw) return null
  const t = raw.trim()
  // Rango "1-5 sep (año?)"
  const rg = t.match(/^(\d{1,2})\s*(?:-|al)\s*(\d{1,2})\s+([a-zA-Záéíóúñ]+)(?:\s+(\d{4}))?$/i)
  if (rg) {
    const [, d1, d2, mesStrRaw, yRaw] = rg
    const mi = MESES[mesStrRaw.toLowerCase()]
    if (mi) {
      const year = yRaw ? Number(yRaw) : (anchor ? pickYearClosest(mi, anchor) : new Date().getUTCFullYear())
      const di1 = Number(d1), di2 = Number(d2)
      if (di1>=1 && di1<=31 && di2>=1 && di2<=31) {
        const start = new Date(Date.UTC(year, mi-1, di1))
        const end = new Date(Date.UTC(year, mi-1, di2))
        if (end.getTime() < start.getTime()) return { start:end, end:start }
        return { start, end }
      }
    }
  }
  // Día único con nombre de mes
  const singleNamed = t.match(/^(\d{1,2})(?:\s+de)?\s+([a-zA-Záéíóúñ]+)(?:\s+(\d{4}))?$/i)
  if (singleNamed) {
    const [, dStr, mesStrRaw, yRaw] = singleNamed
    const mi = MESES[mesStrRaw.toLowerCase()]
    if (mi) {
      const year = yRaw ? Number(yRaw) : (anchor ? pickYearClosest(mi, anchor) : new Date().getUTCFullYear())
      const di = Number(dStr)
      if (di>=1 && di<=31) {
        const dt = new Date(Date.UTC(year, mi-1, di))
        return { start: dt, end: dt }
      }
    }
  }
  // Rango dd/mm - dd/mm (sin año explícito)
  const parts = raw.split(/\s*-\s*|\sal\s/i).map(s=>s.trim()).filter(Boolean)
  if (parts.length === 2) {
    const a = parseOneDate(parts[0]) || (anchor ? parseOneDateWithAnchor(parts[0], anchor) : null)
    const b = parseOneDate(parts[1]) || (anchor ? parseOneDateWithAnchor(parts[1], anchor) : null)
    if (a && b) return { start: a, end: b }
  }
  const single = parseOneDate(raw) || (anchor ? parseOneDateWithAnchor(raw, anchor) : null)
  if (single) return { start: single, end: single }
  return null
}

export function parseAllRangesWithAnchor(raw?: string, anchor?: Anchor): Range[] {
  if (!raw) return []
  const chunks = raw
    .split(/[\r\n]+|\t+|\s\|\s|,|;|\s{1}\u2022\s|\s+y\s+/i)
    .map(s=>s.trim())
    .filter(Boolean)
  const out: Range[] = []
  for (const c of chunks) {
    const r = parseRangeWithAnchor(c, anchor)
    if (r) out.push(r)
  }
  if (!out.length) {
    const r = parseRangeWithAnchor(raw, anchor)
    if (r) out.push(r)
  }
  return out
}

export function diasDesdeCT(fecha_creacion_ct?: string): number | undefined {
  if (!fecha_creacion_ct) return undefined
  const base = parseOneDate(fecha_creacion_ct)
  if (!base) return undefined
  const diff = Date.now() - base.getTime()
  return diff >= 0 ? Math.floor(diff / MS_PER_DAY) : 0
}

export function derivarProceso(s: SnapshotFechas, hoyDate: Date = new Date()): string {
  // Normalizamos hoy a UTC (solo fecha)
  const hoy = new Date(Date.UTC(hoyDate.getUTCFullYear(), hoyDate.getUTCMonth(), hoyDate.getUTCDate()))

  // Rango especial: fecha_tentativa_de_examen (si coincide el día exacto lo mostramos como campo activo)
  const examDate = parseOneDate(s.fecha_tentativa_de_examen || '')
  if (examDate) {
    const examUTC = new Date(Date.UTC(examDate.getUTCFullYear(), examDate.getUTCMonth(), examDate.getUTCDate()))
    if (hoy.getTime() === examUTC.getTime()) return 'FECHA TENTATIVA DE EXAMEN'
    if (hoy.getTime() > examUTC.getTime()) return 'POST EXAMEN'
  }

  // Colección de campos/rangos (devolvemos el NOMBRE DEL CAMPO que contiene hoy)
  const campos: Array<{ etiqueta: string; range: Range | null }> = [
    { etiqueta: 'PERIODO PARA REGISTRO Y ENVÍO DE DOCUMENTOS', range: parseRange(s.periodo_para_registro_y_envio_de_documentos) },
    { etiqueta: 'CAPACITACIÓN CÉDULA A1', range: parseRange(s.capacitacion_cedula_a1) },
    { etiqueta: 'PERIODO PARA INGRESAR FOLIO OFICINA VIRTUAL', range: parseRange(s.periodo_para_ingresar_folio_oficina_virtual) },
    { etiqueta: 'PERIODO PARA PLAYBOOK', range: parseRange(s.periodo_para_playbook) },
    { etiqueta: 'PRE ESCUELA SESIÓN ÚNICA DE ARRANQUE', range: parseRange(s.pre_escuela_sesion_unica_de_arranque) },
    { etiqueta: 'FECHA LÍMITE PARA PRESENTAR CURRÍCULA CDP', range: parseRange(s.fecha_limite_para_presentar_curricula_cdp) },
    { etiqueta: 'INICIO ESCUELA FUNDAMENTAL', range: parseRange(s.inicio_escuela_fundamental) }
  ]

  for (const c of campos) {
    if (c.range && hoy.getTime() >= c.range.start.getTime() && hoy.getTime() <= c.range.end.getTime()) {
      return c.etiqueta
    }
  }

  // Próximo campo futuro -> indicamos nombre prefijado con 'pendiente:'
  const futuras = campos.filter(c=> c.range && c.range.start.getTime() > hoy.getTime()).sort((a,b)=> a.range!.start.getTime() - b.range!.start.getTime())
  if (futuras.length) return  futuras[0].etiqueta

  // Si hay examen futuro (pero no estamos en ningún rango ya finalizado todos los demás)
  if (examDate && hoy.getTime() < examDate.getTime()) return 'PREPARACIÓN EXAMEN'

  return 'SIN ETAPA'
}

export function calcularDerivados(s: SnapshotFechas) {
  return {
    dias_desde_ct: diasDesdeCT(s.fecha_creacion_ct),
    proceso: derivarProceso(s)
  }
}

// Mapeo a etiquetas legibles en UI
export const LABELS: Record<string,string> = {
  // Ya no se usan códigos internos, la función derivarProceso devuelve etiquetas finales.
}

export function etiquetaProceso(codigo?: string): string {
  return codigo || ''
}
