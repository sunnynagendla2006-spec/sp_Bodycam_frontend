import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

// Centered dialog on desktop, full-width sheet pinned to the bottom on phones.
// Rendered into <body> so page animations and transforms can never trap it
// underneath the navigation.
export default function Modal({ title, onClose, children, footer, size = 'md', dismissible = true }) {
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape' && dismissible) onClose?.()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, dismissible])

  const width = { sm: 'sm:max-w-sm', md: 'sm:max-w-md', lg: 'sm:max-w-2xl' }[size]

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <div
        className="absolute inset-0 animate-fade-in bg-ink-900/40 backdrop-blur-[2px]"
        onClick={dismissible ? onClose : undefined}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`relative max-h-[92vh] w-full animate-pop-in overflow-y-auto rounded-t-3xl bg-surface shadow-pop sm:rounded-2xl ${width}`}
      >
        <div className="flex items-start justify-between gap-4 px-5 pb-2 pt-5 sm:px-6 sm:pt-6">
          <h2 className="text-lg font-semibold text-ink-900">{title}</h2>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="-mr-2 -mt-1 rounded-lg p-2 text-ink-500 transition-colors hover:bg-line/60 hover:text-ink-900"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>
        <div className="px-5 pb-5 sm:px-6">{children}</div>
        {footer && <div className="flex flex-col-reverse gap-2 border-t border-line bg-canvas/60 px-5 py-4 sm:flex-row sm:justify-end sm:px-6">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}
