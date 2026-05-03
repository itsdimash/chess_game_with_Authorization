import type { Metadata } from 'next'
import './globals.css'
import { Toaster } from 'react-hot-toast'
import { ThemeProvider } from '@/components/ThemeProvider'

export const metadata: Metadata = {
  title: 'KnightOwl Chess',
  description: 'Chess with AI coaching powered by Stockfish',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider>
          {children}
        </ThemeProvider>
        <Toaster
          position="top-right"
          toastOptions={{
            style: {
              background: 'var(--surface2)',
              color: 'var(--text)',
              border: '1px solid var(--border2)',
            },
          }}
        />
      </body>
    </html>
  )
}
