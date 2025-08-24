
import './globals.css'; // Contiene bootstrap + bootstrap-icons
import { AuthProvider } from '@/context/AuthProvider'
import { PageTitleProvider } from '@/context/PageTitleContext'
import React from 'react';

interface RootLayoutProps {
  children: React.ReactNode;
}

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="es" data-scroll-behavior="smooth" suppressHydrationWarning>
      <body>
        <AuthProvider>
          <PageTitleProvider>
            {children}
          </PageTitleProvider>
        </AuthProvider>
      </body>
    </html>
  )
}
