'use client'

import { useEffect } from 'react'
import { useAuth } from '@/context/AuthProvider'
import { normalizeRole } from '@/lib/roles'
import FullScreenLoader from '@/components/ui/FullScreenLoader'
import { useExecDashboard } from '@/lib/execDashboard'
import { formatCurrency } from '@/lib/format'
import type { DatePreset, ExecFilters } from '@/types/exec-dashboard'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, CartesianGrid, Legend,
  PieChart, Pie, Cell,
} from 'recharts'

// ── Constantes de color ──────────────────────────────────────────────────────
const BRAND = '#072e40'
const PIE_COLORS = ['#0d6efd', '#198754', '#ffc107', '#dc3545', '#6f42c1', '#0dcaf0']

// ── Helper: badge de estado de pólizas por vencer ───────────────────────────
function VencerBadge({ dias }: { dias: number }) {
  if (dias <= 7) return <span className="badge bg-danger">{dias}d</span>
  if (dias <= 30) return <span className="badge bg-warning text-dark">{dias}d</span>
  return <span className="badge bg-info text-dark">{dias}d</span>
}

/** Formatea una fecha ISO/YYYY-MM-DD en zona horaria CDMX (America/Mexico_City). */
function fmtCDMX(iso: string | null | undefined): string {
  if (!iso) return '—'
  // Append T00:00:00 so dates without time are treated as local midnight
  const d = iso.includes('T') ? new Date(iso) : new Date(`${iso}T00:00:00`)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleDateString('es-MX', {
    timeZone: 'America/Mexico_City',
    day: '2-digit', month: 'short', year: 'numeric',
  })
}

