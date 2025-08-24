// Evitar que importaciones en edge (middleware) arrastren supabase realtime y Node APIs.
// Cargamos supabase dinámicamente sólo cuando realmente se invoca logAccion desde un entorno server Node.
// Cache interno de supabase (tipo laxo para evitar arrastrar tipos pesados en edge)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _supabase: any | null = null
async function getSupabaseLazy() {
  if (_supabase) return _supabase
  // Dynamic import to keep edge bundle lighter; if fails, we fallback to no-op
  try {
    const mod = await import('@/lib/supabaseClient')
    _supabase = mod.supabase
    return _supabase
  } catch {
    return null
  }
}

// Campos mínimos para registrar acciones. Se intenta insertar primero en "RegistroAcciones" y si falla
// (por diferencia de naming) se reintenta en "registro_acciones" para compatibilidad con código previo.
// Columnas esperadas (si existen): fecha, usuario, accion, tabla_afectada, id_registro, snapshot

export interface LogOptions {
  usuario?: string | null
  tabla_afectada?: string
  id_registro?: number | null
  snapshot?: unknown
}

export async function logAccion(accion: string, opts: LogOptions = {}) {
  const payload: Record<string, unknown> = {
    fecha: new Date().toISOString(),
    usuario: opts.usuario || 'sistema',
    accion,
    tabla_afectada: opts.tabla_afectada || 'debug',
    id_registro: opts.id_registro ?? 0,
    snapshot: opts.snapshot ?? null
  }
  // Evitar ejecuciones en edge runtime: no hay necesidad crítica de registrar allí
  // Detect edge runtime (NEXT_RUNTIME injected by Next.js)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (typeof process !== 'undefined' && (process as any).env && process.env.NEXT_RUNTIME === 'edge') {
    return
  }
  try {
  const sb = await getSupabaseLazy()
    if (!sb) return
  const { error } = await sb.from('RegistroAcciones').insert(payload)
    if (error) {
      await sb.from('registro_acciones').insert(payload)
    }
  } catch (e) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('[logger] fallo al insertar registro', e)
    }
  }
}

