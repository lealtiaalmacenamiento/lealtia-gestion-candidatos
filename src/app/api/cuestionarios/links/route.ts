import { randomBytes } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getUsuarioSesion } from '@/lib/auth'
import { ensureAdminClient } from '@/lib/supabaseAdmin'
import { getCalcomApiKey, getCalcomEventTypes } from '@/lib/integrations/calcom'
import { logAccion } from '@/lib/logger'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const createLinkSchema = z.object({
  questionnaire_id: z.string().uuid(),
  cal_event_type_id: z.number().int().positive(),
  agente_id: z.number().int().positive().optional(),
  expires_at: z.string().datetime().nullable().optional()
})

const updateLinkSchema = z.object({
  id: z.string().uuid(),
  activo: z.boolean()
})

async function resolveActor(req: NextRequest) {
  const actor = await getUsuarioSesion(req.headers)
  if (!actor?.activo) return { error: NextResponse.json({ error: 'No autenticado' }, { status: 401 }) }
  return { actor }
}

function canGenerateForOthers(role?: string | null) {
  return role === 'admin' || role === 'supervisor'
}

export async function GET(req: NextRequest) {
  const resolved = await resolveActor(req)
  if ('error' in resolved) return resolved.error
  const { actor } = resolved
  const requestedAgentId = Number(req.nextUrl.searchParams.get('agente_id'))
  const targetAgentId = Number.isFinite(requestedAgentId) && requestedAgentId > 0
    ? requestedAgentId
    : Number(actor.id)
  if (targetAgentId !== Number(actor.id) && !canGenerateForOthers(actor.rol)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }
  const supabase = ensureAdminClient()
  let query = supabase
    .from('questionnaire_links')
    .select('*, questionnaire:questionnaires(titulo,slug), agente:usuarios(nombre,email)')
    .eq('agente_id', targetAgentId)
    .order('created_at', { ascending: false })
    .limit(100)
  if (req.nextUrl.searchParams.get('include_inactive') !== '1') {
    query = query.eq('activo', true)
  }
  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const links = data || []
  const linkIds = links.map(link => link.id)
  const submissionsByLink = new Map<string, { responses: number; simulations: number; bookings: number }>()
  if (linkIds.length > 0) {
    const { data: submissions, error: submissionsError } = await supabase
      .from('questionnaire_submissions')
      .select('link_id,estado')
      .in('link_id', linkIds)
    if (submissionsError) return NextResponse.json({ error: submissionsError.message }, { status: 500 })
    for (const submission of submissions || []) {
      const current = submissionsByLink.get(submission.link_id) || {
        responses: 0,
        simulations: 0,
        bookings: 0
      }
      current.responses += 1
      if (submission.estado === 'simulacion_completa' || submission.estado === 'cita_agendada') {
        current.simulations += 1
      }
      if (submission.estado === 'cita_agendada') current.bookings += 1
      submissionsByLink.set(submission.link_id, current)
    }
  }
  return NextResponse.json({
    links: links.map(link => ({
      ...link,
      stats: submissionsByLink.get(link.id) || { responses: 0, simulations: 0, bookings: 0 }
    }))
  })
}

