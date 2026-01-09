import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { sendMail } from '@/lib/mailer'
import { logAccion } from '@/lib/logger'
import { getServiceClient } from '@/lib/supabaseAdmin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function getSupa() {
  const cookieStore = await cookies()
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  return createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      get(name: string) { return cookieStore.get(name)?.value },
      set(name: string, value: string, options: CookieOptions) { cookieStore.set({ name, value, ...options }) },
      remove(name: string, options: CookieOptions) { cookieStore.set({ name, value: '', ...options }) }
    }
  })
}

export async function POST(req: Request) {
  const supa = await getSupa()
  const { data: auth } = await supa.auth.getUser()
  if (!auth?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const body = await req.json().catch(() => null) as { request_id?: string, debug?: boolean }
  if (!body?.request_id) return NextResponse.json({ error: 'Falta request_id' }, { status: 400 })

  // Debug logs (se activan si body.debug=true o NODE_ENV=development)
  const debugOn = body.debug || process.env.NODE_ENV === 'development'
  if (debugOn) {
    // Info de usuario y payload previo a la llamada RPC
    console.debug('[apply_poliza_update][debug] user.id', auth.user.id)
    console.debug('[apply_poliza_update][debug] request_id', body.request_id)
    try {
      const { data: usuarioRow } = await supa.from('usuarios').select('id,id_auth,rol,activo').eq('id_auth', auth.user.id).maybeSingle()
      console.debug('[apply_poliza_update][debug] usuarios row', usuarioRow)
      const { data: reqRow } = await supa.from('poliza_update_requests').select('id,estado,poliza_id,solicitante_id,payload_propuesto').eq('id', body.request_id).maybeSingle()
      console.debug('[apply_poliza_update][debug] update_request row', reqRow)
      if (reqRow?.payload_propuesto) {
        console.debug('[apply_poliza_update][debug] payload_propuesto', reqRow.payload_propuesto)
      }
    } catch (e) {
      console.debug('[apply_poliza_update][debug] error fetching pre-data', e)
    }
  }

  const rpc = await supa.rpc('apply_poliza_update', { p_request_id: body.request_id })
  if (rpc.error) {
    if (debugOn) {
      console.debug('[apply_poliza_update][debug] rpc.error', rpc.error)
      // Intento adicional: evaluar is_super_role a través de un pequeño SELECT
      try {
        const { data: isSuper } = await supa.rpc('is_super_role_wrapper')
        console.debug('[apply_poliza_update][debug] is_super_role_wrapper()', isSuper)
      } catch (e) {
        console.debug('[apply_poliza_update][debug] fallo wrapper is_super_role', e)
      }
      // Llamar helper de depuración si existe
      try {
        const dbg = await supa.rpc('apply_poliza_update_dbg', { p_request_id: body.request_id })
        if (dbg.error) {
          console.debug('[apply_poliza_update][debug] dbg.error', dbg.error)
        } else {
          console.debug('[apply_poliza_update][debug] dbg.data', dbg.data)
        }
      } catch (e) {
        console.debug('[apply_poliza_update][debug] fallo apply_poliza_update_dbg', e)
      }
    }
    let pending: unknown = null
    if (body.debug) {
      const { data: row } = await supa
        .from('poliza_update_requests')
        .select('*')
        .eq('id', body.request_id)
        .maybeSingle()
      pending = row
    }
    return NextResponse.json({ error: rpc.error.message, details: rpc.error.details, hint: rpc.error.hint, code: rpc.error.code, pending }, { status: 400 })
  }
  // Si hay debug, volver a leer la solicitud para ver el estado post-aprobación
  if (body?.debug) {
    try {
      const { data: reqAfter } = await supa
        .from('poliza_update_requests')
        .select('id,estado,poliza_id,solicitante_id,resuelto_at,resuelto_por')
        .eq('id', body.request_id)
        .maybeSingle()
      console.debug('[apply_poliza_update][debug] request after RPC', reqAfter)
    } catch (e) {
      console.debug('[apply_poliza_update][debug] error fetching post-data', e)
    }
  }

  let polizaId: string | null = null
  let reqRow: any = null
  let updatedPoliza: {
    id: string
    prima_input?: number|null
    prima_moneda?: string|null
    puntos_cache?: {
      base_factor?: number|null
      year_factor?: number|null
      prima_anual_snapshot?: number|null
      puntos_total?: number|null
      clasificacion?: string|null
    }|null
    comision_mxn?: number|null
  } | null = null
  try {
    const { data: reqData } = await supa
      .from('poliza_update_requests')
      .select('solicitante_id, poliza_id, payload_propuesto')
      .eq('id', body.request_id)
      .maybeSingle()
    reqRow = reqData
    polizaId = reqRow?.poliza_id || null

    if (polizaId) {
      // Fijar explícitamente fecha_limite_pago si vino en el payload (fallback en caso de que la RPC no la persista)
      try {
        const proposed = (reqRow?.payload_propuesto as { fecha_limite_pago?: string | null } | null)?.fecha_limite_pago
        if (proposed !== undefined) {
          const admin = getServiceClient()
          await admin
            .from('polizas')
            .update({ fecha_limite_pago: proposed || null })
            .eq('id', polizaId)
        }
      } catch (err) {
        if (debugOn) console.debug('[apply_poliza_update][debug] fallback fecha_limite_pago update err', err)
      }

      // Forzar recálculo inmediato (fallback en caso de que el trigger o la RPC no actualicen el cache por RLS)
      try {
        const admin = getServiceClient()
        await admin.rpc('recalc_puntos_poliza', { p_poliza_id: polizaId })
      } catch (e) {
        if (debugOn) console.debug('[apply_poliza_update][debug] recalc_puntos_poliza via service client failed/ignored', e)
      }

      const { data: pRow } = await supa
        .from('polizas')
        .select('id, prima_input, prima_moneda, poliza_puntos_cache(base_factor,year_factor,prima_anual_snapshot,puntos_total,clasificacion)')
        .eq('id', polizaId)
        .maybeSingle()

      // Regenerar calendario de pagos cuando se actualiza la póliza (sin depender del cliente)
      try {
        const admin = getServiceClient()
        const { data: poliza } = await admin
          .from('polizas')
          .select('id, numero_poliza, periodicidad_pago, fecha_emision, fecha_limite_pago, dia_pago, prima_mxn, estatus, meses_check, producto_parametro_id')
          .eq('id', polizaId)
          .single()

        if (poliza && poliza.estatus !== 'CANCELADA' && poliza.periodicidad_pago && poliza.fecha_emision) {
          const map = {
            mensual: { divisor: 12, step: 1 },
            trimestral: { divisor: 4, step: 3 },
            semestral: { divisor: 2, step: 6 },
            anual: { divisor: 1, step: 12 }
          } as const
          const cfg = map[poliza.periodicidad_pago as keyof typeof map]

          if (cfg) {
            await admin
              .from('poliza_pagos_mensuales')
              .delete()
              .eq('poliza_id', polizaId)
              .neq('estado', 'pagado')

            const emision = new Date(poliza.fecha_emision)
            const startYear = emision.getUTCFullYear()
            const startMonth = emision.getUTCMonth()
            const diaPago = poliza.dia_pago ?? 1

            const baseFechaPrimerPago = new Date(Date.UTC(startYear, startMonth, 1))
            baseFechaPrimerPago.setUTCDate(diaPago)

            const baseDiaLimite = (() => {
              if (poliza.fecha_limite_pago) {
                const d = new Date(poliza.fecha_limite_pago)
                if (!Number.isNaN(d.valueOf())) return d.getUTCDate()
              }
              return diaPago
            })()
            const baseFechaLimite = new Date(Date.UTC(startYear, startMonth, 1))
            baseFechaLimite.setUTCDate(baseDiaLimite)

            // Tomar porcentaje del producto parametrizado: anio_1_percent con fallback al último porcentaje no nulo; si no hay, 0
            let pct = 0
            if (poliza.producto_parametro_id) {
              const { data: prod } = await admin
                .from('producto_parametros')
                .select('anio_1_percent, anio_2_percent, anio_3_percent, anio_4_percent, anio_5_percent, anio_6_percent, anio_7_percent, anio_8_percent, anio_9_percent, anio_10_percent, anio_11_plus_percent')
                .eq('id', poliza.producto_parametro_id)
                .maybeSingle()

              if (prod) {
                const chain = [
                  prod.anio_1_percent,
                  prod.anio_2_percent,
                  prod.anio_3_percent,
                  prod.anio_4_percent,
                  prod.anio_5_percent,
                  prod.anio_6_percent,
                  prod.anio_7_percent,
                  prod.anio_8_percent,
                  prod.anio_9_percent,
                  prod.anio_10_percent,
                  prod.anio_11_plus_percent
                ].filter(v => typeof v === 'number' && Number.isFinite(v)) as number[]
                if (chain.length) pct = chain[chain.length - 1]
              }
            }

            const baseMensual = Number(poliza.prima_mxn || 0) / cfg.divisor
            const montoPeriodo = Number(((baseMensual * pct) / 100).toFixed(2))
            const pagosToInsert: Array<{ poliza_id: string; periodo_mes: string; fecha_programada: string; fecha_limite: string; monto_programado: number; estado: string; created_by?: string | null }> = []

            for (let i = 0; i < cfg.divisor; i++) {
              const offsetMonths = i * cfg.step
              const periodo = new Date(Date.UTC(startYear, startMonth + offsetMonths, 1))
              const fechaProg = new Date(baseFechaPrimerPago)
              fechaProg.setUTCMonth(fechaProg.getUTCMonth() + offsetMonths)
              const fechaLimCandidate = new Date(baseFechaLimite)
              fechaLimCandidate.setUTCMonth(fechaLimCandidate.getUTCMonth() + offsetMonths)
              const lastDayOfTargetMonth = new Date(Date.UTC(fechaLimCandidate.getUTCFullYear(), fechaLimCandidate.getUTCMonth() + 1, 0))
              const fechaLim = fechaLimCandidate.getUTCDate() === baseDiaLimite ? fechaLimCandidate : lastDayOfTargetMonth

              pagosToInsert.push({
                poliza_id: polizaId,
                periodo_mes: periodo.toISOString().slice(0, 10),
                fecha_programada: fechaProg.toISOString(),
                fecha_limite: fechaLim.toISOString().slice(0, 10),
                monto_programado: montoPeriodo,
                estado: 'pendiente',
                created_by: null
              })
            }

            await admin
              .from('poliza_pagos_mensuales')
              .upsert(pagosToInsert, { onConflict: 'poliza_id,periodo_mes' })

            const mesesCheck = (poliza as { meses_check?: Record<string, boolean> }).meses_check || {}
            const mesesMontosRaw = (reqRow?.payload_propuesto as { meses_montos?: Record<string, number | string | null> } | null)?.meses_montos || {}

            const parseMonthKey = (key: string): string | null => {
              if (key.includes('-')) {
                const [y, m] = key.split('-').map(Number)
                if (!Number.isFinite(y) || !Number.isFinite(m)) return null
                const d = new Date(Date.UTC(y, (m || 1) - 1, 1))
                return d.toISOString().slice(0, 10)
              }
              if (key.includes('/')) {
                const [mStr, yStr] = key.split('/')
                const m = Number(mStr)
                const y = Number(yStr.length === 2 ? `20${yStr}` : yStr)
                if (!Number.isFinite(y) || !Number.isFinite(m)) return null
                const d = new Date(Date.UTC(y, (m || 1) - 1, 1))
                return d.toISOString().slice(0, 10)
              }
              return null
            }

            const mesesPagados = Object.entries(mesesCheck)
              .filter(([, v]) => !!v)
              .map(([k]) => parseMonthKey(k))
              .filter(Boolean) as string[]

            const montoPorMesIso: Record<string, number> = {}
            for (const [k, v] of Object.entries(mesesMontosRaw)) {
              const iso = parseMonthKey(k)
              const num = typeof v === 'string' ? Number(v) : Number(v)
              if (iso && Number.isFinite(num) && num >= 0) montoPorMesIso[iso] = num
            }

            if (mesesPagados.length > 0) {
              for (const iso of mesesPagados) {
                const monto = montoPorMesIso[iso]
                if (!Number.isFinite(monto)) {
                  if (debugOn) console.debug('[apply_poliza_update][debug] monto faltante para periodo', iso)
                  continue
                }
                await admin
                  .from('poliza_pagos_mensuales')
                  .update({ estado: 'pagado', monto_pagado: Number(monto) })
                  .eq('poliza_id', polizaId)
                  .eq('periodo_mes', iso)
              }
            }
          }
        }
      } catch (err) {
        if (debugOn) console.debug('[apply_poliza_update][debug] fallo al regenerar pagos', err)
      }

      // Disparar Edge Function de actualización de pagos vencidos
      try {
        const fnUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/actualizar-pagos-vencidos` : null
        const secret = process.env.REPORTES_CRON_SECRET
        if (fnUrl && secret) {
          const res = await fetch(fnUrl, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${secret}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ source: 'apply_poliza_update' })
          })
          if (!res.ok && debugOn) {
            console.debug('[apply_poliza_update][debug] edge actualizar-pagos-vencidos fallo', res.status, await res.text())
          }
        } else if (debugOn) {
          console.debug('[apply_poliza_update][debug] edge actualizar-pagos-vencidos omitido: faltan envs')
        }
      } catch (err) {
        if (debugOn) console.debug('[apply_poliza_update][debug] edge actualizar-pagos-vencidos error', err)
      }

      if (pRow) {
        const puntos_cache = (pRow as { poliza_puntos_cache?: { base_factor?: number|null; year_factor?: number|null; prima_anual_snapshot?: number|null; puntos_total?: number|null; clasificacion?: string|null }|null }).poliza_puntos_cache ?? null
        const pct = puntos_cache?.base_factor ?? null
        const primaMXN = puntos_cache?.prima_anual_snapshot ?? null
        const comision_mxn = (pct!=null && primaMXN!=null) ? Number(((primaMXN * pct) / 100).toFixed(2)) : null
        updatedPoliza = {
          id: (pRow as { id: string }).id,
          prima_input: (pRow as { prima_input?: number|null }).prima_input ?? null,
          prima_moneda: (pRow as { prima_moneda?: string|null }).prima_moneda ?? null,
          puntos_cache,
          comision_mxn
        }
      }

      if (body?.debug) {
        console.debug('[apply_poliza_update][debug] updated poliza snapshot', updatedPoliza)
      }
    }

    if (process.env.NOTIFY_CHANGE_REQUESTS === '1' && reqRow?.solicitante_id) {
      const { data: user } = await supa.from('usuarios').select('email').eq('id', reqRow.solicitante_id).maybeSingle()
      if (user?.email) {
        await sendMail({ to: user.email, subject: 'Solicitud de póliza aprobada', html: `<p>Tu solicitud fue aprobada para la póliza ${reqRow.poliza_id}.</p>` })
      }
    }
  } catch {}

  await logAccion('apply_poliza_update', { usuario: auth.user.email || undefined, tabla_afectada: 'poliza_update_requests', snapshot: { id: body.request_id } })
  try {
    // Notificar al solicitante que su solicitud fue aprobada
    const admin = getServiceClient()
    if (reqRow?.solicitante_id) {
      await admin.from('notificaciones').insert({
        usuario_id: reqRow.solicitante_id,
        tipo: 'sistema',
        titulo: 'Solicitud de póliza aprobada',
        mensaje: `Se aprobó tu solicitud ${body.request_id || ''}${polizaId ? ` para póliza ${polizaId}` : ''}`.trim(),
        leida: false,
        metadata: { request_id: body.request_id, poliza_id: polizaId }
      })
    }
  } catch (e) {
    if (debugOn) console.debug('[apply_poliza_update][debug] notificacion solicitante error', e)
  }
  return NextResponse.json({ ok: true, poliza_id: polizaId, poliza: updatedPoliza })
}
