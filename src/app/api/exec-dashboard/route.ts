/**
 * API Route: /api/exec-dashboard
 * Dashboard Ejecutivo — proxy hacia las funciones RPC de Supabase.
 *
 * Sólo accesible para usuarios con rol admin o supervisor.
 * Llama a las RPCs usando service role (SECURITY DEFINER en el DB permite
 * llamadas sin auth.uid() cuando provienen del servidor).
 *
 * Query params:
 *   rpc      — nombre del RPC (ver ExecRpc en types/exec-dashboard.ts)
 *   desde    — fecha inicio YYYY-MM-DD (opcional)
 *   hasta    — fecha fin   YYYY-MM-DD (opcional)
 *   asesor   — UUID del asesor (opcional, null = todos)
 *   dias     — días de alerta para polizas_vencer (default 60)
 *   limit    — límite para top_ (default 10)
 */

import { NextRequest, NextResponse } from 'next/server'
import { ensureSuper } from '@/lib/apiGuards'
import { getServiceClient } from '@/lib/supabaseAdmin'

export const runtime = 'nodejs'

// Helper: convierte el string 'null'/'undefined'/vacío a null real
function toUUID(v: string | null): string | null {
  if (!v || v === 'null' || v === 'undefined' || v.trim() === '') return null
  return v.trim()
}

function toDate(v: string | null): string | null {
  if (!v || v === 'null' || v === 'undefined' || v.trim() === '') return null
  return v.trim()
}

function toInt(v: string | null, fallback: number): number {
  if (!v) return fallback
  const n = parseInt(v, 10)
  return isNaN(n) ? fallback : n
}

export async function GET(req: NextRequest) {
  // ── Verificar sesión + super rol ──────────────────────────────────────────
  const guard = await ensureSuper(req)
  if (guard.kind === 'error') return guard.response

  const sp   = req.nextUrl.searchParams
  const rpc  = sp.get('rpc') ?? ''
  const desde  = toDate(sp.get('desde'))
  const hasta  = toDate(sp.get('hasta'))
  const asesor = toUUID(sp.get('asesor'))
  const dias   = toInt(sp.get('dias'), 60)
  const limit  = toInt(sp.get('limit'), 10)

  const sb = getServiceClient()

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let result: any = null

    switch (rpc) {
      // ── Zona 1: Filtros ────────────────────────────────────────────────
      case 'asesores_list': {
        const { data, error } = await sb.rpc('rpc_exec_asesores_list')
        if (error) throw error
        result = data
        break
      }

      // ── Zona 2: KPIs ──────────────────────────────────────────────────
      case 'kpis': {
        const { data, error } = await sb.rpc('rpc_exec_kpis', {
          p_desde:          desde  ?? null,
          p_hasta:          hasta  ?? null,
          p_asesor_auth_id: asesor ?? null,
        })
        if (error) throw error
        result = data
        break
      }

      case 'tendencia': {
        const { data, error } = await sb.rpc('rpc_exec_tendencia', {
          p_desde:          desde  ?? null,
          p_hasta:          hasta  ?? null,
          p_asesor_auth_id: asesor ?? null,
        })
        if (error) throw error
        result = data
        break
      }

      // ── Zona 3: Conversión y actividad ────────────────────────────────
      case 'funnel': {
        const { data, error } = await sb.rpc('rpc_exec_funnel', {
          p_desde:          desde  ?? null,
          p_hasta:          hasta  ?? null,
          p_asesor_auth_id: asesor ?? null,
        })
        if (error) throw error
        result = data
        break
      }

      case 'sla_stats': {
        const { data, error } = await sb.rpc('rpc_exec_sla_stats', {
          p_desde:          desde  ?? null,
          p_hasta:          hasta  ?? null,
          p_asesor_auth_id: asesor ?? null,
        })
        if (error) throw error
        result = data
        break
      }

      case 'citas_stats': {
        const { data, error } = await sb.rpc('rpc_exec_citas_stats', {
          p_desde:          desde  ?? null,
          p_hasta:          hasta  ?? null,
          p_asesor_auth_id: asesor ?? null,
        })
        if (error) throw error
        result = data
        break
      }

      case 'motivos_descarte': {
        const { data, error } = await sb.rpc('rpc_exec_motivos_descarte', {
          p_desde:          desde  ?? null,
          p_hasta:          hasta  ?? null,
          p_asesor_auth_id: asesor ?? null,
        })
        if (error) throw error
        result = data
        break
      }

      case 'polizas_por_tipo': {
        const { data, error } = await sb.rpc('rpc_exec_polizas_por_tipo', {
          p_asesor_auth_id: asesor ?? null,
        })
        if (error) throw error
        result = data
        break
      }

      case 'polizas_vencer': {
        const { data, error } = await sb.rpc('rpc_exec_polizas_vencer', {
          p_dias_alerta:    dias,
          p_asesor_auth_id: asesor ?? null,
        })
        if (error) throw error
        result = data
        break
      }

      // ── Zona 4: Leaderboards ──────────────────────────────────────────
      case 'top_asesores': {
        const { data, error } = await sb.rpc('rpc_exec_top_asesores', {
          p_desde: desde ?? null,
          p_hasta: hasta ?? null,
          p_limit: limit,
        })
        if (error) throw error
        result = data
        break
      }

      case 'top_clientes': {
        const { data, error } = await sb.rpc('rpc_exec_top_clientes', {
          p_asesor_auth_id: asesor ?? null,
          p_limit:          limit,
        })
        if (error) throw error
        result = data
        break
      }

      default:
        return NextResponse.json(
          { data: null, error: `RPC desconocido: "${rpc}"` },
          { status: 400 }
        )
    }

    return NextResponse.json({ data: result, error: null })
  } catch (err: unknown) {
    const msg = err instanceof Error
      ? err.message
      : (err as { message?: string })?.message ?? 'Error desconocido'
    console.error('[exec-dashboard] RPC error:', rpc, msg)
    return NextResponse.json({ data: null, error: msg }, { status: 500 })
  }
}
