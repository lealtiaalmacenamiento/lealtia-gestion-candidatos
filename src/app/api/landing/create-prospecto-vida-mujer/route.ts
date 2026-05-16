import { NextRequest, NextResponse } from 'next/server'
import { ensureAdminClient } from '@/lib/supabaseAdmin'
import { sendMail, buildProspectoVidaMujerEmail } from '@/lib/mailer'
import { logAccion } from '@/lib/logger'

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

/**
 * POST /api/landing/create-prospecto-vida-mujer
 * Crea un prospecto desde el simulador Inversión Mujer de la landing page
 */
export async function POST(request: NextRequest) {
  try {
    const body: CreateProspectoVidaMujerRequest = await request.json()

    if (!body.nombre || !body.email || !body.telefono) {
      return NextResponse.json({ error: 'Faltan campos requeridos' }, { status: 400 })
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(body.email)) {
      return NextResponse.json({ error: 'Email inválido' }, { status: 400 })
    }

    const telefonoLimpio = body.telefono.replace(/\D/g, '')
    if (telefonoLimpio.length !== 10) {
      return NextResponse.json({ error: 'Teléfono debe tener 10 dígitos' }, { status: 400 })
    }

    const supabase = ensureAdminClient()

    let agente_id = body.agente_id
    let nombreAgente = ''
    let emailAgente = ''

    if (!agente_id) {
      const defaultEmail = process.env.SUPABASE_PROJECT_REF === 'oooyuomshachmmblmpvd'
        ? 'ing.zamarripaa@gmail.com'
        : 'paopecina3@gmail.com'

      const { data: defaultAgent, error: defaultError } = await supabase
        .from('usuarios')
        .select('id, nombre, email')
        .eq('email', defaultEmail)
        .single()

      if (defaultError || !defaultAgent) {
        return NextResponse.json({ error: 'Agente por defecto no encontrado' }, { status: 500 })
      }

      agente_id = defaultAgent.id
      nombreAgente = defaultAgent.nombre ?? 'Agente'
      emailAgente = defaultAgent.email
    } else {
      const { data: agente, error: agenteError } = await supabase
        .from('usuarios')
        .select('id, nombre, email')
        .eq('id', agente_id)
        .single()

      if (agenteError || !agente) {
        return NextResponse.json({ error: 'Agente no encontrado' }, { status: 404 })
      }

      nombreAgente = agente.nombre ?? 'Agente'
      emailAgente = agente.email
    }

    const { data: existingProspecto } = await supabase
      .from('prospectos')
      .select('id')
      .eq('email', body.email)
      .single()

    if (existingProspecto) {
      return NextResponse.json({ error: 'Ya existe un prospecto con este email' }, { status: 409 })
    }

    const now = new Date()
    const anio = now.getFullYear()
    const semana_iso = getISOWeek(now)

    const primaAnualFormatted = new Intl.NumberFormat('es-MX', {
      style: 'currency', currency: 'MXN', minimumFractionDigits: 0, maximumFractionDigits: 0,
    }).format(body.cotizacion.primaAnualMXN)

    const notas = `Prospecto del simulador Inversión Mujer. Edad: ${body.edad} años. Suma asegurada: ${body.cotizacion.sumaAseguradaUDI.toLocaleString('es-MX')} UDIs. Prima anual estimada: ${primaAnualFormatted}`

    const { data: prospecto, error: prospectoError } = await supabase
      .from('prospectos')
      .insert({
        agente_id,
        anio,
        semana_iso,
        nombre: body.nombre,
        email: body.email,
        telefono: telefonoLimpio,
        notas,
        estado: 'pendiente',
        origen: 'landing_vida_mujer',
        first_visit_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (prospectoError) {
      console.error('[create-prospecto-vida-mujer] Error:', prospectoError)
      return NextResponse.json(
        { error: 'Error al crear prospecto', details: prospectoError.message },
        { status: 500 },
      )
    }

    void logAccion('alta_prospecto_landing', {
      tabla_afectada: 'prospectos',
      id_registro: prospecto.id,
      snapshot: { nombre: body.nombre, email: body.email, producto: 'vida_mujer', agente_id },
    })

    const { data: supervisores } = await supabase
      .from('usuarios')
      .select('email')
      .eq('rol', 'supervisor')

    const supervisorEmails = (supervisores || [])
      .map((s: { email: string | null }) => s.email)
      .filter(Boolean) as string[]

    try {
      const totalRecibidoFormatted = new Intl.NumberFormat('es-MX', {
        style: 'currency', currency: 'MXN', minimumFractionDigits: 0, maximumFractionDigits: 0,
      }).format(body.cotizacion.totalRecibidoMXN)

      const emailContent = buildProspectoVidaMujerEmail({
        nombreProspecto: body.nombre,
        edad: body.edad,
        email: body.email,
        telefono: telefonoLimpio,
        sumaAseguradaUDI: body.cotizacion.sumaAseguradaUDI,
        primaAnualMXN: primaAnualFormatted,
        totalRecibidoMXN: totalRecibidoFormatted,
        totalRecibidoUDI: body.cotizacion.totalRecibidoUDI,
        nombreAgente,
      })

      await sendMail({
        to: [emailAgente, body.email].filter(Boolean).join(','),
        bcc: supervisorEmails,
        subject: emailContent.subject,
        html: emailContent.html,
        text: emailContent.text,
      })
    } catch (emailError) {
      console.error('Error sending email (vida mujer):', emailError)
    }

    return NextResponse.json({ success: true, prospecto_id: prospecto.id })
  } catch (error) {
    console.error('Error in create-prospecto-vida-mujer:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
