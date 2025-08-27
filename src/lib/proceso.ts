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
  const hoy = new Date(Date.UTC(hoyDate.getUTCFullYear(), hoyDate.getUTCMonth(), hoyDate.getUTCDate()))
  const exam = parseOneDate(s.fecha_tentativa_de_examen || '')

  // Si ya pasó examen
  if (exam && hoy.getTime() > exam.getTime()) return 'Post-examen'

  const etapas: Array<{ nombre: string; range: Range | null }> = [
    { nombre: 'Registro', range: parseRange(s.periodo_para_registro_y_envio_de_documentos) },
    { nombre: 'Capacitación A1', range: parseRange(s.capacitacion_cedula_a1) },
    { nombre: 'Folio OV', range: parseRange(s.periodo_para_ingresar_folio_oficina_virtual) },
    { nombre: 'Playbook', range: parseRange(s.periodo_para_playbook) },
    { nombre: 'Pre Escuela', range: parseRange(s.pre_escuela_sesion_unica_de_arranque) },
    { nombre: 'Currícula CDP', range: parseRange(s.fecha_limite_para_presentar_curricula_cdp) },
    { nombre: 'Escuela Fundamental', range: parseRange(s.inicio_escuela_fundamental) }
  ]

  for (const e of etapas) {
    if (e.range && hoy.getTime() >= e.range.start.getTime() && hoy.getTime() <= e.range.end.getTime()) {
      return e.nombre
    }
  }

  // Si aún no empieza ninguna pero hay futuras
  const futuras = etapas.filter(e=> e.range && e.range.start.getTime() > hoy.getTime()).sort((a,b)=> a.range!.start.getTime() - b.range!.start.getTime())
  if (futuras.length) return 'Pendiente ' + futuras[0].nombre

  // Si ya terminó la última etapa pero aún no es examen
  if (exam && hoy.getTime() < exam.getTime()) return 'Preparación Examen'

  return 'Sin etapa'
}

export function calcularDerivados(s: SnapshotFechas) {
  return {
    dias_desde_ct: diasDesdeCT(s.fecha_creacion_ct),
    proceso: derivarProceso(s)
  }
}
