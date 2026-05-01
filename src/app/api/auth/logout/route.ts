import { NextRequest, NextResponse } from 'next/server'
import {
  getDashboardSessionCookieName,
  getDashboardSessionCookieOptions,
} from '@/lib/dashboard-auth'

export async function POST(req: NextRequest) {
  const response = req.headers.get('accept')?.includes('text/html')
    ? NextResponse.redirect(new URL('/login', req.url), { status: 303 })
    : NextResponse.json({ success: true })

  response.cookies.set(getDashboardSessionCookieName(), '', {
    ...getDashboardSessionCookieOptions(),
    maxAge: 0,
  })

  return response
}
