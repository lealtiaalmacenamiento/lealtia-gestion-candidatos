import type { Candidato } from '@/types'

// Reglas simples de proceso; se puede refinar con más fechas/parametros
export function calcularProceso(c: Candidato): string {
  const hoy = new Date()
  const hoyISO = hoy.toISOString().slice(0,10)
  if (!c.ct) return 'Registro'
  if (c.fecha_tentativa_de_examen) {
    if (c.fecha_tentativa_de_examen === hoyISO) return 'Examen'
    if (c.fecha_tentativa_de_examen < hoyISO) return 'Post-examen'
    return 'Preparación'
  }
  return 'Preparación'
}

export function diasDesdeCreacionCT(c: Pick<Candidato,'fecha_creacion_ct'>): number | null {
  if (!c.fecha_creacion_ct) return null
  const inicio = new Date(c.fecha_creacion_ct)
  if (isNaN(inicio.getTime())) return null
  const diff = Date.now() - inicio.getTime()
  return Math.floor(diff / 86400000)
}