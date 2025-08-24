// Next.js configuration (migrated from TypeScript file for Vercel builder compatibility)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://YOUR_PROJECT_REF.supabase.co'
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  `connect-src 'self' ${supabaseUrl}`,
  "img-src 'self' data: https://lh3.googleusercontent.com https://*.googleusercontent.com",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self'"
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
