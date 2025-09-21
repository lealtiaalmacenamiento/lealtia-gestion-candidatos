import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabaseClient'
import { semanaDesdeNumero } from '@/lib/semanaIso'

type ActivityBreakdown = {
  views: number
  clicks: number
  forms: number
  prospectos: number
  planificacion: number
  clientes: number
  polizas: number
  usuarios: number
  parametros: number
  reportes: number
  otros: number
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const anioStr = url.searchParams.get('anio')
    const semanaStr = url.searchParams.get('semana')
    const usuario = (url.searchParams.get('usuario') || '').trim().toLowerCase()
    if (!anioStr || !semanaStr || !usuario) {
      return NextResponse.json({ error: 'anio, semana y usuario son requeridos' }, { status: 400 })
    }
    const anio = Number(anioStr)
    const semana = Number(semanaStr)
    if (!Number.isFinite(anio) || !Number.isFinite(semana)) {
      return NextResponse.json({ error: 'anio/semana inválidos' }, { status: 400 })
    }
    // CDMX fijo -06:00 (sin DST desde 2023). Trabajamos en milisegundos UTC con un corrimiento de +6h
    const OFFSET_MS = 6 * 60 * 60 * 1000
    const sem = semanaDesdeNumero(anio, semana)
    // Como Date nativa no permite getTimezoneOffset arbitrario, aproximamos el rango CDMX en UTC ampliando el rango:
    // 06:00-29:59 UTC abarca 00:00-23:59 CDMX con DST típico (-6/-5). Si se requiere ajuste fino, considerar una función con librería TZ.
  // Semana local CDMX [Lun 00:00 .. Dom 23:59:59.999] equivale en UTC a [Lun 06:00Z .. Lun siguiente 05:59:59.999Z]
  const weekStartUTCms = Date.UTC(sem.inicio.getUTCFullYear(), sem.inicio.getUTCMonth(), sem.inicio.getUTCDate(), 0, 0, 0) + OFFSET_MS
  const start = new Date(weekStartUTCms)
  const end = new Date(weekStartUTCms + (7 * 86400000) - 1)
    // Nota: 06:00-29:59 UTC abarca 00:00-23:59 CDMX considerando el desfase típico (-6/-5). Si fuera necesario, podemos ajustar con offsets dinámicos por DST.

    // Leer de ambas tablas (camelCase y snake_case) y combinar resultados para evitar falsos vacíos
    const sel = 'fecha,usuario,accion,tabla_afectada'
    const [qCamel, qSnake] = await Promise.all([
      supabase
        .from('RegistroAcciones')
        .select(sel)
        .gte('fecha', start.toISOString())
        .lte('fecha', end.toISOString())
        .ilike('usuario', usuario)
        .order('fecha', { ascending: true }),
      supabase
        .from('registro_acciones')
        .select(sel)
        .gte('fecha', start.toISOString())
        .lte('fecha', end.toISOString())
        .ilike('usuario', usuario)
        .order('fecha', { ascending: true })
    ])
    const rowsCamel = (!qCamel.error && Array.isArray(qCamel.data) ? qCamel.data : []) as Array<{ fecha: string; usuario: string | null; accion: string | null; tabla_afectada: string | null }>
    const rowsSnake = (!qSnake.error && Array.isArray(qSnake.data) ? qSnake.data : []) as Array<{ fecha: string; usuario: string | null; accion: string | null; tabla_afectada: string | null }>
    // Deduplicar por (fecha|usuario|accion|tabla_afectada)
    const seen = new Set<string>()
    const rows: Array<{ fecha: string; usuario: string | null; accion: string | null; tabla_afectada: string | null }> = []
    for (const r of [...rowsCamel, ...rowsSnake]) {
      const key = [r.fecha, r.usuario || '', r.accion || '', r.tabla_afectada || ''].join('|')
      if (!seen.has(key)) { seen.add(key); rows.push(r) }
    }

    const counts = new Array(7).fill(0) as number[]
    const breakdown: ActivityBreakdown = { views: 0, clicks: 0, forms: 0, prospectos: 0, planificacion: 0, clientes: 0, polizas: 0, usuarios: 0, parametros: 0, reportes: 0, otros: 0 }
    const dailyCats: ActivityBreakdown[] = Array.from({ length: 7 }, () => ({ views: 0, clicks: 0, forms: 0, prospectos: 0, planificacion: 0, clientes: 0, polizas: 0, usuarios: 0, parametros: 0, reportes: 0, otros: 0 }))
    // Detalle de acciones (totales y por día)
    const detailTotals = {
      prospectos_altas: 0,
      prospectos_cambios_estado: 0,
      prospectos_notas: 0,
      planificacion_ediciones: 0,
      clientes_altas: 0,
      clientes_modificaciones: 0,
      polizas_altas: 0,
      polizas_modificaciones: 0
    }
    const detailDaily = Array.from({ length: 7 }, () => ({
      prospectos_altas: 0,
      prospectos_cambios_estado: 0,
      prospectos_notas: 0,
      planificacion_ediciones: 0,
      clientes_altas: 0,
      clientes_modificaciones: 0,
      polizas_altas: 0,
      polizas_modificaciones: 0
    }))
  const safeRows = rows
    for (const r of safeRows) {
  const ts = new Date(r.fecha)
  // Índice 0..6 relativo a inicio local CDMX (weekStartUTCms)
  const dayIndex = Math.floor((ts.getTime() - weekStartUTCms) / 86400000)
      if (dayIndex >= 0 && dayIndex < 7) counts[dayIndex] += 1
      const a = (r.accion || '').toLowerCase()
      const t = (r.tabla_afectada || '').toLowerCase()
      if (a.startsWith('ui_')) {
        if (a === 'ui_page_view') breakdown.views += 1
        else if (a === 'ui_click') breakdown.clicks += 1
        else if (a === 'ui_form_submit') breakdown.forms += 1
        else breakdown.otros += 1
        if (dayIndex >= 0 && dayIndex < 7) {
          if (a === 'ui_page_view') dailyCats[dayIndex].views += 1
          else if (a === 'ui_click') dailyCats[dayIndex].clicks += 1
          else if (a === 'ui_form_submit') dailyCats[dayIndex].forms += 1
          else dailyCats[dayIndex].otros += 1
        }
        continue
      }
      // Clasificación por módulos/acciones clave
      if (a.includes('prospecto') || t.includes('prospectos')) {
        breakdown.prospectos += 1
        if (dayIndex >= 0 && dayIndex < 7) dailyCats[dayIndex].prospectos += 1
        // Nota: Para evitar doble conteo, NO incrementamos aquí altas/notas de prospectos.
        // Esas métricas se calculan exclusivamente desde prospectos_historial más abajo.
        // Si aparecen acciones como 'edicion_prospecto' o 'cambio_estado', el detalle se deriva del historial.
      }
      else if (a.includes('planificacion') || t.includes('planificaciones')) {
        breakdown.planificacion += 1
        if (dayIndex >= 0 && dayIndex < 7) dailyCats[dayIndex].planificacion += 1
        if (a.includes('upsert_planificacion')) { detailTotals.planificacion_ediciones += 1; if (dayIndex >= 0 && dayIndex < 7) detailDaily[dayIndex].planificacion_ediciones += 1 }
      }
      else if (a.includes('cliente') || t.includes('clientes')) {
        breakdown.clientes += 1
        if (dayIndex >= 0 && dayIndex < 7) dailyCats[dayIndex].clientes += 1
        if (a.includes('alta_cliente')) { detailTotals.clientes_altas += 1; if (dayIndex >= 0 && dayIndex < 7) detailDaily[dayIndex].clientes_altas += 1 }
        if (a.includes('submit_cliente_update') || a.includes('apply_cliente_update') || a.includes('reject_cliente_update') || a.includes('edicion_cliente') || a.includes('update_cliente')) {
          detailTotals.clientes_modificaciones += 1; if (dayIndex >= 0 && dayIndex < 7) detailDaily[dayIndex].clientes_modificaciones += 1
        }
      }
      else if (a.includes('poliza') || t.includes('polizas')) {
        breakdown.polizas += 1
        if (dayIndex >= 0 && dayIndex < 7) dailyCats[dayIndex].polizas += 1
        if (a.includes('alta_poliza')) { detailTotals.polizas_altas += 1; if (dayIndex >= 0 && dayIndex < 7) detailDaily[dayIndex].polizas_altas += 1 }
        if (a.includes('submit_poliza_update') || a.includes('apply_poliza_update') || a.includes('reject_poliza_update') || a.includes('edicion_poliza') || a.includes('update_poliza')) {
          detailTotals.polizas_modificaciones += 1; if (dayIndex >= 0 && dayIndex < 7) detailDaily[dayIndex].polizas_modificaciones += 1
        }
      }
      else if (a.includes('usuario') || t.includes('usuarios')) { breakdown.usuarios += 1; if (dayIndex >= 0 && dayIndex < 7) dailyCats[dayIndex].usuarios += 1 }
      else if (a.includes('parametro') || t.includes('parametros')) { breakdown.parametros += 1; if (dayIndex >= 0 && dayIndex < 7) dailyCats[dayIndex].parametros += 1 }
      else if (a.includes('reporte') || t.includes('reportes')) { breakdown.reportes += 1; if (dayIndex >= 0 && dayIndex < 7) dailyCats[dayIndex].reportes += 1 }
      else { breakdown.otros += 1; if (dayIndex >= 0 && dayIndex < 7) dailyCats[dayIndex].otros += 1 }
    }

    // Complementar detalle desde prospectos_historial para diferenciar altas/cambios/notas con precisión
    try {
      const { data: hist, error: histErr } = await supabase
        .from('prospectos_historial')
        .select('created_at, usuario_email, estado_anterior, estado_nuevo, nota_agregada')
        .gte('created_at', start.toISOString())
        .lte('created_at', end.toISOString())
        .ilike('usuario_email', usuario)
        .order('created_at', { ascending: true })
      if (!histErr && Array.isArray(hist)){
        for (const h of hist as Array<{ created_at: string; usuario_email: string|null; estado_anterior: string|null; estado_nuevo: string|null; nota_agregada: boolean|null }>){
          const ts = new Date(h.created_at)
          const di = Math.floor((ts.getTime() - weekStartUTCms) / 86400000)
          const safeDay = di >= 0 && di < 7 ? di : -1
          const esAlta = !h.estado_anterior || h.estado_anterior === ''
          const cambioEstado = !!(h.estado_anterior && h.estado_nuevo && h.estado_anterior !== h.estado_nuevo)
          if (esAlta){ detailTotals.prospectos_altas += 1; if (safeDay>=0) detailDaily[safeDay].prospectos_altas += 1 }
          if (cambioEstado){ detailTotals.prospectos_cambios_estado += 1; if (safeDay>=0) detailDaily[safeDay].prospectos_cambios_estado += 1 }
          if (h.nota_agregada){ detailTotals.prospectos_notas += 1; if (safeDay>=0) detailDaily[safeDay].prospectos_notas += 1 }
        }
      }
    } catch { /* ignore */ }

    const labels = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom']
    return NextResponse.json({
      success: true,
      range: { inicio: start.toISOString(), fin: end.toISOString() },
      daily: { labels, counts },
      breakdown,
      dailyBreakdown: dailyCats,
      details: detailTotals,
      detailsDaily: detailDaily
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
