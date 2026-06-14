import { NextResponse } from 'next/server'
import { getUsuarioSesion } from '@/lib/auth'
import { ensureAdminClient } from '@/lib/supabaseAdmin'
import { logAccion } from '@/lib/logger'
import { updateLeadStatus } from '@/lib/integrations/sendpilot'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

const supabase = ensureAdminClient()

/**
 * POST /api/precandidatos/[id]/promover
 *
 * Promotes a pre-candidate to a full candidato record:
 * 1. Validates still eligible (not already promoted or discarded)
 * 2. Inserts into candidatos table using the recruiter's email as usuario_creador
 * 3. Updates sp_precandidatos.estado = 'promovido' and candidato_id
 * 4. Logs sp_actividades entry
 */
export async function POST(req: Request, context: RouteContext) {
  const actor = await getUsuarioSesion()
  if (!actor) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  if (!['admin', 'supervisor'].includes(actor.rol)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  const { id } = await context.params

  // Optional body to override candidato fields
  let body: { mes_conexion?: string | null; notas?: string | null } = {}
  try {
    if (req.headers.get('content-type')?.includes('application/json')) {
      body = await req.json()
    }
  } catch {
    // ignore
  }

  // Fetch pre-candidate
  const { data: pre, error: preError } = await supabase
    .from('sp_precandidatos')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (preError) return NextResponse.json({ error: preError.message }, { status: 500 })
  if (!pre) return NextResponse.json({ error: 'Precandidato no encontrado' }, { status: 404 })

  if (pre.estado === 'promovido') {
    return NextResponse.json({
      error: 'Ya promovido',
      candidato_id: pre.candidato_id
    }, { status: 409 })
  }
  if (pre.estado === 'descartado') {
    return NextResponse.json({ error: 'El precandidato está descartado y no puede promoverse' }, { status: 409 })
  }

  // Build candidato name
  const nombreCompleto = [pre.nombre, pre.apellido].filter(Boolean).join(' ')

  // Insert into candidatos
  const { data: candidato, error: candidatoError } = await supabase
    .from('candidatos')
    .insert({
      candidato: nombreCompleto,
      usuario_creador: actor.email,
      mes_conexion: body.mes_conexion ?? null
    })
    .select('id_candidato')
    .single()

  if (candidatoError) return NextResponse.json({ error: candidatoError.message }, { status: 500 })

  const candidato_id = candidato.id_candidato

  // Update pre-candidate
  const { error: updateError } = await supabase
    .from('sp_precandidatos')
    .update({ estado: 'promovido', candidato_id })
    .eq('id', id)

  if (updateError) {
    // The candidato was created but the precandidato status couldn't be updated.
    // Return a 500 so the caller knows there's an inconsistency instead of silently succeeding.
    console.error('[promover] Failed to update sp_precandidatos:', updateError.message)
    return NextResponse.json(
      { error: 'Candidato creado pero no se pudo marcar el precandidato como promovido. Contacte al administrador.', candidato_id },
      { status: 500 }
    )
  }

  // Log activity
  await supabase.from('sp_actividades').insert({
    precandidato_id: id,
    campana_id: pre.campana_id,
    tipo: 'promovido',
    descripcion: `Promovido a candidato #${candidato_id}`,
    metadata: { candidato_id, promovido_por: actor.email }
  })

  await logAccion('sp_precandidato_promovido', { snapshot: { precandidato_id: id, candidato_id } })

  // Push estado change to SendPilot (best-effort)
  if (pre.sp_contact_id) {
    updateLeadStatus(pre.sp_contact_id, 'Meeting complete').catch(() => {})
  }

  return NextResponse.json({ candidato_id }, { status: 201 })
}
