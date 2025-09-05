import { NextResponse } from 'next/server'
import { ensureAdminClient } from '@/lib/supabaseAdmin'
import { sendMail } from '@/lib/mailer'
import * as XLSX from 'xlsx'

function getTodayCDMXParts(now = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit', day: '2-digit' })
  const parts = Object.fromEntries(fmt.formatToParts(now).map(p => [p.type, p.value])) as { year: string; month: string; day: string }
  return { y: Number(parts.year), m: Number(parts.month), d: Number(parts.day) }
}

function getDailyWindowUTC(now = new Date()) {
  // 00:00 CDMX == 06:00 UTC (sin DST en CDMX)
  const { y, m, d } = getTodayCDMXParts(now)
  const todayUTC = Date.UTC(y, m - 1, d, 6, 0, 0)
  const yesterdayUTC = todayUTC - 24 * 60 * 60 * 1000
  return { start: new Date(yesterdayUTC), end: new Date(todayUTC) }
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
  const window = (!startQ || !endQ)
    ? getDailyWindowUTC(new Date())
    : { start: new Date(startQ), end: new Date(endQ) }
  const startISO = window.start.toISOString()
  const endISO = window.end.toISOString()

  // 1) Cambios de historial del último día CDMX
  const { data: historial, error: histErr } = await supa
    .from('prospectos_historial')
    .select('id, created_at, prospecto_id, agente_id, usuario_email, estado_anterior, estado_nuevo, nota_agregada, notas_anteriores, notas_nuevas')
    .gte('created_at', startISO)
    .lt('created_at', endISO)
    .order('created_at', { ascending: true })

  if (histErr) {
    return NextResponse.json({ ok: false, error: histErr.message }, { status: 500 })
  }

  const idsPros = Array.from(new Set((historial || []).map(h => h.prospecto_id).filter(Boolean))) as number[]
  const idsAg = Array.from(new Set((historial || []).map(h => h.agente_id).filter(Boolean))) as number[]

  // 2) Datos de prospectos
  const prospectosMap = new Map<number, { id: number; nombre: string | null; estado: string | null; agente_id: number | null }>()
  if (idsPros.length) {
    const { data: pros } = await supa
      .from('prospectos')
      .select('id, nombre, estado, agente_id')
      .in('id', idsPros)
    for (const p of pros || []) prospectosMap.set(p.id, p)
  }

  // 3) Emails de agentes
  const agentesMap = new Map<number, { id: number; email: string | null; nombre: string | null }>()
  if (idsAg.length) {
    const { data: ags } = await supa
      .from('usuarios')
      .select('id, email, nombre')
      .in('id', idsAg)
    for (const a of ags || []) agentesMap.set(a.id, a)
  }

  // 4) Construir HTML
  // label basado en fecha de inicio de la ventana en CDMX
  const rangeLabel = new Intl.DateTimeFormat('es-MX', { timeZone: 'America/Mexico_City', dateStyle: 'medium' }).format(window.start)
  const title = `Reporte de cambios en prospectos — ${rangeLabel}`

  const rows = (historial || []).map(h => {
    const p = h.prospecto_id ? prospectosMap.get(h.prospecto_id) : undefined
    const ag = h.agente_id ? agentesMap.get(h.agente_id) : undefined
    const nombre = (p?.nombre || '—')
    const agente = (ag?.nombre || ag?.email || '—')
    const estado = (h.estado_anterior == null || String(h.estado_anterior).trim()==='')
      ? `Creación (→ ${h.estado_nuevo || '—'})`
      : `${h.estado_anterior} → ${h.estado_nuevo || '—'}`
    const notas = h.nota_agregada ? 'Actualizó notas' : ''
    return `<tr>
      <td style="padding:6px;border-bottom:1px solid #eee;white-space:nowrap">${fmtCDMX(h.created_at)}</td>
      <td style="padding:6px;border-bottom:1px solid #eee">${nombre}</td>
      <td style="padding:6px;border-bottom:1px solid #eee">${agente}</td>
      <td style="padding:6px;border-bottom:1px solid #eee">${estado}</td>
      <td style="padding:6px;border-bottom:1px solid #eee">${notas}</td>
    </tr>`
  }).join('')

  const count = historial?.length || 0
  const html = `
  <div style="font-family:Arial,sans-serif;max-width:800px;margin:auto">
    <h2 style="margin:0 0 12px;color:#004481">${title}</h2>
    <p style="margin:0 0 12px;color:#333">Ventana: ${fmtCDMX(window.start)} — ${fmtCDMX(window.end)}</p>
    <p style="margin:0 0 12px">Total de cambios: <strong>${count}</strong></p>
    <table style="width:100%;border-collapse:collapse;font-size:14px">
      <thead>
        <tr style="background:#f5f7fa">
          <th style="text-align:left;padding:8px;border-bottom:1px solid #ddd">Fecha (CDMX)</th>
          <th style="text-align:left;padding:8px;border-bottom:1px solid #ddd">Prospecto</th>
          <th style="text-align:left;padding:8px;border-bottom:1px solid #ddd">Agente</th>
          <th style="text-align:left;padding:8px;border-bottom:1px solid #ddd">Cambio de estado</th>
          <th style="text-align:left;padding:8px;border-bottom:1px solid #ddd">Notas</th>
        </tr>
      </thead>
      <tbody>${rows || '<tr><td colspan="5" style="padding:10px;color:#777">Sin cambios registrados en la ventana.</td></tr>'}</tbody>
    </table>
  </div>`
  // Generar XLSX real como adjunto
  const header = ['Fecha (CDMX)','Prospecto','Agente','Cambio de estado','Notas']
  const aoa = [header]
  for (const h of (historial||[])) {
    const p = h.prospecto_id ? prospectosMap.get(h.prospecto_id) : undefined
    const ag = h.agente_id ? agentesMap.get(h.agente_id) : undefined
    const nombre = (p?.nombre || '')
    const agente = (ag?.nombre || ag?.email || '')
    const estado = (h.estado_anterior == null || String(h.estado_anterior).trim()==='')
      ? `Creación (-> ${h.estado_nuevo || ''})`
      : `${h.estado_anterior || ''} -> ${h.estado_nuevo || ''}`
    const notas = h.nota_agregada ? 'Actualizó notas' : ''
    const fecha = fmtCDMX(h.created_at)
    aoa.push([fecha, nombre, agente, estado, notas])
  }
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Cambios')
  const xlsxBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
  const attachment = { filename: `reporte_prospectos_${rangeLabel.replace(/\s+/g,'_')}.xlsx`, content: xlsxBuffer, contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }
  
  // Enviar SOLO a superusuarios/admin activos
  const { data: supers, error: supErr } = await supa
    .from('usuarios')
    .select('email, rol, activo')
    .eq('rol', 'superusuario')
    .eq('activo', true)

  if (supErr) {
    return NextResponse.json({ ok: false, error: supErr.message }, { status: 500 })
  }

  const emails = Array.from(new Set((supers || []).map(u => (u.email || '').trim()).filter(e => /.+@.+\..+/.test(e))))
  if (dry) {
    return NextResponse.json({ ok: true, dry: true, sent: false, count, window: { start: startISO, end: endISO }, recipients: emails, attachment_name: attachment.filename })
  }
  if (!emails.length) {
    return NextResponse.json({ ok: true, sent: false, reason: 'No hay superusuarios/admin activos con email válido' })
  }
  await sendMail({ to: emails.join(','), subject: title, html, attachments: [attachment] })
  return NextResponse.json({ ok: true, sent: true, count })
}
