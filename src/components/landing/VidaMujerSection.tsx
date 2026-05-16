"use client"
import { useState, useEffect } from 'react'
import { getUDIValueOrBefore } from '@/lib/udi'

const TASA_INFLACION = 0.05

// Tabla de primas anuales en UDIS por suma asegurada y rango de edad
// Fuente: folleto oficial Inversión Mujer GNP
const TABLA_VIDA_MUJER: Record<number, Record<number, number>> = {
  35000: { 25: 2291, 30: 2315, 35: 2360, 40: 2446, 45: 2594 },
  45000: { 25: 2828, 30: 2850, 35: 2897, 40: 2986, 45: 3143 },
  55000: { 25: 3364, 30: 3385, 35: 3434, 40: 3527, 45: 3692 },
  65000: { 25: 3901, 30: 3920, 35: 3971, 40: 4068, 45: 4240 },
  75000: { 25: 4437, 30: 4455, 35: 4507, 40: 4608, 45: 4789 },
}

const SUMAS_ASEGURADAS = [35000, 45000, 55000, 65000, 75000]

// Redondea la edad al rango de la tabla (25/30/35/40/45)
function getRangoEdad(edad: number): number {
  if (edad >= 18 && edad <= 25) return 25
  if (edad >= 26 && edad <= 30) return 30
  if (edad >= 31 && edad <= 35) return 35
  if (edad >= 36 && edad <= 40) return 40
  if (edad >= 41 && edad <= 45) return 45
  return 0
}

const formatMoney = (v: number) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v)

