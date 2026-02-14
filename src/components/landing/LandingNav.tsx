"use client"
import Link from 'next/link'
import Image from 'next/image'
import { useState } from 'react'

export default function LandingNav() {
  const [isOpen, setIsOpen] = useState(false)

  const scrollToSection = (id: string) => {
    setIsOpen(false)
    const element = document.getElementById(id)
    if (element) {
      const navHeight = 80
      const elementPosition = element.getBoundingClientRect().top + window.scrollY
      const offsetPosition = elementPosition - navHeight

      window.scrollTo({
        top: offsetPosition,
        behavior: 'smooth'
      })
    }
  }

  return (
    <nav className="landing-nav">
      <div className="container">
        <div className="nav-wrapper">
          <Link href="/" className="brand">
            <Image 
              src="/Logolealtia.png" 
              alt="Lealtia" 
              width={180}
              height={50}
              className="brand-logo"
              priority
              style={{ 
                filter: 'brightness(0) saturate(100%)',
                opacity: 0.8
              }}
            />
          </Link>
          
          <button 
            className="nav-toggle d-md-none"
            onClick={() => setIsOpen(!isOpen)}
            aria-label="Toggle menu"
          >
            <i className={`bi bi-${isOpen ? 'x' : 'list'}`}></i>
          </button>

          <div className={`nav-links ${isOpen ? 'active' : ''}`}>
            <button 
              onClick={() => scrollToSection('cotizar')}
              className="nav-link-btn"
            >
              Cotizar
            </button>
            <button 
              onClick={() => scrollToSection('beneficios')}
              className="nav-link-btn"
            >
              Beneficios
            </button>
            <button 
              onClick={() => scrollToSection('ser-agente')}
              className="nav-link-btn"
            >
              Ser agente
            </button>
            <Link href="/login" className="btn-login" onClick={() => setIsOpen(false)}>
              Acceso agentes
            </Link>
          </div>
        </div>
      </div>
    </nav>
  )
}
