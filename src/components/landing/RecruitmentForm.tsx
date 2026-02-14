"use client"
import { useState } from 'react'

export default function RecruitmentForm() {
  const [formData, setFormData] = useState({
    nombre: '',
    ciudad: '',
    edad: '',
    telefono: '',
    email: '',
    interes: ''
  })
  const [submitting, setSubmitting] = useState(false)
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setNotification(null)

    try {
      const response = await fetch('/api/landing/recruitment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      })

      const data = await response.json()

      if (response.ok) {
        setNotification({ type: 'success', message: '¡Gracias! Tu solicitud ha sido enviada correctamente. Nos pondremos en contacto contigo pronto.' })
        // Limpiar formulario
        setFormData({
          nombre: '',
          ciudad: '',
          edad: '',
          telefono: '',
          email: '',
          interes: ''
        })
      } else {
        setNotification({ type: 'error', message: data.error || 'Error al enviar la solicitud. Por favor intenta nuevamente.' })
      }
    } catch (error) {
      console.error('Error submitting form:', error)
      setNotification({ type: 'error', message: 'Error al enviar la solicitud. Por favor intenta nuevamente.' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="recruitment-form" id="formulario-reclutamiento">
      <div className="container">
        <div className="row justify-content-center">
          <div className="col-lg-8">
            <div className="form-card">
              <h2 className="section-title text-center">Únete a Lealtia</h2>
              <p className="text-center mb-4">
                Completa el formulario y nos pondremos en contacto contigo
              </p>
              
              {notification && (
                <div className={`alert alert-${notification.type === 'success' ? 'success' : 'danger'} mb-4`} role="alert">
                  {notification.message}
                </div>
              )}
              
              <form onSubmit={handleSubmit}>
                <div className="row g-3">
                  <div className="col-md-6">
                    <label className="form-label">Nombre completo</label>
                    <input
                      type="text"
                      className="form-control"
                      value={formData.nombre}
                      onChange={(e) => setFormData({...formData, nombre: e.target.value})}
                      required
                      disabled={submitting}
                    />
                  </div>
                  <div className="col-md-6">
                    <label className="form-label">Ciudad</label>
                    <input
                      type="text"
                      className="form-control"
                      value={formData.ciudad}
                      onChange={(e) => setFormData({...formData, ciudad: e.target.value})}
                      required
                      disabled={submitting}
                    />
                  </div>
                  <div className="col-md-6">
                    <label className="form-label">Edad</label>
                    <input
                      type="number"
                      className="form-control"
                      value={formData.edad}
                      onChange={(e) => setFormData({...formData, edad: e.target.value})}
                      required
                      min="18"
                      max="99"
                      disabled={submitting}
                    />
                  </div>
                  <div className="col-md-6">
                    <label className="form-label">Teléfono</label>
                    <input
                      type="tel"
                      className="form-control"
                      value={formData.telefono}
                      onChange={(e) => setFormData({...formData, telefono: e.target.value})}
                      required
                      disabled={submitting}
                    />
                  </div>
                  <div className="col-md-6">
                    <label className="form-label">Email</label>
                    <input
                      type="email"
                      className="form-control"
                      value={formData.email}
                      onChange={(e) => setFormData({...formData, email: e.target.value})}
                      required
                      disabled={submitting}
                    />
                  </div>
                  <div className="col-md-6">
                    <label className="form-label">Me interesa</label>
                    <select
                      className="form-select"
                      value={formData.interes}
                      onChange={(e) => setFormData({...formData, interes: e.target.value})}
                      required
                      disabled={submitting}
                    >
                      <option value="">Selecciona una opción</option>
                      <option value="cotizar">Cotizar un seguro</option>
                      <option value="agente">Ser agente</option>
                      <option value="ambos">Ambos</option>
                    </select>
                  </div>
                  <div className="col-12 text-center mt-4">
                    <button type="submit" className="btn btn-primary btn-lg" disabled={submitting}>
                      {submitting ? (
                        <>
                          <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                          Enviando...
                        </>
                      ) : (
                        'Enviar solicitud'
                      )}
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
