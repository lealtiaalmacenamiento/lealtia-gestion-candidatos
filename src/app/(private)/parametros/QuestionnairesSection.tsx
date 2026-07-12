'use client'

import { useEffect, useState } from 'react'
import type {
  Questionnaire,
  QuestionnaireQuestion,
  QuestionnaireQuestionType,
  QuestionnaireSection
} from '@/types'

type Notify = (message: string, type: 'success' | 'danger' | 'info' | 'warning') => void

const QUESTION_TYPES: Array<{ value: QuestionnaireQuestionType; label: string }> = [
  { value: 'texto', label: 'Texto corto' },
  { value: 'texto_largo', label: 'Texto largo' },
  { value: 'email', label: 'Correo' },
  { value: 'telefono', label: 'Teléfono' },
  { value: 'numero', label: 'Número' },
  { value: 'fecha', label: 'Fecha' },
  { value: 'seleccion', label: 'Selección única' },
  { value: 'multiple', label: 'Selección múltiple' },
  { value: 'booleano', label: 'Sí / No' }
]

const SEMANTICS: Array<{ value: QuestionnaireQuestion['semantica']; label: string }> = [
  { value: 'otro', label: 'Respuesta general' },
  { value: 'nombre', label: 'Nombre del prospecto' },
  { value: 'email', label: 'Correo del prospecto' },
  { value: 'telefono', label: 'Teléfono del prospecto' },
  { value: 'edad', label: 'Edad para PPR' }
]

function uid(prefix: string) {
  const random = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID().slice(0, 8)
    : Math.random().toString(36).slice(2, 10)
  return `${prefix}_${random}`
}

function emptyQuestion(): QuestionnaireQuestion {
  return {
    id: uid('pregunta'),
    etiqueta: '',
    tipo: 'texto',
    semantica: 'otro',
    requerida: false
  }
}

function emptySection(): QuestionnaireSection {
  return {
    id: uid('seccion'),
    titulo: 'Nueva sección',
    preguntas: [emptyQuestion()]
  }
}

function emptyDraft(): Omit<Questionnaire, 'id' | 'version'> {
  return {
    slug: '',
    titulo: '',
    descripcion: '',
    activo: true,
    requiere_ppr: true,
    secciones: [emptySection()]
  }
}

