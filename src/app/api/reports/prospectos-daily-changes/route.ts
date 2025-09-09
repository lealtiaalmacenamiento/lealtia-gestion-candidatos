import { NextResponse } from 'next/server'
import { ensureAdminClient } from '@/lib/supabaseAdmin'
import { sendMail } from '@/lib/mailer'
import * as XLSX from 'xlsx'

// Asegurar runtime Node.js (necesario para nodemailer/xlsx)
export const runtime = 'nodejs'
// Evita cualquier caching accidental en plataformas que puedan cachear GET
export const dynamic = 'force-dynamic'

// Tipado de filas de historial
type HistRow = {
  id: number
  created_at: string
  prospecto_id: number | null
  agente_id: number | null
  usuario_email: string | null
  estado_anterior: string | null
  estado_nuevo: string | null
  nota_agregada?: boolean | null
  notas_anteriores?: string | null
  notas_nuevas?: string | null
}

function getTodayCDMXParts(now = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit', day: '2-digit' })
  const parts = Object.fromEntries(fmt.formatToParts(now).map(p => [p.type, p.value])) as { year: string; month: string; day: string }
  return { y: Number(parts.year), m: Number(parts.month), d: Number(parts.day) }
}

// Ventana anclada al día CDMX de la fecha dada: [00:00, 24:00) => [06:00Z, 06:00Z siguiente)
function getCDMXDayWindowFor(date = new Date()) {
  const { y, m, d } = getTodayCDMXParts(date)
  const startUTC = Date.UTC(y, m - 1, d, 6, 0, 0)
  const endUTC = startUTC + 24 * 60 * 60 * 1000
  return { start: new Date(startUTC), end: new Date(endUTC) }
}

// Ventana móvil últimas 24 horas
function getRollingLast24UTC(now = new Date()) {
  const end = new Date(now)
  const start = new Date(end.getTime() - 24 * 60 * 60 * 1000)
  return { start, end }
}

function fmtCDMX(d: string | Date) {
  const dt = typeof d === 'string' ? new Date(d) : d
  return new Intl.DateTimeFormat('es-MX', { timeZone: 'America/Mexico_City', dateStyle: 'short', timeStyle: 'short' }).format(dt)
}

