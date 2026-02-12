import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabaseAdmin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function resolveProjectRef(): string {
  const fromEnv = process.env.SUPABASE_PROJECT_REF || ''
  if (fromEnv) return fromEnv
  const fromUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || ''
  const host = fromUrl.replace(/^https?:\/\//,'').split('.')[0] || ''
  return host
}

function getDefaultAgentEmail(): string {
  const projectRef = resolveProjectRef()
  // Main: oooyuomshachmmblmpvd => ing.zamarripaa@gmail.com
  if (projectRef === 'oooyuomshachmmblmpvd') return 'ing.zamarripaa@gmail.com'
  // Local/dev: wqutrjnxvcgmyyiyjmsd => paopecina3@gmail.com
  if (projectRef === 'wqutrjnxvcgmyyiyjmsd') return 'paopecina3@gmail.com'
  // Fallback (local sin ref)
  return 'paopecina3@gmail.com'
}

/**
 * GET /api/landing/resolve-agent?code=JMCT2024
 * Resuelve el código de agente a su información
 * Si no hay código válido, retorna el agente por defecto (ing.zamarripaa@gmail.com)
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const code = searchParams.get('code')

    // Usar service role para saltar RLS en agent_codes y usuarios (público landing)
    const supabase = getServiceClient()

    const defaultEmail = getDefaultAgentEmail()

    // Si no hay código, buscar agente por defecto
    if (!code) {
      const { data: defaultAgent, error: defaultError } = await supabase
        .from('usuarios')
        .select('id, nombre, email')
        .eq('email', defaultEmail)
        .single()

      if (defaultError || !defaultAgent) {
        return NextResponse.json(
          { error: 'Agente por defecto no encontrado' },
          { status: 404 }
        )
      }

      return NextResponse.json({
        agente_id: defaultAgent.id,
        nombre: defaultAgent.nombre,
        email: defaultAgent.email,
        is_default: true
      })
    }

    // Buscar código en agent_codes
    const { data: agentCode, error: codeError } = await supabase
      .from('agent_codes')
      .select('agente_id, nombre_agente, activo, expires_at')
      .eq('code', code.toUpperCase())
      .single()

    if (codeError || !agentCode) {
      // Código no válido, retornar agente por defecto
      const { data: defaultAgent, error: defaultError } = await supabase
        .from('usuarios')
        .select('id, nombre, email')
        .eq('email', defaultEmail)
        .single()

      if (defaultError || !defaultAgent) {
        return NextResponse.json(
          { error: 'Agente por defecto no encontrado' },
          { status: 404 }
        )
      }

      return NextResponse.json({
        agente_id: defaultAgent.id,
        nombre: defaultAgent.nombre,
        email: defaultAgent.email,
        is_default: true,
        code_error: 'Código no válido o expirado'
      })
    }

    // Verificar si el código está activo
    if (!agentCode.activo) {
      const { data: defaultAgent } = await supabase
        .from('usuarios')
        .select('id, nombre, email')
        .eq('email', defaultEmail)
        .single()

      return NextResponse.json({
        agente_id: defaultAgent!.id,
        nombre: defaultAgent!.nombre,
        email: defaultAgent!.email,
        is_default: true,
        code_error: 'Código inactivo'
      })
    }

    // Verificar si el código ha expirado
    if (agentCode.expires_at && new Date(agentCode.expires_at) < new Date()) {
      const { data: defaultAgent } = await supabase
        .from('usuarios')
        .select('id, nombre, email')
        .eq('email', defaultEmail)
        .single()

      return NextResponse.json({
        agente_id: defaultAgent!.id,
        nombre: defaultAgent!.nombre,
        email: defaultAgent!.email,
        is_default: true,
        code_error: 'Código expirado'
      })
    }

    // Código válido, buscar info del agente
    const { data: agente, error: agenteError } = await supabase
      .from('usuarios')
      .select('id, nombre, email')
      .eq('id', agentCode.agente_id)
      .single()

    if (agenteError || !agente) {
      return NextResponse.json(
        { error: 'Agente no encontrado' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      agente_id: agente.id,
      nombre: agente.nombre,
      email: agente.email,
      is_default: false,
      code: code.toUpperCase()
    })

  } catch (error) {
    console.error('Error resolving agent code:', error)
    return NextResponse.json(
      { error: 'Error al resolver código de agente' },
      { status: 500 }
    )
  }
}
