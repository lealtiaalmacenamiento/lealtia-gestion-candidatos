'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { getCandidatoById, updateCandidato, getCedulaA1, getEfc } from '@/lib/api'
import type { CedulaA1, Efc, Candidato } from '@/types'
import BasePage from '@/components/BasePage'
// Modal de eliminación y lógica removidos según solicitud

interface FormState {
  ct?: string;
  candidato?: string;
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
        // Normalizar datos existentes en formato del formulario
        setForm({ ...cand })
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

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target
  const nextVal: string = value
    setForm(prev => ({ ...prev, [name]: nextVal }))
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
  // La API normaliza fecha_tentativa_de_examen dd/mm/aaaa -> yyyy-mm-dd antes de guardar
      await updateCandidato(Number(params.id), form as Partial<Candidato>)
  router.push('/consulta_candidatos')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo guardar'
      setNotif({ type: 'danger', msg: message })
    } finally { setSaving(false) }
  }

  // Función de eliminación eliminada

  if (loading) return <BasePage title="Editar candidato"><div className="text-center py-5"><div className="spinner-border" /></div></BasePage>

  return (
    <BasePage title={`Editar candidato #${params.id}`}>
  <div className="mx-auto app-form-shell px-2 px-sm-0">
        <div ref={cardRef} className="card shadow-sm border-0 fade-in-scale">
          <div className="card-body">
            <div className="mb-3">
              <h6 className="fw-bold mb-0">Editar candidato</h6>
            </div>
            {notif && (<div className={`alert alert-${notif.type}`}>{notif.msg}</div>)}
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
                <label className="form-label fw-semibold small mb-1">Cédula A1 <span className="text-danger">*</span></label>
                <select name="mes" className="form-select" value={form.mes || ''} onChange={handleChange} required>
                  <option value="">Selecciona una opción</option>
                  {meses.map(m => <option key={m.id} value={m.mes}>{m.mes}</option>)}
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
                  onChange={handleChange}
                />
              </div>
              <div className="col-12">
                <label className="form-label fw-semibold small mb-1">EFC <span className="text-danger">*</span></label>
                <select name="efc" className="form-select" value={form.efc || ''} onChange={handleChange} required>
                  <option value="">Selecciona una opción</option>
                  {efcs.map(e => <option key={e.id} value={e.efc}>{e.efc}</option>)}
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
      {/* Modal de eliminación eliminado */}
    </BasePage>
  )
}

