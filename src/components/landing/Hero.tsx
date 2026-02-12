"use client"

export default function Hero() {
  const scrollToSection = (id: string) => {
    const element = document.getElementById(id)
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
    <section className="hero">
      <div className="container">
        <div className="row align-items-center">
          <div className="col-lg-6">
            <div className="hero-content">
              <h1 className="hero-title">
                Construye tu futuro con Lealtia
              </h1>
              <p className="hero-subtitle">
                Promotoría de seguros y comunidad de agentes enfocada en tu crecimiento financiero y profesional.
              </p>
              <div className="hero-cta">
                <button 
                  className="btn btn-primary btn-lg"
                  onClick={() => scrollToSection('cotizar')}
                >
                  Cotizar Plan de Retiro para el futuro
                </button>
                <button 
                  className="btn btn-outline-primary btn-lg"
                  onClick={() => scrollToSection('ser-agente')}
                >
                  Quiero ser agente
                </button>
              </div>
            </div>
          </div>
          <div className="col-lg-6">
            <div className="hero-image">
              <div className="hero-placeholder">
                <i className="bi bi-people-fill"></i>
                <p>Comunidad profesional</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
