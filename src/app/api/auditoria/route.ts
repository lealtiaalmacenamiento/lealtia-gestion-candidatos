import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabaseClient'
import type { Auditoria } from '@/types'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const debug = url.searchParams.get('debug') === '1'
  const primary = await supabase.from('RegistroAcciones').select('*').order('fecha', { ascending: false })
  let data = primary.data
  if (primary.error) {
    // Fallback a snake_case
    const fallback = await supabase.from('registro_acciones').select('*').order('fecha', { ascending: false })
    if (fallback.error) {
      return NextResponse.json({ success: false, message: primary.error.message, ...(debug ? { stack: primary.error.details || null } : {}) }, { status: 500 })
    }
    data = fallback.data
  }
  return NextResponse.json<{ success: boolean; data: Auditoria[] }>({ success: true, data: (data || []) as Auditoria[] })
}
