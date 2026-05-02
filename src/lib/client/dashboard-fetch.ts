'use client'

export class DashboardApiError extends Error {
  status: number
  code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = 'DashboardApiError'
    this.status = status
    this.code = code
  }
}

let csrfTokenPromise: Promise<string> | null = null

export async function dashboardFetch<T>(url: string, options: RequestInit = {}): Promise<T> {
  const method = (options.method || 'GET').toUpperCase()
  const headers = new Headers(options.headers)

  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  if (isUnsafeMethod(method)) {
    headers.set('X-CSRF-Token', await getCsrfToken())
  }

  const response = await fetch(url, {
    ...options,
    method,
    headers,
    credentials: options.credentials || 'same-origin',
  })

  if (response.status === 401) {
    window.location.href = '/login'
    throw new DashboardApiError(401, 'UNAUTHORIZED', 'Unauthorized')
  }

  const body = await parseJson(response)

  if (!response.ok) {
    const normalized = normalizeApiError(body, response.status)
    throw new DashboardApiError(response.status, normalized.code, normalized.message)
  }

  return body as T
}

export function getJson<T>(url: string): Promise<T> {
  return dashboardFetch<T>(url)
}

export function postJson<T>(url: string, body?: unknown): Promise<T> {
  return dashboardFetch<T>(url, {
    method: 'POST',
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

export function patchJson<T>(url: string, body?: unknown): Promise<T> {
  return dashboardFetch<T>(url, {
    method: 'PATCH',
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

export function deleteJson<T>(url: string): Promise<T> {
  return dashboardFetch<T>(url, { method: 'DELETE' })
}

async function getCsrfToken(): Promise<string> {
  csrfTokenPromise ||= fetch('/api/auth/csrf', { credentials: 'same-origin' })
    .then(async response => {
      if (response.status === 401) {
        window.location.href = '/login'
        throw new DashboardApiError(401, 'UNAUTHORIZED', 'Unauthorized')
      }

      if (!response.ok) throw new DashboardApiError(response.status, 'CSRF_UNAVAILABLE', 'Unable to prepare request')
      const body = await response.json()
      return String(body.csrfToken || '')
    })

  return csrfTokenPromise
}

async function parseJson(response: Response): Promise<unknown> {
  const text = await response.text()
  if (!text) return null

  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

function normalizeApiError(body: unknown, status: number): { code: string; message: string } {
  if (body && typeof body === 'object' && 'error' in body) {
    const error = (body as { error?: unknown }).error
    if (typeof error === 'string') return { code: codeForStatus(status), message: error }
    if (error && typeof error === 'object') {
      const code = typeof (error as { code?: unknown }).code === 'string'
        ? (error as { code: string }).code
        : codeForStatus(status)
      const message = typeof (error as { message?: unknown }).message === 'string'
        ? (error as { message: string }).message
        : messageForStatus(status)
      return { code, message }
    }
  }

  return { code: codeForStatus(status), message: messageForStatus(status) }
}

function isUnsafeMethod(method: string): boolean {
  return ['POST', 'PATCH', 'PUT', 'DELETE'].includes(method)
}

function codeForStatus(status: number): string {
  if (status === 400) return 'BAD_REQUEST'
  if (status === 401) return 'UNAUTHORIZED'
  if (status === 403) return 'FORBIDDEN'
  if (status === 404) return 'NOT_FOUND'
  if (status === 409) return 'CONFLICT'
  if (status === 429) return 'RATE_LIMITED'
  return 'INTERNAL_ERROR'
}

function messageForStatus(status: number): string {
  if (status === 401) return 'Unauthorized'
  if (status === 403) return 'Forbidden'
  if (status === 404) return 'Not found'
  if (status === 409) return 'Conflict'
  if (status === 429) return 'Rate limit exceeded'
  return status >= 500 ? 'Internal server error' : 'Invalid request'
}
