export default function WhyLealtia() {
  const features = [
    {
      icon: 'bi-headset',
      title: 'Acompañamiento continuo',
      description: 'Te apoyamos en cada paso del proceso'
    },
    {
      icon: 'bi-clipboard-check',
      title: 'Planes a tu medida',
      description: 'Soluciones personalizadas para cada necesidad'
    },
    {
      icon: 'bi-chat-dots',
      title: 'Atención directa',
      description: 'Contacto directo con tu asesor'
    },
    {
      icon: 'bi-people-fill',
      title: 'Comunidad profesional',
      description: 'Forma parte de nuestra red de agentes'
    }
  ]

  return (
    <section className="why-section">
      <div className="container">
        <div className="row justify-content-center mb-5">
          <div className="col-lg-8 text-center">
            <h2 className="section-title">¿Por qué Lealtia?</h2>
          </div>
        </div>
        
        <div className="row g-4">
          {features.map((feature, index) => (
            <div key={index} className="col-md-6 col-lg-3">
              <div className="feature-card">
                <div className="feature-icon">
                  <i className={`bi ${feature.icon}`}></i>
                </div>
                <h3>{feature.title}</h3>
                <p>{feature.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