const formatUDI = (v: number) =>
  new Intl.NumberFormat('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v) + ' UDIs'

export default function VidaMujerSection() {
  const [formData, setFormData] = useState({ nombre: '', edad: '', sa: '' })
  const [resultado, setResultado] = useState<ReturnType<typeof calcular> | null>(null)
  const [udiActual, setUdiActual] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [agenteInfo, setAgenteInfo] = useState<{ agente_id: number; nombre: string; is_default: boolean } | null>(null)
  const [agentCodeInput, setAgentCodeInput] = useState('')
  const [agentMessage, setAgentMessage] = useState<string | null>(null)
  const [agentResolving, setAgentResolving] = useState(false)
  const [showContactForm, setShowContactForm] = useState(false)
  const [contactData, setContactData] = useState({ email: '', telefono: '' })
  const [submittingProspecto, setSubmittingProspecto] = useState(false)
  const [prospectoCreado, setProspectoCreado] = useState(false)
  const [saMXNPreview, setSaMXNPreview] = useState<string | null>(null)

  useEffect(() => {
    const fetchUdi = async () => {
      const hoy = new Date().toISOString().split('T')[0]
      const udi = await getUDIValueOrBefore(hoy)
      if (udi) setUdiActual(udi.valor)
    }
    fetchUdi()

    const resolveAgentCode = async () => {
      const urlParams = new URLSearchParams(window.location.search)
      let code = urlParams.get('code') || urlParams.get('ref')
      if (code) localStorage.setItem('agent_ref_code', code)
      else code = localStorage.getItem('agent_ref_code')
      if (code) setAgentCodeInput(code.toUpperCase())
      await resolveAgent(code || undefined)
    }
    resolveAgentCode()
  }, [])

  // Actualizar preview del SA en pesos cuando cambia el dropdown o la UDI
  useEffect(() => {
    if (formData.sa && udiActual) {
      const sa = parseInt(formData.sa)
      setSaMXNPreview(formatMoney(sa * udiActual))
    } else {
      setSaMXNPreview(null)
    }
  }, [formData.sa, udiActual])

  const resolveAgent = async (code?: string) => {
    try {
      setAgentResolving(true)
      setAgentMessage(null)
      const res = await fetch(`/api/landing/resolve-agent${code ? `?code=${code}` : ''}`)
      const data = await res.json()
      if (res.ok && data.agente_id) {
        setAgenteInfo({ agente_id: data.agente_id, nombre: data.nombre, is_default: data.is_default || false })
        if (code) {
          setAgentMessage(`Código aplicado: ${code.toUpperCase()}`)
          localStorage.setItem('agent_ref_code', code)
        }
      } else {
        setAgentMessage('No se pudo asignar un agente. Intenta de nuevo.')
      }
    } catch {
      setAgentMessage('Error al validar el código de agente')
    } finally {
      setAgentResolving(false)
    }
  }

  const handleApplyAgentCode = async () => {
    const code = agentCodeInput.trim()
    if (!code) { setAgentMessage('Ingresa un código para aplicarlo'); return }
    await resolveAgent(code)
  }

  const ANOS_DOTE = [5, 7, 9, 11, 13, 15, 17] as const

  function calcular(saUDI: number, rangoEdad: number, primaAnualUDI: number, udiHoy: number, udiPorAno: Record<number, number>) {
    const primaAnualMXN = primaAnualUDI * udiHoy
    const primaMensualMXN = primaAnualMXN / 12
    const primaMensualUDI = primaAnualUDI / 12
    const totalAportadoUDI = primaAnualUDI * 20
    const totalAportadoMXN = primaAnualMXN * 20 // pesos de hoy, orientativo

    // Dotes: 7 pagos × 5% = 35%, pago final 80%, total 115%
    const dotesUDI = saUDI * 0.35        // 7 × 5%
    const pagoFinalUDI = saUDI * 0.80
    const totalRecibidoUDI = saUDI * 1.15

    // MXN por año usando la UDI proyectada para ese año específico
    const doteMXNPorAno: Record<number, number> = {}
    for (const ano of ANOS_DOTE) {
      doteMXNPorAno[ano] = saUDI * 0.05 * (udiPorAno[ano] ?? udiHoy)
    }
    const pagoFinalMXN = pagoFinalUDI * (udiPorAno[20] ?? udiHoy)
    const coberturaFallecimientoMXN = saUDI * udiHoy

    // Total recibido = suma de cada pago con su UDI proyectada real
    const totalRecibidoMXN =
      ANOS_DOTE.reduce((sum, ano) => sum + doteMXNPorAno[ano], 0) + pagoFinalMXN

    return {
      rangoEdad,
      primaAnualUDI,
      primaAnualMXN,
      primaMensualMXN,
      primaMensualUDI,
      totalAportadoUDI,
      totalAportadoMXN,
      dotesUDI,
      doteMXNPorAno,
      pagoFinalUDI,
      pagoFinalMXN,
      totalRecibidoUDI,
      totalRecibidoMXN,
      coberturaFallecimientoMXN,
      saUDI,
      udiHoy,
      udiPorAno,
    }
  }

  const handleCotizar = () => {
    if (!formData.edad || !formData.sa || !udiActual) return
    setLoading(true)

    const edad = parseInt(formData.edad)
    const saUDI = parseInt(formData.sa)
    const rangoEdad = getRangoEdad(edad)

    if (rangoEdad === 0) {
      alert('Edad no válida. Debe estar entre 18 y 45 años.')
      setLoading(false)
      return
    }

    const primaAnualUDI = TABLA_VIDA_MUJER[saUDI]?.[rangoEdad]
    if (!primaAnualUDI) {
      alert('No se encontró la prima para esa combinación de edad y suma asegurada.')
      setLoading(false)
      return
    }

    // Proyección UDI: UDI_actual × (1 + 5%)^(año - 1)  — fórmula Excel
    const udiPorAno: Record<number, number> = {}
    for (const ano of [5, 7, 9, 11, 13, 15, 17, 20]) {
      udiPorAno[ano] = udiActual * Math.pow(1 + TASA_INFLACION, ano - 1)
    }

    setResultado(calcular(saUDI, rangoEdad, primaAnualUDI, udiActual, udiPorAno))
    setLoading(false)
  }

  const handleSubmitProspecto = async () => {
    if (!contactData.email || !contactData.telefono) { alert('Email y teléfono son obligatorios'); return }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(contactData.email)) { alert('Email inválido'); return }
    const telefonoLimpio = contactData.telefono.replace(/\D/g, '')
    if (telefonoLimpio.length !== 10) { alert('Teléfono debe tener 10 dígitos'); return }
    if (!resultado || !formData.nombre) { alert('Faltan datos del formulario'); return }

    setSubmittingProspecto(true)
    try {
      const res = await fetch('/api/landing/create-prospecto-vida-mujer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre: formData.nombre,
          edad: parseInt(formData.edad),
          email: contactData.email,
          telefono: telefonoLimpio,
          cotizacion: {
            sumaAseguradaUDI: resultado.saUDI,
            primaAnualUDI: resultado.primaAnualUDI,
            primaAnualMXN: resultado.primaAnualMXN,
            totalRecibidoUDI: resultado.totalRecibidoUDI,
            totalRecibidoMXN: resultado.totalRecibidoMXN,
          },
          agente_id: agenteInfo?.agente_id,
        }),
      })
      const data = await res.json()
      if (res.ok) { setProspectoCreado(true); setShowContactForm(false) }
      else alert(data.error || 'Error al crear prospecto')
    } catch {
      alert('Error al enviar solicitud')
    } finally {
      setSubmittingProspecto(false)
    }
  }

  return (
    <section
      id="vida-mujer"
      style={{
        background: 'linear-gradient(160deg, #F3F1FA 0%, #ffffff 60%)',
        padding: '5rem 0',
      }}
    >
      <div className="container">
        <div className="row justify-content-center">
          <div className="col-lg-10">

            {/* Header */}
            <div className="text-center mb-5">
              <span
                style={{
                  display: 'inline-block',
                  background: '#8E8AB5',
                  color: '#fff',
                  borderRadius: '20px',
                  padding: '4px 16px',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  marginBottom: '12px',
                }}
              >
                Diseñado para mujeres
              </span>
              <h2
                style={{
                  color: '#E59A5A',
                  fontWeight: 300,
                  fontSize: 'clamp(1.8rem, 4vw, 2.6rem)',
                  letterSpacing: '-0.5px',
                  lineHeight: 1.2,
                  marginBottom: '0.75rem',
                }}
              >
                Simulador Inversión Mujer
              </h2>
              <p style={{ color: '#2F5D7C', fontWeight: 500, fontSize: '1.05rem', maxWidth: 560, margin: '0 auto 0.5rem' }}>
                Protección de vida + ahorro programado que te devuelve dinero durante 20 años
              </p>
              <p style={{ color: '#888', fontSize: '0.9rem', maxWidth: 480, margin: '0 auto' }}>
                Sin tecnicismos — te explicamos exactamente cuánto pagas y cuánto recibes
              </p>
            </div>

            {/* How it works strips */}
            <div
              className="d-flex flex-wrap justify-content-center gap-3 mb-5"
            >
              {[
                { icon: '💳', title: 'Pagas', desc: 'Una prima anual fija durante 20 años' },
                { icon: '🛡️', title: 'Te protegen', desc: 'Cobertura de vida y salud todo el tiempo' },
                { icon: '🎁', title: 'Recibes', desc: 'Tu dinero de regreso en etapas — ¡más de lo que pagaste!' },
              ].map((step) => (
                <div
                  key={step.title}
                  style={{
                    background: '#fff',
                    border: '1px solid #E8E4F3',
                    borderRadius: '14px',
                    padding: '16px 20px',
                    minWidth: 160,
                    flex: '1 1 160px',
                    maxWidth: 220,
                    textAlign: 'center',
                    boxShadow: '0 2px 8px rgba(142,138,181,0.10)',
                  }}
                >
                  <div style={{ fontSize: '1.8rem', marginBottom: '6px' }}>{step.icon}</div>
                  <div style={{ fontWeight: 700, color: '#2F5D7C', fontSize: '0.95rem' }}>{step.title}</div>
                  <div style={{ color: '#888', fontSize: '0.82rem', lineHeight: 1.4, marginTop: 2 }}>{step.desc}</div>
                </div>
              ))}
            </div>

            {/* Form card */}
            <div
              style={{
                background: '#fff',
                borderRadius: '20px',
                boxShadow: '0 4px 32px rgba(142,138,181,0.13)',
                padding: '2rem 2.5rem',
                border: '1px solid #EDE9F7',
              }}
            >
              {!udiActual && (
                <div className="alert alert-warning text-center mb-4">
                  Cargando datos del mercado...
                </div>
              )}

              <div className="row g-4">
                <div className="col-md-4">
                  <label className="form-label fw-bold" style={{ color: '#2F5D7C' }}>
                    Tu nombre
                  </label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Nombre completo"
                    value={formData.nombre}
                    onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                    style={{ borderColor: '#C8C4E8', borderRadius: '10px' }}
                  />
                </div>

                <div className="col-md-4">
                  <label className="form-label fw-bold" style={{ color: '#2F5D7C' }}>
                    Tu edad
                  </label>
                  <select
                    className="form-select"
                    value={formData.edad}
                    onChange={(e) => setFormData({ ...formData, edad: e.target.value })}
                    style={{ borderColor: '#C8C4E8', borderRadius: '10px' }}
                  >
                    <option value="">Selecciona tu edad</option>
                    <option value="25">25 años</option>
                    <option value="30">30 años</option>
                    <option value="35">35 años</option>
                    <option value="40">40 años</option>
                    <option value="45">45 años</option>
                  </select>
                </div>

                <div className="col-md-4">
                  <label className="form-label fw-bold" style={{ color: '#2F5D7C' }}>
                    ¿Cuánto quieres asegurar?
                  </label>
                  <select
                    className="form-select"
                    value={formData.sa}
                    onChange={(e) => setFormData({ ...formData, sa: e.target.value })}
                    style={{ borderColor: '#C8C4E8', borderRadius: '10px' }}
                  >
                    <option value="">Elige una cantidad</option>
                    {SUMAS_ASEGURADAS.map((sa) => (
                      <option key={sa} value={sa}>
                        {new Intl.NumberFormat('es-MX').format(sa)} UDIs
                      </option>
                    ))}
                  </select>
                  {saMXNPreview && (
                    <div className="form-text" style={{ color: '#8E8AB5' }}>
                      ≈ {saMXNPreview} al valor de hoy
                    </div>
                  )}
                  {!saMXNPreview && (
                    <div className="form-text" style={{ color: '#8E8AB5' }}>
                      Las UDIs son unidades que crecen con la inflación — tu ahorro conserva su valor
                    </div>
                  )}
                </div>

                <div className="col-12 text-center">
                  <button
                    type="button"
                    style={{
                      background: 'linear-gradient(90deg, #E59A5A 0%, #D4854A 100%)',
                      border: 'none',
                      borderRadius: '12px',
                      color: '#fff',
                      fontWeight: 700,
                      fontSize: '1rem',
                      padding: '14px 36px',
                      cursor: 'pointer',
                      boxShadow: '0 4px 16px rgba(229,154,90,0.35)',
                      transition: 'opacity 0.2s',
                      opacity: (!formData.edad || !formData.sa || loading) ? 0.6 : 1,
                    }}
                    onClick={handleCotizar}
                    disabled={!formData.edad || !formData.sa || loading}
                  >
                    {loading ? 'Calculando...' : 'Calcular mi plan Inversión Mujer'}
                  </button>
                </div>
              </div>

              {/* Resultados */}
              {resultado && (
                <div className="mt-5">

                  {/* Intro banner */}
                  <div
                    style={{
                      background: 'linear-gradient(90deg, #F3F1FA, #EAE7F7)',
                      border: '1px solid #C8C4E8',
                      borderRadius: '14px',
                      padding: '20px 24px',
                      marginBottom: '1.5rem',
                    }}
                  >
                    <h5 style={{ color: '#2F5D7C', marginBottom: '6px', fontWeight: 600 }}>
                      {formData.nombre ? `${formData.nombre}, aquí está tu plan ✨` : 'Tu plan Inversión Mujer ✨'}
                    </h5>
                    <p style={{ color: '#555', marginBottom: 0, fontSize: '0.93rem', lineHeight: 1.6 }}>
                      Con una suma asegurada de <strong>{formatUDI(resultado.saUDI)}</strong> a tus <strong>{resultado.rangoEdad} años</strong>,
                      este es tu resumen.
                    </p>
                  </div>

                  {/* Results cards */}
                  <div className="row g-3 mb-4">

                    {/* Prima anual */}
                    <div className="col-md-6">
                      <div
                        style={{
                          background: '#fff',
                          border: '1px solid #EDE9F7',
                          borderLeft: '4px solid #E59A5A',
                          borderRadius: '12px',
                          padding: '18px 20px',
                          height: '100%',
                        }}
                      >
                        <div style={{ color: '#888', fontSize: '0.82rem', marginBottom: 4 }}>LO QUE PAGAS CADA AÑO</div>
                        <div style={{ color: '#E59A5A', fontWeight: 700, fontSize: '1.5rem' }}>
                          {formatMoney(resultado.primaAnualMXN)}
                        </div>
                        <div style={{ color: '#8E8AB5', fontSize: '0.85rem' }}>
                          {formatUDI(resultado.primaAnualUDI)} · {formatMoney(resultado.primaMensualMXN)}<span style={{ fontSize: '0.78rem' }}>/mes</span>
                        </div>
                        <div style={{ color: '#aaa', fontSize: '0.78rem', marginTop: 6 }}>
                          Al precio del UDI de hoy (${resultado.udiHoy.toFixed(2)})
                        </div>
                      </div>
                    </div>

                    {/* Total recibido */}
                    <div className="col-md-6">
                      <div
                        style={{
                          background: '#fff',
                          border: '1px solid #EDE9F7',
                          borderLeft: '4px solid #8E8AB5',
                          borderRadius: '12px',
                          padding: '18px 20px',
                          height: '100%',
                        }}
                      >
                        <div style={{ color: '#888', fontSize: '0.82rem', marginBottom: 4 }}>
                          LO QUE RECIBIRÁS EN TOTAL
                          <span
                            style={{
                              background: '#8E8AB5',
                              color: '#fff',
                              borderRadius: '8px',
                              padding: '1px 8px',
                              fontSize: '0.72rem',
                              marginLeft: 8,
                              fontWeight: 700,
                            }}
                          >
                            115% garantizado
                          </span>
                        </div>
                        <div style={{ color: '#2F5D7C', fontWeight: 700, fontSize: '1.5rem' }}>
                          {formatUDI(resultado.totalRecibidoUDI)}
                        </div>
                        <div style={{ color: '#8E8AB5', fontSize: '0.85rem' }}>
                          ≈ {formatMoney(resultado.totalRecibidoMXN)}{' '}
                          <span style={{ fontSize: '0.78rem', color: '#aaa' }}>(valor esperado)</span>
                        </div>
                        <div style={{ color: '#aaa', fontSize: '0.78rem', marginTop: 6 }}>
                          Las UDIs se ajustan a la inflación — tu poder adquisitivo se mantiene
                        </div>
                      </div>
                    </div>

                    {/* Cobertura de vida */}
                    <div className="col-md-6">
                      <div
                        style={{
                          background: '#fff',
                          border: '1px solid #EDE9F7',
                          borderLeft: '4px solid #2F5D7C',
                          borderRadius: '12px',
                          padding: '18px 20px',
                          height: '100%',
                        }}
                      >
                        <div style={{ color: '#888', fontSize: '0.82rem', marginBottom: 4 }}>PROTECCIÓN DE VIDA INCLUIDA</div>
                        <div style={{ color: '#2F5D7C', fontWeight: 700, fontSize: '1.4rem' }}>
                          {formatMoney(resultado.coberturaFallecimientoMXN)}
                        </div>
                        <div style={{ color: '#8E8AB5', fontSize: '0.85rem' }}>
                          {formatUDI(resultado.saUDI)} en caso de fallecimiento
                        </div>
                        <div style={{ color: '#aaa', fontSize: '0.78rem', marginTop: 6 }}>
                          Tu familia recibe el 100% — aunque ya hayas recibido pagos
                        </div>
                      </div>
                    </div>

                    {/* Pagos en vida */}
                    <div className="col-md-6">
                      <div
                        style={{
                          background: '#FFF8F3',
                          border: '1px solid #F5D9BE',
                          borderLeft: '4px solid #E59A5A',
                          borderRadius: '12px',
                          padding: '18px 20px',
                          height: '100%',
                        }}
                      >
                        <div style={{ color: '#888', fontSize: '0.82rem', marginBottom: 10 }}>PAGOS QUE RECIBES EN VIDA</div>
                        {/* 7 dotes */}
                        {[5, 7, 9, 11, 13, 15, 17].map((año) => (
                          <div key={año} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #F5D9BE', padding: '4px 0', fontSize: '0.87rem' }}>
                            <span style={{ color: '#777' }}>Año {año}</span>
                            <span style={{ color: '#E59A5A', fontWeight: 600 }}>
                              {formatUDI(resultado.saUDI * 0.05)}
                              <span style={{ color: '#aaa', fontWeight: 400, fontSize: '0.78rem', marginLeft: 4 }}>≈ {formatMoney(resultado.doteMXNPorAno[año])}</span>
                            </span>
                          </div>
                        ))}
                        {/* pago final */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0 0', fontSize: '0.87rem' }}>
                          <span style={{ color: '#777', fontWeight: 600 }}>Año 20 (final)</span>
                          <span style={{ color: '#E59A5A', fontWeight: 700 }}>
                            {formatUDI(resultado.pagoFinalUDI)}
                            <span style={{ color: '#aaa', fontWeight: 400, fontSize: '0.78rem', marginLeft: 4 }}>≈ {formatMoney(resultado.pagoFinalMXN)}</span>
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* UDI note */}
                  <div
                    style={{
                      background: '#F9F8FF',
                      border: '1px solid #E8E4F3',
                      borderRadius: '10px',
                      padding: '12px 18px',
                      marginBottom: '1.5rem',
                      fontSize: '0.82rem',
                      color: '#777',
                      lineHeight: 1.6,
                    }}
                  >
                    <strong style={{ color: '#8E8AB5' }}>¿Qué significa &quot;valor esperado&quot;?</strong>{' '}
                    Los montos en pesos son estimaciones basadas en el valor proyectado del UDI en el año de cada pago.
                    Como el UDI sube con la inflación, en la práctica recibirás más pesos — pero el UDI garantizado es el dato firme.
                    Prima de hoy: <strong>${resultado.udiHoy.toFixed(4)}</strong> por UDI.
                  </div>

                  {/* CTA */}
                  {!prospectoCreado && !showContactForm && (
                    <div className="text-center">
                      <button
                        type="button"
                        style={{
                          background: 'linear-gradient(90deg, #2F5D7C 0%, #245070 100%)',
                          border: 'none',
                          borderRadius: '12px',
                          color: '#fff',
                          fontWeight: 700,
                          fontSize: '1rem',
                          padding: '14px 36px',
                          cursor: 'pointer',
                          boxShadow: '0 4px 16px rgba(47,93,124,0.25)',
                        }}
                        onClick={() => setShowContactForm(true)}
                      >
                        Quiero más información — que me contacte un asesor
                      </button>
                    </div>
                  )}

                  {/* Contact form */}
                  {showContactForm && !prospectoCreado && (
                    <div
                      style={{
                        background: '#F9F8FF',
                        border: '1px solid #C8C4E8',
                        borderRadius: '16px',
                        padding: '24px',
                        marginTop: '1.5rem',
                      }}
                    >
                      <h5 style={{ color: '#2F5D7C', marginBottom: '0.25rem' }}>Un asesor se pondrá en contacto contigo</h5>
                      <p style={{ color: '#888', fontSize: '0.88rem', marginBottom: '1.25rem' }}>
                        Sin compromiso. Solo para resolver tus dudas y personalizar tu plan.
                      </p>

                      <div className="row g-3 align-items-end mb-3">
                        <div className="col-md-8">
                          <label className="form-label fw-bold" style={{ color: '#2F5D7C' }}>Código de agente (opcional)</label>
                          <input
                            type="text"
                            className="form-control"
                            placeholder="Escribe el código si alguien te lo compartió"
                            value={agentCodeInput}
                            onChange={(e) => setAgentCodeInput(e.target.value.toUpperCase())}
                            style={{ borderColor: '#C8C4E8', borderRadius: '10px' }}
                          />
                        </div>
                        <div className="col-md-4">
                          <button
                            type="button"
                            className="btn w-100"
                            style={{ background: '#EDE9F7', color: '#2F5D7C', fontWeight: 600, borderRadius: '10px' }}
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
                          <label className="form-label fw-bold" style={{ color: '#2F5D7C' }}>Correo electrónico</label>
                          <input
                            type="email"
                            className="form-control"
                            placeholder="tu@correo.com"
                            value={contactData.email}
                            onChange={(e) => setContactData({ ...contactData, email: e.target.value })}
                            style={{ borderColor: '#C8C4E8', borderRadius: '10px' }}
                          />
                        </div>
                        <div className="col-md-6">
                          <label className="form-label fw-bold" style={{ color: '#2F5D7C' }}>Teléfono</label>
                          <input
                            type="tel"
                            className="form-control"
                            placeholder="10 dígitos (ej. 5512345678)"
                            value={contactData.telefono}
                            onChange={(e) => setContactData({ ...contactData, telefono: e.target.value })}
                            maxLength={10}
                            style={{ borderColor: '#C8C4E8', borderRadius: '10px' }}
                          />
                        </div>
                        <div className="col-12 d-flex gap-2 justify-content-end">
                          <button
                            type="button"
                            className="btn btn-outline-secondary"
                            style={{ borderRadius: '10px' }}
                            onClick={() => setShowContactForm(false)}
                            disabled={submittingProspecto}
                          >
                            Cancelar
                          </button>
                          <button
                            type="button"
                            style={{
                              background: 'linear-gradient(90deg, #E59A5A 0%, #D4854A 100%)',
                              border: 'none',
                              borderRadius: '10px',
                              color: '#fff',
                              fontWeight: 700,
                              padding: '10px 28px',
                              cursor: 'pointer',
                              opacity: submittingProspecto || !contactData.email || !contactData.telefono ? 0.6 : 1,
                            }}
                            onClick={handleSubmitProspecto}
                            disabled={submittingProspecto || !contactData.email || !contactData.telefono}
                          >
                            {submittingProspecto ? 'Enviando...' : 'Enviar solicitud'}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Success */}
                  {prospectoCreado && (
                    <div
                      style={{
                        background: 'linear-gradient(90deg, #F3F1FA, #EAE7F7)',
                        border: '1px solid #8E8AB5',
                        borderRadius: '14px',
                        padding: '24px',
                        textAlign: 'center',
                        marginTop: '1.5rem',
                      }}
                    >
                      <div style={{ fontSize: '2rem', marginBottom: 8 }}>🌸</div>
                      <h5 style={{ color: '#2F5D7C', fontWeight: 700 }}>¡Gracias, {formData.nombre || 'gracias'}!</h5>
                      <p style={{ color: '#555', marginBottom: 0, fontSize: '0.95rem' }}>
                        Recibimos tu solicitud. Un asesor se pondrá en contacto contigo para resolver tus dudas y ayudarte a
                        personalizar tu plan Inversión Mujer.
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
