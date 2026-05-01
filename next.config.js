/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
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
        ],
      },
    ]
  },
}

// TODO: Add a nonce-based Content-Security-Policy before public deployment.
// A strict CSP is deferred so Next.js dev mode and dashboard charts keep working.

module.exports = nextConfig
