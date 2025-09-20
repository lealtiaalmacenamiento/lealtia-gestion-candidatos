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
    const sem = semanaDesdeNumero(anio, semana)
    // Rango UTC de la semana ISO [inicio 00:00:00, fin 23:59:59]
    const start = new Date(Date.UTC(sem.inicio.getUTCFullYear(), sem.inicio.getUTCMonth(), sem.inicio.getUTCDate(), 0, 0, 0))
    const end = new Date(Date.UTC(sem.fin.getUTCFullYear(), sem.fin.getUTCMonth(), sem.fin.getUTCDate(), 23, 59, 59, 999))

    // Intentar tabla camelCase luego snake_case
    const sel = 'fecha,usuario,accion,tabla_afectada'
    const q1 = await supabase
      .from('RegistroAcciones')
      .select(sel)
      .gte('fecha', start.toISOString())
      .lte('fecha', end.toISOString())
      .ilike('usuario', usuario)
      .order('fecha', { ascending: true })
  let rows = q1.data as Array<{ fecha: string; usuario: string | null; accion: string | null; tabla_afectada: string | null }> | null
    if (q1.error) {
      const q2 = await supabase
        .from('registro_acciones')
        .select(sel)
        .gte('fecha', start.toISOString())
        .lte('fecha', end.toISOString())
        .ilike('usuario', usuario)
        .order('fecha', { ascending: true })
      if (q2.error) return NextResponse.json({ error: q2.error.message }, { status: 500 })
      rows = q2.data as Array<{ fecha: string; usuario: string | null; accion: string | null; tabla_afectada: string | null }> | null
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
    const safeRows = rows || []
    for (const r of safeRows) {
      const ts = new Date(r.fecha)
      // Mapear a índice 0..6 relativo a inicio UTC
      const dayIndex = Math.floor((Date.UTC(ts.getUTCFullYear(), ts.getUTCMonth(), ts.getUTCDate()) - Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate())) / 86400000)
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
        // Subclasificar acciones de prospectos si vienen por auditoría
        if (a.includes('alta_prospecto')) { detailTotals.prospectos_altas += 1; if (dayIndex >= 0 && dayIndex < 7) detailDaily[dayIndex].prospectos_altas += 1 }
        if (a.includes('cambio_estado') || a.includes('estado_') || a.includes('edicion_prospecto')) {
          // edicion_prospecto puede ser cambio de estado o notas; se contará mejor desde prospectos_historial abajo
        }
        if (a.includes('nota')) { detailTotals.prospectos_notas += 1; if (dayIndex >= 0 && dayIndex < 7) detailDaily[dayIndex].prospectos_notas += 1 }
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
          const di = Math.floor((Date.UTC(ts.getUTCFullYear(), ts.getUTCMonth(), ts.getUTCDate()) - Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate())) / 86400000)
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
