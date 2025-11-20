import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { getServiceClient } from '@/lib/supabaseAdmin'
import { getUsuarioSesion } from '@/lib/auth'
import type { UsuarioSesion } from '@/lib/auth'
import { sendMail } from '@/lib/mailer'
import ExcelJS from 'exceljs'
import { logAccion } from '@/lib/logger'
import { normalizeRole } from '@/lib/roles'

// Forzar runtime Node para uso de nodemailer/xlsx
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const supabase = getServiceClient()

function getTodayCDMXParts(now = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit', day: '2-digit' })
  const parts = Object.fromEntries(fmt.formatToParts(now).map(p => [p.type, p.value])) as { year: string; month: string; day: string }
  return { y: Number(parts.year), m: Number(parts.month), d: Number(parts.day) }
}

function yesterdayRangeCDMXUTC(now = new Date()) {
  // Ventana de 00:00 a 24:00 CDMX del día anterior
  const { y, m, d } = getTodayCDMXParts(now)
  const todayStartUTC = Date.UTC(y, m - 1, d, 6, 0, 0) // 00:00 CDMX == 06:00 UTC
  const start = new Date(todayStartUTC - 24*60*60*1000)
  const end = new Date(todayStartUTC)
  return { start: start.toISOString(), end: end.toISOString() }
}

function lastHoursRange(hours: number) {
  const end = new Date()
  const start = new Date(end.getTime() - Math.max(1, hours) * 60 * 60 * 1000)
  return { start: start.toISOString(), end: end.toISOString() }
}

function isCronAuthorized(req: Request): boolean {
  const secretEnv = (process.env.REPORTES_CRON_SECRET || '').trim()
  const allowVercelHeader = (process.env.ALLOW_VERCEL_CRON_WITH_HEADER || '').trim() === '1'
  if (!secretEnv) return true
  const url = new URL(req.url)
  const hKey = req.headers.get('x-cron-key') || req.headers.get('x-cron-secret') || ''
  if (hKey && hKey === secretEnv) return true
  const q = url.searchParams.get('secret') || ''
  if (q && q === secretEnv) return true
  const auth = req.headers.get('authorization') || ''
  if (auth.toLowerCase().startsWith('bearer ') && auth.slice(7).trim() === secretEnv) return true
  if (allowVercelHeader && !!req.headers.get('x-vercel-cron')) return true
  return false
}

