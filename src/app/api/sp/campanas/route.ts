import { NextResponse } from 'next/server'
import { getUsuarioSesion } from '@/lib/auth'
import { ensureAdminClient } from '@/lib/supabaseAdmin'
import { logAccion } from '@/lib/logger'

export const dynamic = 'force-dynamic'

const supabase = ensureAdminClient()

export async function GET() {
  const actor = await getUsuarioSesion()
  if (!actor) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { data, error } = await supabase
    .from('sp_campanas')
    .select(`
      id,
      nombre,
      sendpilot_campaign_id,
      calcom_linkedin_identifier,
      estado,
      created_at,
      updated_at,
      sp_campana_reclutadores (
        id,
        reclutador_id,
        calcom_event_type_id,
        calcom_scheduling_url,
        activo
      )
    `)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Enrich with pre-candidate counts per campaign
  const ids = (data || []).map(c => c.id)
  let countMap: Record<string, number> = {}
  if (ids.length > 0) {
    const { data: counts } = await supabase
      .from('sp_precandidatos')
      .select('campana_id')
      .in('campana_id', ids)
      .neq('estado', 'descartado')
    if (counts) {
      for (const row of counts) {
        countMap[row.campana_id] = (countMap[row.campana_id] ?? 0) + 1
      }
    }
  }

  const items = (data || []).map(c => ({
    ...c,
    precandidatos_activos: countMap[c.id] ?? 0
  }))

  return NextResponse.json({ items })
}

export async function POST(req: Request) {
  const actor = await getUsuarioSesion()
  if (!actor) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  if (!['admin', 'supervisor'].includes(actor.rol)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  let body: { nombre?: string; sendpilot_campaign_id?: string; calcom_linkedin_identifier?: string; estado?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const nombre = (body.nombre ?? '').trim()
  const sendpilot_campaign_id = (body.sendpilot_campaign_id ?? '').trim()
  if (!nombre) return NextResponse.json({ error: 'nombre es obligatorio' }, { status: 400 })
  if (!sendpilot_campaign_id) return NextResponse.json({ error: 'sendpilot_campaign_id es obligatorio' }, { status: 400 })

  const { data, error } = await supabase
    .from('sp_campanas')
    .insert({
      nombre,
      sendpilot_campaign_id,
      calcom_linkedin_identifier: (body.calcom_linkedin_identifier ?? '').trim() || 'LinkedIn',
      estado: body.estado === 'activa' || body.estado === 'pausada' || body.estado === 'inactiva' ? body.estado : 'activa'
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logAccion('sp_campana_created', { snapshot: { campana_id: data.id, nombre } })
  return NextResponse.json(data, { status: 201 })
}
