import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabaseAdmin'
import { resolveLandingAgent } from '@/lib/landingAgent'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/landing/resolve-agent?code=JMCT2024
 * Resolves an optional agent code. Invalid/missing codes fall back to the
 * configured default landing agent, preserving the previous landing behavior.
 */
export async function GET(request: NextRequest) {
  try {
    const code = request.nextUrl.searchParams.get('code')
    const supabase = getServiceClient()
    const agent = await resolveLandingAgent(supabase, code)

    if (!agent) {
      return NextResponse.json(
        { error: 'Agente por defecto no encontrado' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      agente_id: agent.agente_id,
      nombre: agent.nombre,
      email: agent.email,
      is_default: agent.is_default,
      code: agent.code,
      code_error: agent.code_error
    })
  } catch (error) {
    console.error('Error resolving agent code:', error)
    return NextResponse.json(
      { error: 'Error al resolver código de agente' },
      { status: 500 }
    )
  }
}
