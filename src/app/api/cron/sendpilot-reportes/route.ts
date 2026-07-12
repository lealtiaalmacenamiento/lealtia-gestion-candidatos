import { NextResponse } from 'next/server'
import { ensureAdminClient } from '@/lib/supabaseAdmin'
import { sendMail } from '@/lib/mailer'
import { buildSendPilotCampaignReport } from '@/lib/sendpilotCampaignReport'
import { buildSendPilotReportEmail } from '@/lib/sendpilotReportEmail'
import { logAccion } from '@/lib/logger'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

interface ScheduledReportConfig {
  id: string
  nombre: string
  campana_id: string
  destinatarios: string[]
  frecuencia_dias: number
  activo: boolean
  ultimo_envio_at: string | null
  proximo_envio_at: string | null
}

function addDays(date: Date, days: number): string {
  const next = new Date(date)
  next.setUTCDate(next.getUTCDate() + days)
  return next.toISOString()
}

function isDue(config: ScheduledReportConfig, now: Date): boolean {
  if (!config.activo) return false
  if (!config.ultimo_envio_at) return true
  if (!config.proximo_envio_at) return true
  const dueAt = new Date(config.proximo_envio_at).getTime()
  return Number.isFinite(dueAt) && dueAt <= now.getTime()
}

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get('authorization')
    const cronSecret = process.env.REPORTES_CRON_SECRET || process.env.CRON_SECRET
    const isVercelCron = req.headers.get('x-vercel-cron')

    if (!isVercelCron && (!authHeader || authHeader !== `Bearer ${cronSecret}`)) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const url = new URL(req.url)
    const dryRun = url.searchParams.get('dry') === '1'
    const onlyId = url.searchParams.get('id')
    const now = new Date()
    const supabase = ensureAdminClient()

    let query = supabase
      .from('sp_reportes_programados')
      .select('id,nombre,campana_id,destinatarios,frecuencia_dias,activo,ultimo_envio_at,proximo_envio_at')
      .eq('activo', true)

    if (onlyId) query = query.eq('id', onlyId)

    const { data, error } = await query.order('created_at', { ascending: true })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const configs = ((data || []) as ScheduledReportConfig[])
      .filter(config => onlyId ? true : isDue(config, now))

    const results: Array<{
      id: string
      nombre: string
      ok: boolean
      dryRun?: boolean
      sentTo?: number
      rows?: number
      filename?: string
      nextRun?: string
      error?: string
    }> = []

    for (const config of configs) {
      try {
        const recipients = (config.destinatarios || []).filter(Boolean)
        if (!recipients.length) throw new Error('Sin destinatarios configurados')

        const report = await buildSendPilotCampaignReport(supabase, config.campana_id)
        const email = buildSendPilotReportEmail(report)
        const attachment = {
          filename: report.filename,
          content: Buffer.from(`\uFEFF${report.csv}`, 'utf8'),
          contentType: 'text/csv; charset=utf-8',
        }
        const nextRun = addDays(now, config.frecuencia_dias)

        if (!dryRun) {
          await sendMail({
            to: recipients.join(','),
            subject: email.subject,
            html: email.html,
            text: email.text,
            attachments: [attachment],
          })

          await supabase
            .from('sp_reportes_programados')
            .update({
              ultimo_envio_at: now.toISOString(),
              proximo_envio_at: nextRun,
              updated_at: now.toISOString(),
              ultimo_resultado: {
                ok: true,
                sent_to: recipients.length,
                filename: report.filename,
                rows: report.summary.totalRows,
                campaign_id: report.campana.id,
                sendpilot_campaign_id: report.campana.sendpilot_campaign_id,
                generated_at: report.generatedAt,
                summary: report.summary,
              },
            })
            .eq('id', config.id)

          await logAccion('sp_reporte_programado_enviado', {
            tabla_afectada: 'sp_reportes_programados',
            snapshot: {
              id: config.id,
              campana_id: config.campana_id,
              recipients: recipients.length,
              rows: report.summary.totalRows,
              filename: report.filename,
            },
          })
        }

        results.push({
          id: config.id,
          nombre: config.nombre,
          ok: true,
          dryRun,
          sentTo: recipients.length,
          rows: report.summary.totalRows,
          filename: report.filename,
          nextRun,
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        results.push({ id: config.id, nombre: config.nombre, ok: false, error: message })
        if (!dryRun) {
          await supabase
            .from('sp_reportes_programados')
            .update({
              updated_at: now.toISOString(),
              ultimo_resultado: {
                ok: false,
                error: message,
                attempted_at: now.toISOString(),
              },
            })
            .eq('id', config.id)
        }
      }
    }

    const sent = results.filter(result => result.ok && !result.dryRun).length
    const preview = results.filter(result => result.ok && result.dryRun).length
    const failed = results.filter(result => !result.ok).length

    return NextResponse.json({
      success: failed === 0,
      dryRun,
      checked: (data || []).length,
      due: configs.length,
      sent,
      preview,
      failed,
      results,
      timestamp: now.toISOString(),
    }, { status: failed > 0 ? 207 : 200 })
  } catch (error) {
    console.error('[cron/sendpilot-reportes] Error inesperado:', error)
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Error desconocido',
    }, { status: 500 })
  }
}

