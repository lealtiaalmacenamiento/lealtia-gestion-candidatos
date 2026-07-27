import { NextRequest, NextResponse } from 'next/server'
import { ensureAdminClient } from '@/lib/supabaseAdmin'
import { sendMail, buildProspectoVidaMujerEmail } from '@/lib/mailer'
import { logAccion } from '@/lib/logger'
import { notifyCrmUsers, type CrmNotificationRecipient } from '@/lib/crmNotifications'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface CreateProspectoVidaMujerRequest {
  nombre: string
  edad: number
  email: string
  telefono: string
  cotizacion: {
    sumaAseguradaUDI: number
    primaAnualUDI: number
    primaAnualMXN: number
    totalRecibidoUDI: number
    totalRecibidoMXN: number
  }
  agente_id?: number
}

interface ProspectoVidaMujerRow {
  id: number
  agente_id: number | null
  nombre: string | null
  telefono: string | null
  email: string | null
  notas: string | null
  estado: string | null
  origen: string | null
  first_visit_at: string | null
}

const VIDA_MUJER_NOTE_START = '--- Simulador Inversión Mujer ---'
const VIDA_MUJER_NOTE_END = '--- Fin simulador Inversión Mujer ---'

function getISOWeek(date: Date): number {
  const target = new Date(date.valueOf())
  const dayNr = (date.getDay() + 6) % 7
  target.setDate(target.getDate() - dayNr + 3)
  const firstThursday = target.valueOf()
  target.setMonth(0, 1)
  if (target.getDay() !== 4) {
    target.setMonth(0, 1 + ((4 - target.getDay()) + 7) % 7)
  }
  return 1 + Math.ceil((firstThursday - target.valueOf()) / 604800000)
}

function uniqueEmails(emails: Array<string | null | undefined>) {
  const seen = new Set<string>()
  const out: string[] = []
  for (const email of emails) {
    const normalized = String(email || '').trim().toLowerCase()
    if (!normalized || !normalized.includes('@') || seen.has(normalized)) continue
    seen.add(normalized)
    out.push(normalized)
  }
  return out
}

function buildVidaMujerNote(input: {
  fecha: Date
  edad: number
  sumaAseguradaUDI: number
  primaAnualMXN: string
  totalRecibidoMXN: string
  totalRecibidoUDI: number
  nombreAgente: string
}) {
  const totalUDIFormatted = new Intl.NumberFormat('es-MX').format(input.totalRecibidoUDI)
  const sumaUDIFormatted = new Intl.NumberFormat('es-MX').format(input.sumaAseguradaUDI)
  return [
    VIDA_MUJER_NOTE_START,
    `Fecha de solicitud: ${input.fecha.toLocaleString('es-MX', { timeZone: 'America/Mexico_City' })}`,
    `Producto: Inversión Mujer`,
    `Asesor asignado: ${input.nombreAgente}`,
    `Edad: ${input.edad} años`,
    `Suma asegurada: ${sumaUDIFormatted} UDIs`,
    `Prima anual estimada: ${input.primaAnualMXN}`,
    `Total recibido estimado: ${totalUDIFormatted} UDIs ≈ ${input.totalRecibidoMXN}`,
    VIDA_MUJER_NOTE_END
  ].join('\n')
}

function upsertVidaMujerNote(currentNotes: string | null | undefined, vidaMujerNote: string) {
  const current = String(currentNotes || '').trim()
  const escapedStart = VIDA_MUJER_NOTE_START.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const escapedEnd = VIDA_MUJER_NOTE_END.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const withoutPrevious = current
    .replace(new RegExp(`\\n?${escapedStart}[\\s\\S]*?${escapedEnd}\\n?`, 'g'), '\n')
    .trim()
  return [withoutPrevious, vidaMujerNote].filter(Boolean).join('\n\n')
}

/**
 * POST /api/landing/create-prospecto-vida-mujer
 * Crea un prospecto desde el simulador Inversión Mujer de la landing page
 */
