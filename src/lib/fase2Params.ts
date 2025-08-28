// Utilidades para cargar parámetros de Fase 2 (metas dinámicas)
export interface Fase2Metas { metaProspectos: number; metaCitas: number }

export async function fetchFase2Metas(): Promise<Fase2Metas> {
  try {
    const url = `/api/parametros?tipo=fase2`
    const res = await fetch(url)
    if (!res.ok) throw new Error('resp no ok')
  const json = await res.json() as { success?: boolean; data?: Array<{ clave?: string; valor?: unknown }> }
    const base: Fase2Metas = { metaProspectos: 30, metaCitas: 5 }
    for (const p of json.data || []) {
      if (p.clave === 'meta_prospectos_semana') {
        const v = Number(p.valor)
        if (!Number.isNaN(v) && v > 0) base.metaProspectos = v
      } else if (p.clave === 'meta_citas_semana') {
        const v = Number(p.valor)
        if (!Number.isNaN(v) && v > 0) base.metaCitas = v
      }
    }
    return base
  } catch {
    return { metaProspectos: 30, metaCitas: 5 }
  }
}