import React, { useEffect } from 'react'
import AlertBox from './AlertBox'
import { usePageTitle } from '@/context/PageTitleContext'

interface BasePageProps {
  title?: string
  alert?: { type?: 'success' | 'danger' | 'info' | 'warning'; message?: string; show?: boolean }
  children: React.ReactNode
}

export default function BasePage({ title, alert, children }: BasePageProps) {
  const { setTitle } = usePageTitle()
  useEffect(() => { if (title) setTitle(title); return () => { if (title) setTitle(''); }; }, [title, setTitle])
  const showBar = false // la barra ahora vive en Header
  return (
    <>
  {showBar && null}
      <div className="container mt-3">
        <AlertBox {...(alert || {})} />
        {children}
      </div>
    </>
  )
}
