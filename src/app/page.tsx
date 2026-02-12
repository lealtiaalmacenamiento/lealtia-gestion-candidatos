import LandingNav from '@/components/landing/LandingNav'
import Hero from '@/components/landing/Hero'
import AboutSection from '@/components/landing/AboutSection'
import QuoteSection from '@/components/landing/QuoteSection'
import WhyLealtia from '@/components/landing/WhyLealtia'
import BecomeAgent from '@/components/landing/BecomeAgent'
import RecruitmentForm from '@/components/landing/RecruitmentForm'
import EmotionalSection from '@/components/landing/EmotionalSection'
import LandingFooter from '@/components/landing/LandingFooter'
import './landing.css'

export const metadata = {
  title: 'Lealtia - Promotoría de Seguros y Comunidad de Agentes',
  description: 'Construye tu futuro con Lealtia. Cotiza seguros o únete como agente con capacitación, home office y comunidad activa.',
}

export default function Home() {
  return (
    <div className="landing-page">
      <LandingNav />
      <Hero />
      <AboutSection />
      <WhyLealtia />
      <QuoteSection />
      <BecomeAgent />
      <RecruitmentForm />
      <EmotionalSection />
      <LandingFooter />
    </div>
  )
}



