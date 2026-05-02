const DEFAULT_COOKIE_NAME = 'tokenwatcher_session'
const SESSION_TTL_SECONDS = 60 * 60 * 12

type SessionPayload = {
  sub: 'dashboard'
  exp: number
  n: string
}

export function isDashboardAuthEnabled(): boolean {
  return process.env.DASHBOARD_AUTH_ENABLED !== 'false'
}

export function getDashboardSessionCookieName(): string {
  return process.env.DASHBOARD_SESSION_COOKIE_NAME || DEFAULT_COOKIE_NAME
}

export function getDashboardSessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  }
}

export function getDashboardCredentials(): { username: string; password: string } {
  return {
    username: process.env.DASHBOARD_USERNAME || 'admin',
    password: process.env.DASHBOARD_PASSWORD || '',
  }
}

export async function createDashboardSessionToken(_username: string): Promise<string> {
  const secret = getSessionSecret()
  const payload: SessionPayload = {
    sub: 'dashboard',
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
    n: crypto.randomUUID(),
  }
  const encodedPayload = base64UrlEncode(JSON.stringify(payload))
  const signature = await sign(encodedPayload, secret)

  return `${encodedPayload}.${signature}`
}

export async function verifyDashboardSessionToken(token: string | undefined | null): Promise<boolean> {
  if (!token) return false

  const secret = getSessionSecret()
  if (!secret) return false

  const [encodedPayload, signature, extra] = token.split('.')
  if (!encodedPayload || !signature || extra) return false

  const expectedSignature = await sign(encodedPayload, secret)
  if (!timingSafeStringEqual(signature, expectedSignature)) return false

  try {
    const payload = JSON.parse(base64UrlDecode(encodedPayload)) as Partial<SessionPayload>
    return (
      payload.sub === 'dashboard' &&
      typeof payload.exp === 'number' &&
      payload.exp > Math.floor(Date.now() / 1000)
    )
  } catch {
    return false
  }
}

export function hasUsableDashboardSessionSecret(): boolean {
  return Boolean(getSessionSecret())
}

function getSessionSecret(): string {
  return process.env.DASHBOARD_SESSION_SECRET || process.env.NEXTAUTH_SECRET || ''
}

async function sign(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value))

  return base64UrlEncodeBytes(new Uint8Array(signature))
}

function base64UrlEncode(value: string): string {
  return base64UrlEncodeBytes(new TextEncoder().encode(value))
}

function base64UrlEncodeBytes(bytes: Uint8Array): string {
  let binary = ''

  bytes.forEach(byte => {
    binary += String.fromCharCode(byte)
  })

  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function base64UrlDecode(value: string): string {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
  const binary = atob(padded)
  const bytes = Uint8Array.from(binary, char => char.charCodeAt(0))

  return new TextDecoder().decode(bytes)
}

function timingSafeStringEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false

  let result = 0
  for (let i = 0; i < a.length; i += 1) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }

  return result === 0
}
