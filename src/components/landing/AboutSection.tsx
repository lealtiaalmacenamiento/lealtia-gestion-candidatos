export default function AboutSection() {
  const benefits = [
    { icon: 'bi-shield-check', text: 'Cotizaciones personalizadas' },
    { icon: 'bi-people', text: 'Acompañamiento real' },
    { icon: 'bi-heart', text: 'Comunidad activa' },
    { icon: 'bi-house', text: 'Home office' },
    { icon: 'bi-graph-up-arrow', text: 'Desarrollo profesional' },
  ]

  return (
    <section className="about-section" id="beneficios">
      <div className="container">
        <div className="row justify-content-center">
          <div className="col-lg-8 text-center">
            <h2 className="section-title">¿Qué es Lealtia?</h2>
            <p className="section-description">
              Lealtia es una promotoría de seguros que impulsa personas a proteger su futuro 
              y desarrollar una carrera como agentes, mediante acompañamiento, capacitación y comunidad.
            </p>
          </div>
        </div>
        
        <div className="row mt-5 g-4 justify-content-center">
          {benefits.map((benefit, index) => (
            <div key={index} className="col-6 col-md-4 col-lg-2">
              <div className="benefit-card">
                <i className={`bi ${benefit.icon}`}></i>
                <p>{benefit.text}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
