/** @type {import('next').NextConfig} */
function buildContentSecurityPolicy(nodeEnv = process.env.NODE_ENV) {
  const connectSrc = (process.env.CSP_CONNECT_SRC || '')
    .split(',')
    .map(origin => origin.trim())
    .filter(origin => origin && origin !== '*')

  const directives = [
    ["default-src", "'self'"],
    ["base-uri", "'self'"],
    ["frame-ancestors", "'none'"],
    ["object-src", "'none'"],
    ["form-action", "'self'"],
    ["img-src", "'self'", 'data:', 'blob:'],
    ["font-src", "'self'", 'data:'],
    ["style-src", "'self'", "'unsafe-inline'"],
    ["script-src", "'self'", ...(nodeEnv === 'development' ? ["'unsafe-eval'", "'unsafe-inline'"] : [])],
    ["connect-src", "'self'", ...connectSrc],
  ]

  return directives.map(parts => `${parts[0]} ${parts.slice(1).join(' ')}`).join('; ')
}

const nextConfig = {
  async headers() {
    const cspHeader = process.env.CSP_REPORT_ONLY === 'true'
      ? 'Content-Security-Policy-Report-Only'
      : 'Content-Security-Policy'

    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), fullscreen=(self)',
          },
          { key: cspHeader, value: buildContentSecurityPolicy(process.env.NODE_ENV) },
        ],
      },
    ]
  },
}

module.exports = nextConfig
