import { NextRequest, NextResponse } from 'next/server'
import { ensureAdminClient } from '@/lib/supabaseAdmin'
import { sendMail, buildProspectoPPREmail } from '@/lib/mailer'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface CreateProspectoRequest {
  nombre: string
  edad: number
  email: string
  telefono: string
  plan: '65' | '15' | '10'
  cotizacion: {
    primaAnualUDI: number
    primaMensualMXN: number
    totalAhorroMXN: number
    meta65MXN: number
    añosPago: number
  }
  agente_id?: number
}

/**
 * POST /api/landing/create-prospecto
 * Crea un prospecto desde la landing page del simulador PPR
 */
export async function POST(request: NextRequest) {
  try {
    const body: CreateProspectoRequest = await request.json()

    // Validaciones básicas
    if (!body.nombre || !body.email || !body.telefono || !body.plan) {
      return NextResponse.json(
        { error: 'Faltan campos requeridos' },
        { status: 400 }
      )
    }

    // Validar formato email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(body.email)) {
      return NextResponse.json(
        { error: 'Email inválido' },
        { status: 400 }
      )
    }

    // Validar teléfono (10 dígitos)
    const telefonoLimpio = body.telefono.replace(/\D/g, '')
    if (telefonoLimpio.length !== 10) {
      return NextResponse.json(
        { error: 'Teléfono debe tener 10 dígitos' },
        { status: 400 }
      )
    }

    // Usamos service role para evitar RLS en landing pública
    console.log('[create-prospecto] Obteniendo cliente service role...')
    const supabase = ensureAdminClient()
    console.log('[create-prospecto] Cliente service role obtenido')

    // Obtener agente_id (del parámetro o el default)
    let agente_id = body.agente_id
    let nombreAgente = ''
    let emailAgente = ''

    console.log('[create-prospecto] agente_id recibido:', agente_id)

    if (!agente_id) {
      console.log('[create-prospecto] Buscando agente por defecto: paopecina3@gmail.com')
      // Buscar agente por defecto
      const { data: defaultAgent, error: defaultError } = await supabase
        .from('usuarios')
        .select('id, nombre, email')
        .eq('email', 'paopecina3@gmail.com')
        .single()

      console.log('[create-prospecto] Resultado búsqueda agente default:', { defaultAgent, defaultError })

      if (defaultError || !defaultAgent) {
        console.error('[create-prospecto] Agente por defecto no encontrado:', defaultError)
        return NextResponse.json(
          { error: 'Agente por defecto no encontrado' },
          { status: 500 }
        )
      }

      agente_id = defaultAgent.id
      nombreAgente = defaultAgent.nombre ?? 'Agente'
      emailAgente = defaultAgent.email
      console.log('[create-prospecto] Agente default asignado:', { agente_id, nombreAgente, emailAgente })
    } else {
      console.log('[create-prospecto] Buscando agente específico con id:', agente_id)
      // Obtener info del agente
      const { data: agente, error: agenteError } = await supabase
        .from('usuarios')
        .select('id, nombre, email')
        .eq('id', agente_id)
        .single()

      console.log('[create-prospecto] Resultado búsqueda agente:', { agente, agenteError })

      if (agenteError || !agente) {
        return NextResponse.json(
          { error: 'Agente no encontrado' },
          { status: 404 }
        )
      }

      nombreAgente = agente.nombre ?? 'Agente'
      emailAgente = agente.email
    }

    // Verificar si ya existe un prospecto con este email
    console.log('[create-prospecto] Verificando email existente:', body.email)
    const { data: existingProspecto } = await supabase
      .from('prospectos')
      .select('id')
      .eq('email', body.email)
      .single()

    console.log('[create-prospecto] Prospecto existente:', existingProspecto)

    if (existingProspecto) {
      return NextResponse.json(
        { error: 'Ya existe un prospecto con este email' },
        { status: 409 }
      )
    }

    // Calcular año y semana ISO según estándar ISO 8601
    const now = new Date()
    const anio = now.getFullYear()
    
    // Calcular semana ISO correctamente según ISO 8601
    // La semana 1 es la primera que contiene un jueves del año
    function getISOWeek(date: Date): number {
      const target = new Date(date.valueOf())
      const dayNr = (date.getDay() + 6) % 7 // Lunes = 0
      target.setDate(target.getDate() - dayNr + 3) // Jueves más cercano
      const firstThursday = target.valueOf()
      target.setMonth(0, 1) // 1 de enero
      if (target.getDay() !== 4) { // Si no es jueves
        target.setMonth(0, 1 + ((4 - target.getDay()) + 7) % 7)
      }
      return 1 + Math.ceil((firstThursday - target.valueOf()) / 604800000)
    }
    const semana_iso = getISOWeek(now)

    // Generar notas automáticas
    const planNombre = body.plan === '65' ? 'Imagina ser 65' : body.plan === '15' ? 'Imagina ser 15' : 'Imagina ser 10'
    const primaMensual = new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN',
      minimumFractionDigits: 2
    }).format(body.cotizacion.primaMensualMXN)

    const notas = `Prospecto del simulador PPR. Plan: ${planNombre}. Edad: ${body.edad} años.
Prima mensual estimada: ${primaMensual}`

    // Crear prospecto
    console.log('[create-prospecto] Intentando crear prospecto con datos:', {
      agente_id,
      anio,
      semana_iso,
      nombre: body.nombre,
      email: body.email,
      telefono: telefonoLimpio,
      estado: 'pendiente',
      origen: 'landing_ppr'
    })

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
        origen: 'landing_ppr',
        first_visit_at: new Date().toISOString()
      })
      .select()
      .single()

    console.log('[create-prospecto] Resultado insert:', { prospecto, prospectoError })

    if (prospectoError) {
      console.error('[create-prospecto] ❌ Error creating prospecto:', prospectoError)
      console.error('[create-prospecto] Error details:', JSON.stringify(prospectoError, null, 2))
      return NextResponse.json(
        { error: 'Error al crear prospecto', details: prospectoError.message },
        { status: 500 }
      )
    }

    console.log('[create-prospecto] ✅ Prospecto creado exitosamente:', prospecto.id)

    // Obtener emails de supervisores
    const { data: supervisores } = await supabase
      .from('usuarios')
      .select('email')
      .eq('rol', 'supervisor')

    const supervisorEmails = (supervisores || [])
      .map((s: { email: string | null }) => s.email)
      .filter(Boolean) as string[]

    // Enviar email al agente con copia a supervisores
    try {
      const meta65Formatted = new Intl.NumberFormat('es-MX', {
        style: 'currency',
        currency: 'MXN',
        minimumFractionDigits: 2
      }).format(body.cotizacion.meta65MXN)

      const emailContent = buildProspectoPPREmail({
        nombreProspecto: body.nombre,
        edad: body.edad,
        email: body.email,
        telefono: telefonoLimpio,
        plan: body.plan,
        primaMensualMXN: primaMensual,
        meta65MXN: meta65Formatted,
        añosPago: body.cotizacion.añosPago,
        nombreAgente
      })

      await sendMail({
        to: emailAgente,
        cc: supervisorEmails,
        subject: emailContent.subject,
        html: emailContent.html,
        text: emailContent.text
      })
    } catch (emailError) {
      // Log error pero no fallar la request
      console.error('Error sending email:', emailError)
    }

    return NextResponse.json({
      success: true,
      prospecto_id: prospecto.id,
      message: 'Prospecto creado exitosamente'
    })

  } catch (error) {
    console.error('Error in create-prospecto:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}
