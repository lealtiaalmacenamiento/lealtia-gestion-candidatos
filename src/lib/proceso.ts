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

interface Range { start: Date; end: Date }

const MS_PER_DAY = 86400000

function parseOneDate(raw?: string): Date | null {
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
  return null
}

function parseRange(raw?: string): Range | null {
  if (!raw) return null
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
    if (hoy.getTime() === examUTC.getTime()) return 'fecha_tentativa_de_examen'
    if (hoy.getTime() > examUTC.getTime()) return 'post_examen'
  }

  // Colección de campos/rangos (devolvemos el NOMBRE DEL CAMPO que contiene hoy)
  const campos: Array<{ campo: keyof SnapshotFechas; range: Range | null }> = [
    { campo: 'periodo_para_registro_y_envio_de_documentos', range: parseRange(s.periodo_para_registro_y_envio_de_documentos) },
    { campo: 'capacitacion_cedula_a1', range: parseRange(s.capacitacion_cedula_a1) },
    { campo: 'periodo_para_ingresar_folio_oficina_virtual', range: parseRange(s.periodo_para_ingresar_folio_oficina_virtual) },
    { campo: 'periodo_para_playbook', range: parseRange(s.periodo_para_playbook) },
    { campo: 'pre_escuela_sesion_unica_de_arranque', range: parseRange(s.pre_escuela_sesion_unica_de_arranque) },
    { campo: 'fecha_limite_para_presentar_curricula_cdp', range: parseRange(s.fecha_limite_para_presentar_curricula_cdp) },
    { campo: 'inicio_escuela_fundamental', range: parseRange(s.inicio_escuela_fundamental) }
  ]

  for (const c of campos) {
    if (c.range && hoy.getTime() >= c.range.start.getTime() && hoy.getTime() <= c.range.end.getTime()) {
      return String(c.campo)
    }
  }

  // Próximo campo futuro -> indicamos nombre prefijado con 'pendiente:'
  const futuras = campos.filter(c=> c.range && c.range.start.getTime() > hoy.getTime()).sort((a,b)=> a.range!.start.getTime() - b.range!.start.getTime())
  if (futuras.length) return 'pendiente:' + futuras[0].campo

  // Si hay examen futuro (pero no estamos en ningún rango ya finalizado todos los demás)
  if (examDate && hoy.getTime() < examDate.getTime()) return 'preparacion_examen'

  return 'sin_etapa'
}

export function calcularDerivados(s: SnapshotFechas) {
  return {
    dias_desde_ct: diasDesdeCT(s.fecha_creacion_ct),
    proceso: derivarProceso(s)
  }
}
