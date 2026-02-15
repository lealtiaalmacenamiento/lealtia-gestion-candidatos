"use client"
import Link from 'next/link'
import Image from 'next/image'

export default function LandingFooter() {
  const scrollToSection = (id: string) => {
    const element = document.getElementById(id)
    element?.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <footer className="landing-footer">
      <div className="container">
        <div className="row g-4">
          <div className="col-lg-4">
            <Image 
              src="/Logolealtiaruedablanca.png" 
              alt="Lealtia" 
              width={120}
              height={35}
              className="footer-logo mb-3"
            />
            <p className="footer-description">
              Promotoría de seguros<br />
              Trabajo remoto<br />
              Capacitación continua
            </p>
          </div>
          
          <div className="col-lg-4">
            <h4 className="footer-title">Enlaces rápidos</h4>
            <div className="footer-links">
              <button onClick={() => scrollToSection('cotizar')} className="footer-link">
                Cotizar
              </button>
              <button onClick={() => scrollToSection('ser-agente')} className="footer-link">
                Ser agente
              </button>
              <Link href="/login" className="footer-link">
                Acceso agentes
              </Link>
              <Link href="/politica-privacidad" className="footer-link">
                Política de privacidad
              </Link>
            </div>
          </div>
          
          <div className="col-lg-4">
            <h4 className="footer-title">Síguenos</h4>
            <div className="social-links">
              <a href="https://www.facebook.com/lealtia/" target="_blank" rel="noopener noreferrer" aria-label="Facebook">
                <i className="bi bi-facebook"></i>
              </a>
              <a href="https://www.instagram.com/lealtia.mx" target="_blank" rel="noopener noreferrer" aria-label="Instagram">
                <i className="bi bi-instagram"></i>
              </a>
            </div>
          </div>
        </div>
        
        <div className="footer-bottom">
          <div className="d-flex flex-column align-items-center gap-3">
            <p className="mb-0">&copy; {new Date().getFullYear()} Lealtia. Todos los derechos reservados.</p>
            <div className="powered-by">
              <div className="d-inline-flex align-items-center gap-2" style={{ opacity: 0.7 }}>
                <span className="small text-white-50">Powered by</span>
                <Image 
                  src="/powered-by-diballo.svg" 
                  alt="Atelier Diballo" 
                  width={120}
                  height={24}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </footer>
  )
}
