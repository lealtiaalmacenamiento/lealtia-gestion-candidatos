import { NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabaseAdmin'
import type { Auditoria } from '@/types'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const debug = url.searchParams.get('debug') === '1'
  const sb = getServiceClient()
  const primary = await sb.from('registro_acciones').select('*').order('fecha', { ascending: false })
  let data = primary.data
  if (primary.error) {
    // Fallback a camelCase
    const fallback = await sb.from('RegistroAcciones').select('*').order('fecha', { ascending: false })
    if (fallback.error) {
      return NextResponse.json({ success: false, message: primary.error.message, ...(debug ? { stack: primary.error.details || null } : {}) }, { status: 500 })
    }
    data = fallback.data
  }
  return NextResponse.json<{ success: boolean; data: Auditoria[] }>({ success: true, data: (data || []) as Auditoria[] })
}
