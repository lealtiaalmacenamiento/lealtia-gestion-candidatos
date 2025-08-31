'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { getCandidatoById, updateCandidato, getCedulaA1, getEfc, getCandidatoByCT, getCandidatoByEmail } from '@/lib/api'
import { calcularDerivados, etiquetaProceso, parseOneDate, parseAllRangesWithAnchor, monthIndexFromText } from '@/lib/proceso'
import type { CedulaA1, Efc, Candidato } from '@/types'
import BasePage from '@/components/BasePage'
// Modal de eliminación y lógica removidos según solicitud

interface FormState {
  ct?: string;
  candidato?: string;
  email_agente?: string;
  fecha_creacion_ct?: string;
  dias_desde_ct?: number; // derivado
  proceso?: string; // derivado
  mes?: string;
  efc?: string;
  fecha_tentativa_de_examen?: string;
  periodo_para_registro_y_envio_de_documentos?: string;
  capacitacion_cedula_a1?: string;
  periodo_para_ingresar_folio_oficina_virtual?: string;
  periodo_para_playbook?: string;
  pre_escuela_sesion_unica_de_arranque?: string;
  fecha_limite_para_presentar_curricula_cdp?: string;
  inicio_escuela_fundamental?: string;
  seg_gmm?: number;
  seg_vida?: number;
}

