import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Inbox, TriangleAlert } from 'lucide-react'
import Button from './ui/Button.jsx'
import Modal from './ui/Modal.jsx'

// How long a load is allowed to look like plain "loading" before the UI
// admits something unusual is going on. The backend's free hosting tier
// goes to sleep when idle and can take 15-20+ seconds to wake up on the
// very first request -- without this, that genuinely looked exactly like
// the whole page had frozen/reset rather than just being slow, which is
// what was reported as "the page refreshes the first time I open it".
const SLOW_LOAD_HINT_MS = 4000

export function LoadingSkeleton({ rows = 5 }) {
  const [slow, setSlow] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setSlow(true), SLOW_LOAD_HINT_MS)
    return () => clearTimeout(t)
  }, [])
  return (
    <div className="space-y-3" role="status" aria-label="Loading">
      {slow && (
        <p className="animate-fade-in rounded-xl bg-amber-50 px-3.5 py-2.5 text-sm font-medium text-amber-800">
          Still waking up the server — the first load after a quiet period can take up to 30 seconds. No need to refresh, this will finish on its own.
        </p>
      )}
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="skeleton h-14" style={{ opacity: 1 - i * 0.08 }} />
      ))}
    </div>
  )
}

export function EmptyState({ title, hint, action, icon: Icon = Inbox }) {
  return (
    <div className="flex animate-fade-in flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-line-strong bg-surface/60 px-6 py-12 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
        <Icon className="h-6 w-6" aria-hidden="true" />
      </span>
      <p className="font-semibold text-ink-900">{title}</p>
      {hint && <p className="max-w-sm text-sm text-ink-500">{hint}</p>}
      {action}
    </div>
  )
}

export function ErrorState({ message, onRetry }) {
  return (
    <div role="alert" className="flex animate-fade-in flex-col items-center justify-center gap-3 rounded-2xl border border-red-200 bg-red-50 px-6 py-12 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-100 text-signal-red">
        <TriangleAlert className="h-6 w-6" aria-hidden="true" />
      </span>
      <p className="font-semibold text-red-900">{message}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  )
}

export function PageHeader({ title, subtitle, actions, back }) {
  return (
    <div className="mb-6 animate-rise-in">
      {back && (
        <Link to={back.to} className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-ink-500 transition-colors hover:text-brand-600">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-ink-900">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-ink-500">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  )
}

// Yes/No confirmation. Pass reasonLabel to also collect an optional note,
// which is handed to onConfirm.
export function ConfirmDialog({ open, ...props }) {
  return open ? <ConfirmBody {...props} /> : null
}

function ConfirmBody({ title, message, confirmLabel = 'Confirm', tone = 'default', onConfirm, onCancel, busy, reasonLabel }) {
  const [reason, setReason] = useState('')
  return (
    <Modal
      title={title}
      onClose={busy ? undefined : onCancel}
      size="sm"
      dismissible={!busy}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button variant={tone === 'danger' ? 'danger' : 'primary'} onClick={() => onConfirm(reason)} loading={busy}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-sm leading-relaxed text-ink-700">{message}</p>
      {reasonLabel && (
        <label className="mt-4 block">
          <span className="mb-1.5 block text-sm font-medium text-ink-700">{reasonLabel}</span>
          <textarea className="input" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
        </label>
      )}
    </Modal>
  )
}
