'use client'
import { useState, useEffect, useRef } from 'react'
import { createCandidato, getCedulaA1, getEfc, getCandidatoByCT, getCandidatoByEmail } from '@/lib/api'
import { calcularDerivados, parseOneDate, parseAllRangesWithAnchor, monthIndexFromText } from '@/lib/proceso'
import type { CedulaA1, Efc, Candidato } from '@/types'
import BasePage from '@/components/BasePage'
import { sanitizeCandidatoPayload } from '@/lib/sanitize'

interface FormState {
  pop: string;
  ct: string;
  candidato: string;
  // Nueva fecha manual: fecha de creación CT
  fecha_creacion_ct?: string;
  fecha_creacion_pop?: string;
  email_agente: string; // correo del candidato (único) y para crear usuario agente
  mes: string;
  efc: string;
  fecha_tentativa_de_examen?: string; // entrada manual
  // Derivados en UI
  dias_desde_ct?: number; // no se envía; calculado
  proceso?: string; // calculado
  // Campos dependientes (solo lectura)
  periodo_para_registro_y_envio_de_documentos?: string;
  capacitacion_cedula_a1?: string;
  periodo_para_ingresar_folio_oficina_virtual?: string;
  periodo_para_playbook?: string;
  pre_escuela_sesion_unica_de_arranque?: string;
  fecha_limite_para_presentar_curricula_cdp?: string;
  inicio_escuela_fundamental?: string;
}

const initialForm: FormState = { pop: '', ct: '', candidato: '', email_agente: '', mes: '', efc: '', fecha_tentativa_de_examen: '', fecha_creacion_ct: '', fecha_creacion_pop: '' }

