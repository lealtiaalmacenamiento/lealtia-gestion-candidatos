import { supabase } from '@/lib/supabaseClient'

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
  try {
    const { error } = await supabase.from('RegistroAcciones').insert(payload)
    if (error) {
      // Reintento silencioso en tabla alternativa
      await supabase.from('registro_acciones').insert(payload)
    }
  } catch (e) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('[logger] fallo al insertar registro', e)
    }
  }
}

