import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const keys = [
    'VERCEL_ENV','VERCEL_URL','NEXT_PUBLIC_SUPABASE_URL','SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','GMAIL_USER','MAIL_LOGIN_URL'
  ] as const
  const data: Record<string,string> = {}
  keys.forEach(k => { data[k] = process.env[k] ? 'SET' : 'MISSING' })
  // Si falta SUPABASE_URL pero existe NEXT_PUBLIC_SUPABASE_URL mostramos INFERRED (usamos fallback internamente)
  if (data['SUPABASE_URL'] === 'MISSING' && process.env.NEXT_PUBLIC_SUPABASE_URL) {
    data['SUPABASE_URL'] = 'INFERRED_FROM_PUBLIC'
  }
  return NextResponse.json({ ok:true, data })
}
