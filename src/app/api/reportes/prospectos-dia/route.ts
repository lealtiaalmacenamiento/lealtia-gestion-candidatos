import { NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabaseAdmin'
import { getUsuarioSesion } from '@/lib/auth'
import { sendMail } from '@/lib/mailer'
import { logAccion } from '@/lib/logger'

const supabase = getServiceClient()

function yesterdayRangeUTC() {
  const now = new Date()
  // Calcular día de ayer en zona MX (UTC-6 aprox). Para simplificar: usar UTC día anterior
  const y = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const start = new Date(y.getTime() - 24*60*60*1000)
  const end = y
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
  const { start, end } = yesterdayRangeUTC()
  const { data: historial, error } = await supabase
    .from('prospectos_historial')
    .select('created_at, prospecto_id, agente_id, usuario_email, estado_anterior, estado_nuevo, nota_agregada, notas_anteriores, notas_nuevas')
    .gte('created_at', start)
    .lt('created_at', end)
    .order('created_at', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Obtener superusuarios
  const { data: superusers, error: suErr } = await supabase
    .from('usuarios')
    .select('email')
    .in('rol', ['superusuario','admin'])
    .eq('activo', true)
  if (suErr) return NextResponse.json({ error: suErr.message }, { status: 500 })
  const recipients = (superusers||[]).map(u => u.email).filter(Boolean)
  if (recipients.length === 0) {
    return NextResponse.json({ success: true, sent: 0, detalle: 'no recipients' })
  }

  const title = 'Reporte diario de cambios en Prospectos'
  const dateLabel = new Date(start).toISOString().slice(0,10)
  const rows = (historial||[]).map(h => `
    <tr>
      <td>${new Date(h.created_at).toLocaleString('es-MX',{ hour12:false })}</td>
      <td>#${h.prospecto_id}</td>
      <td>${h.usuario_email||''}</td>
      <td>${h.estado_anterior||''}</td>
      <td>${h.estado_nuevo||''}</td>
      <td>${h.nota_agregada ? 'Sí' : 'No'}</td>
    </tr>`).join('')
  const html = `
    <div style="font-family:Arial,sans-serif">
      <h2>${title} — ${dateLabel}</h2>
      <p>Total de eventos: <strong>${(historial||[]).length}</strong></p>
      <table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;font-size:13px">
        <thead style="background:#f3f4f6">
          <tr>
            <th>Fecha</th><th>Prospecto</th><th>Usuario</th><th>De</th><th>A</th><th>Nota agregada</th>
          </tr>
        </thead>
        <tbody>${rows||''}</tbody>
      </table>
      <p style="margin-top:12px;color:#6b7280">Nota: contenido de notas no se incluye por privacidad. Consulte la plataforma para detalles.</p>
    </div>`

  // Enviar a todos en un solo correo (BCC sería ideal; aquí simple to: join)
  try {
    await sendMail({ to: recipients.join(','), subject: `${title} — ${dateLabel}`, html })
    await logAccion('reporte_prospectos_diario_enviado', { usuario: usuarioEmail, tabla_afectada: 'prospectos_historial', snapshot: { start, end, recipients: recipients.length } })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Mailer error' }, { status: 500 })
  }
  return NextResponse.json({ success: true, sent: recipients.length, eventos: (historial||[]).length })
}