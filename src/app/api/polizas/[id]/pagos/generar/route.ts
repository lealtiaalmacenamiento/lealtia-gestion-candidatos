import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: polizaId } = await params

  try {
    const supabase = getServiceClient()
    
    const { data: pagosPagados } = await supabase
      .from('poliza_pagos_mensuales')
      .select('periodo_mes')
      .eq('poliza_id', polizaId)
      .eq('estado', 'pagado')
    const pagadosSet = new Set((pagosPagados || []).map(p => p.periodo_mes))

    // Verificar que la póliza existe y tiene periodicidad configurada
    const { data: poliza, error: polizaError } = await supabase
      .from('polizas')
      .select('id, numero_poliza, periodicidad_pago, fecha_emision, fecha_limite_pago, dia_pago, prima_mxn, estatus, meses_check, producto_parametro_id, clientes!inner(asesor_id)')
      .eq('id', polizaId)
      .single()

    console.info('[pagos_generar] polizaId', polizaId, 'polizaError', polizaError, 'poliza', poliza)

    if (polizaError || !poliza) {
      return NextResponse.json({ error: 'Póliza no encontrada' }, { status: 404 })
    }

    if (poliza.estatus === 'CANCELADA') {
      return NextResponse.json({ 
        error: 'No se pueden generar pagos para pólizas canceladas' 
      }, { status: 400 })
    }

    if (!poliza.periodicidad_pago) {
      return NextResponse.json({ 
        error: 'La póliza no tiene periodicidad de pago configurada' 
      }, { status: 400 })
    }

    // Eliminar pagos existentes que no estén pagados
    const { error: deleteError } = await supabase
      .from('poliza_pagos_mensuales')
      .delete()
      .eq('poliza_id', polizaId)
      .neq('estado', 'pagado')

    if (deleteError) {
      console.error('Error eliminando pagos pendientes:', deleteError)
      return NextResponse.json({ 
        error: 'Error al limpiar pagos pendientes' 
      }, { status: 500 })
    }

    const map = {
      mensual: { divisor: 12, step: 1 },
      trimestral: { divisor: 4, step: 3 },
      semestral: { divisor: 2, step: 6 },
      anual: { divisor: 1, step: 12 }
    } as const

    const cfg = poliza.periodicidad_pago && map[poliza.periodicidad_pago as keyof typeof map]
    if (!cfg) {
      return NextResponse.json({ error: 'Periodicidad desconocida' }, { status: 400 })
    }

    // Calcular porcentaje del producto parametrizado (usa anio_1_percent; fallback al último porcentaje válido; si no hay ninguno, 0)
    let pct = 0
    if (poliza.producto_parametro_id) {
      const { data: prod } = await supabase
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
    const emision = poliza.fecha_emision ? new Date(poliza.fecha_emision) : null
    if (!emision || Number.isNaN(emision.valueOf())) {
      return NextResponse.json({ error: 'Fecha de emisión inválida' }, { status: 400 })
    }

    const startYear = emision.getUTCFullYear()
    const startMonth = emision.getUTCMonth()
    const diaPago = poliza.dia_pago ?? 1

    const baseFechaPrimerPago = new Date(Date.UTC(startYear, startMonth, 1))
    baseFechaPrimerPago.setUTCDate(diaPago)

    // Tomar sólo el día de fecha_limite_pago para repetirlo cada periodo; si falta, usar dia_pago; fallback último día del mes si no existe ese día.
    const baseDiaLimite = (() => {
      if (poliza.fecha_limite_pago) {
        const d = new Date(poliza.fecha_limite_pago)
        if (!Number.isNaN(d.valueOf())) return d.getUTCDate()
      }
      return diaPago
    })()
    const baseFechaLimite = new Date(Date.UTC(startYear, startMonth, 1))
    baseFechaLimite.setUTCDate(baseDiaLimite)

    const pagosToInsert = [] as Array<{ poliza_id: string; periodo_mes: string; fecha_programada: string; fecha_limite: string; monto_programado: number; estado: string; created_by?: string | null }>

    for (let i = 0; i < cfg.divisor; i++) {
      const offsetMonths = i * cfg.step
      const periodo = new Date(Date.UTC(startYear, startMonth + offsetMonths, 1))
      const fechaProg = new Date(baseFechaPrimerPago)
      fechaProg.setUTCMonth(fechaProg.getUTCMonth() + offsetMonths)
      const fechaLimCandidate = new Date(baseFechaLimite)
      fechaLimCandidate.setUTCMonth(fechaLimCandidate.getUTCMonth() + offsetMonths)
      // Clamp al último día del mes si el día no existe (p.ej. 31 en febrero)
      const lastDayOfTargetMonth = new Date(Date.UTC(fechaLimCandidate.getUTCFullYear(), fechaLimCandidate.getUTCMonth() + 1, 0))
      const fechaLim = fechaLimCandidate.getUTCDate() === baseDiaLimite
        ? fechaLimCandidate
        : lastDayOfTargetMonth

      if (pagadosSet.has(periodo.toISOString().slice(0, 10))) {
        continue
      }
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

    const { error: insertError } = await supabase
      .from('poliza_pagos_mensuales')
      .upsert(pagosToInsert, { onConflict: 'poliza_id,periodo_mes' })

    if (insertError) {
      console.error('Error generando pagos:', insertError)
      return NextResponse.json({ 
        error: 'Error al generar calendario de pagos',
        details: insertError.message 
      }, { status: 500 })
    }

    // Marcar como pagados los periodos indicados en meses_check de la póliza
    const mesesCheck = poliza.meses_check || {}
    const mesesPagados = Object.entries(mesesCheck)
      .filter(([, v]) => !!v)
      .map(([k]) => {
        // Soportar formatos YYYY-MM y MM/YY
        if (k.includes('-')) {
          const [y, m] = k.split('-').map(Number)
          const d = new Date(Date.UTC(y, (m || 1) - 1, 1))
          return d.toISOString().slice(0, 10)
        }
        if (k.includes('/')) {
          const [mStr, yStr] = k.split('/')
          const m = Number(mStr)
          const y = Number(yStr.length === 2 ? `20${yStr}` : yStr)
          const d = new Date(Date.UTC(y, (m || 1) - 1, 1))
          return d.toISOString().slice(0, 10)
        }
        return null
      })
      .filter(Boolean)

    if (mesesPagados.length > 0) {
      const { error: markPaidError } = await supabase
        .from('poliza_pagos_mensuales')
        .update({ estado: 'pagado' })
        .eq('poliza_id', polizaId)
        .in('periodo_mes', mesesPagados)

      if (markPaidError) {
        console.error('Error marcando pagos pagados:', markPaidError)
      }
    }

    // Consultar los pagos generados
    const { data: pagos, error: pagosError } = await supabase
      .from('poliza_pagos_mensuales')
      .select('*')
      .eq('poliza_id', polizaId)
      .order('periodo_mes')

    if (pagosError) {
      console.error('Error consultando pagos generados:', pagosError)
    }

    // Notificar al asesor que se regeneró/calibró el calendario (p.ej. corrección de fecha límite o reapertura)
    try {
      const asesorId = (poliza as unknown as { clientes?: { asesor_id?: string|null }|null })?.clientes?.asesor_id || null
      if (asesorId) {
        await supabase.from('notificaciones').insert({
          usuario_id: asesorId,
          tipo: 'pago_proximo',
          titulo: 'Pagos recalculados',
          mensaje: `Se actualizó el calendario de pagos de la póliza ${poliza.numero_poliza || polizaId}`,
          leida: false,
          metadata: { poliza_id: polizaId }
        })
      }
    } catch (e) {
      console.error('[pagos_generar] notificacion recalculo err', e)
    }

    return NextResponse.json({
      success: true,
      message: 'Calendario de pagos regenerado exitosamente',
      pagos_generados: pagos?.length || 0,
      pagos: pagos || []
    })

  } catch (error) {
    console.error('Error en POST /api/polizas/[id]/pagos/generar:', error)
    return NextResponse.json({ 
      error: 'Error interno del servidor' 
    }, { status: 500 })
  }
}