export default function QuestionnairesSection({ onNotify }: { onNotify: Notify }) {
  const [open, setOpen] = useState(false)
  const [rows, setRows] = useState<Questionnaire[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<Omit<Questionnaire, 'id' | 'version'>>(emptyDraft())
  const [landingQuestionnaireId, setLandingQuestionnaireId] = useState('')
  const [landingSaving, setLandingSaving] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const response = await fetch('/api/cuestionarios', { cache: 'no-store' })
      const json = await response.json()
      if (!response.ok) throw new Error(json.error || 'No se pudieron cargar los cuestionarios')
      setRows(json.questionnaires || [])
      const configResponse = await fetch('/api/cuestionarios/landing-config', { cache: 'no-store' })
      if (configResponse.ok) {
        const configJson = await configResponse.json()
        setLandingQuestionnaireId(configJson.questionnaire_id || '')
      }
    } catch (error) {
      onNotify(error instanceof Error ? error.message : 'No se pudieron cargar los cuestionarios', 'danger')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (open && rows.length === 0) void load()
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  function startNew() {
    setEditingId('new')
    setDraft(emptyDraft())
  }

  function startEdit(row: Questionnaire) {
    setEditingId(row.id)
    setDraft({
      slug: row.slug,
      titulo: row.titulo,
      descripcion: row.descripcion || '',
      activo: row.activo,
      requiere_ppr: row.requiere_ppr,
      secciones: structuredClone(row.secciones)
    })
  }

  function updateSection(index: number, patch: Partial<QuestionnaireSection>) {
    setDraft(current => ({
      ...current,
      secciones: current.secciones.map((section, sectionIndex) =>
        sectionIndex === index ? { ...section, ...patch } : section
      )
    }))
  }

  function updateQuestion(sectionIndex: number, questionIndex: number, patch: Partial<QuestionnaireQuestion>) {
    setDraft(current => ({
      ...current,
      secciones: current.secciones.map((section, sIndex) => sIndex === sectionIndex
        ? {
            ...section,
            preguntas: section.preguntas.map((question, qIndex) =>
              qIndex === questionIndex ? { ...question, ...patch } : question
            )
          }
        : section)
    }))
  }

  async function save() {
    setSaving(true)
    try {
      const endpoint = editingId === 'new' ? '/api/cuestionarios' : `/api/cuestionarios/${editingId}`
      const response = await fetch(endpoint, {
        method: editingId === 'new' ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft)
      })
      const json = await response.json()
      if (!response.ok) {
        const fieldErrors = json.details?.fieldErrors as Record<string, string[]> | undefined
        const detailsMessage = fieldErrors
          ? Object.values(fieldErrors).flat().join('. ')
          : ''
        throw new Error([json.error, detailsMessage].filter(Boolean).join(': '))
      }
      onNotify(editingId === 'new' ? 'Cuestionario creado' : 'Cuestionario actualizado', 'success')
      setEditingId(null)
      await load()
    } catch (error) {
      onNotify(error instanceof Error ? error.message : 'No se pudo guardar', 'danger')
    } finally {
      setSaving(false)
    }
  }

  async function deactivate(row: Questionnaire) {
    if (!window.confirm(`¿Desactivar "${row.titulo}"? Los enlaces ya generados conservarán su historial.`)) return
    const response = await fetch(`/api/cuestionarios/${row.id}`, { method: 'DELETE' })
    const json = await response.json().catch(() => ({}))
    if (!response.ok) {
      onNotify(json.error || 'No se pudo desactivar', 'danger')
      return
    }
    onNotify('Cuestionario desactivado', 'success')
    await load()
  }

  async function saveLandingConfig() {
    if (!landingQuestionnaireId) {
      onNotify('Selecciona un cuestionario PPR para la landing', 'warning')
      return
    }
    setLandingSaving(true)
    try {
      const response = await fetch('/api/cuestionarios/landing-config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questionnaire_id: landingQuestionnaireId })
      })
      const json = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(json.error || 'No se pudo guardar la configuración')
      onNotify('Cuestionario de landing PPR actualizado', 'success')
    } catch (error) {
      onNotify(error instanceof Error ? error.message : 'No se pudo guardar la configuración', 'danger')
    } finally {
      setLandingSaving(false)
    }
  }

  return (
    <section className="border rounded p-3 bg-body shadow-sm">
      <div className="d-flex justify-content-between align-items-center flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setOpen(value => !value)}
          className="btn btn-link text-decoration-none p-0 d-flex align-items-center gap-2"
          aria-expanded={open}
        >
          <i className={`bi bi-caret-${open ? 'down' : 'right'}-fill`} />
          <span className="fw-bold small text-uppercase">Cuestionarios para prospectos</span>
        </button>
        {open && editingId == null && (
          <button type="button" className="btn btn-primary btn-sm" onClick={startNew}>
            <i className="bi bi-plus-lg me-1" />Nuevo cuestionario
          </button>
        )}
      </div>

      {open && (
        <div className="mt-3">
          {loading && <div className="text-center py-3"><span className="spinner-border spinner-border-sm" /></div>}

          {!loading && editingId == null && (
            <div className="border rounded bg-light-subtle p-3 mb-3">
              <div className="row g-2 align-items-end">
                <div className="col-12 col-lg-8">
                  <label className="form-label small fw-semibold">Cuestionario PPR usado en la landing principal</label>
                  <select
                    className="form-select form-select-sm"
                    value={landingQuestionnaireId}
                    onChange={event => setLandingQuestionnaireId(event.target.value)}
                  >
                    <option value="">Seleccionar cuestionario activo con PPR…</option>
                    {rows
                      .filter(row => row.activo && row.requiere_ppr)
                      .map(row => (
                        <option key={row.id} value={row.id}>{row.titulo} · v{row.version}</option>
                      ))}
                  </select>
                  <div className="form-text">El botón público de la página principal abrirá este cuestionario.</div>
                </div>
                <div className="col-12 col-lg-4 text-lg-end">
                  <button
                    type="button"
                    className="btn btn-outline-primary btn-sm"
                    onClick={() => void saveLandingConfig()}
                    disabled={landingSaving || !landingQuestionnaireId}
                  >
                    {landingSaving ? 'Guardando…' : 'Guardar selección'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {!loading && editingId == null && (
            <div className="table-responsive">
              <table className="table table-sm align-middle">
                <thead>
                  <tr><th>Cuestionario</th><th>Versión</th><th>Estado</th><th>Preguntas</th><th /></tr>
                </thead>
                <tbody>
                  {rows.length === 0 && <tr><td colSpan={5} className="text-center text-muted">Sin cuestionarios</td></tr>}
                  {rows.map(row => (
                    <tr key={row.id}>
                      <td>
                        <div className="fw-semibold">{row.titulo}</div>
                        <div className="text-muted small">/{row.slug}</div>
                      </td>
                      <td>{row.version}</td>
                      <td><span className={`badge ${row.activo ? 'text-bg-success' : 'text-bg-secondary'}`}>{row.activo ? 'Activo' : 'Inactivo'}</span></td>
                      <td>{row.secciones.reduce((total, section) => total + section.preguntas.length, 0)}</td>
                      <td className="text-end text-nowrap">
                        <button type="button" className="btn btn-outline-primary btn-sm me-1" onClick={() => startEdit(row)}>Editar</button>
                        {row.activo && <button type="button" className="btn btn-outline-danger btn-sm" onClick={() => void deactivate(row)}>Desactivar</button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {editingId != null && (
            <div className="d-flex flex-column gap-3">
              <div className="row g-2">
                <div className="col-12 col-md-6">
                  <label className="form-label small">Nombre</label>
                  <input className="form-control form-control-sm" value={draft.titulo} onChange={event => setDraft(current => ({ ...current, titulo: event.target.value }))} />
                </div>
                <div className="col-12 col-md-6">
                  <label className="form-label small">Identificador para enlace</label>
                  <input className="form-control form-control-sm" value={draft.slug} onChange={event => setDraft(current => ({ ...current, slug: event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') }))} />
                </div>
                <div className="col-12">
                  <label className="form-label small">Descripción</label>
                  <textarea className="form-control form-control-sm" rows={2} value={draft.descripcion || ''} onChange={event => setDraft(current => ({ ...current, descripcion: event.target.value }))} />
                </div>
                <div className="col-auto form-check ms-2">
                  <input id="questionnaire-active" type="checkbox" className="form-check-input" checked={draft.activo} onChange={event => setDraft(current => ({ ...current, activo: event.target.checked }))} />
                  <label htmlFor="questionnaire-active" className="form-check-label">Activo</label>
                </div>
                <div className="col-auto form-check ms-2">
                  <input id="questionnaire-ppr" type="checkbox" className="form-check-input" checked={draft.requiere_ppr} onChange={event => setDraft(current => ({ ...current, requiere_ppr: event.target.checked }))} />
                  <label htmlFor="questionnaire-ppr" className="form-check-label">Incluye simulación PPR</label>
                </div>
                <div className="col-12">
                  <div className="alert alert-info small py-2 mb-0">
                    <strong>Dato relacionado:</strong> indica para qué usará el CRM cada respuesta. Nombre, correo y teléfono alimentan el prospecto; edad alimenta la simulación PPR; respuesta general sólo se guarda dentro del cuestionario.
                  </div>
                </div>
              </div>

              {draft.secciones.map((section, sectionIndex) => (
                <div key={section.id} className="border rounded p-3">
                  <div className="d-flex gap-2 align-items-center mb-3">
                    <input
                      className="form-control form-control-sm fw-semibold"
                      value={section.titulo}
                      onChange={event => updateSection(sectionIndex, { titulo: event.target.value })}
                      aria-label="Título de sección"
                    />
                    {draft.secciones.length > 1 && (
                      <button type="button" className="btn btn-outline-danger btn-sm" onClick={() => setDraft(current => ({ ...current, secciones: current.secciones.filter((_, index) => index !== sectionIndex) }))}>
                        <i className="bi bi-trash" />
                      </button>
                    )}
                  </div>

                  {section.preguntas.map((question, questionIndex) => (
                    <div className="row g-2 align-items-end border-top pt-2 mb-2" key={question.id}>
                      <div className="col-12 col-lg-4">
                        <label className="form-label small">Pregunta</label>
                        <input className="form-control form-control-sm" value={question.etiqueta} onChange={event => updateQuestion(sectionIndex, questionIndex, { etiqueta: event.target.value })} />
                      </div>
                      <div className="col-6 col-lg-2">
                        <label className="form-label small">Tipo</label>
                        <select className="form-select form-select-sm" value={question.tipo} onChange={event => updateQuestion(sectionIndex, questionIndex, { tipo: event.target.value as QuestionnaireQuestionType })}>
                          {QUESTION_TYPES.map(type => <option key={type.value} value={type.value}>{type.label}</option>)}
                        </select>
                      </div>
                      <div className="col-6 col-lg-3">
                        <label className="form-label small">Dato relacionado</label>
                        <select className="form-select form-select-sm" value={question.semantica} onChange={event => updateQuestion(sectionIndex, questionIndex, { semantica: event.target.value as QuestionnaireQuestion['semantica'] })}>
                          {SEMANTICS.map(semantic => <option key={semantic.value} value={semantic.value}>{semantic.label}</option>)}
                        </select>
                      </div>
                      <div className="col-auto form-check ms-2 mb-1">
                        <input id={`required-${question.id}`} type="checkbox" className="form-check-input" checked={question.requerida} onChange={event => updateQuestion(sectionIndex, questionIndex, { requerida: event.target.checked })} />
                        <label htmlFor={`required-${question.id}`} className="form-check-label small">Obligatoria</label>
                      </div>
                      <div className="col-auto ms-auto">
                        <button type="button" className="btn btn-outline-danger btn-sm" disabled={section.preguntas.length === 1} onClick={() => updateSection(sectionIndex, { preguntas: section.preguntas.filter((_, index) => index !== questionIndex) })}>
                          <i className="bi bi-trash" />
                        </button>
                      </div>
                      {(question.tipo === 'seleccion' || question.tipo === 'multiple') && (
                        <div className="col-12">
                          <label className="form-label small">Opciones separadas por coma</label>
                          <input
                            className="form-control form-control-sm"
                            value={(question.opciones || []).join(', ')}
                            onChange={event => updateQuestion(sectionIndex, questionIndex, { opciones: event.target.value.split(',').map(value => value.trim()).filter(Boolean) })}
                          />
                        </div>
                      )}
                    </div>
                  ))}
                  <button type="button" className="btn btn-outline-primary btn-sm mt-1" onClick={() => updateSection(sectionIndex, { preguntas: [...section.preguntas, emptyQuestion()] })}>
                    <i className="bi bi-plus-lg me-1" />Agregar pregunta
                  </button>
                </div>
              ))}

              <div>
                <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => setDraft(current => ({ ...current, secciones: [...current.secciones, emptySection()] }))}>
                  <i className="bi bi-plus-lg me-1" />Agregar sección
                </button>
              </div>
              <div className="d-flex justify-content-end gap-2">
                <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => setEditingId(null)} disabled={saving}>Cancelar</button>
                <button type="button" className="btn btn-primary btn-sm" onClick={() => void save()} disabled={saving}>
                  {saving ? 'Guardando…' : 'Guardar cuestionario'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
