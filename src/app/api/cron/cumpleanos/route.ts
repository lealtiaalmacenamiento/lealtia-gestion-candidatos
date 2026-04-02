// POST /api/cron/cumpleanos
// Corre diariamente a las 9:00 AM (hora México).
// Busca candidatos y clientes cuyo día y mes de fecha_nacimiento coincide con hoy
// y les envía un correo de felicitación con copia a todos los supervisores/admins.

import { NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabaseAdmin'
import { sendMail, buildCumpleanosEmail } from '@/lib/mailer'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const TZ = process.env.AGENDA_TZ || 'America/Mexico_City'

function todayMMDD(): { month: number; day: number } {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: TZ }))
  return { month: now.getMonth() + 1, day: now.getDate() }
}

export async function POST(req: Request) {
  try {
    // Validar autorización: Vercel Cron o secret
    const authHeader = req.headers.get('authorization')
    const cronSecret = process.env.REPORTES_CRON_SECRET || process.env.CRON_SECRET
    const isVercelCron = req.headers.get('x-vercel-cron')

    if (!isVercelCron && (!authHeader || authHeader !== `Bearer ${cronSecret}`)) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const url = new URL(req.url)
    const dryRun = url.searchParams.get('dry') === '1'
    // ?fecha=MM-DD permite probar con una fecha específica (solo en dry run)
    const fechaParam = url.searchParams.get('fecha') // e.g. "03-27"

    const supabase = getServiceClient()
    const { month, day } = (() => {
      if (fechaParam && /^\d{2}-\d{2}$/.test(fechaParam)) {
        const [mm, dd] = fechaParam.split('-').map(Number)
        return { month: mm, day: dd }
      }
      return todayMMDD()
    })()

    // Obtener emails de supervisores activos (excluye admin)
    const { data: supervisores } = await supabase
      .from('usuarios')
      .select('email')
      .eq('rol', 'supervisor')
      .eq('activo', true)

    const ccEmails: string[] = (supervisores || [])
      .map((u: { email: string }) => u.email)
      .filter(Boolean)

    const results: Array<{ tipo: string; nombre: string; email: string; ok: boolean; dry?: boolean; error?: string }> = []

    // ── Candidatos ────────────────────────────────────────────────────────────
    // fecha_nacimiento es tipo date (YYYY-MM-DD), filtramos por mes y día
    const { data: candidatos, error: candidatosError } = await supabase
      .from('candidatos')
      .select('id_candidato, candidato, email_agente, fecha_nacimiento')
      .eq('eliminado', false)
      .not('fecha_nacimiento', 'is', null)

    if (candidatosError) return NextResponse.json({ error: candidatosError.message }, { status: 500 })

    for (const c of (candidatos || []) as Array<{
      id_candidato: number
      candidato: string
      email_agente?: string | null
      fecha_nacimiento: string
    }>) {
      const emailDestino = c.email_agente
      if (!c.fecha_nacimiento || !emailDestino) continue
      const [, mm, dd] = c.fecha_nacimiento.split('-').map(Number)
      if (mm !== month || dd !== day) continue

      const nombre = c.candidato || emailDestino
      const { subject, html, text } = buildCumpleanosEmail({ nombre, tipo: 'candidato' })
      if (dryRun) {
        results.push({ tipo: 'candidato', nombre, email: emailDestino, ok: true, dry: true })
        continue
      }
      try {
        await sendMail({
          to: emailDestino,
          bcc: ccEmails.length ? ccEmails : undefined,
          subject,
          html,
          text,
        })
        results.push({ tipo: 'candidato', nombre, email: emailDestino, ok: true })
      } catch (e) {
        results.push({ tipo: 'candidato', nombre, email: emailDestino, ok: false, error: String(e) })
      }
    }

    // ── Clientes ──────────────────────────────────────────────────────────────
    const { data: clientes } = await supabase
      .from('clientes')
      .select('id, primer_nombre, segundo_nombre, primer_apellido, correo, fecha_nacimiento, asesor_id')
      .eq('activo', true)
      .not('fecha_nacimiento', 'is', null)
      .not('correo', 'is', null)

    // Precarga emails de asesores únicos que tienen clientes con cumpleaños hoy
    const todayClientes = (clientes || []).filter(c => {
      if (!c.fecha_nacimiento) return false
      const [, mm, dd] = (c.fecha_nacimiento as string).split('-').map(Number)
      return mm === month && dd === day
    })
    const asesorIds = [...new Set(todayClientes.map((c: { asesor_id?: string | null }) => c.asesor_id).filter(Boolean))] as string[]
    const asesorEmailMap: Record<string, string> = {}
    if (asesorIds.length > 0) {
      const { data: asesores } = await supabase
        .from('usuarios')
        .select('id, email')
        .in('id', asesorIds)
      for (const u of (asesores || []) as Array<{ id: string; email: string }>) {
        if (u.email) asesorEmailMap[u.id] = u.email
      }
    }

    for (const c of (clientes || []) as Array<{
      id: string
      primer_nombre: string
      segundo_nombre?: string | null
      primer_apellido: string
      correo: string
      fecha_nacimiento: string
      asesor_id?: string | null
    }>) {
      if (!c.fecha_nacimiento || !c.correo) continue
      const [, mm, dd] = c.fecha_nacimiento.split('-').map(Number)
      if (mm !== month || dd !== day) continue

      const nombre = [c.primer_nombre, c.segundo_nombre, c.primer_apellido].filter(Boolean).join(' ')
      const { subject, html, text } = buildCumpleanosEmail({ nombre, tipo: 'cliente' })
      // BCC: supervisores (ocultos al cliente y al asesor)
      // CC: asesor del cliente (visible)
      const asesorEmail = c.asesor_id ? (asesorEmailMap[c.asesor_id] || null) : null
      if (dryRun) {
        results.push({ tipo: 'cliente', nombre, email: c.correo, ok: true, dry: true })
        continue
      }
      try {
        await sendMail({
          to: c.correo,
          cc: asesorEmail || undefined,
          bcc: ccEmails.length ? ccEmails : undefined,
          subject,
          html,
          text,
        })
        results.push({ tipo: 'cliente', nombre, email: c.correo, ok: true })
      } catch (e) {
        results.push({ tipo: 'cliente', nombre, email: c.correo, ok: false, error: String(e) })
      }
    }

    const sent = results.filter(r => r.ok && !('dry' in r)).length
    const failed = results.filter(r => !r.ok).length
    const preview = results.filter(r => 'dry' in r).length
    console.log(`[cron/cumpleanos] ${new Date().toISOString()} — dryRun:${dryRun} enviados:${sent} preview:${preview} fallidos:${failed}`)

    return NextResponse.json({ success: true, dryRun, sent, failed, preview: dryRun ? results : undefined, results: dryRun ? undefined : results, timestamp: new Date().toISOString() })
  } catch (error) {
    console.error('[cron/cumpleanos] Error inesperado:', error)
    const message = error instanceof Error ? error.message : 'Error desconocido'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