// Obtener params con useParams para evitar conflicto de tipos del entrypoint
export default function EditarCandidato() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const [meses, setMeses] = useState<CedulaA1[]>([])
  const [efcs, setEfcs] = useState<Efc[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [notif, setNotif] = useState<{ type: 'success' | 'danger'; msg: string } | null>(null)
  // Eliminación deshabilitada
  const [form, setForm] = useState<FormState>({})
  const [modal, setModal] = useState<{ title: string; html: React.ReactNode } | null>(null)
  const firstInputRef = useRef<HTMLInputElement | null>(null)
  const cardRef = useRef<HTMLDivElement | null>(null)

  // Cargar catálogos + candidato
  useEffect(() => {
    (async () => {
      try {
        const idNum = Number(params.id)
        const [cand, m, e] = await Promise.all([
          getCandidatoById(idNum),
          getCedulaA1(),
          getEfc()
        ])
        setMeses(m)
        setEfcs(e)
  // Normalizar datos existentes + derivados
  setForm(prev => ({ ...prev, ...calcularDerivados(cand), ...cand }))
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Error cargando datos'
        setNotif({ type: 'danger', msg: message })
      } finally { setLoading(false) }
    })()
  }, [params.id])

  const flashAutoFill = () => {
    const selectors = [
      'input[name="periodo_para_registro_y_envio_de_documentos"]',
      'input[name="capacitacion_cedula_a1"]',
  // fecha_tentativa_de_examen eliminado
      'input[name="periodo_para_ingresar_folio_oficina_virtual"]',
      'input[name="periodo_para_playbook"]',
      'input[name="pre_escuela_sesion_unica_de_arranque"]',
      'input[name="fecha_limite_para_presentar_curricula_cdp"]',
      'input[name="inicio_escuela_fundamental"]'
    ]
    requestAnimationFrame(() => {
      selectors.forEach(sel => {
        document.querySelectorAll<HTMLInputElement>(sel).forEach(el => {
          el.classList.remove('autofill-flash')
          void el.offsetWidth
            el.classList.add('autofill-flash')
        })
      })
    })
  }

  const recomputeDerived = (draft: FormState): FormState => ({ ...draft, ...calcularDerivados(draft) })

  // Helpers para filtrar opciones futuras (misma lógica que en alta)
  const todayUTC = () => { const n = new Date(); return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate())).getTime() }
  const isFutureCedula = (m: CedulaA1) => {
    const t = todayUTC()
    const anchorMonth = monthIndexFromText(m.mes) || new Date().getUTCMonth()+1
    const anchorYear = new Date().getUTCFullYear()
    const ranges = [
      ...parseAllRangesWithAnchor(m.periodo_para_registro_y_envio_de_documentos, { anchorMonth, anchorYear }),
      ...parseAllRangesWithAnchor(m.capacitacion_cedula_a1, { anchorMonth, anchorYear })
    ]
    if (!ranges.length) return true
    return ranges.some(r => r.end.getTime() >= t)
  }
  const isFutureEfc = (e: Efc) => {
    const t = todayUTC()
    const anchorMonth = monthIndexFromText(e.efc) || monthIndexFromText(form.mes as string) || new Date().getUTCMonth()+1
    const anchorYear = new Date().getUTCFullYear()
    const ranges = [
      ...parseAllRangesWithAnchor(e.periodo_para_ingresar_folio_oficina_virtual, { anchorMonth, anchorYear }),
      ...parseAllRangesWithAnchor(e.periodo_para_playbook, { anchorMonth, anchorYear }),
      ...parseAllRangesWithAnchor(e.pre_escuela_sesion_unica_de_arranque, { anchorMonth, anchorYear }),
      ...parseAllRangesWithAnchor(e.fecha_limite_para_presentar_curricula_cdp, { anchorMonth, anchorYear }),
      ...parseAllRangesWithAnchor(e.inicio_escuela_fundamental, { anchorMonth, anchorYear })
    ]
    if (!ranges.length) return true
    return ranges.some(r => r.end.getTime() >= t)
  }

  const handleChange = async (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target
  const nextVal: string = value
    setForm(prev => recomputeDerived({ ...prev, [name]: nextVal }))
    // CT duplicate check (evita alertar si es el mismo registro)
    if (name === 'ct' && value.trim()) {
      try {
        const existente = await getCandidatoByCT(value.trim())
        if (existente && existente.id_candidato !== Number(params.id)) {
          setModal({ title: 'CT ya registrado', html: (
            <div>
              <p>Existe un candidato con el mismo CT.</p>
              <ul className="mb-0">
                <li><strong>Nombre:</strong> {existente.candidato}</li>
                <li><strong>CT:</strong> {existente.ct}</li>
                <li><strong>Email:</strong> {('email_agente' in existente ? (existente as unknown as { email_agente?: string }).email_agente : '') || '—'}</li>
              </ul>
            </div>
          ) })
        }
      } catch { /* noop */ }
    }
  if (name === 'email_agente' && value.trim()) {
      try {
        const existente = await getCandidatoByEmail(value.trim())
        if (existente && existente.id_candidato !== Number(params.id)) {
          setModal({ title: 'Correo ya registrado', html: (
            <div>
              <p>Este correo ya pertenece a otro candidato.</p>
              <ul className="mb-0">
                <li><strong>Nombre:</strong> {existente.candidato}</li>
        <li><strong>Email:</strong> {existente.email_agente}</li>
                <li><strong>ID:</strong> {existente.id_candidato}</li>
              </ul>
            </div>
          ) })
        }
      } catch { /* noop */ }
    }
    // Avisar empalme en el cambio de fecha tentativa
    if (name === 'fecha_tentativa_de_examen' && value) {
  const overlaps: Array<{label:string; value?:string}> = []
  const anchorMonth = monthIndexFromText(form.mes as string) || new Date().getUTCMonth()+1
  const anchorYear = new Date().getUTCFullYear()
  const check = (label: string, raw?: string)=>{ const f = parseOneDate(value||''); const parts = parseAllRangesWithAnchor(raw, { anchorMonth, anchorYear }); if (f && parts.some(r => f.getTime()>=r.start.getTime() && f.getTime()<=r.end.getTime())) overlaps.push({label, value: raw}) }
      check('PERIODO PARA REGISTRO Y ENVÍO DE DOCUMENTOS', (form.periodo_para_registro_y_envio_de_documentos as string) )
      check('CAPACITACIÓN CÉDULA A1', (form.capacitacion_cedula_a1 as string))
      check('PERIODO PARA INGRESAR FOLIO OFICINA VIRTUAL', (form.periodo_para_ingresar_folio_oficina_virtual as string))
      check('PERIODO PARA PLAYBOOK', (form.periodo_para_playbook as string))
      check('PRE ESCUELA SESIÓN ÚNICA DE ARRANQUE', (form.pre_escuela_sesion_unica_de_arranque as string))
      check('FECHA LÍMITE PARA PRESENTAR CURRÍCULA CDP', (form.fecha_limite_para_presentar_curricula_cdp as string))
      check('INICIO ESCUELA FUNDAMENTAL', (form.inicio_escuela_fundamental as string))
      if (overlaps.length) {
        setModal({ title: 'Aviso de empalme', html: (<div>
          <p>La fecha tentativa de examen se empalma con:</p>
          <ul className="mb-0">{overlaps.map(o=> <li key={o.label}><div className="fw-semibold">{o.label}</div><div className="text-muted small">{o.value || '—'}</div></li>)}</ul>
        </div>) })
      }
    }
    if (name === 'mes') {
      const encontrado = meses.find(x => x.mes === value)
      setForm(prev => ({
        ...prev,
        mes: value,
        periodo_para_registro_y_envio_de_documentos: encontrado?.periodo_para_registro_y_envio_de_documentos || '',
        capacitacion_cedula_a1: encontrado?.capacitacion_cedula_a1 || '',
  // fecha_tentativa_de_examen eliminado
      }))
      flashAutoFill()
    }
    if (name === 'efc') {
      const encontrado = efcs.find(x => x.efc === value)
      setForm(prev => ({
        ...prev,
        efc: value,
        periodo_para_ingresar_folio_oficina_virtual: encontrado?.periodo_para_ingresar_folio_oficina_virtual || '',
        periodo_para_playbook: encontrado?.periodo_para_playbook || '',
        pre_escuela_sesion_unica_de_arranque: encontrado?.pre_escuela_sesion_unica_de_arranque || '',
        fecha_limite_para_presentar_curricula_cdp: encontrado?.fecha_limite_para_presentar_curricula_cdp || '',
        inicio_escuela_fundamental: encontrado?.inicio_escuela_fundamental || ''
      }))
      flashAutoFill()
    }
  }

  const adjustNumber = (field: 'seg_gmm' | 'seg_vida', delta: number) => {
    setForm(prev => {
      const current = typeof prev[field] === 'number' ? (prev[field] as number) : 0
      const raw = current + delta
      const next = field === 'seg_vida'
        ? Math.max(0, Math.round(raw)) // seg_vida solo enteros
        : Math.max(0, +(raw).toFixed(1)) // seg_gmm mantiene pasos de 0.5
      return { ...prev, [field]: next }
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setNotif(null)
    try {
  // Bloquear si CT está duplicado en otro candidato
  if (form.ct && form.ct.trim()) {
    try {
      const existente = await getCandidatoByCT(form.ct.trim())
      if (existente && existente.id_candidato !== Number(params.id)) {
        setModal({ title: 'CT ya registrado', html: (
          <div>
            <p>Existe un candidato con el mismo CT:</p>
            <ul className="mb-0">
              <li><strong>Nombre:</strong> {existente.candidato}</li>
              <li><strong>CT:</strong> {existente.ct}</li>
              <li><strong>Email:</strong> {('email_agente' in existente ? (existente as unknown as { email_agente?: string }).email_agente : '') || '—'}</li>
            </ul>
            <p className="mt-2 mb-0 text-danger">No puedes guardar con un CT duplicado.</p>
          </div>
        ) })
        throw new Error('CT duplicado')
      }
    } catch (e) {
      if (e instanceof Error && e.message === 'CT duplicado') throw e
      // Si la consulta falla, seguimos; backend hará la validación final
    }
  }
  // Validaciones adicionales
  if (form.ct && !form.fecha_creacion_ct) throw new Error('Debes seleccionar la fecha de creación de CT cuando ingresas un CT.')
  if (form.fecha_tentativa_de_examen) {
    const fte = parseOneDate(form.fecha_tentativa_de_examen)
    const hoy = new Date(); const h = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate()))
    if (!fte || fte.getTime() < h.getTime()) throw new Error('La fecha tentativa de examen debe ser hoy o una fecha posterior.')
  }
  // Omitir campos derivados que no existen físicamente en la tabla
  // Extraer y descartar campos derivados sin declararlos (para evitar warnings)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { dias_desde_ct: _d, proceso: _p, ...payload } = form // payload incluye email_agente si fue editado
  await updateCandidato(Number(params.id), payload as Partial<Candidato>)
  router.push('/consulta_candidatos')
    } catch (err) {
      if (err instanceof Error && err.message && err.message.includes('ux_candidatos_email_agente_not_deleted')) {
        try {
          if (form.email_agente && form.email_agente.trim()) {
            const existente = await getCandidatoByEmail(form.email_agente.trim())
            if (existente && existente.id_candidato !== Number(params.id)) {
              setModal({ title: 'Correo ya registrado', html: (
                <div>
                  <p>Este correo ya pertenece a otro candidato:</p>
                  <ul className="mb-0">
                    <li><strong>Nombre:</strong> {existente.candidato}</li>
                    <li><strong>Email:</strong> {existente.email_agente}</li>
                    <li><strong>ID:</strong> {existente.id_candidato}</li>
                  </ul>
                  <p className="mt-2 mb-0 text-danger">No puedes guardar con un correo de candidato duplicado.</p>
                </div>
              ) })
            }
          }
        } catch {/* ignore */}
        setNotif({ type: 'danger', msg: 'El correo ya pertenece a otro candidato.' })
        setSaving(false)
        return
      }
      const message = err instanceof Error ? err.message : 'No se pudo guardar'
      setNotif({ type: 'danger', msg: message })
    } finally { setSaving(false) }
  }

  // Función de eliminación eliminada

  if (loading) return <BasePage title="Editar candidato"><div className="text-center py-5"><div className="spinner-border" /></div></BasePage>

  const procesoActual = etiquetaProceso(form.proceso)
  const diasCT = form.dias_desde_ct

  return (
    <BasePage title={`Editar candidato #${params.id}`}>
  <div className="mx-auto app-form-shell px-2 px-sm-0">
        <div ref={cardRef} className="card shadow-sm border-0 fade-in-scale">
          <div className="card-body">
            <div className="mb-3">
              <h6 className="fw-bold mb-0">Editar candidato</h6>
            </div>
            {notif && (<div className={`alert alert-${notif.type}`}>{notif.msg}</div>)}
            <div className="alert alert-info py-2 small d-flex flex-wrap gap-3">
              {procesoActual && <span><strong>Proceso:</strong> {procesoActual}</span>}
              {form.fecha_creacion_ct && <span><strong>Fecha creación CT:</strong> {form.fecha_creacion_ct}</span>}
              {form.fecha_creacion_ct && <span><strong>Días desde CT:</strong> {diasCT ?? '—'}</span>}
            </div>
            <form onSubmit={handleSubmit} className="row g-3" noValidate>
              <div className="col-12">
                <label className="form-label fw-semibold small mb-1">CT</label>
                <input ref={firstInputRef} name="ct" className="form-control" value={form.ct || ''} onChange={handleChange} placeholder="Ingresa CT (opcional)" />
              </div>
              <div className="col-12">
                <label className="form-label fw-semibold small mb-1">CANDIDATO <span className="text-danger">*</span></label>
                <input name="candidato" className="form-control" value={form.candidato || ''} onChange={handleChange} required />
              </div>
              <div className="col-12">
                <label className="form-label fw-semibold small mb-1">EMAIL (CANDIDATO)</label>
                <input name="email_agente" type="email" className="form-control" value={form.email_agente || ''} onChange={handleChange} />
              </div>
              <div className="col-12">
                <label className="form-label fw-semibold small mb-1">FECHA CREACIÓN CT</label>
                <input type="date" name="fecha_creacion_ct" className="form-control" value={form.fecha_creacion_ct || ''} onChange={handleChange} />
              </div>
              {/* Días desde CT y Proceso ocultos en edición; se muestran arriba como info */}
              <div className="col-12">
                <label className="form-label fw-semibold small mb-1">CÉDULA A1 <span className="text-danger">*</span></label>
                <select name="mes" className="form-select" value={form.mes || ''} onChange={handleChange} required>
                  <option value="">Selecciona una opción</option>
                  {meses.filter(isFutureCedula).map(m => <option key={m.id} value={m.mes}>{m.mes}</option>)}
                </select>
              </div>
              <div className="col-12 mt-2"><hr className="my-0" /><div className="small text-uppercase text-secondary fw-semibold mt-2">Fechas derivadas del MES</div></div>
              <div className="col-12">
                <label className="form-label fw-semibold small mb-1 d-flex align-items-center gap-1"><span role="img" aria-label="bloqueado">🔒</span> PERIODO PARA REGISTRO Y ENVÍO DE DOCUMENTOS</label>
                <input className="form-control bg-light" style={{ cursor:'not-allowed' }} value={form.periodo_para_registro_y_envio_de_documentos || ''} readOnly tabIndex={-1} />
              </div>
              <div className="col-12">
                <label className="form-label fw-semibold small mb-1 d-flex align-items-center gap-1"><span role="img" aria-label="bloqueado">🔒</span> CAPACITACIÓN CÉDULA A1</label>
                <input className="form-control bg-light" style={{ cursor:'not-allowed' }} value={form.capacitacion_cedula_a1 || ''} readOnly tabIndex={-1} />
              </div>
              <div className="col-12">
                <label className="form-label fw-semibold small mb-1">FECHA TENTATIVA DE EXAMEN</label>
                <input
                  type="date"
                  name="fecha_tentativa_de_examen"
                  className="form-control"
                  value={form.fecha_tentativa_de_examen || ''}
                  min={new Date().toISOString().slice(0,10)}
                  onChange={handleChange}
                />
              </div>
              <div className="col-12">
                <label className="form-label fw-semibold small mb-1">EFC <span className="text-danger">*</span></label>
                <select name="efc" className="form-select" value={form.efc || ''} onChange={handleChange} required>
                  <option value="">Selecciona una opción</option>
                  {efcs.filter(isFutureEfc).map(e => <option key={e.id} value={e.efc}>{e.efc}</option>)}
                </select>
              </div>
              <div className="col-12 mt-2"><hr className="my-0" /><div className="small text-uppercase text-secondary fw-semibold mt-2">Fechas derivadas de la EFC</div></div>
              <div className="col-12"><label className="form-label fw-semibold small mb-1 d-flex align-items-center gap-1"><span role="img" aria-label="bloqueado">🔒</span> PERIODO PARA INGRESAR FOLIO OFICINA VIRTUAL</label><input className="form-control bg-light" style={{ cursor:'not-allowed' }} value={form.periodo_para_ingresar_folio_oficina_virtual || ''} readOnly tabIndex={-1} /></div>
              <div className="col-12"><label className="form-label fw-semibold small mb-1 d-flex align-items-center gap-1"><span role="img" aria-label="bloqueado">🔒</span> PERIODO PARA PLAYBOOK</label><input className="form-control bg-light" style={{ cursor:'not-allowed' }} value={form.periodo_para_playbook || ''} readOnly tabIndex={-1} /></div>
              <div className="col-12"><label className="form-label fw-semibold small mb-1 d-flex align-items-center gap-1"><span role="img" aria-label="bloqueado">🔒</span> PRE ESCUELA SESIÓN ÚNICA DE ARRANQUE</label><input className="form-control bg-light" style={{ cursor:'not-allowed' }} value={form.pre_escuela_sesion_unica_de_arranque || ''} readOnly tabIndex={-1} /></div>
              <div className="col-12"><label className="form-label fw-semibold small mb-1 d-flex align-items-center gap-1"><span role="img" aria-label="bloqueado">🔒</span> FECHA LÍMITE PARA PRESENTAR CURRÍCULA CDP</label><input className="form-control bg-light" style={{ cursor:'not-allowed' }} value={form.fecha_limite_para_presentar_curricula_cdp || ''} readOnly tabIndex={-1} /></div>
              <div className="col-12"><label className="form-label fw-semibold small mb-1 d-flex align-items-center gap-1"><span role="img" aria-label="bloqueado">🔒</span> INICIO ESCUELA FUNDAMENTAL</label><input className="form-control bg-light" style={{ cursor:'not-allowed' }} value={form.inicio_escuela_fundamental || ''} readOnly tabIndex={-1} /></div>
              {/* Controles de SEG al final */}
              <div className="col-12 mt-3 d-flex flex-wrap gap-4">
                <div className="d-flex flex-column">
                  <label className="form-label fw-semibold small mb-1 d-flex align-items-center gap-1">SEG GMM <span className="badge bg-secondary">solo botones</span></label>
                  <div className="input-group input-group-sm" style={{width:200}}>
                    <button type="button" className="btn btn-outline-secondary" onClick={()=>adjustNumber('seg_gmm', -0.5)}>-</button>
                    <input type="number" step="0.5" className="form-control text-center bg-light" value={form.seg_gmm ?? 0} readOnly tabIndex={-1} style={{cursor:'not-allowed'}} />
                    <button type="button" className="btn btn-outline-secondary" onClick={()=>adjustNumber('seg_gmm', 0.5)}>+</button>
                  </div>
                </div>
                <div className="d-flex flex-column">
                  <label className="form-label fw-semibold small mb-1 d-flex align-items-center gap-1">SEG VIDA <span className="badge bg-secondary">solo botones</span></label>
                  <div className="input-group input-group-sm" style={{width:200}}>
                    <button type="button" className="btn btn-outline-secondary" onClick={()=>adjustNumber('seg_vida', -1)}>-</button>
                    <input type="number" step="1" className="form-control text-center bg-light" value={form.seg_vida ?? 0} readOnly tabIndex={-1} style={{cursor:'not-allowed'}} />
                    <button type="button" className="btn btn-outline-secondary" onClick={()=>adjustNumber('seg_vida', 1)}>+</button>
                  </div>
                </div>
              </div>

        <div className="col-12 pt-3 d-flex gap-2">
                <button type="submit" className="btn text-white" style={{ background:'#072e40' }} disabled={saving}>{saving ? 'Guardando...' : 'Guardar cambios'}</button>
                <a href="/consulta_candidatos" className="btn btn-outline-secondary">Volver</a>
              </div>
            </form>
          </div>
        </div>
      </div>
      {modal && (
        <div className="position-fixed top-0 start-0 w-100 h-100" style={{zIndex:1050}}>
          <div className="d-flex align-items-center justify-content-center h-100 bg-dark bg-opacity-50">
            <div className="bg-white rounded shadow" style={{maxWidth:520, width:'90%'}}>
              <div className="p-3 border-bottom d-flex align-items-center justify-content-between">
                <div className="fw-semibold">{modal.title}</div>
                <button type="button" className="btn btn-sm btn-link" onClick={()=>setModal(null)} aria-label="Cerrar">
                  <i className="bi bi-x-lg"></i>
                </button>
              </div>
              <div className="p-3">
                {modal.html}
              </div>
              <div className="p-2 border-top text-end">
                <button type="button" className="btn btn-primary" onClick={()=>setModal(null)}>Entendido</button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Modal de eliminación eliminado */}
    </BasePage>
  )
}

