import { NextResponse } from 'next/server'
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

async function fetchBanxicoSeries(series: string, start: string, end: string, token: string) {
  const url = `https://www.banxico.org.mx/SieAPIRest/service/v1/series/${series}/datos/${start}/${end}?token=${encodeURIComponent(token)}`
  const res = await fetch(url)
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Banxico ${series} ${res.status}: ${text}`)
  }
  return res.json() as Promise<unknown>
}

async function fetchBanxicoOportuno(series: string, token: string) {
  const url = `https://www.banxico.org.mx/SieAPIRest/service/v1/series/${series}/datos/oportuno?token=${encodeURIComponent(token)}`
  const res = await fetch(url)
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Banxico oportuno ${series} ${res.status}: ${text}`)
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

export async function POST(req: Request) {
  try {
    const secret = process.env.CRON_SECRET || ''
    const hdr = req.headers.get('x-cron-secret') || ''
    if (!secret || hdr !== secret) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    // Accept params via query string or JSON body for compatibility
    const url = new URL(req.url)
    let source = (url.searchParams.get('source') || '').toLowerCase()
    let daysBackStr = url.searchParams.get('days_back') || ''
    if (!source || !daysBackStr) {
      try {
        const body = await req.json().catch(() => null) as { source?: string; days_back?: number | string } | null
        if (body) {
          if (!source && body.source) source = String(body.source).toLowerCase()
          if (!daysBackStr && body.days_back != null) daysBackStr = String(body.days_back)
        }
      } catch { /* ignore */ }
    }
    const sourceNorm = (source || 'both') as 'udi' | 'usd' | 'both'
    const daysBack = Number(daysBackStr || '365')

    const token = envOrThrow('BANXICO_TOKEN')
    const supabaseUrl = envOrThrow('NEXT_PUBLIC_SUPABASE_URL')
    const serviceKey = envOrThrow('SUPABASE_SERVICE_ROLE_KEY')

    const today = new Date()
    const start = new Date(today.getTime() - daysBack * 24 * 3600 * 1000)
    const startStr = ymd(start)
    const endStr = ymd(today)

    const seriesUDI = process.env.BANXICO_SERIES_UDI || 'SP68257'
    const seriesUSD = process.env.BANXICO_SERIES_USD || 'SF43718'

  const wantUDI = sourceNorm === 'both' || sourceNorm === 'udi'
  const wantUSD = sourceNorm === 'both' || sourceNorm === 'usd'

    const tasks: Array<Promise<unknown>> = []
    if (wantUDI) tasks.push(fetchBanxicoSeries(seriesUDI, startStr, endStr, token))
    if (wantUSD) tasks.push(fetchBanxicoSeries(seriesUSD, startStr, endStr, token))

    const results = await Promise.all(tasks)
    const [udiJson, usdJson] = (
      sourceNorm === 'both' ? results : sourceNorm === 'udi' ? [results[0], undefined] : [undefined, results[0]]
    ) as [unknown | undefined, unknown | undefined]

    const fetchedAt = new Date().toISOString()
    let udiDatos = (udiJson ? parseBanxico(udiJson) : [])
    let usdDatos = (usdJson ? parseBanxico(usdJson) : [])

    const notes: string[] = []
    if (wantUDI && udiDatos.length === 0) {
      try {
        const uOpp = await fetchBanxicoOportuno(seriesUDI, token)
        const opp = parseBanxico(uOpp)
        if (opp.length) {
          udiDatos = opp
          notes.push('UDI vacío en rango, usando datos oportuno')
        }
      } catch {/* ignore */}
    }
    if (wantUSD && usdDatos.length === 0) {
      try {
        const fOpp = await fetchBanxicoOportuno(seriesUSD, token)
        const opp = parseBanxico(fOpp)
        if (opp.length) {
          usdDatos = opp
          notes.push('USD vacío en rango, usando datos oportuno')
        }
      } catch {/* ignore */}
    }

    const udiRows = udiDatos
      .map(d => ({ fecha: parseFechaDDMMYYYY(d.fecha), valor: parseNumero(d.dato) }))
      .filter(r => r.fecha && r.valor != null)
      .map(r => ({ fecha: r.fecha!, valor: r.valor as number, source: 'banxico', fetched_at: fetchedAt, stale: false }))

    const fxRows = usdDatos
      .map(d => ({ fecha: parseFechaDDMMYYYY(d.fecha), valor: parseNumero(d.dato) }))
      .filter(r => r.fecha && r.valor != null)
      .map(r => ({ fecha: r.fecha!, valor: r.valor as number, source: 'banxico', fetched_at: fetchedAt, stale: false }))

    const supaAdmin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })

    if (udiRows.length) {
      const { error: udiErr } = await supaAdmin.from('udi_values').upsert(udiRows, { onConflict: 'fecha' })
      if (udiErr) return NextResponse.json({ error: 'UDI upsert failed', details: udiErr }, { status: 500 })
    }

    if (fxRows.length) {
      const { error: fxErr } = await supaAdmin.from('fx_values').upsert(fxRows, { onConflict: 'fecha' })
      if (fxErr) return NextResponse.json({ error: 'FX upsert failed', details: fxErr }, { status: 500 })
    }

  return NextResponse.json({ ok: true, counts: { udi: udiRows.length, usd: fxRows.length }, range: { start: startStr, end: endStr }, note: notes.length ? notes.join('; ') : undefined })
  } catch (e) {
    const msg = (e instanceof Error) ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
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
