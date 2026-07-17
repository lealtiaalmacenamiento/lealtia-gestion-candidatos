// Next.js configuration (migrated from TypeScript file for Vercel builder compatibility)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://YOUR_PROJECT_REF.supabase.co'
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://app.cal.com",
  `connect-src 'self' ${supabaseUrl} ${supabaseUrl.replace('https://', 'wss://')} https://*.supabase.co https://cal.com https://*.cal.com`,
  `img-src 'self' data: blob: ${supabaseUrl} https://*.supabase.co https://lh3.googleusercontent.com https://*.googleusercontent.com https://sendpilotstorage.blob.core.windows.net https://cal.com https://*.cal.com`,
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self'",
  "frame-src https://cal.com https://*.cal.com"
].join('; ')

const securityHeaders = [
  {
    key: 'Content-Security-Policy',
    value: csp
  }
]

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
        pathname: '/**'
      },
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/storage/v1/object/public/**'
      }
    ]
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders
      }
    ]
  }
}

export default nextConfig
