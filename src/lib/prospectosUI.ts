import type { ProspectoEstado } from '@/types'

export const ESTADO_CLASSES: Record<ProspectoEstado, string> = {
  pendiente: 'bg-gray-100 text-gray-800',
  seguimiento: 'bg-yellow-300 text-gray-900',
  con_cita: 'bg-green-500 text-white',
  descartado: 'bg-red-600 text-white'
}

export const ESTADO_LABEL: Record<ProspectoEstado, string> = {
  pendiente: 'Pendiente',
  seguimiento: 'Seguimiento',
  con_cita: 'Con cita',
  descartado: 'Descartado'
}

export function estadoOptions(): Array<{ value: ProspectoEstado; label: string }> {
  return (Object.keys(ESTADO_LABEL) as ProspectoEstado[]).map(k => ({ value: k, label: ESTADO_LABEL[k] }))
}
