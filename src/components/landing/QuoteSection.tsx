"use client"

import { useEffect, useState } from 'react'

export default function QuoteSection() {
  const [agentCode, setAgentCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [validating, setValidating] = useState(false)
  const [message, setMessage] = useState<{ type: 'info' | 'error'; text: string } | null>(null)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const code = params.get('code') || params.get('ref') || localStorage.getItem('agent_ref_code') || ''
    if (code) setAgentCode(code.toUpperCase())
  }, [])

  async function validateAgentCode() {
    const code = agentCode.trim().toUpperCase()
    setMessage(null)
    if (!code) {
      localStorage.removeItem('agent_ref_code')
      setMessage({
        type: 'info',
        text: 'Puedes continuar sin código y te asignaremos un asesor disponible.'
      })
      return
    }

    setValidating(true)
    try {
      const response = await fetch(`/api/landing/resolve-agent?code=${encodeURIComponent(code)}`, {
        cache: 'no-store'
      })
      const json = await response.json()
      if (!response.ok) throw new Error(json.error || 'No se pudo validar el código')
      if (json.code_error) {
        localStorage.removeItem('agent_ref_code')
        setMessage({
          type: 'error',
          text: 'No encontramos ese código. Puedes continuar y se asignará un asesor disponible.'
        })
        return
      }
      localStorage.setItem('agent_ref_code', code)
      setAgentCode(code)
      setMessage({
        type: 'info',
        text: `Código validado${json.nombre ? ` para ${json.nombre}` : ''}.`
      })
    } catch (error) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'No se pudo validar el código'
      })
    } finally {
      setValidating(false)
    }
  }

  async function startQuestionnaire() {
    setLoading(true)
    setMessage(null)
    const code = agentCode.trim().toUpperCase()
    if (code) localStorage.setItem('agent_ref_code', code)

    try {
      const response = await fetch('/api/public/cuestionarios/landing-ppr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent_code: code || null })
      })
      const json = await response.json()
      if (!response.ok) throw new Error(json.error || 'No se pudo iniciar el diagnóstico')
      if (json.agent?.code_error) {
        localStorage.removeItem('agent_ref_code')
      }
      window.location.assign(json.public_url)
    } catch (error) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'No se pudo abrir el cuestionario'
      })
      setLoading(false)
    }
  }

  return (
    <section className="quote-section" id="cotizar">
      <div className="container">
        <div className="row justify-content-center">
          <div className="col-lg-9">
            <div className="quote-card text-center">
              <h2 className="section-title">Conoce tu Plan Personal de Retiro</h2>
              <p className="lead mb-4">
                Responde un cuestionario breve, simula tu PPR y agenda una sesión con un asesor.
              </p>

              <div className="mx-auto text-start" style={{ maxWidth: 560 }}>
                <label className="form-label fw-bold">Código de agente o asesor (opcional)</label>
                <div className="input-group input-group-lg">
                  <input
                    type="text"
                    className="form-control text-uppercase"
                    placeholder="Código de agente"
                    value={agentCode}
                    onChange={event => setAgentCode(event.target.value.toUpperCase())}
                    maxLength={32}
                  />
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => void validateAgentCode()}
                    disabled={loading || validating}
                  >
                    {validating ? 'Validando…' : 'Validar'}
                  </button>
                </div>
                <div className="form-text">
                  Si no tienes código, continúa sin capturarlo y te asignaremos un asesor disponible.
                </div>
              </div>

              <button
                type="button"
                className="btn btn-success btn-lg mt-4"
                onClick={() => void startQuestionnaire()}
                disabled={loading || validating}
              >
                {loading ? 'Preparando cuestionario…' : 'Aplicar'}
              </button>

              {message && (
                <div className={`alert ${message.type === 'error' ? 'alert-danger' : 'alert-info'} mt-4 mb-0`}>
                  {message.text}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