export default function NuevoCandidato() {
  const [meses, setMeses] = useState<CedulaA1[]>([])
  const [efcs, setEfcs] = useState<Efc[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [notif, setNotif] = useState<{ type: 'success' | 'danger'; msg: string } | null>(null)
  const [form, setForm] = useState<FormState>(initialForm)
  const [modal, setModal] = useState<{ title: string; html: React.ReactNode } | null>(null)
  const firstInputRef = useRef<HTMLInputElement | null>(null)
  const cardRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    (async () => {
      try {
        const [m, e] = await Promise.all([getCedulaA1(), getEfc()])
        setMeses(m)
        setEfcs(e)
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Error cargando catálogos'
        setNotif({ type: 'danger', msg: message })
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  const recomputeDerived = (draft: FormState): FormState => ({ ...draft, ...calcularDerivados(draft) })

    // Helpers para filtrar opciones futuras
    const todayUTC = () => { const n = new Date(); return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate())).getTime() }
    const isFutureCedula = (m: CedulaA1) => {
      const t = todayUTC()
      const anchorMonth = monthIndexFromText(m.mes) || new Date().getUTCMonth()+1
      const anchorYear = new Date().getUTCFullYear()
      const regRanges = parseAllRangesWithAnchor(m.periodo_para_registro_y_envio_de_documentos, { anchorMonth, anchorYear })
      const validReg = regRanges.some(r => r.end.getTime() >= t)
      return validReg
    }
    const isFutureEfc = (e: Efc) => {
      const t = todayUTC()
      const anchorMonth = monthIndexFromText(e.efc) || monthIndexFromText(form.mes) || new Date().getUTCMonth()+1
      const anchorYear = new Date().getUTCFullYear()
      const ovRanges = parseAllRangesWithAnchor(e.periodo_para_ingresar_folio_oficina_virtual, { anchorMonth, anchorYear })
      const playbookRanges = parseAllRangesWithAnchor(e.periodo_para_playbook, { anchorMonth, anchorYear })
      const preEscuelaRanges = parseAllRangesWithAnchor(e.pre_escuela_sesion_unica_de_arranque, { anchorMonth, anchorYear })
      const cdpRanges = parseAllRangesWithAnchor(e.fecha_limite_para_presentar_curricula_cdp, { anchorMonth, anchorYear })
      const validOV = ovRanges.some(r => r.end.getTime() >= t)
      const validPlay = playbookRanges.some(r => r.end.getTime() >= t)
      const validPre = preEscuelaRanges.some(r => r.end.getTime() >= t)
      const validCDP = cdpRanges.some(r => r.end.getTime() >= t)
      // visibilidad: basta con que alguno de los periodos de preparación esté vigente; ignoramos "inicio_escuela_fundamental"
      return (validOV || validPlay || validPre || validCDP)
    }

  const handleChange = async (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target
  const nextVal = value
    // Convert ISO date (yyyy-mm-dd) from date input to dd/mm/aaaa for storage
    setForm(prev => {
      const updated = { ...prev, [name]: nextVal }
      return recomputeDerived(updated)
    })
  // CT duplicate check
    if (name === 'ct' && value.trim()) {
      try {
        const existente = await getCandidatoByCT(value.trim())
        if (existente) {
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
  // Email candidato duplicate check (email_agente)
  if (name === 'email_agente' && value.trim()) {
      try {
        const existente = await getCandidatoByEmail(value.trim())
        if (existente) {
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
    // Date overlap notify immediately when selecting fecha_tentativa_de_examen
    if (name === 'fecha_tentativa_de_examen' && value) {
      const overlaps: Array<{label:string; value?:string}> = []
      const anchorMonth = monthIndexFromText(form.mes) || new Date().getUTCMonth()+1
      const anchorYear = new Date().getUTCFullYear()
      const check = (label: string, raw?: string)=>{
        const f = parseOneDate(value||'');
        const parts = parseAllRangesWithAnchor(raw, { anchorMonth, anchorYear })
        if (f && parts.some(r => f.getTime()>=r.start.getTime() && f.getTime()<=r.end.getTime())) overlaps.push({label, value: raw})
      }
      check('PERIODO PARA REGISTRO Y ENVÍO DE DOCUMENTOS', form.periodo_para_registro_y_envio_de_documentos)
      check('CAPACITACIÓN CÉDULA A1', form.capacitacion_cedula_a1)
      check('PERIODO PARA INGRESAR FOLIO OFICINA VIRTUAL', form.periodo_para_ingresar_folio_oficina_virtual)
      check('PERIODO PARA PLAYBOOK', form.periodo_para_playbook)
      check('PRE ESCUELA SESIÓN ÚNICA DE ARRANQUE', form.pre_escuela_sesion_unica_de_arranque)
      check('FECHA LÍMITE PARA PRESENTAR CURRÍCULA CDP', form.fecha_limite_para_presentar_curricula_cdp)
      check('INICIO ESCUELA FUNDAMENTAL', form.inicio_escuela_fundamental)
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
  // fecha_tentativa_de_examen eliminado del catálogo MES
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

  // Añade clase temporal a los campos autocompletados
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setNotif(null)
    try {
      // Validar CT duplicado al guardar (bloquea)
      if (form.ct && form.ct.trim()) {
        try {
          const existente = await getCandidatoByCT(form.ct.trim())
          if (existente) {
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
          // si la consulta falla, seguimos para permitir guardar; el backend bloqueará si hay duplicado
        }
      }
    // Validar correo de candidato duplicado al guardar (bloquea)
    if (form.email_agente && form.email_agente.trim()) {
        try {
      const existente = await getCandidatoByEmail(form.email_agente.trim())
          if (existente) {
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
            throw new Error('Email candidato duplicado')
          }
        } catch (e) {
          if (e instanceof Error && e.message === 'Email candidato duplicado') throw e
        }
      }
      // Reglas: si hay CT debe existir fecha_creacion_ct
      if (form.ct && !form.fecha_creacion_ct) throw new Error('Debes seleccionar la fecha de creación de CT cuando ingresas un CT.')
      // Si hay fecha tentativa, debe ser hoy o futura
      if (form.fecha_tentativa_de_examen) {
        const fte = parseOneDate(form.fecha_tentativa_de_examen)
        const hoy = new Date(); const h = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate()))
        if (!fte || fte.getTime() < h.getTime()) throw new Error('La fecha tentativa de examen debe ser hoy o una fecha posterior.')
      }
  // Alertar por empalmes con rangos visibles (soporta múltiples segmentos con ancla)
  const overlaps: Array<{label:string; value?:string}> = []
  const anchorMonth = monthIndexFromText(form.mes) || new Date().getUTCMonth()+1
  const anchorYear = new Date().getUTCFullYear()
  const check = (label: string, raw?: string)=>{
    const f = parseOneDate(form.fecha_tentativa_de_examen||'')
    const parts = parseAllRangesWithAnchor(raw, { anchorMonth, anchorYear })
    if (f && parts.some(r => f.getTime()>=r.start.getTime() && f.getTime()<=r.end.getTime())) overlaps.push({label, value: raw})
  }
      check('PERIODO PARA REGISTRO Y ENVÍO DE DOCUMENTOS', form.periodo_para_registro_y_envio_de_documentos)
      check('CAPACITACIÓN CÉDULA A1', form.capacitacion_cedula_a1)
      check('PERIODO PARA INGRESAR FOLIO OFICINA VIRTUAL', form.periodo_para_ingresar_folio_oficina_virtual)
      check('PERIODO PARA PLAYBOOK', form.periodo_para_playbook)
      check('PRE ESCUELA SESIÓN ÚNICA DE ARRANQUE', form.pre_escuela_sesion_unica_de_arranque)
      check('FECHA LÍMITE PARA PRESENTAR CURRÍCULA CDP', form.fecha_limite_para_presentar_curricula_cdp)
      check('INICIO ESCUELA FUNDAMENTAL', form.inicio_escuela_fundamental)
      if (overlaps.length) {
        setModal({ title: 'Aviso de empalme', html: (<div>
          <p>La fecha tentativa de examen se empalma con:</p>
          <ul className="mb-0">{overlaps.map(o=> <li key={o.label}><div className="fw-semibold">{o.label}</div><div className="text-muted small">{o.value || '—'}</div></li>)}</ul>
        </div>) })
      }
  // Forzado: seg_gmm y seg_vida deben iniciarse en 0 y no se muestran en el registro
  // Omitir campos derivados que no se guardan directamente
  // Preparar payload sin campos derivados (ni dias_desde_pop/dias_desde_ct, proceso, etc.)
  // Omitir campos derivados del submit usando sanitización
  const payload = sanitizeCandidatoPayload(form as unknown as Record<string, unknown>)
  if (typeof (payload as Record<string, unknown>).email_agente === 'string') {
    const normalized = ((payload as Record<string, unknown>).email_agente as string).trim().toLowerCase()
    if (normalized) {
      (payload as Record<string, unknown>).email_agente = normalized
    } else {
      (payload as Record<string, unknown>).email_agente = null
    }
  }
  await createCandidato({ ...(payload as unknown as Partial<Candidato>), seg_gmm: 0, seg_vida: 0 })
      setNotif({ type: 'success', msg: 'Candidato guardado correctamente. (Se intentó crear el usuario agente en backend si no existía).' })
      // Reiniciar formulario limpio
      setForm(initialForm)
      // Reenfocar primer campo
      setTimeout(() => firstInputRef.current?.focus(), 50)
      // Replay animación de la tarjeta
      if (cardRef.current) {
  cardRef.current.classList.remove('fade-in-scale')
  // Force reflow to restart animation
  void cardRef.current.offsetWidth
  cardRef.current.classList.add('fade-in-scale')
      }
    } catch (err) {
      // Si fue un error por índice único de email, mostrar modal con el candidato existente
      if (err instanceof Error && err.message && err.message.includes('ux_candidatos_email_agente_not_deleted')) {
        try {
          if (form.email_agente && form.email_agente.trim()) {
            const existente = await getCandidatoByEmail(form.email_agente.trim())
            if (existente) {
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
        } catch {/* ignore follow-up error */}
        setNotif({ type: 'danger', msg: 'El correo ya pertenece a otro candidato.' })
        setSaving(false)
        return
      }
      const message = err instanceof Error ? err.message : 'No se pudo guardar'
      setNotif({ type: 'danger', msg: message })
    } finally {
      setSaving(false)
    }
  }

  return (
    <BasePage title="Registro de candidato">
    <div className="mx-auto app-form-shell px-2 px-sm-0">
  <div ref={cardRef} className="card shadow-sm border-0 fade-in-scale">
          <div className="card-body">
            <div className="text-center mb-3">
              <h6 className="fw-bold">Formulario de Registro de Candidatos</h6>
            </div>
            <p className="small text-muted mb-4 d-flex flex-wrap gap-3 justify-content-center">
              <span><span className="text-danger">*</span> Campos que debes completar obligatoriamente</span>
              <span><span role="img" aria-label="bloqueado" className="me-1">🔒</span> Campos auto‑completados (no editables)</span>
            </p>
            {notif && (
              <div className={`alert alert-${notif.type}`}>{notif.msg}</div>
            )}
            {loading ? (
              <div className="text-center py-5">
                <div className="spinner-border text-primary" role="status" />
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="row g-3" noValidate>
                <div className="col-12">
                  <label className="form-label fw-semibold small mb-1">POP</label>
                  <input ref={firstInputRef} name="pop" className="form-control" value={form.pop} onChange={handleChange} placeholder="Ingresa POP (opcional)" />
                </div>
                <div className="col-12">
                  <label className="form-label fw-semibold small mb-1">CT</label>
                  <input name="ct" className="form-control" value={form.ct} onChange={handleChange} placeholder="Ingresa CT (opcional)" />
                </div>
                <div className="col-12">
                  <label className="form-label fw-semibold small mb-1">CANDIDATO <span className="text-danger">*</span></label>
                  <input name="candidato" className="form-control" value={form.candidato} onChange={handleChange} placeholder="Nombre completo" required />
                </div>
                <div className="col-12">
                  <label className="form-label fw-semibold small mb-1">EMAIL (CANDIDATO)</label>
                  <input name="email_agente" type="email" className="form-control" value={form.email_agente} onChange={handleChange} placeholder="correo@dominio.com" />
                  <div className="form-text small">Se usará como correo del candidato y para crear el usuario agente automáticamente.</div>
                </div>
                <div className="col-12">
                  <label className="form-label fw-semibold small mb-1">FECHA CREACIÓN CT</label>
                  <input type="date" name="fecha_creacion_ct" className="form-control" value={form.fecha_creacion_ct || ''} onChange={handleChange} />
                  <div className="form-text small">Selecciona la fecha en que se creó el CT.</div>
                </div>
                <div className="col-12">
                  <label className="form-label fw-semibold small mb-1">FECHA CREACIÓN POP</label>
                  <input type="date" name="fecha_creacion_pop" className="form-control" value={form.fecha_creacion_pop || ''} onChange={handleChange} />
                  <div className="form-text small">Selecciona la fecha en que se creó el POP.</div>
                </div>
                {/* Días desde CT y Proceso ocultos en registro */}
                <div className="col-12">
                  <label className="form-label fw-semibold small mb-1">CÉDULA A1 <span className="text-danger">*</span></label>
                  <select name="mes" className="form-select" value={form.mes} onChange={handleChange} required>
                    <option value="">Selecciona una opción</option>
                    {meses.filter(isFutureCedula).map(m => <option key={m.id} value={m.mes}>{m.mes}</option>)}
                  </select>
                  <div className="form-text small">Al seleccionar el mes se llenarán automáticamente varias fechas.</div>
                </div>
                <div className="col-12 mt-2">
                  <hr className="my-0" />
                  <div className="small text-uppercase text-secondary fw-semibold mt-2">Fechas derivadas del MES</div>
                </div>
                <div className="col-12">
                  <label className="form-label fw-semibold small mb-1 d-flex align-items-center gap-1"><span role="img" aria-label="bloqueado">🔒</span> PERIODO PARA REGISTRO Y ENVÍO DE DOCUMENTOS</label>
                  <input className="form-control bg-light" style={{ cursor:'not-allowed' }} value={form.periodo_para_registro_y_envio_de_documentos || ''} readOnly aria-readonly tabIndex={-1} />
                  <div className="form-text small">Se calcula según el MES.</div>
                </div>
                <div className="col-12">
                  <label className="form-label fw-semibold small mb-1 d-flex align-items-center gap-1"><span role="img" aria-label="bloqueado">🔒</span> CAPACITACIÓN CÉDULA A1</label>
                  <input className="form-control bg-light" style={{ cursor:'not-allowed' }} value={form.capacitacion_cedula_a1 || ''} readOnly aria-readonly tabIndex={-1} />
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
                  <div className="form-text small">Selecciona la fecha estimada del examen (opcional).</div>
                </div>
                <div className="col-12">
                  <label className="form-label fw-semibold small mb-1">EFC <span className="text-danger">*</span></label>
                  <select name="efc" className="form-select" value={form.efc} onChange={handleChange} required>
                    <option value="">Selecciona una opción</option>
                    {efcs.filter(isFutureEfc).map(e => <option key={e.id} value={e.efc}>{e.efc}</option>)}
                  </select>
                  <div className="form-text small">Al seleccionar la EFC se agregan más fechas.</div>
                </div>
                <div className="col-12 mt-2">
                  <hr className="my-0" />
                  <div className="small text-uppercase text-secondary fw-semibold mt-2">Fechas derivadas de la EFC</div>
                </div>
                <div className="col-12">
                  <label className="form-label fw-semibold small mb-1 d-flex align-items-center gap-1"><span role="img" aria-label="bloqueado">🔒</span> PERIODO PARA INGRESAR FOLIO OFICINA VIRTUAL</label>
                  <input className="form-control bg-light" style={{ cursor:'not-allowed' }} value={form.periodo_para_ingresar_folio_oficina_virtual || ''} readOnly aria-readonly tabIndex={-1} />
                </div>
                <div className="col-12">
                  <label className="form-label fw-semibold small mb-1 d-flex align-items-center gap-1"><span role="img" aria-label="bloqueado">🔒</span> PERIODO PARA PLAYBOOK</label>
                  <input className="form-control bg-light" style={{ cursor:'not-allowed' }} value={form.periodo_para_playbook || ''} readOnly aria-readonly tabIndex={-1} />
                </div>
                <div className="col-12">
                  <label className="form-label fw-semibold small mb-1 d-flex align-items-center gap-1"><span role="img" aria-label="bloqueado">🔒</span> PRE ESCUELA SESIÓN ÚNICA DE ARRANQUE</label>
                  <input className="form-control bg-light" style={{ cursor:'not-allowed' }} value={form.pre_escuela_sesion_unica_de_arranque || ''} readOnly aria-readonly tabIndex={-1} />
                </div>
                <div className="col-12">
                  <label className="form-label fw-semibold small mb-1 d-flex align-items-center gap-1"><span role="img" aria-label="bloqueado">🔒</span> FECHA LÍMITE PARA PRESENTAR CURRÍCULA CDP</label>
                  <input className="form-control bg-light" style={{ cursor:'not-allowed' }} value={form.fecha_limite_para_presentar_curricula_cdp || ''} readOnly aria-readonly tabIndex={-1} />
                </div>
                <div className="col-12">
                  <label className="form-label fw-semibold small mb-1 d-flex align-items-center gap-1"><span role="img" aria-label="bloqueado">🔒</span> INICIO ESCUELA FUNDAMENTAL</label>
                  <input className="form-control bg-light" style={{ cursor:'not-allowed' }} value={form.inicio_escuela_fundamental || ''} readOnly aria-readonly tabIndex={-1} />
                </div>
                {/* Campos SEG GMM / SEG VIDA ocultos en registro: se envían como 0 por backend */}
                <div className="col-12 pt-2">
                  <button type="submit" className="btn w-100 text-white" style={{ background:'#072e40' }} disabled={saving}>{saving ? 'Guardando...' : 'Guardar'}</button>
                </div>
                {modal && (
                  <div className="mt-2">
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
                  </div>
                )}
              </form>
            )}
          </div>
        </div>
      </div>
    </BasePage>
  )
}
