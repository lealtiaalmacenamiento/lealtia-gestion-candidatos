import { NextResponse } from 'next/server'
import { getUsuarioSesion } from '@/lib/auth'
import { ensureAdminClient } from '@/lib/supabaseAdmin'
import { logAccion } from '@/lib/logger'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function requireAdmin(actor: { rol?: string | null } | null) {
  return Boolean(actor && actor.rol === 'admin')
}

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

export async function GET(req: Request) {
  const actor = await getUsuarioSesion(req.headers)
  if (!actor) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  if (!requireAdmin(actor)) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const supabase = ensureAdminClient()
  const [{ data: configs, error: configsError }, { data: campanas, error: campanasError }] = await Promise.all([
    supabase
      .from('sp_reportes_programados')
      .select(`
        id,
        nombre,
        campana_id,
        destinatarios,
        frecuencia_dias,
        activo,
        ultimo_envio_at,
        proximo_envio_at,
        ultimo_resultado,
        created_at,
        updated_at,
        sp_campanas (
          id,
          nombre,
          sendpilot_campaign_id,
          estado
        )
      `)
      .order('created_at', { ascending: false }),
    supabase
      .from('sp_campanas')
      .select('id,nombre,sendpilot_campaign_id,estado')
      .order('created_at', { ascending: false }),
  ])

  if (configsError) return NextResponse.json({ error: configsError.message }, { status: 500 })
  if (campanasError) return NextResponse.json({ error: campanasError.message }, { status: 500 })

  return NextResponse.json({
    configs: configs || [],
    campanas: campanas || [],
  })
}

export async function POST(req: Request) {
  const actor = await getUsuarioSesion(req.headers)
  if (!actor) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  if (!requireAdmin(actor)) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

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

  const campanaId = String(body.campana_id ?? '').trim()
  if (!campanaId) return NextResponse.json({ error: 'Selecciona una campaña' }, { status: 400 })

  const destinatarios = normalizeRecipients(body.destinatarios)
  if (!destinatarios.length) return NextResponse.json({ error: 'Agrega al menos un correo destino' }, { status: 400 })
  const invalid = destinatarios.find(email => !EMAIL_RE.test(email))
  if (invalid) return NextResponse.json({ error: `Correo inválido: ${invalid}` }, { status: 400 })

  let frecuenciaDias: number
  try {
    frecuenciaDias = parseFrequency(body.frecuencia_dias ?? 7)
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Frecuencia inválida' }, { status: 400 })
  }

  const supabase = ensureAdminClient()
  const nombre = String(body.nombre ?? '').trim() || 'Reporte SendPilot'
  const activo = body.activo !== false
  const nowIso = new Date().toISOString()

  const { data, error } = await supabase
    .from('sp_reportes_programados')
    .insert({
      nombre,
      campana_id: campanaId,
      destinatarios,
      frecuencia_dias: frecuenciaDias,
      activo,
      proximo_envio_at: activo ? nowIso : null,
      created_by: actor.id_auth || null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logAccion('sp_reporte_programado_creado', {
    usuario: actor.email,
    tabla_afectada: 'sp_reportes_programados',
    snapshot: { id: data.id, campana_id: campanaId, destinatarios: destinatarios.length, frecuencia_dias: frecuenciaDias },
  })

  return NextResponse.json({ item: data }, { status: 201 })
}

