import type { ReactNode } from 'react'
import './globals.css'

export const metadata = {
  title: 'TokenWatcher',
  description: 'Self-hosted LLM cost and token usage auditor.',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