export async function POST(req: NextRequest) {
  const resolved = await resolveActor(req)
  if ('error' in resolved) return resolved.error
  const { actor } = resolved
  const parsed = createLinkSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Selecciona un cuestionario y un evento de Cal.com' }, { status: 400 })

  const supabase = ensureAdminClient()
  const targetAgentId = parsed.data.agente_id ?? Number(actor.id)
  if (targetAgentId !== Number(actor.id) && !canGenerateForOthers(actor.rol)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }
  const { data: targetAgent, error: targetError } = await supabase
    .from('usuarios')
    .select('id,id_auth,nombre,email,activo')
    .eq('id', targetAgentId)
    .maybeSingle()
  if (targetError) return NextResponse.json({ error: targetError.message }, { status: 500 })
  if (!targetAgent?.activo) {
    return NextResponse.json({ error: 'El agente seleccionado no está activo' }, { status: 409 })
  }

  const [{ data: questionnaire, error: questionnaireError }, { data: codeRows, error: codeError }] = await Promise.all([
    supabase
      .from('questionnaires')
      .select('id,slug,version,titulo,descripcion,secciones,requiere_ppr,activo')
      .eq('id', parsed.data.questionnaire_id)
      .maybeSingle(),
    supabase
      .from('agent_codes')
      .select('code')
      .eq('agente_id', targetAgent.id)
      .eq('activo', true)
      .order('created_at', { ascending: false })
      .limit(1)
  ])

  if (questionnaireError) return NextResponse.json({ error: questionnaireError.message }, { status: 500 })
  if (!questionnaire?.activo) return NextResponse.json({ error: 'El cuestionario no está activo' }, { status: 409 })
  if (codeError) return NextResponse.json({ error: codeError.message }, { status: 500 })
  const agentCode = codeRows?.[0]?.code
  if (!agentCode) {
    return NextResponse.json({ error: 'El agente seleccionado no tiene un código activo. Regístralo en Candidatos.' }, { status: 409 })
  }
  if (!targetAgent.id_auth) return NextResponse.json({ error: 'El agente no tiene identidad de acceso' }, { status: 409 })

  const apiKey = await getCalcomApiKey(targetAgent.id_auth)
  if (!apiKey) return NextResponse.json({ error: 'El agente seleccionado no ha conectado Cal.com' }, { status: 409 })
  let eventTypes
  try {
    eventTypes = await getCalcomEventTypes(apiKey)
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'No se pudieron consultar los eventos de Cal.com' }, { status: 502 })
  }
  const eventType = eventTypes.find(event => event.id === parsed.data.cal_event_type_id)
  if (!eventType) return NextResponse.json({ error: 'El evento seleccionado ya no está disponible en tu cuenta de Cal.com' }, { status: 409 })

  const token = randomBytes(24).toString('base64url')
  const { data, error } = await supabase
    .from('questionnaire_links')
    .insert({
      token,
      questionnaire_id: questionnaire.id,
      questionnaire_version: questionnaire.version,
      questionnaire_snapshot: {
        id: questionnaire.id,
        slug: questionnaire.slug,
        titulo: questionnaire.titulo,
        descripcion: questionnaire.descripcion,
        secciones: questionnaire.secciones,
        requiere_ppr: questionnaire.requiere_ppr,
        version: questionnaire.version
      },
      agente_id: targetAgent.id,
      agent_code: agentCode,
      cal_event_type_id: eventType.id,
      cal_event_title: eventType.title,
      cal_booking_url: eventType.bookingUrl || null,
      expires_at: parsed.data.expires_at || null,
      created_by: actor.id_auth
    })
    .select('*')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logAccion('generar_enlace_cuestionario', {
    usuario: actor.email,
    tabla_afectada: 'questionnaire_links',
    snapshot: {
      id: data.id,
      questionnaire_id: questionnaire.id,
      event_type_id: eventType.id,
      agent_code: agentCode,
      agente_id: targetAgent.id
    }
  })

  const origin = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin
  return NextResponse.json({
    link: data,
    public_url: `${origin.replace(/\/$/, '')}/ppr/${token}`
  }, { status: 201 })
}

export async function PATCH(req: NextRequest) {
  const resolved = await resolveActor(req)
  if ('error' in resolved) return resolved.error
  const { actor } = resolved
  const parsed = updateLinkSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Solicitud inválida' }, { status: 400 })

  const supabase = ensureAdminClient()
  const { data: link, error: linkError } = await supabase
    .from('questionnaire_links')
    .select('id,agente_id,token,activo')
    .eq('id', parsed.data.id)
    .maybeSingle()
  if (linkError) return NextResponse.json({ error: linkError.message }, { status: 500 })
  if (!link) return NextResponse.json({ error: 'Enlace no encontrado' }, { status: 404 })
  if (Number(link.agente_id) !== Number(actor.id) && !canGenerateForOthers(actor.rol)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  const { data, error } = await supabase
    .from('questionnaire_links')
    .update({ activo: parsed.data.activo })
    .eq('id', parsed.data.id)
    .select('*')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logAccion(parsed.data.activo ? 'reactivar_enlace_cuestionario' : 'desactivar_enlace_cuestionario', {
    usuario: actor.email,
    tabla_afectada: 'questionnaire_links',
    snapshot: {
      id: link.id,
      token: link.token,
      agente_id: link.agente_id,
      activo: parsed.data.activo
    }
  }).catch(() => {})

  return NextResponse.json({ link: data })
}
