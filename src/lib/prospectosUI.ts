import type { ProspectoEstado } from '@/types'

// Usamos clases Bootstrap (no Tailwind) para asegurar visibilidad
export const ESTADO_CLASSES: Record<ProspectoEstado, string> = {
  pendiente: 'bg-light text-dark border',
  seguimiento: 'bg-warning text-dark',
  con_cita: 'bg-success text-white',
  descartado: 'bg-danger text-white',
  ya_es_cliente: 'bg-info text-dark'
}

export const ESTADO_LABEL: Record<ProspectoEstado, string> = {
  pendiente: 'Pendiente',
  seguimiento: 'Seguimiento',
  con_cita: 'Con cita',
  descartado: 'Descartado',
  ya_es_cliente: 'Ya es cliente'
}

export function estadoOptions(): Array<{ value: ProspectoEstado; label: string }> {
  return (Object.keys(ESTADO_LABEL) as ProspectoEstado[]).map(k => ({ value: k, label: ESTADO_LABEL[k] }))
}
