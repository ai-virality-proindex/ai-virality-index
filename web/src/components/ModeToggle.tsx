'use client'

interface ModeToggleProps {
  mode: 'trade' | 'content'
  onChange: (mode: 'trade' | 'content') => void
}

/**
 * Toggle between Trading and Content mode.
 */
export default function ModeToggle({ mode, onChange }: ModeToggleProps) {
  return (
    <div className="inline-flex rounded-lg bg-avi-dark border border-avi-border p-1">
      <button
        onClick={() => onChange('trade')}
        className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
          mode === 'trade'
            ? 'bg-emerald-900/60 text-emerald-400 shadow-sm'
            : 'text-slate-400 hover:text-slate-300'
        }`}
      >
        <span className="flex items-center gap-1.5">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.306a11.95 11.95 0 0 1 5.814-5.518l2.74-1.22m0 0-5.94-2.281m5.94 2.28-2.28 5.941" />
          </svg>
          Trading
        </span>
      </button>
      <button
        onClick={() => onChange('content')}
        className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
          mode === 'content'
            ? 'bg-blue-900/60 text-blue-400 shadow-sm'
            : 'text-slate-400 hover:text-slate-300'
        }`}
      >
        <span className="flex items-center gap-1.5">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" />
          </svg>
          Content
        </span>
      </button>
    </div>
  )
}
