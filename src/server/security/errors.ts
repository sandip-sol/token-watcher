import { NextResponse } from 'next/server'
import { ZodError } from 'zod'

export type ApiErrorCode =
  | 'BAD_REQUEST'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'CSRF_INVALID'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'VALIDATION_ERROR'
  | 'INTERNAL_ERROR'

export type ApiErrorBody = {
  error: {
    code: ApiErrorCode | string
    message: string
  }
}

export function jsonOk<T>(data: T, init?: ResponseInit): NextResponse<T> {
  return NextResponse.json(data, init)
}

export function jsonError(status: number, code: ApiErrorCode | string, message = defaultMessage(status)): NextResponse<ApiErrorBody> {
  return NextResponse.json({ error: { code, message } }, { status })
}

export function badRequest(message = 'Invalid request') {
  return jsonError(400, 'BAD_REQUEST', message)
}

export function unauthorized(message = 'Unauthorized') {
  return jsonError(401, 'UNAUTHORIZED', message)
}

export function forbidden(code: ApiErrorCode | string = 'FORBIDDEN', message = 'Forbidden') {
  return jsonError(403, code, message)
}

export function notFound(message = 'Not found') {
  return jsonError(404, 'NOT_FOUND', message)
}

export function conflict(message = 'Conflict') {
  return jsonError(409, 'CONFLICT', message)
}

export function rateLimited(message = 'Rate limit exceeded') {
  return jsonError(429, 'RATE_LIMITED', message)
}

export function validationError(message = 'Invalid request') {
  return jsonError(400, 'VALIDATION_ERROR', message)
}

export function internalError() {
  return jsonError(500, 'INTERNAL_ERROR', 'Internal server error')
}

export function handleApiError(error: unknown, context: string): NextResponse<ApiErrorBody> {
  if (error instanceof ZodError) return validationError()

  console.error(`[TokenWatcher] ${context}:`, safeErrorForLog(error))
  return internalError()
}

export function safeErrorForLog(error: unknown): string {
  if (error instanceof Error) return error.message
  return 'Unknown error'
}

function defaultMessage(status: number): string {
  if (status === 400) return 'Invalid request'
  if (status === 401) return 'Unauthorized'
  if (status === 403) return 'Forbidden'
  if (status === 404) return 'Not found'
  if (status === 409) return 'Conflict'
  if (status === 429) return 'Rate limit exceeded'
  return 'Internal server error'
}
