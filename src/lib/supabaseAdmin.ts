import { createClient } from '@supabase/supabase-js'

let adminClient: ReturnType<typeof createClient> | null = null

export function getServiceClient() {
  if (adminClient) return adminClient
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY
  if(!url || !serviceKey) {
    console.error('[supabaseAdmin] Missing SUPABASE_URL or service role key')
    throw new Error('Missing Supabase service credentials')
  }
  adminClient = createClient(url, serviceKey)
  return adminClient
}