export async function POST(request: NextRequest) {
  try {
    const body: CreateProspectoVidaMujerRequest = await request.json()
    const nombre = String(body.nombre || '').trim()
    const email = String(body.email || '').trim().toLowerCase()

    if (!nombre || !email || !body.telefono) {
      return NextResponse.json({ error: 'Faltan campos requeridos' }, { status: 400 })
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return NextResponse.json({ error: 'Email inválido' }, { status: 400 })
    }

    const telefonoLimpio = body.telefono.replace(/\D/g, '')
    if (telefonoLimpio.length !== 10) {
      return NextResponse.json({ error: 'Teléfono debe tener 10 dígitos' }, { status: 400 })
    }

    if (
      !body.cotizacion ||
      !Number.isFinite(Number(body.edad)) ||
      !Number.isFinite(Number(body.cotizacion.sumaAseguradaUDI)) ||
      !Number.isFinite(Number(body.cotizacion.primaAnualMXN)) ||
      !Number.isFinite(Number(body.cotizacion.totalRecibidoMXN))
    ) {
      return NextResponse.json({ error: 'Cotización inválida' }, { status: 400 })
    }

    const supabase = ensureAdminClient()

    let agente_id = body.agente_id
    let nombreAgente = ''
    let emailAgente = ''
    let agentAuthId: string | null = null

    if (!agente_id) {
      const defaultEmail = process.env.SUPABASE_PROJECT_REF === 'oooyuomshachmmblmpvd'
        ? 'ing.zamarripaa@gmail.com'
        : 'paopecina3@gmail.com'

      const { data: defaultAgent, error: defaultError } = await supabase
        .from('usuarios')
        .select('id, id_auth, nombre, email')
        .eq('email', defaultEmail)
        .single()

      if (defaultError || !defaultAgent) {
        return NextResponse.json({ error: 'Agente por defecto no encontrado' }, { status: 500 })
      }

      agente_id = defaultAgent.id
      nombreAgente = defaultAgent.nombre ?? 'Agente'
      emailAgente = defaultAgent.email
      agentAuthId = defaultAgent.id_auth ?? null
    } else {
      const { data: agente, error: agenteError } = await supabase
        .from('usuarios')
        .select('id, id_auth, nombre, email')
        .eq('id', agente_id)
        .single()

      if (agenteError || !agente) {
        return NextResponse.json({ error: 'Agente no encontrado' }, { status: 404 })
      }

      nombreAgente = agente.nombre ?? 'Agente'
      emailAgente = agente.email
      agentAuthId = agente.id_auth ?? null
    }

    const { data: existingProspecto, error: existingProspectoError } = await supabase
      .from('prospectos')
      .select('id, agente_id, nombre, telefono, email, notas, estado, origen, first_visit_at')
      .ilike('email', email)
      .limit(1)
      .maybeSingle<ProspectoVidaMujerRow>()
    if (existingProspectoError) {
      console.error('[create-prospecto-vida-mujer] Error buscando prospecto existente:', existingProspectoError)
      return NextResponse.json({ error: 'Error al consultar prospecto existente' }, { status: 500 })
    }

    const now = new Date()
    const anio = now.getFullYear()
    const semana_iso = getISOWeek(now)

    const primaAnualFormatted = new Intl.NumberFormat('es-MX', {
      style: 'currency', currency: 'MXN', minimumFractionDigits: 0, maximumFractionDigits: 0,
    }).format(body.cotizacion.primaAnualMXN)

    const totalRecibidoFormatted = new Intl.NumberFormat('es-MX', {
      style: 'currency', currency: 'MXN', minimumFractionDigits: 0, maximumFractionDigits: 0,
    }).format(body.cotizacion.totalRecibidoMXN)
    const vidaMujerNote = buildVidaMujerNote({
      fecha: now,
      edad: body.edad,
      sumaAseguradaUDI: body.cotizacion.sumaAseguradaUDI,
      primaAnualMXN: primaAnualFormatted,
      totalRecibidoMXN: totalRecibidoFormatted,
      totalRecibidoUDI: body.cotizacion.totalRecibidoUDI,
      nombreAgente,
    })
    const notasFinal = upsertVidaMujerNote(existingProspecto?.notas, vidaMujerNote)
    const isExistingProspecto = Boolean(existingProspecto?.id)
    let prospecto: ProspectoVidaMujerRow | null = null
    let prospectoError: { message?: string } | null = null

    if (existingProspecto) {
      const updateResult = await supabase
        .from('prospectos')
        .update({
          agente_id,
          anio,
          semana_iso,
          nombre,
          email,
          telefono: telefonoLimpio,
          notas: notasFinal,
          estado: existingProspecto.estado === 'descartado' ? 'pendiente' : existingProspecto.estado || 'pendiente',
          origen: existingProspecto.origen || 'landing_vida_mujer',
          first_visit_at: existingProspecto.first_visit_at || now.toISOString(),
          updated_at: now.toISOString(),
        })
        .eq('id', existingProspecto.id)
        .select()
        .single()
      prospecto = updateResult.data as ProspectoVidaMujerRow | null
      prospectoError = updateResult.error
    } else {
      const insertResult = await supabase
        .from('prospectos')
        .insert({
          agente_id,
          anio,
          semana_iso,
          nombre,
          email,
          telefono: telefonoLimpio,
          notas: notasFinal,
          estado: 'pendiente',
          origen: 'landing_vida_mujer',
          first_visit_at: now.toISOString(),
        })
        .select()
        .single()
      prospecto = insertResult.data as ProspectoVidaMujerRow | null
      prospectoError = insertResult.error
    }

    if (prospectoError || !prospecto) {
      console.error('[create-prospecto-vida-mujer] Error:', prospectoError)
      return NextResponse.json(
        { error: 'Error al guardar prospecto', details: prospectoError?.message || 'No se recibió prospecto guardado' },
        { status: 500 },
      )
    }

    void logAccion(isExistingProspecto ? 'actualizacion_prospecto_landing_vida_mujer' : 'alta_prospecto_landing', {
      tabla_afectada: 'prospectos',
      id_registro: prospecto.id,
      snapshot: { nombre, email, producto: 'vida_mujer', agente_id, actualizado: isExistingProspecto },
    })

    try {
      await supabase.from('prospectos_historial').insert({
        prospecto_id: prospecto.id,
        agente_id,
        usuario_email: emailAgente || 'landing',
        estado_anterior: existingProspecto?.estado ?? null,
        estado_nuevo: prospecto.estado ?? 'pendiente',
        nota_agregada: true,
        notas_anteriores: existingProspecto?.notas ?? null,
        notas_nuevas: notasFinal,
      })
    } catch {}

    const { data: supervisores } = await supabase
      .from('usuarios')
      .select('id_auth, email, nombre')
      .eq('rol', 'supervisor')
      .eq('activo', true)

    const supervisorRecipients = (supervisores || []).map((s: { id_auth: string | null; email: string | null; nombre: string | null }) => ({
      id_auth: s.id_auth ?? null,
      email: s.email ?? null,
      nombre: s.nombre ?? null,
    }))
    const supervisorEmails = uniqueEmails(supervisorRecipients.map(supervisor => supervisor.email))
    const agentRecipient: CrmNotificationRecipient = {
      id_auth: agentAuthId,
      email: emailAgente,
      nombre: nombreAgente,
    }

    await notifyCrmUsers(supabase, [agentRecipient, ...supervisorRecipients], {
      titulo: isExistingProspecto ? 'Prospecto actualizado desde Vida Mujer' : 'Nuevo prospecto desde Vida Mujer',
      mensaje: `${nombre} solicitó contacto desde el simulador Inversión Mujer.`,
      metadata: {
        source: 'landing_vida_mujer',
        prospecto_id: prospecto.id,
        prospect_email: email,
        agente_id,
        updated_existing: isExistingProspecto,
      },
    })

    try {
      const emailContent = buildProspectoVidaMujerEmail({
        nombreProspecto: nombre,
        edad: body.edad,
        email,
        telefono: telefonoLimpio,
        sumaAseguradaUDI: body.cotizacion.sumaAseguradaUDI,
        primaAnualMXN: primaAnualFormatted,
        totalRecibidoMXN: totalRecibidoFormatted,
        totalRecibidoUDI: body.cotizacion.totalRecibidoUDI,
        nombreAgente,
      })

      await sendMail({
        to: uniqueEmails([emailAgente, email]),
        cc: supervisorEmails,
        subject: emailContent.subject,
        html: emailContent.html,
        text: emailContent.text,
      })
    } catch (emailError) {
      console.error('Error sending email (vida mujer):', emailError)
    }

    return NextResponse.json({
      success: true,
      prospecto_id: prospecto.id,
      updated: isExistingProspecto,
      message: isExistingProspecto ? 'Prospecto actualizado exitosamente' : 'Prospecto creado exitosamente',
    })
  } catch (error) {
    console.error('Error in create-prospecto-vida-mujer:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
