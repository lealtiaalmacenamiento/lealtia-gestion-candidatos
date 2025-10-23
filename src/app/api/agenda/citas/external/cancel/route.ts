import { NextResponse } from 'next/server'
import { ensureAdminClient } from '@/lib/supabaseAdmin'
import { cancelAgendaCitaCascade } from '../../cancel/cascade'

function resolveSecret(): string | null {
  const candidates = [process.env.AGENDA_EXTERNAL_SECRET, process.env.AGENDA_ENCRYPTION_SECRET]
  for (const value of candidates) {
    if (value && value.trim().length > 0) {
      return value.trim()
    }
  }
  return null
}

function checkExternalSecret(req: Request): boolean {
  const secret = resolveSecret()
  if (!secret) {
    return false
  }
  const url = new URL(req.url)
  const byHeader = req.headers.get('x-agenda-secret') || req.headers.get('x-webhook-secret') || null
  const authHeader = req.headers.get('authorization') || ''
  const bearer = authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7).trim() : null
  const byQuery = url.searchParams.get('secret') || null
  return secret === byHeader || secret === bearer || secret === byQuery
}

type CancelPayload = {
  external_event_id?: string | null
  cita_id?: number | null
  motivo?: string | null
}

export async function POST(req: Request) {
  if (!checkExternalSecret(req)) {
    const hasSecretConfigured = Boolean(resolveSecret())
    return NextResponse.json({ error: hasSecretConfigured ? 'No autorizado' : 'Secret de agenda no configurado' }, { status: hasSecretConfigured ? 401 : 500 })
  }

  let payload: CancelPayload
  try {
    payload = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const externalEventId = (payload.external_event_id || '').trim()
  const citaIdFromBody = payload.cita_id && Number.isFinite(payload.cita_id) ? Number(payload.cita_id) : null

  const supabase = ensureAdminClient()

  let citaId: number | null = citaIdFromBody

  if (!citaId) {
    if (!externalEventId) {
      return NextResponse.json({ error: 'Debe indicar external_event_id o cita_id' }, { status: 400 })
    }
    const { data: cita, error: citaError } = await supabase
      .from('citas')
      .select('id')
      .eq('external_event_id', externalEventId)
      .eq('estado', 'confirmada')
      .maybeSingle()
    if (citaError) {
      return NextResponse.json({ error: citaError.message }, { status: 500 })
    }
    if (!cita) {
      return NextResponse.json({ error: 'Cita no encontrada' }, { status: 404 })
    }
    citaId = cita.id
  }

  const result = await cancelAgendaCitaCascade({
    citaId: citaId!,
    motivo: payload.motivo || null,
    actor: {
      email: 'webhook@agenda-interna',
      rol: 'system'
    },
    origin: 'calendar',
    skipRemote: true,
    supabase
  })

  if (!result.success) {
    const status = result.error === 'Cita no encontrada' ? 404 : 500
    return NextResponse.json({ error: result.error || 'No se pudo cancelar la cita' }, { status })
  }

  return NextResponse.json({ success: true, alreadyCancelled: result.alreadyCancelled ?? false })
}
