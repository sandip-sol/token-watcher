import { NextResponse } from 'next/server'

const BASE_PERMISSIONS_POLICY = 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), fullscreen=(self)'

export function applySecurityHeaders(response: NextResponse): void {
  response.headers.set('X-Frame-Options', 'DENY')
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  response.headers.set('Permissions-Policy', BASE_PERMISSIONS_POLICY)

  const csp = buildContentSecurityPolicy(process.env.NODE_ENV)
  const headerName = process.env.CSP_REPORT_ONLY === 'true'
    ? 'Content-Security-Policy-Report-Only'
    : 'Content-Security-Policy'

  response.headers.set(headerName, csp)
}

export function buildContentSecurityPolicy(nodeEnv = process.env.NODE_ENV): string {
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
    ["connect-src", "'self'", ...parseAllowedConnectSrc()],
  ]

  return directives.map(parts => `${parts[0]} ${parts.slice(1).join(' ')}`).join('; ')
}

export function securityHeadersForNextConfig() {
  return [
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    { key: 'Permissions-Policy', value: BASE_PERMISSIONS_POLICY },
    {
      key: process.env.CSP_REPORT_ONLY === 'true'
        ? 'Content-Security-Policy-Report-Only'
        : 'Content-Security-Policy',
      value: buildContentSecurityPolicy(process.env.NODE_ENV),
    },
  ]
}

function parseAllowedConnectSrc(): string[] {
  return (process.env.CSP_CONNECT_SRC || '')
    .split(',')
    .map(origin => origin.trim())
    .filter(origin => origin && origin !== '*')
}
