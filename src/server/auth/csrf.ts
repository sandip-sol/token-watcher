import { NextRequest, NextResponse } from 'next/server'
import {
  getDashboardSessionCookieName,
  isDashboardAuthEnabled,
  verifyDashboardSessionToken,
} from '@/server/auth/dashboard-session'

const CSRF_COOKIE_NAME = 'tokenwatcher_csrf'
const CSRF_HEADER_NAME = 'x-csrf-token'

export async function createCsrfToken(sessionValue: string): Promise<string> {
  const nonce = crypto.randomUUID()
  const signature = await signCsrfValue(sessionValue, nonce)

  return `${nonce}.${signature}`
}

export async function verifyCsrfToken(
  token: string | null | undefined,
  cookieValue: string | null | undefined,
  sessionValue: string | null | undefined
): Promise<boolean> {
  if (!token || !cookieValue || !sessionValue) return false
  if (!timingSafeStringEqual(token, cookieValue)) return false

  const [nonce, signature, extra] = token.split('.')
  if (!nonce || !signature || extra) return false

  const expected = await signCsrfValue(sessionValue, nonce)
  return timingSafeStringEqual(signature, expected)
}

export async function requireCsrf(req: NextRequest): Promise<NextResponse | null> {
  if (!isUnsafeMethod(req.method) || !isDashboardAuthEnabled()) return null

  const sessionValue = req.cookies.get(getDashboardSessionCookieName())?.value
  const validSession = await verifyDashboardSessionToken(sessionValue)
  if (!validSession) return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } }, { status: 401 })

  const validCsrf = await verifyCsrfToken(
    req.headers.get(CSRF_HEADER_NAME),
    req.cookies.get(CSRF_COOKIE_NAME)?.value,
    sessionValue
  )

  if (!validCsrf) {
    return NextResponse.json({ error: { code: 'CSRF_INVALID', message: 'Invalid CSRF token' } }, { status: 403 })
  }

  return null
}

export function setCsrfCookie(response: NextResponse, token: string): void {
  response.cookies.set(CSRF_COOKIE_NAME, token, {
    httpOnly: false,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 12,
  })
}

export function clearCsrfCookie(response: NextResponse): void {
  response.cookies.set(CSRF_COOKIE_NAME, '', {
    httpOnly: false,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  })
}

export function getCsrfCookieName(): string {
  return CSRF_COOKIE_NAME
}

function isUnsafeMethod(method: string): boolean {
  return ['POST', 'PATCH', 'PUT', 'DELETE'].includes(method.toUpperCase())
}

async function signCsrfValue(sessionValue: string, nonce: string): Promise<string> {
  const secret = process.env.CSRF_SECRET || process.env.DASHBOARD_SESSION_SECRET || process.env.NEXTAUTH_SECRET || ''
  if (!secret) return ''

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${sessionValue}.${nonce}`))

  return base64UrlEncodeBytes(new Uint8Array(signature))
}

function base64UrlEncodeBytes(bytes: Uint8Array): string {
  let binary = ''

  bytes.forEach(byte => {
    binary += String.fromCharCode(byte)
  })

  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function timingSafeStringEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false

  let result = 0
  for (let i = 0; i < a.length; i += 1) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }

  return result === 0
}
