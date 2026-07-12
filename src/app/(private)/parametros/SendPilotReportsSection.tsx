"use client"

import { useCallback, useEffect, useMemo, useState } from 'react'

type NotifyType = 'success' | 'danger' | 'info' | 'warning'

interface Props {
  onNotify: (message: string, type: NotifyType) => void
}

interface CampaignOption {
  id: string
  nombre: string
  sendpilot_campaign_id: string
  estado: string
}

interface ReportConfig {
  id: string
  nombre: string
  campana_id: string
  destinatarios: string[]
  frecuencia_dias: number
  activo: boolean
  ultimo_envio_at: string | null
  proximo_envio_at: string | null
  ultimo_resultado?: Record<string, unknown> | null
  created_at?: string
  updated_at?: string
  sp_campanas?: CampaignOption | CampaignOption[] | null
}

interface FormState {
  nombre: string
  campana_id: string
  destinatarios: string
  frecuencia_dias: number
  activo: boolean
}

const INITIAL_FORM: FormState = {
  nombre: 'Reporte SendPilot',
  campana_id: '',
  destinatarios: '',
  frecuencia_dias: 7,
  activo: true,
}

function formatDate(value?: string | null) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('es-MX', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

function relatedCampaign(config: ReportConfig): CampaignOption | null {
  if (!config.sp_campanas) return null
  return Array.isArray(config.sp_campanas) ? config.sp_campanas[0] ?? null : config.sp_campanas
}

export default function SendPilotReportsSection({ onNotify }: Props) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [configs, setConfigs] = useState<ReportConfig[]>([])
  const [campanas, setCampanas] = useState<CampaignOption[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(INITIAL_FORM)

  const selectedCampaign = useMemo(
    () => campanas.find(campaign => campaign.id === form.campana_id) || null,
    [campanas, form.campana_id]
  )

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/sendpilot-report-configs', { cache: 'no-store' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'No se pudo cargar la configuración')
      setConfigs(data.configs || [])
      setCampanas(data.campanas || [])
    } catch (error) {
      onNotify(error instanceof Error ? error.message : 'Error cargando reportes SendPilot', 'danger')
    } finally {
      setLoading(false)
    }
  }, [onNotify])

  useEffect(() => {
    if (open) void load()
  }, [open, load])

  const resetForm = () => {
    setEditingId(null)
    setForm(INITIAL_FORM)
  }

  const startEdit = (config: ReportConfig) => {
    setEditingId(config.id)
    setForm({
      nombre: config.nombre || 'Reporte SendPilot',
      campana_id: config.campana_id,
      destinatarios: (config.destinatarios || []).join(', '),
      frecuencia_dias: config.frecuencia_dias || 7,
      activo: config.activo,
    })
  }

  const save = async () => {
    if (!form.campana_id) {
      onNotify('Selecciona una campaña', 'warning')
      return
    }
    if (!form.destinatarios.trim()) {
      onNotify('Agrega al menos un correo destino', 'warning')
      return
    }
    setSaving(true)
    try {
      const payload = {
        nombre: form.nombre,
        campana_id: form.campana_id,
        destinatarios: form.destinatarios,
        frecuencia_dias: Number(form.frecuencia_dias),
        activo: form.activo,
      }
      const res = await fetch(
        editingId
          ? `/api/admin/sendpilot-report-configs/${editingId}`
          : '/api/admin/sendpilot-report-configs',
        {
          method: editingId ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      )
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'No se pudo guardar')
      onNotify(editingId ? 'Configuración actualizada' : 'Configuración creada', 'success')
      resetForm()
      await load()
    } catch (error) {
      onNotify(error instanceof Error ? error.message : 'Error guardando configuración', 'danger')
    } finally {
      setSaving(false)
    }
  }

  const remove = async (config: ReportConfig) => {
    const ok = window.confirm(`¿Eliminar el reporte programado "${config.nombre}"?`)
    if (!ok) return
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/sendpilot-report-configs/${config.id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'No se pudo eliminar')
      onNotify('Reporte programado eliminado', 'success')
      if (editingId === config.id) resetForm()
      await load()
    } catch (error) {
      onNotify(error instanceof Error ? error.message : 'Error eliminando configuración', 'danger')
    } finally {
      setSaving(false)
    }
  }

  const toggleActive = async (config: ReportConfig) => {
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/sendpilot-report-configs/${config.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activo: !config.activo }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'No se pudo actualizar')
      onNotify(!config.activo ? 'Reporte activado' : 'Reporte pausado', 'success')
      await load()
    } catch (error) {
      onNotify(error instanceof Error ? error.message : 'Error actualizando reporte', 'danger')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="border rounded p-3 bg-body shadow-sm">
      <div className="d-flex justify-content-between align-items-center flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setOpen(value => !value)}
          aria-expanded={open}
          className="btn btn-link text-decoration-none p-0 d-flex align-items-center gap-2"
        >
          <i className={`bi bi-caret-${open ? 'down' : 'right'}-fill`} />
          <span className="fw-bold small text-uppercase">Reportes SendPilot por correo</span>
        </button>
        {open && (
          <span className="badge text-bg-primary">Sólo admin</span>
        )}
      </div>

      {open && (
        <div className="mt-3">
          <p className="small text-muted mb-3">
            El workflow de GitHub revisa diariamente esta configuración. El CRM envía el reporte sólo cuando corresponda según la frecuencia configurada.
          </p>

          <div className="row g-3">
            <div className="col-lg-5">
              <div className="border rounded p-3 h-100">
                <h6 className="mb-3">{editingId ? 'Editar reporte' : 'Nuevo reporte programado'}</h6>
                <div className="mb-2">
                  <label className="form-label small mb-1">Nombre interno</label>
                  <input
                    className="form-control form-control-sm"
                    value={form.nombre}
                    onChange={e => setForm(prev => ({ ...prev, nombre: e.target.value }))}
                    placeholder="Reporte SendPilot semanal"
                  />
                </div>
                <div className="mb-2">
                  <label className="form-label small mb-1">Campaña SendPilot</label>
                  <select
                    className="form-select form-select-sm"
                    value={form.campana_id}
                    onChange={e => setForm(prev => ({ ...prev, campana_id: e.target.value }))}
                  >
                    <option value="">Seleccionar campaña...</option>
                    {campanas.map(campaign => (
                      <option key={campaign.id} value={campaign.id}>
                        {campaign.nombre} · {campaign.sendpilot_campaign_id}
                      </option>
                    ))}
                  </select>
                  {selectedCampaign && (
                    <div className="form-text">
                      Status local: {selectedCampaign.estado}
                    </div>
                  )}
                </div>
                <div className="mb-2">
                  <label className="form-label small mb-1">Correos destino</label>
                  <textarea
                    className="form-control form-control-sm"
                    rows={2}
                    value={form.destinatarios}
                    onChange={e => setForm(prev => ({ ...prev, destinatarios: e.target.value }))}
                    placeholder="correo1@dominio.com, correo2@dominio.com"
                  />
                  <div className="form-text">Puedes separar varios correos con coma, punto y coma o salto de línea.</div>
                </div>
                <div className="row g-2 align-items-end">
                  <div className="col-7">
                    <label className="form-label small mb-1">Enviar cada</label>
                    <div className="input-group input-group-sm">
                      <input
                        type="number"
                        min={1}
                        max={365}
                        className="form-control"
                        value={form.frecuencia_dias}
                        onChange={e => setForm(prev => ({ ...prev, frecuencia_dias: Number(e.target.value) }))}
                      />
                      <span className="input-group-text">días</span>
                    </div>
                  </div>
                  <div className="col-5">
                    <div className="form-check">
                      <input
                        id="sendpilot-report-active"
                        type="checkbox"
                        className="form-check-input"
                        checked={form.activo}
                        onChange={e => setForm(prev => ({ ...prev, activo: e.target.checked }))}
                      />
                      <label htmlFor="sendpilot-report-active" className="form-check-label small">Activo</label>
                    </div>
                  </div>
                </div>
                <div className="d-flex gap-2 mt-3">
                  <button type="button" className="btn btn-primary btn-sm" disabled={saving} onClick={save}>
                    {saving ? 'Guardando...' : editingId ? 'Guardar cambios' : 'Crear reporte'}
                  </button>
                  {editingId && (
                    <button type="button" className="btn btn-outline-secondary btn-sm" disabled={saving} onClick={resetForm}>
                      Cancelar
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="col-lg-7">
              <div className="border rounded p-3 h-100">
                <div className="d-flex justify-content-between align-items-center mb-2">
                  <h6 className="mb-0">Configuraciones</h6>
                  <button type="button" className="btn btn-outline-primary btn-sm" disabled={loading} onClick={load}>
                    Actualizar
                  </button>
                </div>
                {loading ? (
                  <div className="text-center py-4"><div className="spinner-border spinner-border-sm" /></div>
                ) : configs.length === 0 ? (
                  <div className="text-muted small">Aún no hay reportes programados.</div>
                ) : (
                  <div className="table-responsive">
                    <table className="table table-sm align-middle">
                      <thead>
                        <tr>
                          <th>Nombre</th>
                          <th>Campaña</th>
                          <th>Frecuencia</th>
                          <th>Próximo envío</th>
                          <th>Último envío</th>
                          <th className="text-end">Acciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {configs.map(config => {
                          const campaign = relatedCampaign(config)
                          return (
                            <tr key={config.id}>
                              <td>
                                <div className="fw-semibold">{config.nombre}</div>
                                <div className="small text-muted">
                                  {(config.destinatarios || []).join(', ')}
                                </div>
                                <span className={`badge ${config.activo ? 'text-bg-success' : 'text-bg-secondary'}`}>
                                  {config.activo ? 'Activo' : 'Pausado'}
                                </span>
                              </td>
                              <td>
                                <div>{campaign?.nombre || config.campana_id}</div>
                                {campaign?.sendpilot_campaign_id && (
                                  <div className="small text-muted">{campaign.sendpilot_campaign_id}</div>
                                )}
                              </td>
                              <td>Cada {config.frecuencia_dias} día{config.frecuencia_dias === 1 ? '' : 's'}</td>
                              <td>{formatDate(config.proximo_envio_at)}</td>
                              <td>{formatDate(config.ultimo_envio_at)}</td>
                              <td className="text-end">
                                <div className="btn-group btn-group-sm">
                                  <button type="button" className="btn btn-outline-secondary" disabled={saving} onClick={() => startEdit(config)}>
                                    Editar
                                  </button>
                                  <button type="button" className="btn btn-outline-warning" disabled={saving} onClick={() => toggleActive(config)}>
                                    {config.activo ? 'Pausar' : 'Activar'}
                                  </button>
                                  <button type="button" className="btn btn-outline-danger" disabled={saving} onClick={() => remove(config)}>
                                    Eliminar
                                  </button>
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
