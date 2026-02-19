'use client'

import { useState } from 'react'
import { trackConversion } from '../lib/analytics'

interface ShareButtonsProps {
  url?: string
  title?: string
  className?: string
}

export default function ShareButtons({ url, title, className = '' }: ShareButtonsProps) {
  const [copied, setCopied] = useState(false)

  const shareUrl = typeof window !== 'undefined' ? (url || window.location.href) : ''
  const shareTitle = title || 'AI Virality Index'
  const encodedUrl = encodeURIComponent(shareUrl)
  const encodedTitle = encodeURIComponent(shareTitle)

  function handleShare(platform: string) {
    trackConversion('share_clicked', { platform })
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      trackConversion('share_clicked', { platform: 'copy_link' })
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // fallback
    }
  }

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <span className="text-xs text-slate-500 mr-1">Share:</span>

      {/* X (Twitter) */}
      <a
        href={`https://twitter.com/intent/tweet?text=${encodedTitle}&url=${encodedUrl}`}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => handleShare('x')}
        className="w-8 h-8 rounded-lg border border-avi-border bg-avi-dark flex items-center justify-center text-slate-400 hover:text-white hover:border-slate-500 transition-colors"
        title="Share on X"
      >
        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
        </svg>
      </a>

      {/* LinkedIn */}
      <a
        href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => handleShare('linkedin')}
        className="w-8 h-8 rounded-lg border border-avi-border bg-avi-dark flex items-center justify-center text-slate-400 hover:text-white hover:border-slate-500 transition-colors"
        title="Share on LinkedIn"
      >
        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
          <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
        </svg>
      </a>

      {/* Copy Link */}
      <button
        onClick={handleCopy}
        className="w-8 h-8 rounded-lg border border-avi-border bg-avi-dark flex items-center justify-center text-slate-400 hover:text-white hover:border-slate-500 transition-colors"
        title={copied ? 'Copied!' : 'Copy link'}
      >
        {copied ? (
          <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
        ) : (
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m9.86-2.939a4.5 4.5 0 0 0-1.242-7.244l-4.5-4.5a4.5 4.5 0 0 0-6.364 6.364L5.25 9.503" />
          </svg>
        )}
      </button>
    </div>
  )
}
