
import './globals.css'; // Contiene bootstrap + bootstrap-icons
import { AuthProvider } from '@/context/AuthProvider'
import { PageTitleProvider } from '@/context/PageTitleContext'
import React from 'react';

interface RootLayoutProps {
  children: React.ReactNode;
}

export default function RootLayout({ children }: RootLayoutProps) {
  const env = process.env.VERCEL_ENV
  const isProd = env === 'production'
  const isDevelop = env === 'preview' && (process.env.VERCEL_GIT_COMMIT_REF === 'develop')
  const showBanner = !isProd
  const bannerLabel = isDevelop ? 'DEVELOP' : env === 'preview' ? `PREVIEW:${process.env.VERCEL_GIT_COMMIT_REF}` : 'LOCAL'
  return (
    <html lang="es" data-scroll-behavior="smooth" suppressHydrationWarning>
      <head>
        {/* Favicon usando logo rueda blanca */}
        <link rel="icon" type="image/png" href="/Logo%20lealtia%20rueda%20blanca.png" />
      </head>
      <body>
        {showBanner && (
          <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, zIndex: 1000,
            fontSize: 12, fontFamily: 'system-ui, Arial, sans-serif',
            letterSpacing: 1, padding: '4px 8px', textAlign: 'center',
            background: isDevelop ? '#1d4ed8' : env === 'preview' ? '#b45309' : '#525252',
            color: 'white', fontWeight: 600, boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
          }}>
            {bannerLabel}
          </div>
        )}
        <AuthProvider>
          <PageTitleProvider>
            <div style={{ marginTop: showBanner ? 28 : 0 }}>
              {children}
            </div>
          </PageTitleProvider>
        </AuthProvider>
      </body>
    </html>
  )
}
