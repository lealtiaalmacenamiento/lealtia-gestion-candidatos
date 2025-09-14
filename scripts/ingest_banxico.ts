/*
  Ingesta Banxico (UDI y USD/MXN FIX) hacia Supabase.

  Requisitos env:
  - BANXICO_TOKEN: token SIE Banxico
  - NEXT_PUBLIC_SUPABASE_URL: URL del proyecto
  - SUPABASE_SERVICE_ROLE_KEY: clave service role (para escribir sin RLS)

  Opcionales:
  - BANXICO_SERIES_UDI (por defecto 'SP68257')
  - BANXICO_SERIES_USD (por defecto 'SF43718')
  - DAYS_BACK (por defecto 365)
*/

import { createClient } from '@supabase/supabase-js'

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
  const json = await res.json()
  return json
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
  // Banxico suele usar punto decimal, pero por si acaso, quitamos comas separadores
  const n = Number(String(val).replace(/,/g, ''))
  return Number.isFinite(n) ? n : null
}

function parseFechaDDMMYYYY(s: string): string | null {
  // Respuesta viene como dd/MM/yyyy; convertimos a yyyy-MM-dd
  const m = /^([0-3]?\d)\/([0-1]?\d)\/(\d{4})$/.exec(s)
  if (!m) return null
  const dd = m[1].padStart(2, '0')
  const MM = m[2].padStart(2, '0')
  const yyyy = m[3]
  return `${yyyy}-${MM}-${dd}`
}

async function run() {
  const token = envOrThrow('BANXICO_TOKEN')
  const supaUrl = envOrThrow('NEXT_PUBLIC_SUPABASE_URL')
  const supaKey = envOrThrow('SUPABASE_SERVICE_ROLE_KEY')
  const daysBack = Number(process.env.DAYS_BACK || '365')
  const today = new Date()
  const start = new Date(today.getTime() - daysBack * 24 * 3600 * 1000)

  const startStr = ymd(start)
  const endStr = ymd(today)

  const seriesUDI = process.env.BANXICO_SERIES_UDI || 'SP68257'
  const seriesUSD = process.env.BANXICO_SERIES_USD || 'SF43718'

  console.log(`[ingest_banxico] Rango ${startStr}..${endStr}`)

  // Fetch
  const [udiJson, usdJson] = await Promise.all([
    fetchBanxicoSeries(seriesUDI, startStr, endStr, token),
    fetchBanxicoSeries(seriesUSD, startStr, endStr, token)
  ])

  const udiDatos = parseBanxico(udiJson)
  const usdDatos = parseBanxico(usdJson)

  // Mapear a filas
  const udiRows = udiDatos
    .map(d => ({ fecha: parseFechaDDMMYYYY(d.fecha), valor: parseNumero(d.dato) }))
    .filter(r => r.fecha && r.valor != null)
    .map(r => ({
      fecha: r.fecha!,
      valor: r.valor as number,
      source: 'banxico',
      fetched_at: new Date().toISOString(),
      stale: false
    }))

  const fxRows = usdDatos
    .map(d => ({ fecha: parseFechaDDMMYYYY(d.fecha), valor: parseNumero(d.dato) }))
    .filter(r => r.fecha && r.valor != null)
    .map(r => ({
      fecha: r.fecha!,
      valor: r.valor as number,
      source: 'banxico',
      fetched_at: new Date().toISOString(),
      stale: false
    }))

  console.log(`[ingest_banxico] UDI rows: ${udiRows.length}, USD rows: ${fxRows.length}`)

  // Upsert en Supabase
  const supa = createClient(supaUrl, supaKey, { auth: { persistSession: false } })

  // Nota: requerir índice único en (fecha) para que onConflict funcione bien.
  const { error: udiErr } = await supa.from('udi_values').upsert(udiRows, { onConflict: 'fecha' })
  if (udiErr) throw udiErr
  const { error: fxErr } = await supa.from('fx_values').upsert(fxRows, { onConflict: 'fecha' })
  if (fxErr) throw fxErr

  console.log('[ingest_banxico] Ingesta completa')
}

run().catch(err => {
  console.error('[ingest_banxico] ERROR', err)
  process.exitCode = 1
})
