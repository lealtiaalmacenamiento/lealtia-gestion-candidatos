import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let adminClient: SupabaseClient | null = null

function buildPlaceholder(): SupabaseClient {
  const handler: ProxyHandler<object> = {
    get(_t, prop) {
      if (prop === '__isPlaceholder') return true
      throw new Error('[supabaseAdmin] Cliente no configurado: faltan SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en variables de entorno')
    }
  }
  return new Proxy({}, handler) as SupabaseClient
}

export function getServiceClient(): SupabaseClient {
  if (adminClient) return adminClient
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY
  if(!url || !serviceKey || url === '' || serviceKey === '') {
    // No lanzamos error durante build; devolver proxy que lanza al usarse
    adminClient = buildPlaceholder()
    return adminClient
  }
  adminClient = createClient(url, serviceKey)
  return adminClient
}

export function ensureAdminClient(): SupabaseClient {
  const c = getServiceClient()
  // Forzar error explícito si es placeholder al usarlo conscientemente
  if ((c as unknown as { __isPlaceholder?: boolean }).__isPlaceholder) {
    throw new Error('[supabaseAdmin] Falta configurar variables SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
  }
  return c
}
