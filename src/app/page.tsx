"use client"
import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/context/AuthProvider'

export default function Home() {
  const router = useRouter()
  const { user, session } = useAuth()

  const redirected = useRef(false)
  useEffect(() => {
    if (redirected.current) return
    if (user === null) {
      console.log('[root] sin sesión -> /login')
      redirected.current = true
      router.replace('/login')
    } else if (user) {
      console.log('[root] sesión encontrada -> /home')
      redirected.current = true
      router.replace('/home')
    } else {
      console.log('[root] esperando datos de usuario...')
    }
  }, [user, session, router])

  return <div style={{ padding: 24, fontFamily: 'sans-serif' }}></div>
}

// vercel: redeploy marker (2025-08-29-3)

