import { NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabaseAdmin'

// Usa service key directamente para diagnosticar (NO dejar en producción)
const supabase = getServiceClient()

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  const row = await supabase.from('efc').select('*').eq('id', id).maybeSingle()
  return NextResponse.json({ row })
}

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  const body = await req.json().catch(()=> ({}))
  // Hacer update directo con service key y devolver filas afectadas
  const { data, error } = await supabase.from('efc').update(body).eq('id', id).select()
  return NextResponse.json({ error: error?.message || null, updatedCount: Array.isArray(data)? data.length: null, data })
}