// ── Zona 1: Filtros ──────────────────────────────────────────────────────────
function FiltersBar({
  filters,
  asesoresList,
  onPreset,
  onCustomRange,
  onAsesor,
  onRefresh,
  loading,
}: {
  filters: ExecFilters
  asesoresList: Array<{ usuario_id: number; asesor_auth_id: string; nombre: string; email: string }>
  onPreset: (p: DatePreset) => void
  onCustomRange: (desde: string, hasta: string) => void
  onAsesor: (id: string | null) => void
  onRefresh: () => void
  loading: boolean
}) {
  const presets: { value: DatePreset; label: string }[] = [
    { value: 'mes_actual',    label: 'Este mes' },
    { value: 'trimestre',     label: 'Trimestre' },
    { value: 'anio',          label: 'Este año' },
    { value: 'anio_anterior', label: 'Año anterior' },
  ]

  return (
    <div className="card border-0 shadow-sm mb-4">
      <div className="card-body py-3">
        <div className="d-flex flex-wrap align-items-center gap-3">
          {/* Presets */}
          <div className="btn-group" role="group">
            {presets.map((p) => (
              <button
                key={p.value}
                type="button"
                className={`btn btn-sm ${filters.preset === p.value ? 'btn-primary' : 'btn-outline-primary'}`}
                onClick={() => onPreset(p.value)}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Rango de fechas editable */}
          <div className="d-flex align-items-center gap-1">
            <input
              type="date"
              className="form-control form-control-sm"
              style={{ width: 140 }}
              value={filters.desde}
              onChange={e => onCustomRange(e.target.value, filters.hasta)}
            />
            <span className="text-muted small">→</span>
            <input
              type="date"
              className="form-control form-control-sm"
              style={{ width: 140 }}
              value={filters.hasta}
              min={filters.desde}
              onChange={e => onCustomRange(filters.desde, e.target.value)}
            />
          </div>

          {/* Filtro por asesor */}
          <select
            className="form-select form-select-sm"
            style={{ maxWidth: 220 }}
            value={filters.asesorAuthId ?? ''}
            onChange={(e) => onAsesor(e.target.value || null)}
          >
            <option value="">Todos los asesores</option>
            {asesoresList.map((a) => (
              <option key={a.asesor_auth_id} value={a.asesor_auth_id}>
                {a.nombre || a.email}
              </option>
            ))}
          </select>

          {/* Refresh */}
          <button
            className="btn btn-sm btn-outline-secondary ms-auto"
            onClick={onRefresh}
            disabled={loading}
          >
            <i className={`bi bi-arrow-clockwise ${loading ? 'spin' : ''}`}></i>{' '}
            {loading ? 'Cargando…' : 'Actualizar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Zona 2a: Tarjetas KPI ────────────────────────────────────────────────────
function KpiCard({
  icon, label, value, sub, color = 'primary',
}: {
  icon: string; label: string; value: string | number | null; sub?: string; color?: string
}) {
  return (
    <div className="col-6 col-md-4 col-xl-3">
      <div className={`card border-0 shadow-sm border-start border-4 border-${color} h-100`}>
        <div className="card-body py-3 d-flex gap-3 align-items-center">
          <div className={`fs-3 text-${color}`}>
            <i className={`bi bi-${icon}`}></i>
          </div>
          <div>
            <div className="fw-bold fs-5 lh-1">{value ?? '—'}</div>
            <div className="small text-muted">{label}</div>
            {sub && <div className="text-muted" style={{ fontSize: '0.72rem' }}>{sub}</div>}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Zona 3a: Funnel ──────────────────────────────────────────────────────────
function FunnelSection({ steps }: { steps: Array<{ label: string; count: number; porcentaje: number }> }) {
  return (
    <div className="card border-0 shadow-sm h-100">
      <div className="card-header bg-transparent fw-semibold border-0 pt-3 pb-0">
        <i className="bi bi-filter me-2 text-primary"></i>Embudo de candidatos
      </div>
      <div className="card-body pt-2">
        {steps.map((s, i) => (
          <div key={i} className="mb-3">
            <div className="d-flex justify-content-between small mb-1">
              <span>{s.label}</span>
              <span className="fw-semibold">{s.count} <span className="text-muted">({s.porcentaje.toFixed(0)}%)</span></span>
            </div>
            <div className="progress" style={{ height: 10 }}>
              <div
                className="progress-bar bg-primary"
                style={{ width: `${Math.max(s.porcentaje, 2)}%`, backgroundColor: BRAND }}
              />
            </div>
          </div>
        ))}
        {steps.length === 0 && <div className="text-muted small">Sin datos</div>}
      </div>
    </div>
  )
}

// ── Zona 3b: SLA stats ───────────────────────────────────────────────────────
function SlaSection({
  data,
}: {
  data: { tiempo_primer_contacto_dias: number | null; tiempo_cierre_dias: number | null; sin_primer_contacto: number; muestra_total: number } | null
}) {
  if (!data) return null
  return (
    <div className="card border-0 shadow-sm h-100">
      <div className="card-header bg-transparent fw-semibold border-0 pt-3 pb-0">
        <i className="bi bi-stopwatch me-2 text-warning"></i>SLA tiempos
      </div>
      <div className="card-body py-3">
        <div className="row g-2">
          {[
            { label: 'Días 1er contacto', value: data.tiempo_primer_contacto_dias != null ? data.tiempo_primer_contacto_dias.toFixed(1) : '—', icon: 'send', color: 'info' },
            { label: 'Días a cierre', value: data.tiempo_cierre_dias != null ? data.tiempo_cierre_dias.toFixed(1) : '—', icon: 'flag', color: 'success' },
            { label: 'Sin contacto', value: data.sin_primer_contacto, icon: 'exclamation-triangle', color: 'danger' },
            { label: 'Muestra', value: data.muestra_total, icon: 'database', color: 'secondary' },
          ].map((item) => (
            <div key={item.label} className="col-6">
              <div className={`p-2 rounded bg-${item.color} bg-opacity-10 text-center`}>
                <div className={`fw-bold text-${item.color}`}>{item.value}</div>
                <div className="text-muted" style={{ fontSize: '0.72rem' }}>{item.label}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Zona 3c: Motivos descarte ────────────────────────────────────────────────
function MotivosSection({ motivos }: { motivos: Array<{ motivo: string; count: number }> }) {
  const max = Math.max(...motivos.map((m) => m.count), 1)
  return (
    <div className="card border-0 shadow-sm h-100">
      <div className="card-header bg-transparent fw-semibold border-0 pt-3 pb-0">
        <i className="bi bi-x-circle me-2 text-danger"></i>Motivos de descarte
      </div>
      <div className="card-body pt-2">
        {motivos.length === 0 && <div className="text-muted small">Sin datos</div>}
        {motivos.map((m) => (
          <div key={m.motivo} className="mb-2">
            <div className="d-flex justify-content-between small mb-1">
              <span className="text-truncate" style={{ maxWidth: '75%' }}>{m.motivo || 'Sin motivo'}</span>
              <span className="fw-semibold">{m.count}</span>
            </div>
            <div className="progress" style={{ height: 7 }}>
              <div className="progress-bar bg-danger" style={{ width: `${(m.count / max) * 100}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Zona 3d: Pólizas por tipo ────────────────────────────────────────────────
function PolizasTipoSection({ tipos }: { tipos: Array<{ tipo: string; count: number; prima_total: number }> }) {
  return (
    <div className="card border-0 shadow-sm h-100">
      <div className="card-header bg-transparent fw-semibold border-0 pt-3 pb-0">
        <i className="bi bi-pie-chart me-2 text-info"></i>Pólizas por tipo
      </div>
      <div className="card-body py-2">
        {tipos.length === 0 && <div className="text-muted small">Sin datos</div>}
        {tipos.length > 0 && (
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              <Pie data={tipos} dataKey="count" nameKey="tipo" cx="50%" cy="50%" outerRadius={70} label={(entry: any) => `${entry.tipo}: ${entry.count}`}>
                {tipos.map((_, i) => (
                  <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(v: number | string | undefined) => [v ?? 0, 'Pólizas']} />
            </PieChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}

// ── Zona 3e: Pólizas por vencer ──────────────────────────────────────────────
function PolizasVencerSection({
  polizas,
}: {
  polizas: Array<{ poliza_id: string | number; numero_poliza: string; cliente: string; asesor: string; fecha_renovacion: string; dias_restantes: number; prima_mxn: number; tipo_producto: string }>
}) {
  return (
    <div className="card border-0 shadow-sm">
      <div className="card-header bg-transparent fw-semibold border-0 pt-3 pb-0">
        <i className="bi bi-alarm me-2 text-danger"></i>Pólizas próximas a vencer
        <span className="badge bg-secondary ms-2">{polizas.length}</span>
      </div>
      <div className="card-body p-0">
        {polizas.length === 0 && <div className="text-muted small p-3">Sin pólizas próximas a vencer</div>}
        {polizas.length > 0 && (
          <div className="table-responsive">
            <table className="table table-sm table-hover mb-0 align-middle">
              <thead className="table-light">
                <tr>
                  <th>Póliza</th>
                  <th>Cliente</th>
                  <th>Asesor</th>
                  <th>Tipo</th>
                  <th>Renovación</th>
                  <th>Días</th>
                  <th className="text-end">Prima</th>
                </tr>
              </thead>
              <tbody>
                {polizas.map((p, idx) => (
                  <tr key={`${p.poliza_id}-${idx}`}>
                    <td><code className="small">{p.numero_poliza}</code></td>
                    <td className="small">{p.cliente}</td>
                    <td className="small text-muted">{p.asesor}</td>
                    <td><span className="badge bg-info text-dark">{p.tipo_producto}</span></td>
                    <td className="small">{fmtCDMX(p.fecha_renovacion)}</td>
                    <td><VencerBadge dias={p.dias_restantes} /></td>
                    <td className="text-end small">{formatCurrency(p.prima_mxn)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Zona 4a: Top Asesores ────────────────────────────────────────────────────
function TopAsesoresSection({
  asesores,
}: {
  asesores: Array<{ usuario_id: number; nombre: string; clientes_total: number; polizas_activas: number; ingreso_generado: number; candidatos_nuevos: number; conversion_pct: number }>
}) {
  return (
    <div className="card border-0 shadow-sm">
      <div className="card-header bg-transparent fw-semibold border-0 pt-3 pb-0">
        <i className="bi bi-star me-2 text-warning"></i>Top asesores
      </div>
      <div className="card-body p-0">
        <div className="table-responsive">
          <table className="table table-sm table-hover mb-0 align-middle">
            <thead className="table-light">
              <tr>
                <th>#</th>
                <th>Asesor</th>
                <th className="text-center">Clientes</th>
                <th className="text-center">Pólizas</th>
                <th className="text-center">Candidatos</th>
                <th className="text-center">Conv %</th>
                <th className="text-end">Ingreso</th>
              </tr>
            </thead>
            <tbody>
              {asesores.map((a, i) => (
                <tr key={a.usuario_id}>
                  <td>
                    {i === 0 ? <span className="badge bg-warning text-dark">1°</span> : i === 1 ? <span className="badge bg-secondary">2°</span> : i === 2 ? <span className="badge" style={{ backgroundColor: '#cd7f32' }}>3°</span> : <span className="text-muted">{i + 1}</span>}
                  </td>
                  <td className="fw-medium">{a.nombre}</td>
                  <td className="text-center">{a.clientes_total}</td>
                  <td className="text-center">{a.polizas_activas}</td>
                  <td className="text-center">{a.candidatos_nuevos}</td>
                  <td className="text-center">
                    <span className={`badge ${a.conversion_pct >= 30 ? 'bg-success' : a.conversion_pct >= 15 ? 'bg-warning text-dark' : 'bg-secondary'}`}>
                      {a.conversion_pct.toFixed(0)}%
                    </span>
                  </td>
                  <td className="text-end">{formatCurrency(a.ingreso_generado)}</td>
                </tr>
              ))}
              {asesores.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-muted text-center small py-3">Sin datos</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ── Zona 4b: Top Clientes ────────────────────────────────────────────────────
function TopClientesSection({
  clientes,
}: {
  clientes: Array<{ cliente_id: string | number; nombre: string; asesor: string; polizas_activas: number; valor_total: number }>
}) {
  return (
    <div className="card border-0 shadow-sm">
      <div className="card-header bg-transparent fw-semibold border-0 pt-3 pb-0">
        <i className="bi bi-people me-2 text-success"></i>Top clientes por valor
      </div>
      <div className="card-body p-0">
        <div className="table-responsive">
          <table className="table table-sm table-hover mb-0 align-middle">
            <thead className="table-light">
              <tr>
                <th>#</th>
                <th>Cliente</th>
                <th>Asesor</th>
                <th className="text-center">Pólizas</th>
                <th className="text-end">Valor total</th>
              </tr>
            </thead>
            <tbody>
              {clientes.map((c, i) => (
                <tr key={c.cliente_id}>
                  <td><span className="text-muted small">{i + 1}</span></td>
                  <td className="fw-medium">{c.nombre}</td>
                  <td className="small text-muted">{c.asesor}</td>
                  <td className="text-center">{c.polizas_activas}</td>
                  <td className="text-end fw-semibold">{formatCurrency(c.valor_total)}</td>
                </tr>
              ))}
              {clientes.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-muted text-center small py-3">Sin datos</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// PÁGINA PRINCIPAL
// ════════════════════════════════════════════════════════════════════════════
export default function ExecutiveDashboardPage() {
  const { user, loadingUser } = useAuth()

  // Guard de rol
  const role = normalizeRole(user?.rol) ?? (user?.rol ?? '').toLowerCase()
  const notAllowed = !loadingUser && user && role !== 'admin'

  useEffect(() => {
    if (notAllowed) window.location.replace('/home')
  }, [notAllowed])

  const {
    filters, asesores, kpis, tendencia, funnel, slaStats,
    citasStats, motivosDescarte, polizasPorTipo, polizasVencer,
    topAsesores, topClientes, loading, error,
    setPreset, setAsesor, setCustomRange, refresh,
  } = useExecDashboard()

  if (loadingUser) return <FullScreenLoader text="Cargando sesión…" />
  if (!user || notAllowed) return <FullScreenLoader text="Redirigiendo…" />

  // ── KPI helpers ─────────────────────────────────────────────────────────
  const kpiCards = kpis
    ? [
        { icon: 'person-plus', label: 'Candidatos', value: kpis.total_candidatos ?? 0, color: 'primary' },
        { icon: 'person-check', label: 'Agentes conectados', value: kpis.total_ganados ?? 0, color: 'success' },
        { icon: 'people', label: 'Clientes', value: kpis.total_clientes ?? 0, color: 'info' },
        { icon: 'file-earmark-check', label: 'Pólizas emitidas', value: kpis.polizas_activas ?? 0, color: 'warning' },
        { icon: 'file-earmark-x', label: 'Pólizas canceladas', value: kpis.polizas_canceladas ?? 0, color: 'danger' },
        {
          icon: 'cash-stack',
          label: 'Ingreso emitido (periodo)',
          value: formatCurrency(kpis.ingreso_mxn),
          color: 'success',
        },
        {
          icon: 'lightning-charge',
          label: 'Proyección fin de mes',
          value: formatCurrency(kpis.proyeccion_fin_mes),
          sub: `${kpis.dias_transcurridos}/${kpis.dias_mes} días`,
          color: 'warning',
        },
      ]
    : []

  // ── Trend chart data ─────────────────────────────────────────────────────
  const trendData = (tendencia ?? []).map((t) => ({
    mes: t.mes_label,
    Ingreso: t.ingreso_emitido,
    'Mes conexión': t.ganados,
    Candidatos: t.nuevos_candidatos,
  }))

  // ── Citas stats ──────────────────────────────────────────────────────────
  const citasResumen = citasStats
    ? [
        { label: 'Total citas', value: citasStats.total, icon: 'calendar2-check', color: 'primary' },
        { label: 'Confirmadas', value: citasStats.confirmadas, icon: 'check-circle', color: 'success' },
        { label: 'Completadas', value: citasStats.completadas, icon: 'patch-check', color: 'info' },
        { label: 'Canceladas', value: citasStats.canceladas, icon: 'x-circle', color: 'danger' },
      ]
    : []

  return (
    <div className="container-xl py-4">
      {/* Header */}
      <div className="d-flex align-items-center gap-3 mb-4">
        <div className="fs-1 text-primary"><i className="bi bi-graph-up-arrow"></i></div>
        <div>
          <h4 className="mb-0 fw-bold">Centro de Control</h4>
          <p className="text-muted mb-0 small">Dashboard ejecutivo — exclusivo administradores</p>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="alert alert-danger d-flex align-items-center gap-2 mb-3">
          <i className="bi bi-exclamation-triangle-fill"></i>
          {error}
        </div>
      )}

      {/* ── ZONA 1: Filtros ─────────────────────────────────────────────── */}
      <FiltersBar
        filters={filters}
        asesoresList={asesores ?? []}
        onPreset={setPreset}        onCustomRange={setCustomRange}        onAsesor={setAsesor}
        onRefresh={refresh}
        loading={loading}
      />

      {loading && !kpis && (
        <div className="text-center py-5 text-muted">
          <div className="spinner-border spinner-border-sm me-2"></div>
          Cargando dashboard…
        </div>
      )}

      {/* ── ZONA 2: KPIs ────────────────────────────────────────────────── */}
      {kpis && (
        <>
          <h6 className="text-uppercase text-muted small mb-3 fw-semibold">
            <i className="bi bi-speedometer2 me-2"></i>KPIs del periodo
          </h6>
          <div className="row g-3 mb-4">
            {kpiCards.map((c) => (
              <KpiCard key={c.label} icon={c.icon} label={c.label} value={c.value} sub={c.sub} color={c.color} />
            ))}
          </div>
        </>
      )}

      {/* ── Prospectos por estado ───────────────────────────────────────── */}
      {kpis && (
        <div className="card border-0 shadow-sm mb-4">
          <div className="card-header bg-transparent fw-semibold border-0 pt-3 pb-0">
            <i className="bi bi-funnel me-2 text-secondary"></i>Prospectos por estado (periodo)
          </div>
          <div className="card-body py-3">
            <div className="row g-3 text-center">
              {[
                { label: 'Pendiente',    value: kpis.prospectos_pendiente,   color: 'secondary' },
                { label: 'Seguimiento',  value: kpis.prospectos_seguimiento, color: 'info'      },
                { label: 'Con cita',     value: kpis.prospectos_con_cita,    color: 'success'   },
                { label: 'Descartado',   value: kpis.prospectos_descartado,  color: 'danger'    },
              ].map((s) => (
                <div key={s.label} className="col-6 col-md-3">
                  <div className={`p-3 rounded bg-${s.color} bg-opacity-10`}>
                    <div className={`fw-bold fs-4 text-${s.color}`}>{s.value ?? 0}</div>
                    <div className="small text-muted">{s.label}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── ZONA 2b: Tendencia ──────────────────────────────────────────── */}
      {trendData.length > 0 && (
        <div className="card border-0 shadow-sm mb-4">
          <div className="card-header bg-transparent fw-semibold border-0 pt-3 pb-0">
            <i className="bi bi-bar-chart-line me-2 text-primary"></i>Tendencia mensual
          </div>
          <div className="card-body">
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={trendData} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="mes" tick={{ fontSize: 12 }} />
                <YAxis yAxisId="left" orientation="left" tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number | string | undefined, name: string | undefined) => name === 'Ingreso' ? [formatCurrency(Number(v ?? 0)), name] : [v ?? 0, name ?? '']} />
                <Legend />
                <Line yAxisId="left" type="monotone" dataKey="Ingreso" stroke="#0d6efd" strokeWidth={2} dot={false} />
                <Line yAxisId="right" type="monotone" dataKey="Mes conexión" stroke="#198754" strokeWidth={2} dot={{ r: 3 }} />
                <Line yAxisId="right" type="monotone" dataKey="Candidatos" stroke="#ffc107" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* ── ZONA 3: Actividad Comercial ──────────────────────────────────── */}
      <h6 className="text-uppercase text-muted small mb-3 fw-semibold">
        <i className="bi bi-activity me-2"></i>Conversión y actividad
      </h6>

      <div className="row g-3 mb-4">
        {/* Funnel */}
        <div className="col-md-6 col-xl-4">
          <FunnelSection steps={funnel ?? []} />
        </div>

        {/* SLA */}
        <div className="col-md-6 col-xl-4">
          {slaStats && <SlaSection data={slaStats} />}
        </div>

        {/* Citas resumen */}
        {citasStats && (
          <div className="col-md-6 col-xl-4">
            <div className="card border-0 shadow-sm h-100">
              <div className="card-header bg-transparent fw-semibold border-0 pt-3 pb-0">
                <i className="bi bi-calendar-check me-2 text-success"></i>Citas
              </div>
              <div className="card-body">
                <div className="row g-2">
                  {citasResumen.map((c) => (
                    <div key={c.label} className="col-6">
                      <div className={`p-2 rounded bg-${c.color} bg-opacity-10 text-center`}>
                        <div className={`fw-bold text-${c.color} fs-5`}>{c.value}</div>
                        <div className="text-muted" style={{ fontSize: '0.72rem' }}>{c.label}</div>
                      </div>
                    </div>
                  ))}
                </div>
                {/* Mini bar chart by month */}
                {(citasStats.por_mes ?? []).length > 0 && (
                  <div className="mt-3">
                    <ResponsiveContainer width="100%" height={100}>
                      <BarChart data={citasStats.por_mes} margin={{ top: 0, right: 5, bottom: 0, left: -20 }}>
                        <XAxis dataKey="mes" tick={{ fontSize: 10 }} />
                        <Tooltip />
                        <Bar dataKey="total" fill="#0d6efd" radius={[2, 2, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Motivos descarte */}
        <div className="col-md-6 col-xl-4">
          <MotivosSection motivos={motivosDescarte ?? []} />
        </div>

        {/* Pólizas por tipo */}
        <div className="col-md-6 col-xl-4">
          <PolizasTipoSection tipos={polizasPorTipo ?? []} />
        </div>
      </div>

      {/* Pólizas por vencer */}
      {(polizasVencer ?? []).length > 0 && (
        <div className="mb-4">
          <PolizasVencerSection polizas={polizasVencer ?? []} />
        </div>
      )}

      {/* ── ZONA 4: Leaderboards ─────────────────────────────────────────── */}
      <h6 className="text-uppercase text-muted small mb-3 fw-semibold">
        <i className="bi bi-trophy me-2"></i>Leaderboards
      </h6>
      <div className="row g-3 mb-5">
        <div className="col-12 col-xl-7">
          <TopAsesoresSection asesores={topAsesores ?? []} />
        </div>
        <div className="col-12 col-xl-5">
          <TopClientesSection clientes={topClientes ?? []} />
        </div>
      </div>

      {/* Footer info */}
      <div className="text-center text-muted small pb-3">
        Periodo: {filters.desde} → {filters.hasta}
        {filters.asesorAuthId && ` · Asesor filtrado`}
      </div>
    </div>
  )
}
