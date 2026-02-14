"use client"
import { useState, useEffect } from 'react'
import { getUDIValue, getUDIValueOrBefore } from '@/lib/udi'

interface PPRPlan {
  nombre: string
  años: number
  sumaAsegurada: number
}

interface PlanData {
  primaAnualUDI: number
  meta65UDI: number
}

const PLANES_PPR: Record<string, PPRPlan> = {
  '65': { nombre: 'Imagina ser 65', años: 65, sumaAsegurada: 100000 },
  '15': { nombre: 'Imagina ser 15', años: 15, sumaAsegurada: 75000 },
  '10': { nombre: 'Imagina ser 10', años: 10, sumaAsegurada: 75000 }
}

// Tablas de primas y metas por edad
const TABLA_PLANES: Record<number, Record<string, PlanData>> = {
  20: {
    '65': { primaAnualUDI: 1604.73, meta65UDI: 102741.00 },
    '15': { primaAnualUDI: 3354.64, meta65UDI: 91423.00 },
    '10': { primaAnualUDI: 4450.31, meta65UDI: 81291.00 }
  },
  25: {
    '65': { primaAnualUDI: 1876.24, meta65UDI: 99527.00 },
    '15': { primaAnualUDI: 3495.90, meta65UDI: 85482.00 },
    '10': { primaAnualUDI: 4645.98, meta65UDI: 76367.00 }
  },
  30: {
    '65': { primaAnualUDI: 2255.39, meta65UDI: 96934.00 },
    '15': { primaAnualUDI: 3677.28, meta65UDI: 80407.00 },
    '10': { primaAnualUDI: 4899.00, meta65UDI: 73107.00 }
  },
  35: {
    '65': { primaAnualUDI: 2810.25, meta65UDI: 95499.00 },
    '15': { primaAnualUDI: 3951.31, meta65UDI: 77251.00 },
    '10': { primaAnualUDI: 5280.59, meta65UDI: 70917.00 }
  },
  40: {
    '65': { primaAnualUDI: 3551.44, meta65UDI: 94796.00 },
    '15': { primaAnualUDI: 4231.60, meta65UDI: 73429.00 },
    '10': { primaAnualUDI: 5662.19, meta65UDI: 68089.00 }
  },
  45: {
    '65': { primaAnualUDI: 4997.14, meta65UDI: 95685.00 },
    '15': { primaAnualUDI: 4789.67, meta65UDI: 73708.00 },
    '10': { primaAnualUDI: 6422.57, meta65UDI: 68975.00 }
  },
  50: {
    '65': { primaAnualUDI: 7326.41, meta65UDI: 95368.00 },
    '15': { primaAnualUDI: 5325.78, meta65UDI: 73327.00 },
    '10': { primaAnualUDI: 7160.71, meta65UDI: 68542.00 }
  }
}

const TASA_ISR = 0.30 // 30%

// Determinar rango de edad para la tabla (redondea hacia arriba al múltiplo de 5)
function getRangoEdad(edad: number): number {
  if (edad >= 18 && edad <= 20) return 20
  if (edad >= 21 && edad <= 25) return 25
  if (edad >= 26 && edad <= 30) return 30
  if (edad >= 31 && edad <= 35) return 35
  if (edad >= 36 && edad <= 40) return 40
  if (edad >= 41 && edad <= 45) return 45
  if (edad >= 46 && edad <= 50) return 50
  return 0 // Edad no válida
}

