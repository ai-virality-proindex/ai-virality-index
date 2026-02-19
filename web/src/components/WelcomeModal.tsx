'use client'

import { useState, useEffect } from 'react'
import { trackConversion } from '../lib/analytics'

interface WelcomeModalProps {
  plan: string
  onClose: () => void
}

const STEPS = [
  {
    title: 'Welcome to AVI Pro!',
    description: 'You now have access to real-time data, component breakdowns, and trading signals.',
    icon: '\u{1F389}',
  },
  {
    title: 'Market Average Gauge',
    description: 'The gauge shows overall AI market virality. Green = high virality, Red = low. Watch for sudden shifts.',
    icon: '\u{1F4CA}',
  },
  {
    title: 'Switch Between Modes',
    description: 'Use the toggle to switch between Trading mode (for market predictions) and Content mode (for trend-chasing).',
    icon: '\u{1F504}',
  },
]

export default function WelcomeModal({ plan, onClose }: WelcomeModalProps) {
  const [step, setStep] = useState(0)

  useEffect(() => {
    trackConversion('checkout_completed', { plan })
  }, [plan])

  function handleNext() {
    if (step < STEPS.length - 1) {
      setStep(step + 1)
    } else {
      localStorage.setItem('onboarding_completed', 'true')
      onClose()
    }
  }

  function handleSkip() {
    localStorage.setItem('onboarding_completed', 'true')
    onClose()
  }

  const current = STEPS[step]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-avi-border bg-avi-card p-8 shadow-2xl mx-4">
        {/* Progress dots */}
        <div className="flex justify-center gap-2 mb-6">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`w-2 h-2 rounded-full transition-colors ${
                i === step ? 'bg-emerald-400' : i < step ? 'bg-emerald-700' : 'bg-slate-600'
              }`}
            />
          ))}
        </div>

        <div className="text-center">
          <div className="text-4xl mb-4">{current.icon}</div>
          <h2 className="text-xl font-bold text-white mb-2">{current.title}</h2>
          <p className="text-sm text-slate-400 leading-relaxed">{current.description}</p>
        </div>

        <div className="mt-8 flex justify-between items-center">
          <button
            onClick={handleSkip}
            className="text-sm text-slate-500 hover:text-slate-300 transition-colors"
          >
            Skip tour
          </button>
          <div className="flex gap-3">
            {step > 0 && (
              <button
                onClick={() => setStep(step - 1)}
                className="text-sm text-slate-400 hover:text-white transition-colors"
              >
                Back
              </button>
            )}
            <button
              onClick={handleNext}
              className="rounded-lg bg-emerald-600 px-6 py-2 text-sm font-semibold text-white hover:bg-emerald-500 transition-colors"
            >
              {step === STEPS.length - 1 ? 'Start Exploring' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
