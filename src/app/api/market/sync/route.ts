import { NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabaseAdmin'

const supabase = getServiceClient()

// Evitar edge runtime y caching accidental
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Source = 'udi' | 'fx' | 'both'

function okSecret(req: Request): boolean {
  const secret = process.env.MARKET_SYNC_SECRET
  if (!secret) return false
  const hdr = req.headers.get('x-cron-secret') || new URL(req.url).searchParams.get('secret')
  return !!hdr && hdr === secret
}

function todayMX(): string {
  // Use today in local server timezone; in Vercel this is UTC, acceptable for daily sync
  return new Date().toISOString().slice(0, 10)
}

type BanxicoResponse = { bmx?: { series?: Array<{ datos?: Array<{ fecha?: string, dato?: string }> }> } }

async function fetchBanxicoSerie(serie: string, date: string, token: string) {
  const url = `https://www.banxico.org.mx/SieAPIRest/service/v1/series/${serie}/datos/${date}/${date}?token=${encodeURIComponent(token)}`
  const res = await fetch(url, { headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error(`Banxico ${serie} ${res.status}`)
  const json: BanxicoResponse = await res.json()
  const series = json?.bmx?.series?.[0]?.datos
  if (!Array.isArray(series) || series.length === 0) throw new Error('Banxico vacío')
  const dato = series[0]?.dato
  const fecha = series[0]?.fecha
  const valor = Number(String(dato).replace(/,/g, '.'))
  if (!fecha || Number.isNaN(valor)) throw new Error('Dato inválido')
  // Convert Banxico dd/MM/yyyy to yyyy-MM-dd if necessary
  const [dd, mm, yyyy] = String(fecha).split('/')
  const iso = yyyy && mm && dd ? `${yyyy}-${mm.padStart(2,'0')}-${dd.padStart(2,'0')}` : date
  return { fecha: iso, valor }
}

export async function POST(req: Request) {
  if (!okSecret(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'x-cron-secret,content-type', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS' } })
  const url = new URL(req.url)
  const source = (url.searchParams.get('source') as Source) || 'both'
  const date = url.searchParams.get('date') || todayMX()
  const token = process.env.BANXICO_TOKEN
  if (!token) return NextResponse.json({ error: 'BANXICO_TOKEN no configurado' }, { status: 500, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'x-cron-secret,content-type', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS' } })

  const results: Record<string, unknown> = {}
  try {
    if (source === 'udi' || source === 'both') {
      // UDI serie SP68257
      const { fecha, valor } = await fetchBanxicoSerie('SP68257', date, token)
      const up = await supabase.from('udi_values').upsert({ fecha, valor, source: 'banxico', fetched_at: new Date().toISOString(), stale: false }, { onConflict: 'fecha' }).select().single()
      if (up.error) throw up.error
      results.udi = up.data
    }
    if (source === 'fx' || source === 'both') {
      // USD/MXN FIX serie SF43718
      const { fecha, valor } = await fetchBanxicoSerie('SF43718', date, token)
      const up = await supabase.from('fx_values').upsert({ fecha, valor, source: 'banxico', fetched_at: new Date().toISOString(), stale: false }, { onConflict: 'fecha' }).select().single()
      if (up.error) throw up.error
      results.fx = up.data
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'x-cron-secret,content-type', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS' } })
  }

  return NextResponse.json({ success: true, date, source, results }, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'x-cron-secret,content-type', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS' } })
}

export async function GET(req: Request) {
  // Allow GET for manual test with the secret; same as POST
  return POST(req)
}

export async function OPTIONS() {
  // Preflight support (useful if called cross-origin or with custom headers)
  return new NextResponse(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'x-cron-secret,content-type', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS' } })
}

export async function HEAD() {
  return new NextResponse(null, { status: 200, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'x-cron-secret,content-type', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS' } })
}