export default function QuoteSection() {
  const [formData, setFormData] = useState({
    nombre: '',
    edad: '',
    plan: ''
  })

  const [resultado, setResultado] = useState<any>(null)
  const [udiActual, setUdiActual] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [agenteInfo, setAgenteInfo] = useState<{agente_id: number, nombre: string, is_default: boolean} | null>(null)
  const [agentCodeInput, setAgentCodeInput] = useState('')
  const [agentMessage, setAgentMessage] = useState<string | null>(null)
  const [agentResolving, setAgentResolving] = useState(false)
  const [showContactForm, setShowContactForm] = useState(false)
  const [contactData, setContactData] = useState({ email: '', telefono: '' })
  const [submittingProspecto, setSubmittingProspecto] = useState(false)
  const [prospectoCreado, setProspectoCreado] = useState(false)

  useEffect(() => {
    // Obtener UDI actual al cargar el componente
    const fetchUdiActual = async () => {
      const hoy = new Date().toISOString().split('T')[0]
      const udi = await getUDIValueOrBefore(hoy)
      if (udi) {
        setUdiActual(udi.valor)
        console.log('UDI actual cargado:', udi.valor, 'fecha:', udi.fecha)
      } else {
        console.error('No se pudo obtener el valor UDI')
      }
    }
    fetchUdiActual()

    // Detectar código de agente en URL o localStorage
    const resolveAgentCode = async () => {
      const urlParams = new URLSearchParams(window.location.search)
      let code = urlParams.get('code') || urlParams.get('ref')
      
      // Si hay código en URL, guardarlo en localStorage
      if (code) {
        localStorage.setItem('agent_ref_code', code)
      } else {
        // Si no hay en URL, buscar en localStorage
        code = localStorage.getItem('agent_ref_code')
      }

      if (code) {
        setAgentCodeInput(code.toUpperCase())
      }

      await resolveAgent(code || undefined)
    }

    resolveAgentCode()
  }, [])

  const resolveAgent = async (code?: string) => {
    try {
      setAgentResolving(true)
      setAgentMessage(null)
      const response = await fetch(`/api/landing/resolve-agent${code ? `?code=${code}` : ''}`)
      const data = await response.json()
      if (response.ok && data.agente_id) {
        setAgenteInfo({
          agente_id: data.agente_id,
          nombre: data.nombre,
          is_default: data.is_default || false
        })
        if (code) {
          setAgentMessage(`Código aplicado: ${code.toUpperCase()}${data.is_default ? ' (se asignó agente por defecto)' : ''}`)
          localStorage.setItem('agent_ref_code', code)
        } else {
          setAgentMessage(`Agente asignado: ${data.nombre}${data.is_default ? ' (por defecto)' : ''}`)
        }
      } else {
        setAgentMessage('No se pudo asignar un agente. Intenta de nuevo.')
      }
    } catch (error) {
      console.error('Error resolving agent code:', error)
      setAgentMessage('Error al validar el código de agente')
    } finally {
      setAgentResolving(false)
    }
  }

  const handleApplyAgentCode = async () => {
    const code = agentCodeInput.trim()
    if (!code) {
      setAgentMessage('Ingresa un código para aplicarlo')
      return
    }
    await resolveAgent(code)
  }

  const calcularCotizacion = async () => {
    if (!formData.edad || !formData.plan || !udiActual) return

    setLoading(true)
    
    const edad = parseInt(formData.edad)
    const planSeleccionado = PLANES_PPR[formData.plan]
    
    // Determinar rango de edad para buscar en la tabla
    const rangoEdad = getRangoEdad(edad)
    if (rangoEdad === 0 || !TABLA_PLANES[rangoEdad]) {
      alert('Edad no válida. Debe estar entre 18 y 50 años')
      setLoading(false)
      return
    }
    
    // Obtener datos del plan según edad
    const datoPlan = TABLA_PLANES[rangoEdad][formData.plan]
    if (!datoPlan) {
      alert('Plan no encontrado')
      setLoading(false)
      return
    }
    
    // Calcular años de pago según el plan (usando la edad del rango, no la edad real)
    let añosPago: number
    if (formData.plan === '65') {
      // Imagina ser 65: paga hasta los 65 usando la edad del rango
      añosPago = 65 - rangoEdad
    } else {
      // Imagina ser 15 o 10: paga el número de años del plan
      añosPago = planSeleccionado.años
    }
    
    if (añosPago <= 0) {
      alert('La edad debe ser menor a 65 años')
      setLoading(false)
      return
    }

    // Obtener UDI proyectada al término del plan de pago
    const fechaTerminoPago = new Date()
    fechaTerminoPago.setFullYear(fechaTerminoPago.getFullYear() + añosPago)
    const fechaTerminoPagoStr = fechaTerminoPago.toISOString().split('T')[0]
    
    let udiProyectadaPago = await getUDIValue(fechaTerminoPagoStr)
    if (!udiProyectadaPago) {
      udiProyectadaPago = await getUDIValueOrBefore(fechaTerminoPagoStr)
    }
    const udiTerminoPago = udiProyectadaPago?.valor || udiActual

    // UDI a los 65 años del cliente (para meta), solo si el plan no es 65
    let udi65 = udiTerminoPago
    if (formData.plan !== '65') {
      const añosHasta65 = 65 - rangoEdad
      const fecha65 = new Date()
      fecha65.setFullYear(fecha65.getFullYear() + añosHasta65)
      const fecha65Str = fecha65.toISOString().split('T')[0]

      let udiProyectada65 = await getUDIValue(fecha65Str)
      if (!udiProyectada65) {
        udiProyectada65 = await getUDIValueOrBefore(fecha65Str)
      }
      udi65 = udiProyectada65?.valor || udiTerminoPago
    }
    
    // Calcular UDI promedio para conversiones (aportes en MXN a lo largo del tiempo)
    const udiPromedio = (udiActual + udiTerminoPago) / 2
    
    console.log('UDI actual:', udiActual, 'UDI término pago:', udiTerminoPago, 'UDI 65:', udi65, 'UDI promedio:', udiPromedio)

    // Prima anual en MXN usando la UDI vigente hoy
    const primaAnualMXN = datoPlan.primaAnualUDI * udiActual
    const primaMensualMXN = primaAnualMXN / 12
    
    // Total aportado: UDI promedio para reflejar un valor compuesto a lo largo del tiempo
    const totalAportadoUDI = datoPlan.primaAnualUDI * añosPago
    const totalAportadoMXN = totalAportadoUDI * udiPromedio
    
    // Total Recibido a los 65 (Meta 65 de la tabla)
    const meta65UDI = datoPlan.meta65UDI
    const meta65MXN = meta65UDI * (formData.plan === '65' ? udiTerminoPago : udi65)
    
    // Deducción de impuestos (30% del total aportado)
    const deduccionISR_MXN = totalAportadoMXN * TASA_ISR
    const deduccionISR_UDI = totalAportadoUDI * TASA_ISR
    
    // Total que conseguirá al finalizar (Meta 65 + Deducción ISR)
    const totalAhorroMXN = meta65MXN + deduccionISR_MXN
    const totalAhorroUDI = meta65UDI + deduccionISR_UDI

    setResultado({
      planNombre: planSeleccionado.nombre,
      añosPago,
      primaAnualMXN,
      primaAnualUDI: datoPlan.primaAnualUDI,
      primaMensualMXN,
      primaMensualUDI: datoPlan.primaAnualUDI / 12,
      totalAportadoMXN,
      totalAportadoUDI,
      meta65MXN,
      meta65UDI,
      deduccionISR_MXN,
      deduccionISR_UDI,
      totalAhorroMXN,
      totalAhorroUDI,
      udiActual,
      udiTermino: udiTerminoPago,
      udi65,
      udiPromedio,
      esProyeccion: udiProyectadaPago?.is_projection || false
    })

    setLoading(false)
  }

  const formatMoney = (value: number) => {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN',
      minimumFractionDigits: 2
    }).format(value)
  }

  const formatUDI = (value: number) => {
    return value.toFixed(2) + ' UDIs'
  }

  const handleSolicitarAsesoria = () => {
    setShowContactForm(true)
  }

  const handleSubmitProspecto = async () => {
    // Validaciones
    if (!contactData.email || !contactData.telefono) {
      alert('Email y teléfono son obligatorios')
      return
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(contactData.email)) {
      alert('Email inválido')
      return
    }

    const telefonoLimpio = contactData.telefono.replace(/\D/g, '')
    if (telefonoLimpio.length !== 10) {
      alert('Teléfono debe tener 10 dígitos')
      return
    }

    if (!resultado || !formData.nombre) {
      alert('Faltan datos del formulario')
      return
    }

    setSubmittingProspecto(true)

    try {
      const response = await fetch('/api/landing/create-prospecto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre: formData.nombre,
          edad: parseInt(formData.edad),
          email: contactData.email,
          telefono: telefonoLimpio,
          plan: formData.plan,
          cotizacion: {
            primaAnualUDI: resultado.primaAnualUDI,
            primaMensualMXN: resultado.primaMensualMXN,
            totalAhorroMXN: resultado.totalAhorroMXN,
            meta65MXN: resultado.meta65MXN,
            añosPago: resultado.añosPago
          },
          agente_id: agenteInfo?.agente_id
        })
      })

      const data = await response.json()

      if (response.ok) {
        setProspectoCreado(true)
        setShowContactForm(false)
      } else {
        alert(data.error || 'Error al crear prospecto')
      }
    } catch (error) {
      console.error('Error submitting prospecto:', error)
      alert('Error al enviar solicitud')
    } finally {
      setSubmittingProspecto(false)
    }
  }

  return (
    <section className="quote-section" id="cotizar">
      <div className="container">
        <div className="row justify-content-center">
          <div className="col-lg-10">
            <div className="quote-card">
              <h2 className="section-title text-center">Simulador de Plan de Retiro (PPR)</h2>
              <p className="text-center mb-4">
                Calcula tu plan personalizado de retiro con deducción de impuestos
              </p>

              {!udiActual && (
                <div className="alert alert-warning text-center">
                  Cargando valores de UDI...
                </div>
              )}
              
              <div className="row g-4">
                <div className="col-md-4">
                  <label className="form-label fw-bold">Nombre</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Tu nombre completo"
                    value={formData.nombre}
                    onChange={(e) => setFormData({...formData, nombre: e.target.value})}
                  />
                </div>
                <div className="col-md-4">
                  <label className="form-label fw-bold">Edad</label>
                  <input
                    type="number"
                    className="form-control"
                    placeholder="Tu edad actual (18-50 años)"
                    min="18"
                    max="50"
                    value={formData.edad}
                    onChange={(e) => setFormData({...formData, edad: e.target.value})}
                  />
                </div>
                <div className="col-md-4">
                  <label className="form-label fw-bold">Plan</label>
                  <select
                    className="form-select"
                    value={formData.plan}
                    onChange={(e) => setFormData({...formData, plan: e.target.value})}
                  >
                    <option value="">Selecciona un plan</option>
                    <option value="65">Imagina ser 65</option>
                    <option value="15">Imagina ser 15</option>
                    <option value="10">Imagina ser 10</option>
                  </select>
                </div>
                <div className="col-12 text-center">
                  <button 
                    type="button"
                    className="btn btn-primary btn-lg"
                    onClick={calcularCotizacion}
                    disabled={!formData.edad || !formData.plan || loading}
                  >
                    {loading ? 'Calculando...' : 'Cotizar plan de retiro para el futuro'}
                  </button>
                </div>
              </div>

              {resultado && (
                <div className="mt-5">
                  <div className="alert alert-info mb-4">
                    <h5 className="mb-3">
                      {formData.nombre && `${formData.nombre}, tu `}
                      Plan: <strong>{resultado.planNombre}</strong>
                    </h5>
                    <p className="mb-1">
                      Pagarás durante <strong>{resultado.añosPago} años</strong> y recibirás tu ahorro a los 65 años.
                    </p>
                    <p className="mb-0 text-muted small">
                      Montos en MXN estimados; pueden variar según la UDI observada al momento de cada aportación y a los 65 años.
                    </p>
                  </div>

                  <div className="bg-white rounded-3 shadow-sm p-3 border">
                    <div className="d-flex justify-content-between align-items-center pb-2 border-bottom">
                      <div>
                        <div className="fw-semibold">Aportación Anual</div>
                        <div className="text-muted small">{formatUDI(resultado.primaAnualUDI)}</div>
                      </div>
                      <div className="fw-semibold">{formatMoney(resultado.primaAnualMXN)}</div>
                    </div>
                    <div className="d-flex justify-content-between align-items-center py-2 border-bottom">
                      <div>
                        <div className="fw-semibold">Aportación Mensual</div>
                        <div className="text-muted small">{formatUDI(resultado.primaMensualUDI)}</div>
                      </div>
                      <div className="fw-semibold">{formatMoney(resultado.primaMensualMXN)}</div>
                    </div>
                    <div className="d-flex justify-content-between align-items-center py-2 border-bottom">
                      <div className="fw-semibold">Total Aportado ({resultado.añosPago} años)</div>
                      <div className="fw-semibold">{formatMoney(resultado.totalAportadoMXN)}</div>
                    </div>
                    <div className="d-flex justify-content-between align-items-center py-2 border-bottom bg-light rounded-2">
                      <div className="fw-semibold">Total Recibido a los 65 (Meta)</div>
                      <div className="fw-bold text-success">{formatMoney(resultado.meta65MXN)}</div>
                    </div>
                    <div className="d-flex justify-content-between align-items-center py-2 border-bottom">
                      <div className="fw-semibold">Deducción de Impuestos (30% ISR)</div>
                      <div className="fw-semibold">{formatMoney(resultado.deduccionISR_MXN)}</div>
                    </div>
                    <div className="d-flex justify-content-between align-items-center pt-3">
                      <div>
                        <div className="fw-bold">Total que Podrás Conseguir al Finalizar</div>
                        <div className="small text-muted">Meta + deducción estimada</div>
                      </div>
                      <div className="fw-bold fs-5 text-primary">{formatMoney(resultado.totalAhorroMXN)}</div>
                    </div>
                  </div>

                  <div className="alert alert-secondary mt-3">
                    <small>
                      <strong>Supuestos del cálculo:</strong><br/>
                      • Tasa ISR para deducción: {(TASA_ISR * 100).toFixed(0)}%<br/>
                      • UDI actual (para prima anual/mensual en MXN): {resultado.udiActual.toFixed(6)}<br/>
                      • UDI al término del plan ({resultado.añosPago} años): {resultado.udiTermino.toFixed(6)} {resultado.esProyeccion ? '(proyectada)' : '(real)'} (cierra aportaciones)<br/>
                      • UDI a los 65 años: {resultado.udi65.toFixed(6)} {resultado.esProyeccion ? '(proyectada)' : '(real/proy.)'} (para meta a 65 en planes 10/15)<br/>
                      • UDI promedio (para total aportado en MXN): {resultado.udiPromedio.toFixed(6)}
                    </small>
                  </div>

                  {/* Botón para solicitar asesoría */}
                  {!prospectoCreado && !showContactForm && (
                    <div className="text-center mt-4">
                      <button
                        type="button"
                        className="btn btn-success btn-lg"
                        onClick={handleSolicitarAsesoria}
                      >
                        Solicitar asesoría personalizada
                      </button>
                      {agenteInfo && !agenteInfo.is_default && (
                        <p className="text-muted small mt-2">
                          Asesor asignado: <strong>{agenteInfo.nombre}</strong>
                        </p>
                      )}
                    </div>
                  )}

                  {/* Formulario de contacto expandible */}
                  {showContactForm && !prospectoCreado && (
                    <div className="mt-4 p-4 border rounded-3 bg-light">
                      <h5 className="mb-3">Completa tus datos para que un asesor te contacte</h5>
                      <div className="row g-3 align-items-end mb-2">
                        <div className="col-md-8">
                          <label className="form-label fw-bold">Código de agente (opcional)</label>
                          <input
                            type="text"
                            className="form-control"
                            placeholder="Escribe el código y presiona Aplicar"
                            value={agentCodeInput}
                            onChange={(e) => setAgentCodeInput(e.target.value.toUpperCase())}
                          />
                        </div>
                        <div className="col-md-4 d-flex gap-2">
                          <button
                            type="button"
                            className="btn btn-outline-primary w-100"
                            onClick={handleApplyAgentCode}
                            disabled={agentResolving}
                          >
                            {agentResolving ? 'Validando...' : 'Aplicar código'}
                          </button>
                        </div>
                        {agentMessage && (
                          <div className="col-12">
                            <div className="alert alert-info py-2 mb-0">
                              <small>{agentMessage}</small>
                            </div>
                          </div>
                        )}
                      </div>
                      <div className="row g-3">
                        <div className="col-md-6">
                          <label className="form-label fw-bold">Email</label>
                          <input
                            type="email"
                            className="form-control"
                            placeholder="tu@email.com"
                            value={contactData.email}
                            onChange={(e) => setContactData({...contactData, email: e.target.value})}
                            required
                          />
                        </div>
                        <div className="col-md-6">
                          <label className="form-label fw-bold">Teléfono</label>
                          <input
                            type="tel"
                            className="form-control"
                            placeholder="5512345678 (10 dígitos)"
                            value={contactData.telefono}
                            onChange={(e) => setContactData({...contactData, telefono: e.target.value})}
                            maxLength={10}
                            required
                          />
                        </div>
                        <div className="col-12 d-flex gap-2 justify-content-end">
                          <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={() => setShowContactForm(false)}
                            disabled={submittingProspecto}
                          >
                            Cancelar
                          </button>
                          <button
                            type="button"
                            className="btn btn-success"
                            onClick={handleSubmitProspecto}
                            disabled={submittingProspecto || !contactData.email || !contactData.telefono}
                          >
                            {submittingProspecto ? 'Enviando...' : 'Enviar solicitud'}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Mensaje de éxito */}
                  {prospectoCreado && (
                    <div className="alert alert-success mt-4">
                      <h5 className="alert-heading">¡Gracias por tu interés!</h5>
                      <p className="mb-0">
                        Hemos recibido tu solicitud. Un asesor se pondrá en contacto contigo pronto para brindarte más información sobre tu plan de retiro.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
