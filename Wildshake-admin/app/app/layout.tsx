import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Wildshakes Master Admin Portal',
  description: 'Centralized command and control center for the Wildshake franchise ecosystem.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
