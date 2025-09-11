import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function envOrThrow(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`Missing env ${name}`)
  return v
}

function ymd(d: Date): string {
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

async function getSupaSSR() {
  const cookieStore = await cookies()
  const supabaseUrl = envOrThrow('NEXT_PUBLIC_SUPABASE_URL')
  const supabaseKey = envOrThrow('NEXT_PUBLIC_SUPABASE_ANON_KEY')
  return createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      get(name: string) { return cookieStore.get(name)?.value },
      set(name: string, value: string, options: CookieOptions) { cookieStore.set({ name, value, ...options }) },
      remove(name: string, options: CookieOptions) { cookieStore.set({ name, value: '', ...options }) }
    }
  })
}

async function fetchBanxicoSeries(series: string, start: string, end: string, token: string) {
  const url = `https://www.banxico.org.mx/SieAPIRest/service/v1/series/${series}/datos/${start}/${end}?token=${encodeURIComponent(token)}`
  const res = await fetch(url)
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Banxico ${series} ${res.status}: ${text}`)
  }
  return res.json() as Promise<unknown>
}

type BanxicoDato = { fecha: string; dato: string }

function isBanxicoResp(obj: unknown): obj is { bmx: { series: Array<{ datos: BanxicoDato[] }> } } {
  if (!obj || typeof obj !== 'object') return false
  const root = obj as Record<string, unknown>
  const bmx = root['bmx'] as Record<string, unknown> | undefined
  const series = (bmx?.['series'] as unknown) as Array<{ datos?: unknown }>
  return Array.isArray(series) && Array.isArray(series[0]?.datos)
}

function parseBanxico(json: unknown): BanxicoDato[] {
  if (!isBanxicoResp(json)) return []
  return json.bmx.series[0].datos
}

function parseNumero(val: string): number | null {
  if (!val) return null
  const n = Number(String(val).replace(/,/g, ''))
  return Number.isFinite(n) ? n : null
}

function parseFechaDDMMYYYY(s: string): string | null {
  const m = /^([0-3]?\d)\/([0-1]?\d)\/(\d{4})$/.exec(s)
  if (!m) return null
  const dd = m[1].padStart(2, '0')
  const MM = m[2].padStart(2, '0')
  const yyyy = m[3]
  return `${yyyy}-${MM}-${dd}`
}

export async function GET(req: Request) {
  try {
    const supaSSR = await getSupaSSR()
    const { data: auth } = await supaSSR.auth.getUser()
    if (!auth?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

    // Debe ser super
    const { data: isSuper } = await supaSSR.rpc('is_super_role_wrapper')
    if (!isSuper) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const url = new URL(req.url)
    const daysBack = Number(url.searchParams.get('days_back') || '365')
    const seriesUDI = url.searchParams.get('series_udi') || process.env.BANXICO_SERIES_UDI || 'SP68257'
    const seriesUSD = url.searchParams.get('series_usd') || process.env.BANXICO_SERIES_USD || 'SF43718'

    const token = envOrThrow('BANXICO_TOKEN')
    const today = new Date()
    const start = new Date(today.getTime() - daysBack * 24 * 3600 * 1000)
    const startStr = ymd(start)
    const endStr = ymd(today)

    const [udiJson, usdJson] = await Promise.all([
      fetchBanxicoSeries(seriesUDI, startStr, endStr, token),
      fetchBanxicoSeries(seriesUSD, startStr, endStr, token)
    ])

    const udiDatos = parseBanxico(udiJson)
    const usdDatos = parseBanxico(usdJson)

    const fetchedAt = new Date().toISOString()
    const udiRows = udiDatos
      .map(d => ({ fecha: parseFechaDDMMYYYY(d.fecha), valor: parseNumero(d.dato) }))
      .filter(r => r.fecha && r.valor != null)
      .map(r => ({ fecha: r.fecha!, valor: r.valor as number, source: 'banxico', fetched_at: fetchedAt, stale: false }))

    const fxRows = usdDatos
      .map(d => ({ fecha: parseFechaDDMMYYYY(d.fecha), valor: parseNumero(d.dato) }))
      .filter(r => r.fecha && r.valor != null)
      .map(r => ({ fecha: r.fecha!, valor: r.valor as number, source: 'banxico', fetched_at: fetchedAt, stale: false }))

    const supabaseUrl = envOrThrow('NEXT_PUBLIC_SUPABASE_URL')
    const serviceKey = envOrThrow('SUPABASE_SERVICE_ROLE_KEY')
    const supaAdmin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })

    const { error: udiErr } = await supaAdmin.from('udi_values').upsert(udiRows, { onConflict: 'fecha' })
    if (udiErr) return NextResponse.json({ error: 'UDI upsert failed', details: udiErr }, { status: 500 })

    const { error: fxErr } = await supaAdmin.from('fx_values').upsert(fxRows, { onConflict: 'fecha' })
    if (fxErr) return NextResponse.json({ error: 'FX upsert failed', details: fxErr }, { status: 500 })

    return NextResponse.json({ ok: true, counts: { udi: udiRows.length, usd: fxRows.length }, range: { start: startStr, end: endStr } })
  } catch (e) {
    const msg = (e instanceof Error) ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
