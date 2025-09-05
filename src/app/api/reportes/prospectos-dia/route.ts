import { NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabaseAdmin'
import { getUsuarioSesion } from '@/lib/auth'
import { sendMail } from '@/lib/mailer'
import * as XLSX from 'xlsx'
import { logAccion } from '@/lib/logger'

// Forzar runtime Node para uso de nodemailer/xlsx
export const runtime = 'nodejs'

const supabase = getServiceClient()

function yesterdayRangeUTC() {
  const now = new Date()
  const y = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const start = new Date(y.getTime() - 24*60*60*1000)
  const end = y
  return { start: start.toISOString(), end: end.toISOString() }
}

function lastHoursRange(hours: number) {
  const end = new Date()
  const start = new Date(end.getTime() - Math.max(1, hours) * 60 * 60 * 1000)
  return { start: start.toISOString(), end: end.toISOString() }
}

export async function POST(req: Request) {
  const secretHeader = req.headers.get('x-cron-key') || ''
  const secretEnv = process.env.REPORTES_CRON_SECRET || ''
  let usuarioEmail: string | null = null
  // Si hay secret válido, permitimos ejecución sin sesión; si no, validamos sesión admin/superusuario
  if (!secretEnv || secretHeader !== secretEnv) {
    const usuario = await getUsuarioSesion()
    if (!usuario) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    if (!(usuario.rol === 'admin' || usuario.rol === 'superusuario')) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
    }
    usuarioEmail = usuario.email
  } else {
    usuarioEmail = 'cron'
  }
  const url = new URL(req.url)
  const mode = url.searchParams.get('mode') || ''
  const startQ = url.searchParams.get('start')
  const endQ = url.searchParams.get('end')
  const hoursQ = url.searchParams.get('hours')
  const modeAll = url.searchParams.get('mode') === 'all'
  const dry = url.searchParams.get('dry') === '1'
  let range: { start: string; end: string }
  if (startQ && endQ) {
    range = { start: new Date(startQ).toISOString(), end: new Date(endQ).toISOString() }
  } else if (mode === 'last24h' || (!!hoursQ && Number(hoursQ) > 0)) {
    range = lastHoursRange(hoursQ ? Number(hoursQ) : 24)
  } else {
    range = yesterdayRangeUTC()
  }
  const { start, end } = range
  let q = supabase
    .from('prospectos_historial')
    .select('created_at, prospecto_id, agente_id, usuario_email, estado_anterior, estado_nuevo, nota_agregada, notas_anteriores, notas_nuevas')
  if (!modeAll) {
    q = q.gte('created_at', start).lt('created_at', end)
  }
  const { data: historial, error } = await q.order('created_at', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Enriquecer con nombre de prospecto y agente dueño (desde usuarios)
  const idsPros = Array.from(new Set((historial||[]).map(h => h.prospecto_id).filter(Boolean))) as number[]
  const idsAgts = Array.from(new Set((historial||[]).map(h => h.agente_id).filter(Boolean))) as number[]
  const emailsMod = Array.from(new Set((historial||[]).map(h => (h.usuario_email||'').trim()).filter(e => e.length>0))) as string[]
  let mapPros: Record<number, { nombre?: string }> = {}
  let mapUsers: Record<number, { email?: string; nombre?: string }> = {}
  let mapEmails: Record<string, { email?: string; nombre?: string }> = {}
  if (idsPros.length > 0) {
    const { data: prosData } = await supabase.from('prospectos').select('id,nombre').in('id', idsPros)
    if (prosData) {
      type RowP = { id: number; nombre?: string | null }
      mapPros = (prosData as RowP[]).reduce((acc, p) => { acc[p.id] = { nombre: p.nombre ?? undefined }; return acc }, {} as Record<number, { nombre?: string }>)
    }
  }
  if (idsAgts.length > 0) {
    const { data: usersData } = await supabase.from('usuarios').select('id,email,nombre').in('id', idsAgts)
    if (usersData) {
      type RowU = { id: number; email?: string | null; nombre?: string | null }
      mapUsers = (usersData as RowU[]).reduce((acc, u) => { acc[u.id] = { email: u.email ?? undefined, nombre: u.nombre ?? undefined }; return acc }, {} as Record<number, { email?: string; nombre?: string }>)
    }
  }
  if (emailsMod.length > 0) {
    const { data: modsData } = await supabase.from('usuarios').select('email,nombre').in('email', emailsMod)
    if (modsData) {
      type RowM = { email: string | null; nombre?: string | null }
      mapEmails = (modsData as RowM[]).reduce((acc, m) => { const key = (m.email||'').trim(); if(key){ acc[key] = { email: key, nombre: m.nombre ?? undefined } } return acc }, {} as Record<string, { email?: string; nombre?: string }>)
    }
  }

  // Obtener superusuarios
  const { data: superusers, error: suErr } = await supabase
    .from('usuarios')
    .select('email')
    .eq('rol', 'superusuario')
    .eq('activo', true)
  if (suErr) return NextResponse.json({ error: suErr.message }, { status: 500 })
  const recipients = (superusers||[]).map(u => u.email).filter(Boolean)
  if (recipients.length === 0) {
    return NextResponse.json({ success: true, sent: 0, detalle: 'no recipients' })
  }

  const title = 'Reporte de cambios en Prospectos'
  const dateLabel = modeAll ? 'Todo' : new Date(start).toISOString().slice(0,10)
  const meta = {
    start,
    end,
    mode: modeAll ? 'all' : (hoursQ ? `last${hoursQ}h` : (mode || 'yesterdayUTC')),
    count: (historial||[]).length,
    min: (historial && historial[0]?.created_at) || null,
    max: (historial && historial[historial.length-1]?.created_at) || null
  }
  const rows = (historial||[]).map(h => {
  const pInfo = mapPros[h.prospecto_id as number]
  const pName = (pInfo?.nombre || '').toString()
    const owner = mapUsers[h.agente_id as number]
    const ownerLabel = owner?.nombre ? `${owner.nombre} <${owner.email||''}>` : (owner?.email || '')
    const modInfo = h.usuario_email ? mapEmails[h.usuario_email] : undefined
    const modLabel = modInfo?.nombre ? `${modInfo.nombre} <${modInfo.email||''}>` : (h.usuario_email||'')
    return `
    <tr>
      <td>${new Date(h.created_at).toLocaleString('es-MX',{ hour12:false })}</td>
      <td>${pName}</td>
      <td>${ownerLabel}</td>
      <td>${modLabel}</td>
      <td>${h.estado_anterior||''}</td>
      <td>${h.estado_nuevo||''}</td>
      <td>${h.nota_agregada ? 'Sí' : 'No'}</td>
    </tr>`
  }).join('')
  const year = new Date().getFullYear()
  const LOGO_URL = process.env.MAIL_LOGO_LIGHT_URL || process.env.MAIL_LOGO_URL || 'https://via.placeholder.com/140x50?text=Lealtia'
  const html = `
  <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;border:1px solid #ddd;border-radius:8px;overflow:hidden">
    <div style="background-color:#004481;color:#fff;padding:16px;text-align:center">
      <span style="display:inline-block;background:#ffffff;padding:6px 10px;border-radius:6px;margin-bottom:8px">
        <img src="${LOGO_URL}" alt="Lealtia" style="max-height:40px;display:block;margin:auto" />
      </span>
      <h2 style="margin:0;font-size:20px;">${title}</h2>
      <div style="opacity:0.9;font-size:12px;">${dateLabel}</div>
    </div>
    <div style="padding:24px;background-color:#fff;">
      <p>Total de eventos: <strong>${(historial||[]).length}</strong></p>
      <div style="overflow:auto">
        <table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;font-size:13px;width:100%">
          <thead style="background:#f3f4f6">
            <tr>
              <th>Fecha</th><th>Prospecto</th><th>Pertenece a</th><th>Usuario (modificó)</th><th>De</th><th>A</th><th>Nota agregada</th>
            </tr>
          </thead>
          <tbody>${rows||''}</tbody>
        </table>
      </div>
      <p style="margin-top:12px;color:#6b7280">Nota: contenido de notas no se incluye por privacidad. Consulte la plataforma para detalles.</p>
    </div>
    <div style="background-color:#f4f4f4;color:#555;font-size:12px;padding:16px;text-align:center;line-height:1.4">
      <p>© ${year} Lealtia — Todos los derechos reservados</p>
      <p>Este mensaje es confidencial y para uso exclusivo del destinatario.</p>
    </div>
  </div>`

  if (dry) {
    return NextResponse.json({ success: true, dry: true, meta, sample: (historial||[]).slice(0, 10) })
  }
  // Generar adjunto XLSX con las mismas columnas mostradas en el correo
  const aoa: Array<Array<string>> = []
  aoa.push(['Fecha','Prospecto','Pertenece a','Usuario (modificó)','De','A','Nota agregada'])
  for (const h of (historial || [])) {
    const pInfo = mapPros[h.prospecto_id as number]
    const pName = (pInfo?.nombre || '').toString()
    const owner = mapUsers[h.agente_id as number]
    const ownerLabel = owner?.nombre ? `${owner.nombre} <${owner.email||''}>` : (owner?.email || '')
    const modInfo = h.usuario_email ? mapEmails[h.usuario_email] : undefined
    const modLabel = modInfo?.nombre ? `${modInfo.nombre} <${modInfo.email||''}>` : (h.usuario_email||'')
    const fecha = new Date(h.created_at).toLocaleString('es-MX', { hour12: false })
    const de = h.estado_anterior || ''
    const a = h.estado_nuevo || ''
    const nota = h.nota_agregada ? 'Sí' : 'No'
    aoa.push([fecha, pName, ownerLabel, modLabel, de, a, nota])
  }
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Cambios')
  const xlsxBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
  const attachment = { filename: `reporte_prospectos_${dateLabel}.xlsx`, content: xlsxBuffer, contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }

  // Enviar a todos en un solo correo (BCC sería ideal; aquí simple to: join)
  try {
    await sendMail({ to: recipients.join(','), subject: `${title} — ${dateLabel}`, html, attachments: [attachment] })
    await logAccion('reporte_prospectos_diario_enviado', { usuario: usuarioEmail, tabla_afectada: 'prospectos_historial', snapshot: { ...meta, recipients: recipients.length } })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Mailer error' }, { status: 500 })
  }
  return NextResponse.json({ success: true, sent: recipients.length, eventos: (historial||[]).length, meta })
}