"use client"

export default function BecomeAgent() {
  const benefits = [
    'No necesitas experiencia',
    'Capacitación incluida',
    'Ingresos por desempeño',
    'Trabajo remoto',
    'Comunidad activa'
  ]

  const scrollToForm = () => {
    const element = document.getElementById('formulario-reclutamiento')
    if (element) {
      const navHeight = 80 // Altura aproximada de la navegación
      const elementPosition = element.getBoundingClientRect().top + window.scrollY
      const offsetPosition = elementPosition - navHeight

      window.scrollTo({
        top: offsetPosition,
        behavior: 'smooth'
      })
    }
  }

  return (
    <section className="become-agent" id="ser-agente">
      <div className="container">
        <div className="row align-items-center">
          <div className="col-lg-6">
            <h2 className="section-title">Transforma tu forma de trabajar</h2>
            <p className="section-description">
              Lealtia forma agentes profesionales desde cero con capacitación continua, 
              modelo home office, comisiones y plan de crecimiento.
            </p>
            
            <ul className="benefits-list">
              {benefits.map((benefit, index) => (
                <li key={index}>
                  <i className="bi bi-check-circle-fill"></i>
                  <span>{benefit}</span>
                </li>
              ))}
            </ul>
            
            <button 
              className="btn btn-primary btn-lg"
              onClick={scrollToForm}
            >
              Quiero ser agente
            </button>
          </div>
          
          <div className="col-lg-6">
            <div className="agent-image">
              <div className="agent-placeholder">
                <i className="bi bi-laptop"></i>
                <p>Trabajo remoto</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
