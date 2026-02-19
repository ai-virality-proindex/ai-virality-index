import type { Metadata } from 'next'
import './globals.css'
import AuthButton from '../components/AuthButton'
import Analytics from '../components/Analytics'

export const metadata: Metadata = {
  title: 'AI Virality Index — The Fear & Greed Index for AI Models',
  description: 'Real-time virality tracking for ChatGPT, Gemini, Claude, Perplexity, DeepSeek, Grok, and Copilot. Trading signals and content insights.',
  metadataBase: new URL('https://aiviralityindex.com'),
  openGraph: {
    title: 'AI Virality Index',
    description: 'The Fear & Greed Index for AI Models. Real-time virality tracking for 7 AI models.',
    type: 'website',
    siteName: 'AI Virality Index',
    locale: 'en_US',
    url: 'https://aiviralityindex.com',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'AI Virality Index — Real-time AI model virality tracking',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AI Virality Index',
    description: 'The Fear & Greed Index for AI Models',
    images: ['/og-image.png'],
  },
  icons: {
    icon: '/favicon.ico',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-avi-dark text-slate-200 antialiased">
        <Analytics />
        <header className="border-b border-avi-border px-6 py-4">
          <div className="mx-auto flex max-w-7xl items-center justify-between">
            <div className="flex items-center gap-2">
              <a href="/" className="flex items-center gap-2">
                <span className="text-2xl font-bold text-white">AVI</span>
                <span className="text-sm text-slate-400">AI Virality Index</span>
              </a>
            </div>
            <nav className="flex items-center gap-4 sm:gap-6 text-sm text-slate-400">
              <a href="/dashboard" className="hover:text-white transition-colors">Dashboard</a>
              <a href="/compare" className="hover:text-white transition-colors hidden sm:inline">Compare</a>
              <a href="/pricing" className="hover:text-white transition-colors">Pricing</a>
              <a href="/docs" className="hover:text-white transition-colors hidden sm:inline">API Docs</a>
              <AuthButton />
            </nav>
          </div>
        </header>
        <main>{children}</main>
      </body>
    </html>
  )
}
