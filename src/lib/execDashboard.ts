/**
 * execDashboard.ts
 * Funciones de fetching client-side para el Dashboard Ejecutivo.
 * Consume el endpoint /api/exec-dashboard.
 *
 * Uso desde componentes React:
 *   const { kpis, tendencia, funnel, ... } = useExecDashboard()
 */

import { useEffect, useReducer, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabaseClient'
import type {
  ExecFilters,
  ExecAsesor,
  ExecKpis,
  ExecTendencia,
  ExecFunnel,
  ExecSlaStats,
  ExecCitasStats,
  ExecMotivosDescarte,
  ExecPolizasPorTipo,
  ExecPolizasVencer,
  ExecTopAsesores,
  ExecTopClientes,
  ExecDashboardState,
  ExecApiResponse,
  DatePreset,
} from '@/types/exec-dashboard'

// =============================================================================
// UTILIDADES DE FECHA
// =============================================================================

/** Devuelve { desde, hasta } en YYYY-MM-DD según el preset seleccionado.
 *  Todos los cálculos se hacen en la zona horaria de CDMX (America/Mexico_City). */
export function buildDateRange(preset: DatePreset): { desde: string; hasta: string } {
  const { year, month, day } = todayCDMX()
  const today = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`

  if (preset === 'mes_actual') {
    const desde = `${year}-${String(month + 1).padStart(2, '0')}-01`
    return { desde, hasta: today }
  }

  if (preset === 'trimestre') {
    const qMonth = Math.floor(month / 3) * 3
    const desde  = `${year}-${String(qMonth + 1).padStart(2, '0')}-01`
    return { desde, hasta: today }
  }

  if (preset === 'anio_anterior') {
    const prevYear = year - 1
    return { desde: `${prevYear}-01-01`, hasta: `${prevYear}-12-31` }
  }

  if (preset === 'personalizado') {
    // Rango libre: no se recalcula desde aquí; usar setCustomRange
    return { desde: `${year}-01-01`, hasta: today }
  }

  // anio (año a la fecha)
  return { desde: `${year}-01-01`, hasta: today }
}

/** Fecha de hoy desglosada en zona horaria CDMX (America/Mexico_City). */
function todayCDMX(): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Mexico_City',
    year:     'numeric',
    month:    '2-digit',
    day:      '2-digit',
  }).formatToParts(new Date())
  const get = (t: string) => parseInt(parts.find(p => p.type === t)!.value)
  return { year: get('year'), month: get('month') - 1, day: get('day') }
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' }) // YYYY-MM-DD CDMX
}

/** Filtros iniciales por defecto (mes actual, todos los asesores) */
export function defaultFilters(): ExecFilters {
  return {
    preset:       'mes_actual',
    ...buildDateRange('mes_actual'),
    asesorAuthId: null,
  }
}

// =============================================================================
// FETCHERS POR RPC
// =============================================================================

const BASE = '/api/exec-dashboard'

function buildUrl(rpc: string, params: Record<string, string | number | null>): string {
  const sp = new URLSearchParams({ rpc })
  for (const [k, v] of Object.entries(params)) {
    if (v !== null && v !== undefined) sp.set(k, String(v))
  }
  return `${BASE}?${sp.toString()}`
}

async function fetchRpc<T>(url: string): Promise<T | null> {
  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`[exec-dashboard] HTTP ${res.status}: ${body}`)
  }
  const json: ExecApiResponse<T> = await res.json()
  if (json.error) throw new Error(json.error)
  return json.data
}

// ── Zona 1 ──────────────────────────────────────────────────────────────────

export async function fetchAsesoresList(): Promise<ExecAsesor[]> {
  const data = await fetchRpc<ExecAsesor[]>(buildUrl('asesores_list', {}))
  return data ?? []
}

// ── Zona 2 ──────────────────────────────────────────────────────────────────

export async function fetchKpis(f: ExecFilters): Promise<ExecKpis | null> {
  return fetchRpc<ExecKpis>(
    buildUrl('kpis', { desde: f.desde, hasta: f.hasta, asesor: f.asesorAuthId })
  )
}

export async function fetchTendencia(f: ExecFilters, granularity: 'day' | 'month' | 'year' = 'month'): Promise<ExecTendencia> {
  const data = await fetchRpc<ExecTendencia>(
    buildUrl('tendencia', { desde: f.desde, hasta: f.hasta, asesor: f.asesorAuthId, granularity })
  )
  return data ?? []
}

// ── Zona 3 ──────────────────────────────────────────────────────────────────

export async function fetchFunnel(f: ExecFilters): Promise<ExecFunnel> {
  const data = await fetchRpc<ExecFunnel>(
    buildUrl('funnel', { desde: f.desde, hasta: f.hasta, asesor: f.asesorAuthId })
  )
  return data ?? []
}

export async function fetchSlaStats(f: ExecFilters): Promise<ExecSlaStats | null> {
  return fetchRpc<ExecSlaStats>(
    buildUrl('sla_stats', { desde: f.desde, hasta: f.hasta, asesor: f.asesorAuthId })
  )
}

export async function fetchCitasStats(f: ExecFilters): Promise<ExecCitasStats | null> {
  return fetchRpc<ExecCitasStats>(
    buildUrl('citas_stats', { desde: f.desde, hasta: f.hasta, asesor: f.asesorAuthId })
  )
}

export async function fetchMotivosDescarte(f: ExecFilters): Promise<ExecMotivosDescarte> {
  const data = await fetchRpc<ExecMotivosDescarte>(
    buildUrl('motivos_descarte', { desde: f.desde, hasta: f.hasta, asesor: f.asesorAuthId })
  )
  return data ?? []
}

export async function fetchPolizasPorTipo(f: ExecFilters): Promise<ExecPolizasPorTipo> {
  const data = await fetchRpc<ExecPolizasPorTipo>(
    buildUrl('polizas_por_tipo', { desde: f.desde, hasta: f.hasta, asesor: f.asesorAuthId })
  )
  return data ?? []
}

export async function fetchPolizasVencer(
  f: ExecFilters,
  dias = 60
): Promise<ExecPolizasVencer> {
  const data = await fetchRpc<ExecPolizasVencer>(
    buildUrl('polizas_vencer', { dias, asesor: f.asesorAuthId })
  )
  return data ?? []
}

// ── Zona 4 ──────────────────────────────────────────────────────────────────

export async function fetchTopAsesores(f: ExecFilters, limit = 10): Promise<ExecTopAsesores> {
  const data = await fetchRpc<ExecTopAsesores>(
    buildUrl('top_asesores', { desde: f.desde, hasta: f.hasta, limit })
  )
  return data ?? []
}

export async function fetchTopClientes(f: ExecFilters, limit = 10): Promise<ExecTopClientes> {
  const data = await fetchRpc<ExecTopClientes>(
    buildUrl('top_clientes', { asesor: f.asesorAuthId, limit })
  )
  return data ?? []
}

// =============================================================================
// HOOK: useExecDashboard
// Gestiona el estado global del dashboard y la carga paralela de todos los RPCs.
// =============================================================================

// ── Reducer ──────────────────────────────────────────────────────────────────

type Action =
  | { type: 'SET_FILTERS';       payload: ExecFilters }
  | { type: 'SET_ASESORES';      payload: ExecAsesor[] }
  | { type: 'SET_ALL_DATA';      payload: Partial<ExecDashboardState> }
  | { type: 'SET_LOADING';       payload: boolean }
  | { type: 'SET_ERROR';         payload: string | null }

function reducer(state: ExecDashboardState, action: Action): ExecDashboardState {
  switch (action.type) {
    case 'SET_FILTERS':
      return { ...state, filters: action.payload }
    case 'SET_ASESORES':
      return { ...state, asesores: action.payload }
    case 'SET_ALL_DATA':
      return { ...state, ...action.payload }
    case 'SET_LOADING':
      return { ...state, loading: action.payload }
    case 'SET_ERROR':
      return { ...state, error: action.payload }
    default:
      return state
  }
}

const initialState: ExecDashboardState = {
  filters:         defaultFilters(),
  asesores:        [],
  kpis:            null,
  tendencia:       [],
  funnel:          [],
  slaStats:        null,
  citasStats:      null,
  motivosDescarte: [],
  polizasPorTipo:  [],
  polizasVencer:   [],
  topAsesores:     [],
  topClientes:     [],
  loading:         false,
  error:           null,
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useExecDashboard() {
  const [state, dispatch] = useReducer(reducer, initialState)
  // Ref para cancelar fetches obsoletos cuando cambian los filtros
  const abortRef = useRef<AbortController | null>(null)

  /** Carga la lista de asesores (sólo una vez al montar) */
  const loadAsesores = useCallback(async () => {
    try {
      const asesores = await fetchAsesoresList()
      dispatch({ type: 'SET_ASESORES', payload: asesores })
    } catch (e) {
      console.warn('[exec-dashboard] Error cargando asesores:', e)
    }
  }, [])

  /** Carga todos los datos del dashboard en paralelo según los filtros actuales */
  const loadAll = useCallback(async (filters: ExecFilters) => {
    // Cancelar cualquier petición anterior
    abortRef.current?.abort()
    abortRef.current = new AbortController()

    dispatch({ type: 'SET_LOADING', payload: true })
    dispatch({ type: 'SET_ERROR',   payload: null })

    try {
      const [
        kpis,
        tendencia,
        funnel,
        slaStats,
        citasStats,
        motivosDescarte,
        polizasPorTipo,
        polizasVencer,
        topAsesores,
        topClientes,
      ] = await Promise.all([
        fetchKpis(filters),
        fetchTendencia(filters),
        fetchFunnel(filters),
        fetchSlaStats(filters),
        fetchCitasStats(filters),
        fetchMotivosDescarte(filters),
        fetchPolizasPorTipo(filters),
        fetchPolizasVencer(filters, 60),
        fetchTopAsesores(filters, 10),
        fetchTopClientes(filters, 10),
      ])

      dispatch({
        type: 'SET_ALL_DATA',
        payload: {
          kpis,
          tendencia,
          funnel,
          slaStats,
          citasStats,
          motivosDescarte,
          polizasPorTipo,
          polizasVencer,
          topAsesores,
          topClientes,
          loading: false,
          error:   null,
        },
      })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error cargando el dashboard'
      dispatch({ type: 'SET_ERROR',   payload: msg })
      dispatch({ type: 'SET_LOADING', payload: false })
    }
  }, [])

  // ── Efecto inicial: cargar asesores + datos ───────────────────────────────
  useEffect(() => {
    loadAsesores()
  }, [loadAsesores])

  useEffect(() => {
    loadAll(state.filters)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.filters, loadAll])

  // ── Realtime: recarga automática al detectar cambios en BD ────────────────
  useEffect(() => {
    let debounceTimer: ReturnType<typeof setTimeout> | null = null

    const triggerReload = () => {
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => {
        loadAll(state.filters)
      }, 2000)
    }

    const channel = supabase
      .channel('exec-dashboard-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'candidatos' }, triggerReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'polizas' }, triggerReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'planificaciones' }, triggerReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'prospectos' }, triggerReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'citas' }, triggerReload)
      .subscribe()

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer)
      supabase.removeChannel(channel)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.filters, loadAll])

  // ── Acciones expuestas ────────────────────────────────────────────────────

  /** Cambia el preset de fecha y recalcula el rango */
  const setPreset = useCallback((preset: DatePreset) => {
    const range = buildDateRange(preset)
    dispatch({
      type:    'SET_FILTERS',
      payload: { ...state.filters, preset, ...range },
    })
  }, [state.filters])

  /** Cambia el asesor filtrado (null = todos) */
  const setAsesor = useCallback((asesorAuthId: string | null) => {
    dispatch({
      type:    'SET_FILTERS',
      payload: { ...state.filters, asesorAuthId },
    })
  }, [state.filters])

  /** Establece un rango de fechas libre (sin preset fijo) */
  const setCustomRange = useCallback((desde: string, hasta: string) => {
    dispatch({
      type:    'SET_FILTERS',
      payload: { ...state.filters, preset: 'personalizado', desde, hasta },
    })
  }, [state.filters])

  /** Fuerza una recarga manual con los filtros actuales */
  const refresh = useCallback(() => {
    loadAll(state.filters)
  }, [state.filters, loadAll])

  return {
    // Estado
    ...state,
    // Acciones
    setPreset,
    setAsesor,
    setCustomRange,
    refresh,
  }
}
