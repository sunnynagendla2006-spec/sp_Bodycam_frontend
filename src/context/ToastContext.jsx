import { createContext, useCallback, useContext, useState } from 'react'
import { CircleAlert, CircleCheck, Info, TriangleAlert, X } from 'lucide-react'

const ToastContext = createContext(null)
let idCounter = 0

const TONES = {
  success: { icon: CircleCheck, accent: 'text-signal-green', bar: 'bg-signal-green' },
  error: { icon: CircleAlert, accent: 'text-signal-red', bar: 'bg-signal-red' },
  warning: { icon: TriangleAlert, accent: 'text-signal-amber', bar: 'bg-signal-amber' },
  info: { icon: Info, accent: 'text-signal-blue', bar: 'bg-signal-blue' },
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const notify = useCallback((message, { tone = 'info', duration = 5000 } = {}) => {
    const id = ++idCounter
    setToasts((prev) => [...prev, { id, message, tone }])
    if (duration) setTimeout(() => dismiss(id), duration)
  }, [dismiss])

  return (
    <ToastContext.Provider value={{ notify }}>
      {children}
      <div className="pointer-events-none fixed inset-x-4 top-16 z-[60] flex flex-col gap-2 sm:inset-x-auto sm:right-6 sm:top-20 sm:w-96">
        {toasts.map((t) => {
          const tone = TONES[t.tone] || TONES.info
          const Icon = tone.icon
          return (
            <div
              key={t.id}
              role="status"
              className="pointer-events-auto relative flex animate-slide-in-right items-start gap-3 overflow-hidden rounded-2xl border border-line bg-surface py-3.5 pl-5 pr-3 text-sm text-ink-900 shadow-pop"
            >
              <span className={`absolute inset-y-0 left-0 w-1.5 ${tone.bar}`} />
              <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${tone.accent}`} aria-hidden="true" />
              <span className="flex-1 leading-snug">{t.message}</span>
              <button
                onClick={() => dismiss(t.id)}
                className="rounded-lg p-1 text-ink-400 transition-colors hover:bg-line/60 hover:text-ink-900"
                aria-label="Dismiss notification"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}
