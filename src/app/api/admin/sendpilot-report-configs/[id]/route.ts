import { NextResponse } from 'next/server'
import { getUsuarioSesion } from '@/lib/auth'
import { ensureAdminClient } from '@/lib/supabaseAdmin'
import { logAccion } from '@/lib/logger'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function normalizeRecipients(raw: unknown): string[] {
  const items = Array.isArray(raw)
    ? raw
    : typeof raw === 'string'
      ? raw.split(/[,\n;]/)
      : []

  return Array.from(new Set(
    items
      .map(item => String(item ?? '').trim().toLowerCase())
      .filter(Boolean)
  ))
}

function parseFrequency(raw: unknown): number {
  const value = Number(raw)
  if (!Number.isInteger(value) || value < 1 || value > 365) {
    throw new Error('La frecuencia debe ser un número entre 1 y 365 días')
  }
  return value
}

function nextDue(frequencyDays: number): string {
  const date = new Date()
  date.setUTCDate(date.getUTCDate() + frequencyDays)
  return date.toISOString()
}

export async function PATCH(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const actor = await getUsuarioSesion(req.headers)
  if (!actor) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  if (actor.rol !== 'admin') return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const { id } = await context.params
  let body: {
    nombre?: unknown
    campana_id?: unknown
    destinatarios?: unknown
    frecuencia_dias?: unknown
    activo?: unknown
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }

  if ('nombre' in body) {
    update.nombre = String(body.nombre ?? '').trim() || 'Reporte SendPilot'
  }
  if ('campana_id' in body) {
    const campanaId = String(body.campana_id ?? '').trim()
    if (!campanaId) return NextResponse.json({ error: 'Selecciona una campaña' }, { status: 400 })
    update.campana_id = campanaId
  }
  if ('destinatarios' in body) {
    const destinatarios = normalizeRecipients(body.destinatarios)
    if (!destinatarios.length) return NextResponse.json({ error: 'Agrega al menos un correo destino' }, { status: 400 })
    const invalid = destinatarios.find(email => !EMAIL_RE.test(email))
    if (invalid) return NextResponse.json({ error: `Correo inválido: ${invalid}` }, { status: 400 })
    update.destinatarios = destinatarios
  }
  if ('frecuencia_dias' in body) {
    try {
      update.frecuencia_dias = parseFrequency(body.frecuencia_dias)
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : 'Frecuencia inválida' }, { status: 400 })
    }
  }
  if ('activo' in body) {
    update.activo = body.activo !== false
  }

  if (update.activo === false) {
    update.proximo_envio_at = null
  } else if ('frecuencia_dias' in update) {
    update.proximo_envio_at = nextDue(Number(update.frecuencia_dias))
  } else if (update.activo === true) {
    update.proximo_envio_at = new Date().toISOString()
  }

  const supabase = ensureAdminClient()
  const { data, error } = await supabase
    .from('sp_reportes_programados')
    .update(update)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logAccion('sp_reporte_programado_actualizado', {
    usuario: actor.email,
    tabla_afectada: 'sp_reportes_programados',
    snapshot: { id, update },
  })

  return NextResponse.json({ item: data })
}

export async function DELETE(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const actor = await getUsuarioSesion(req.headers)
  if (!actor) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  if (actor.rol !== 'admin') return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const { id } = await context.params
  const supabase = ensureAdminClient()
  const { error } = await supabase
    .from('sp_reportes_programados')
    .delete()
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logAccion('sp_reporte_programado_eliminado', {
    usuario: actor.email,
    tabla_afectada: 'sp_reportes_programados',
    snapshot: { id },
  })

  return NextResponse.json({ ok: true })
}