export async function GET(req: Request) {
  const supa = ensureAdminClient()
  const url = new URL(req.url)
  const startQ = url.searchParams.get('start')
  const endQ = url.searchParams.get('end')
  const dry = url.searchParams.get('dry') === '1'
  const windowParam = (url.searchParams.get('window') || url.searchParams.get('mode') || '').toLowerCase()
  const useAnchored = ['cdmx-day', 'day', 'anchored'].includes(windowParam)
  const explicitRange = !!(startQ && endQ)

  let selectedMode: 'last24h' | 'cdmx-day' = useAnchored ? 'cdmx-day' : 'last24h'
  let window = explicitRange
    ? { start: new Date(startQ as string), end: new Date(endQ as string) }
    : (useAnchored ? getCDMXDayWindowFor(new Date()) : getRollingLast24UTC(new Date()))

  let startISO = window.start.toISOString()
  let endISO = window.end.toISOString()

  // 1) Traer historial para la ventana elegida
  const { data: historial, error: histErr } = await supa
    .from('prospectos_historial')
    .select('id, created_at, prospecto_id, agente_id, usuario_email, estado_anterior, estado_nuevo, nota_agregada, notas_anteriores, notas_nuevas')
    .gte('created_at', startISO)
    .lt('created_at', endISO)
    .order('created_at', { ascending: true })

  if (histErr) {
    return NextResponse.json({ ok: false, error: histErr.message }, { status: 500 })
  }

  let histRows: HistRow[] = (historial || []) as HistRow[]

  // 1b) Fallbacks si no se pasó rango explícito y no hay resultados
  if (!explicitRange && histRows.length === 0) {
    try {
      if (selectedMode === 'last24h') {
        // Probar CDMX-day para la fecha actual (hoy 00:00→mañana 00:00)
        const alt1 = getCDMXDayWindowFor(new Date())
        const { data: h1 } = await supa
          .from('prospectos_historial')
          .select('id, created_at, prospecto_id, agente_id, usuario_email, estado_anterior, estado_nuevo, nota_agregada, notas_anteriores, notas_nuevas')
          .gte('created_at', alt1.start.toISOString())
          .lt('created_at', alt1.end.toISOString())
          .order('created_at', { ascending: true })
        if ((h1 || []).length > 0) {
          histRows = h1 as HistRow[]
          window = alt1
          startISO = window.start.toISOString()
          endISO = window.end.toISOString()
          selectedMode = 'cdmx-day'
        } else {
          // Probar CDMX-day anterior (ayer 00:00→hoy 00:00)
          const alt2 = getCDMXDayWindowFor(new Date(Date.now() - 24 * 60 * 60 * 1000))
          const { data: h2 } = await supa
            .from('prospectos_historial')
            .select('id, created_at, prospecto_id, agente_id, usuario_email, estado_anterior, estado_nuevo, nota_agregada, notas_anteriores, notas_nuevas')
            .gte('created_at', alt2.start.toISOString())
            .lt('created_at', alt2.end.toISOString())
            .order('created_at', { ascending: true })
          if ((h2 || []).length > 0) {
            histRows = h2 as HistRow[]
            window = alt2
            startISO = window.start.toISOString()
            endISO = window.end.toISOString()
            selectedMode = 'cdmx-day'
          }
        }
      } else {
        // selectedMode === 'cdmx-day' → probar CDMX-day anterior
        const alt = getCDMXDayWindowFor(new Date(Date.now() - 24 * 60 * 60 * 1000))
        const { data: hPrev } = await supa
          .from('prospectos_historial')
          .select('id, created_at, prospecto_id, agente_id, usuario_email, estado_anterior, estado_nuevo, nota_agregada, notas_anteriores, notas_nuevas')
          .gte('created_at', alt.start.toISOString())
          .lt('created_at', alt.end.toISOString())
          .order('created_at', { ascending: true })
        if ((hPrev || []).length > 0) {
          histRows = hPrev as HistRow[]
          window = alt
          startISO = window.start.toISOString()
          endISO = window.end.toISOString()
        }
      }
    } catch {
      // silencioso
    }
  }

  // 2) Enriquecer datos
  const idsPros = Array.from(new Set(histRows.map(h => h.prospecto_id).filter((v): v is number => !!v)))
  const idsAg = Array.from(new Set(histRows.map(h => h.agente_id).filter((v): v is number => !!v)))
  const emailsMod = Array.from(new Set(histRows.map(h => (h.usuario_email || '').trim()).filter(e => e.length > 0)))

  const prospectosMap = new Map<number, { id: number; nombre: string | null; estado: string | null; agente_id: number | null }>()
  if (idsPros.length) {
    const { data: pros } = await supa
      .from('prospectos')
      .select('id, nombre, estado, agente_id')
      .in('id', idsPros)
    for (const p of pros || []) prospectosMap.set(p.id, p)
  }

  const agentesMap = new Map<number, { id: number; email: string | null; nombre: string | null }>()
  if (idsAg.length) {
    const { data: ags } = await supa
      .from('usuarios')
      .select('id, email, nombre')
      .in('id', idsAg)
    for (const a of ags || []) agentesMap.set(a.id, a)
  }

  const modsMap = new Map<string, { email: string | null; nombre: string | null }>()
  if (emailsMod.length) {
    const { data: mods } = await supa
      .from('usuarios')
      .select('email, nombre')
      .in('email', emailsMod)
    for (const m of mods || []) if (m.email) modsMap.set(m.email, m)
  }

  // 3) Construir HTML y XLSX
  const rangeLabel = new Intl.DateTimeFormat('es-MX', { timeZone: 'America/Mexico_City', dateStyle: 'medium' }).format(window.start)
  const title = `Reporte de cambios en prospectos — ${rangeLabel}`

  const rows = histRows.map(h => {
    const p = h.prospecto_id ? prospectosMap.get(h.prospecto_id) : undefined
    const ag = h.agente_id ? agentesMap.get(h.agente_id) : undefined
    const nombre = (p?.nombre || '—')
    const perteneceA = ag?.nombre ? `${ag.nombre} <${ag.email || ''}>` : (ag?.email || '—')
    const modInfo = h.usuario_email ? modsMap.get(h.usuario_email) : undefined
    const modLabel = modInfo?.nombre ? `${modInfo.nombre} <${modInfo.email || ''}>` : (h.usuario_email || '—')
    const de = (h.estado_anterior == null || String(h.estado_anterior).trim() === '') ? '' : String(h.estado_anterior)
    const a = h.estado_nuevo || '—'
    const notaAgregada = h.nota_agregada ? 'Sí' : ((h.notas_anteriores || '') !== (h.notas_nuevas || '') ? 'Sí' : 'No')
    return `<tr>
      <td style="padding:6px;border-bottom:1px solid #eee;white-space:nowrap">${fmtCDMX(h.created_at)}</td>
      <td style="padding:6px;border-bottom:1px solid #eee">${nombre}</td>
      <td style="padding:6px;border-bottom:1px solid #eee">${perteneceA}</td>
      <td style="padding:6px;border-bottom:1px solid #eee">${modLabel}</td>
      <td style="padding:6px;border-bottom:1px solid #eee">${de}</td>
      <td style="padding:6px;border-bottom:1px solid #eee">${a}</td>
      <td style="padding:6px;border-bottom:1px solid #eee">${notaAgregada}</td>
    </tr>`
  }).join('')

  const count = histRows.length
  const year = new Date().getFullYear()
  const LOGO_URL = process.env.MAIL_LOGO_LIGHT_URL || process.env.MAIL_LOGO_URL || 'https://via.placeholder.com/140x50?text=Lealtia'

  const html = `
  <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;border:1px solid #ddd;border-radius:8px;overflow:hidden">
    <div style="background-color:#004481;color:#fff;padding:16px;text-align:center">
      <span style="display:inline-block;background:#ffffff;padding:6px 10px;border-radius:6px;margin-bottom:8px">
        <img src="${LOGO_URL}" alt="Lealtia" style="max-height:40px;display:block;margin:auto" />
      </span>
      <h2 style="margin:0;font-size:20px;">${title}</h2>
      <div style="opacity:0.9;font-size:12px;">Ventana: ${fmtCDMX(window.start)} — ${fmtCDMX(window.end)}</div>
      <div style="opacity:0.9;font-size:12px;margin-top:4px;">Total de cambios: <strong>${count}</strong></div>
    </div>
    <div style="padding:16px;background-color:#fff;">
      <div style="overflow:auto">
        <table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;font-size:13px;width:100%">
          <thead style="background:#f3f4f6">
            <tr>
              <th>Fecha</th><th>Prospecto</th><th>Pertenece a</th><th>Usuario (modificó)</th><th>De</th><th>A</th><th>Nota agregada</th>
            </tr>
          </thead>
          <tbody>${rows || ''}</tbody>
        </table>
      </div>
      <p style="margin-top:12px;color:#6b7280;font-size:12px;">Nota: el adjunto incluye la tabla completa para Excel.</p>
    </div>
    <div style="background-color:#f4f4f4;color:#555;font-size:12px;padding:16px;text-align:center;line-height:1.4">
      <p>© ${year} Lealtia — Todos los derechos reservados</p>
      <p>Este mensaje es confidencial y para uso exclusivo del destinatario.</p>
    </div>
  </div>`

  // Generar XLSX real como adjunto
  const header = ['Fecha', 'Prospecto', 'Pertenece a', 'Usuario (modificó)', 'De', 'A', 'Nota agregada']
  const aoa: Array<Array<string>> = [header]
  for (const h of histRows) {
    const p = h.prospecto_id ? prospectosMap.get(h.prospecto_id) : undefined
    const ag = h.agente_id ? agentesMap.get(h.agente_id) : undefined
    const nombre = (p?.nombre || '')
    const perteneceA = ag?.nombre ? `${ag.nombre} <${ag.email || ''}>` : (ag?.email || '')
    const modInfo = h.usuario_email ? modsMap.get(h.usuario_email) : undefined
    const modLabel = modInfo?.nombre ? `${modInfo.nombre} <${modInfo.email || ''}>` : (h.usuario_email || '')
    const de = (h.estado_anterior == null || String(h.estado_anterior).trim() === '') ? '' : String(h.estado_anterior)
    const a = h.estado_nuevo || ''
    const notaAgregada = h.nota_agregada ? 'Sí' : ((h.notas_anteriores || '') !== (h.notas_nuevas || '') ? 'Sí' : 'No')
    const fecha = fmtCDMX(h.created_at)
    aoa.push([fecha, nombre, perteneceA, modLabel, de, a, notaAgregada])
  }
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Cambios')
  const xlsxBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
  const attachment = { filename: `reporte_prospectos_${rangeLabel.replace(/\s+/g, '_')}.xlsx`, content: xlsxBuffer, contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }

  // Destinatarios: superusuarios activos
  const { data: supers, error: supErr } = await supa
    .from('usuarios')
    .select('email, rol, activo')
    .eq('rol', 'superusuario')
    .eq('activo', true)

  if (supErr) {
    return NextResponse.json({ ok: false, error: supErr.message }, { status: 500 })
  }

  const emails = Array.from(new Set((supers || []).map(u => (u.email || '').trim()).filter(e => /.+@.+\..+/.test(e))))

  // Observabilidad
  try {
    console.log('[prospectos-daily-changes] window', { mode: selectedMode, startISO, endISO, count, first: histRows[0]?.created_at, last: histRows[histRows.length - 1]?.created_at })
  } catch {}

  if (dry) {
    return NextResponse.json({ ok: true, dry: true, sent: false, count, window: { start: startISO, end: endISO, mode: selectedMode }, recipients: emails, attachment_name: attachment.filename, sample: { first: histRows[0]?.created_at, last: histRows[histRows.length - 1]?.created_at } })
  }
  if (!emails.length) {
    return NextResponse.json({ ok: true, sent: false, reason: 'No hay superusuarios/admin activos con email válido' })
  }
  await sendMail({ to: emails.join(','), subject: title, html, attachments: [attachment] })
  return NextResponse.json({ ok: true, sent: true, count })
}
