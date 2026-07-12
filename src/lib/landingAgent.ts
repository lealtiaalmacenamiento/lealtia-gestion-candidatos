import type { SupabaseClient } from '@supabase/supabase-js'

export interface LandingAgentResult {
  agente_id: number
  id_auth: string | null
  nombre: string | null
  email: string
  is_default: boolean
  code?: string
  code_error?: string
}

function resolveProjectRef(): string {
  const fromEnv = process.env.SUPABASE_PROJECT_REF || ''
  if (fromEnv) return fromEnv
  const fromUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || ''
  return fromUrl.replace(/^https?:\/\//, '').split('.')[0] || ''
}

export function getDefaultLandingAgentEmail(): string {
  const configured = process.env.LANDING_DEFAULT_AGENT_EMAIL?.trim()
  if (configured) return configured.toLowerCase()

  const projectRef = resolveProjectRef()
  if (projectRef === 'oooyuomshachmmblmpvd') return 'ing.zamarripaa@gmail.com'
  if (projectRef === 'wqutrjnxvcgmyyiyjmsd') return 'paopecina3@gmail.com'
  return 'paopecina3@gmail.com'
}

async function resolveDefaultAgent(
  supabase: SupabaseClient,
  codeError?: string
): Promise<LandingAgentResult | null> {
  const defaultEmail = getDefaultLandingAgentEmail()
  const { data: defaultAgent } = await supabase
    .from('usuarios')
    .select('id,id_auth,nombre,email,activo')
    .eq('email', defaultEmail)
    .maybeSingle()

  if (!defaultAgent?.id || !defaultAgent.email) return null
  return {
    agente_id: Number(defaultAgent.id),
    id_auth: defaultAgent.id_auth ?? null,
    nombre: defaultAgent.nombre ?? null,
    email: defaultAgent.email,
    is_default: true,
    code_error: codeError
  }
}

export async function resolveLandingAgent(
  supabase: SupabaseClient,
  rawCode?: string | null
): Promise<LandingAgentResult | null> {
  const code = rawCode?.trim().toUpperCase()
  if (!code) return resolveDefaultAgent(supabase)

  const { data: agentCode } = await supabase
    .from('agent_codes')
    .select('code,agente_id,nombre_agente,activo,expires_at')
    .eq('code', code)
    .maybeSingle()

  if (!agentCode) return resolveDefaultAgent(supabase, 'Código no válido o expirado')
  if (!agentCode.activo) return resolveDefaultAgent(supabase, 'Código inactivo')
  if (agentCode.expires_at && new Date(agentCode.expires_at).getTime() <= Date.now()) {
    return resolveDefaultAgent(supabase, 'Código expirado')
  }

  const { data: agente } = await supabase
    .from('usuarios')
    .select('id,id_auth,nombre,email,activo')
    .eq('id', agentCode.agente_id)
    .maybeSingle()

  if (!agente?.id || !agente.email || agente.activo === false) {
    return resolveDefaultAgent(supabase, 'Agente no disponible')
  }

  return {
    agente_id: Number(agente.id),
    id_auth: agente.id_auth ?? null,
    nombre: agente.nombre ?? agentCode.nombre_agente ?? null,
    email: agente.email,
    is_default: false,
    code
  }
}

