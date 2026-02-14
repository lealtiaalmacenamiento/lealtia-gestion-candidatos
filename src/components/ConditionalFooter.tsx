"use client"
import { usePathname } from 'next/navigation'
import Footer from '@/components/Footer'

export function ConditionalFooter() {
  const pathname = usePathname()
  // No mostrar el footer global en la landing page
  const isLandingPage = pathname === '/'
  
  if (isLandingPage) {
    return null
  }
  
  return <Footer />
}