export async function POST(req: Request) {
  let usuarioEmail: string | null = null
  const url = new URL(req.url)
  const debug = url.searchParams.get('debug') === '1'
  // Si hay autorización por secret/header/bearer/vercel-cron, permitimos sin sesión; de lo contrario validamos sesión
  if (!isCronAuthorized(req)) {
    let usuario = await getUsuarioSesion(req.headers)
    if (!usuario) {
      // Fallback robusto: leer usuario de Auth vía SSR cookies y cruzar contra tabla usuarios por id_auth/email
      try {
        const cookieStore = await cookies()
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
        const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
        const supa = createServerClient(supabaseUrl, supabaseKey, {
          cookies: {
            get(name: string) { return cookieStore.get(name)?.value },
            set(name: string, value: string, options: CookieOptions) { cookieStore.set({ name, value, ...options }) },
            remove(name: string, options: CookieOptions) { cookieStore.set({ name, value: '', ...options }) }
          }
        })
        const { data: { user } } = await supa.auth.getUser()
        if (user?.email) {
          // buscar por id_auth o email con admin (sin RLS)
          const admin = getServiceClient()
          const byId = user.id ? await admin.from('usuarios').select('id,email,rol,activo').eq('id_auth', user.id).maybeSingle() : { data: null }
          const row = byId.data ?? (await admin.from('usuarios').select('id,email,rol,activo,nombre').eq('email', user.email).maybeSingle()).data
          if (row) {
            usuario = row as UsuarioSesion
          }
        }
      } catch {}
    }
    if (!usuario) {
      const cookieNames = debug ? (await cookies()).getAll().map(c => c.name) : undefined
      return NextResponse.json({ error: 'No autenticado', cookieNames }, { status: 401 })
    }
    const normalizedRole = normalizeRole(usuario.rol)
    if (!(normalizedRole === 'admin' || normalizedRole === 'supervisor')) {
      const info = debug ? { rol: usuario.rol, email: usuario.email } : undefined
      return NextResponse.json({ error: 'No autorizado', info }, { status: 403 })
    }
    usuarioEmail = usuario.email
  } else {
    usuarioEmail = 'cron'
  }
  const mode = url.searchParams.get('mode') || ''
  const startQ = url.searchParams.get('start')
  const endQ = url.searchParams.get('end')
  const hoursQ = url.searchParams.get('hours')
  const modeAll = url.searchParams.get('mode') === 'all'
  const dry = url.searchParams.get('dry') === '1'
  const skipIfEmpty = url.searchParams.get('skipIfEmpty') === '1'
  let range: { start: string; end: string }
  if (startQ && endQ) {
    range = { start: new Date(startQ).toISOString(), end: new Date(endQ).toISOString() }
  } else if (mode === 'last24h' || (!!hoursQ && Number(hoursQ) > 0)) {
    range = lastHoursRange(hoursQ ? Number(hoursQ) : 24)
  } else {
    range = yesterdayRangeCDMXUTC()
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

  // Obtener supervisores
  const { data: superusers, error: suErr } = await supabase
    .from('usuarios')
    .select('email, rol')
    .in('rol', ['supervisor', 'admin'])
    .eq('activo', true)
  if (suErr) return NextResponse.json({ error: suErr.message }, { status: 500 })
  const recipients = (superusers||[])
    .filter(u => normalizeRole(u.rol) === 'supervisor')
    .map(u => u.email)
    .filter((email): email is string => Boolean(email))
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
  try { console.log('[prospectos-dia] window', meta) } catch {}
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

  if (dry) {
    const would_send = (recipients.length > 0) && (!skipIfEmpty || (historial||[]).length > 0)
    return NextResponse.json({ success: true, dry: true, would_send, meta, sample: (historial||[]).slice(0, 10) })
  }
  if (skipIfEmpty && (historial||[]).length === 0) {
    return NextResponse.json({ success: true, sent: 0, detalle: 'skipIfEmpty: no hay eventos en el rango' })
  }
  // Generar adjunto XLSX con las mismas columnas mostradas en el correo usando ExcelJS
  const workbook = new ExcelJS.Workbook()
  const cambiosSheet = workbook.addWorksheet('Cambios')
  cambiosSheet.columns = [
    { header: 'Fecha', key: 'fecha', width: 22 },
    { header: 'Prospecto', key: 'prospecto', width: 30 },
    { header: 'Pertenece a', key: 'pertenece', width: 32 },
    { header: 'Usuario (modificó)', key: 'usuario', width: 32 },
    { header: 'De', key: 'de', width: 14 },
    { header: 'A', key: 'a', width: 14 },
    { header: 'Nota agregada', key: 'nota', width: 16 }
  ]
  for (const h of (historial || [])) {
    const pInfo = mapPros[h.prospecto_id as number]
    const pName = (pInfo?.nombre || '').toString()
    const owner = mapUsers[h.agente_id as number]
    const ownerLabel = owner?.nombre ? `${owner.nombre} <${owner.email || ''}>` : (owner?.email || '')
    const modInfo = h.usuario_email ? mapEmails[h.usuario_email] : undefined
    const modLabel = modInfo?.nombre ? `${modInfo.nombre} <${modInfo.email || ''}>` : (h.usuario_email || '')
    const fecha = new Date(h.created_at).toLocaleString('es-MX', { hour12: false })
    const de = h.estado_anterior || ''
    const a = h.estado_nuevo || ''
    const nota = h.nota_agregada ? 'Sí' : 'No'
    cambiosSheet.addRow({ fecha, prospecto: pName, pertenece: ownerLabel, usuario: modLabel, de, a, nota })
  }
  if (cambiosSheet.rowCount > 0) {
    cambiosSheet.getRow(1).font = { bold: true }
  }

  // Agregar segunda hoja: última conexión de cada usuario (vía Auth last_sign_in_at)
  type UsuarioRow = { email: string; nombre?: string | null }
  const { data: usersTable } = await supabase.from('usuarios').select('email,nombre')
  // Cargar todos los usuarios de Auth con paginación
  const authMap = new Map<string, string | null>() // email(lower) -> last_sign_in_at ISO
  try {
    const perPage = 1000
    for (let page = 1; page <= 100; page++) {
      const { data: authData, error: authErr } = await supabase.auth.admin.listUsers({ page, perPage })
      if (authErr) break
      const list = (authData?.users || []) as Array<{ email: string | null; last_sign_in_at: string | null }>
      for (const u of list) {
        if (u.email) authMap.set(u.email.toLowerCase(), u.last_sign_in_at)
      }
      if (!list || list.length < perPage) break
    }
  } catch {
    // Si falla (falta service role), generamos adjunto vacío para no romper el flujo
  }
  const usuariosSheet = workbook.addWorksheet('Usuarios - Última conexión')
  usuariosSheet.columns = [
    { header: 'Email', key: 'email', width: 34 },
    { header: 'Nombre', key: 'nombre', width: 28 },
    { header: 'Última conexión (CDMX)', key: 'ultimaConexion', width: 30 }
  ]
  let usersRowsHtml = ''
  if (usersTable) {
    for (const u of usersTable as UsuarioRow[]) {
      const key = (u.email || '').toLowerCase()
      const raw = authMap.get(key)
      let display = ''
      if (raw) display = new Date(raw).toLocaleString('es-MX', { timeZone: 'America/Mexico_City', hour12: false })
      usuariosSheet.addRow({ email: u.email, nombre: u.nombre || '', ultimaConexion: display })
      usersRowsHtml += `<tr>
        <td>${u.email}</td>
        <td>${u.nombre || ''}</td>
        <td>${display}</td>
      </tr>`
    }
  }
  if (usuariosSheet.rowCount > 0) {
    usuariosSheet.getRow(1).font = { bold: true }
  }
  // Construir HTML final con sección de cambios y sección de última conexión
  const html = `
  <div style="font-family:Arial,sans-serif;max-width:700px;margin:auto;border:1px solid #ddd;border-radius:8px;overflow:hidden">
    <div style="background-color:#004481;color:#fff;padding:16px;text-align:center">
      <span style="display:inline-block;background:#ffffff;padding:6px 10px;border-radius:6px;margin-bottom:8px">
        <img src="${LOGO_URL}" alt="Lealtia" style="max-height:40px;display:block;margin:auto" />
      </span>
      <h2 style="margin:0;font-size:20px;">${title}</h2>
      <div style="opacity:0.9;font-size:12px;">${dateLabel}</div>
    </div>
    <div style="padding:24px;background-color:#fff;">
      <h3 style="margin:0 0 8px 0;font-size:16px;">Cambios en prospectos</h3>
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

      <h3 style="margin:24px 0 8px 0;font-size:16px;">Usuarios — Última conexión (CDMX)</h3>
      <div style="overflow:auto">
        <table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;font-size:13px;width:100%">
          <thead style="background:#f3f4f6">
            <tr>
              <th>Email</th><th>Nombre</th><th>Última conexión (CDMX)</th>
            </tr>
          </thead>
          <tbody>${usersRowsHtml}</tbody>
        </table>
      </div>
    </div>
    <div style="background-color:#f4f4f4;color:#555;font-size:12px;padding:16px;text-align:center;line-height:1.4">
      <p>© ${year} Lealtia — Todos los derechos reservados</p>
      <p>Este mensaje es confidencial y para uso exclusivo del destinatario.</p>
    </div>
  </div>`
  // Escribir el workbook final con ambas hojas (Cambios y UltimaConexion)
  const xlsxArrayBuffer = await workbook.xlsx.writeBuffer()
  const xlsxBuffer = Buffer.isBuffer(xlsxArrayBuffer) ? xlsxArrayBuffer : Buffer.from(xlsxArrayBuffer)
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