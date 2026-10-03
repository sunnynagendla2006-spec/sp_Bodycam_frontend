import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'

export function Card({ children, className = '', ...rest }) {
  return (
    <section className={`card ${className}`} {...rest}>
      {children}
    </section>
  )
}

// Section title with an icon chip and an optional "view all" link or action.
export function CardHeader({ icon: Icon, title, subtitle, to, linkLabel = 'View all', action }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
      <div className="flex min-w-0 items-center gap-3">
        {Icon && (
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
            <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
          </span>
        )}
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold text-ink-900">{title}</h2>
          {subtitle && <p className="truncate text-sm text-ink-500">{subtitle}</p>}
        </div>
      </div>
      {action}
      {to && (
        <Link to={to} className="group inline-flex shrink-0 items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-800">
          {linkLabel}
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
        </Link>
      )}
    </div>
  )
}

// Label and value pairs. Each pair stays in its own <div> so the label and
// value always read together.
export function InfoGrid({ children, columns = 2 }) {
  const cols = columns === 1 ? '' : columns === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2'
  return <dl className={`grid grid-cols-1 gap-x-6 gap-y-4 ${cols}`}>{children}</dl>
}

export function Info({ label, children }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium uppercase tracking-wide text-ink-500">{label}</dt>
      <dd className="mt-1 break-words text-sm text-ink-900">{children}</dd>
    </div>
  )
}

const STAT_TONES = {
  neutral: { chip: 'bg-brand-50 text-brand-600', value: 'text-ink-900' },
  green: { chip: 'bg-green-50 text-signal-green', value: 'text-ink-900' },
  red: { chip: 'bg-red-50 text-signal-red', value: 'text-signal-red' },
  amber: { chip: 'bg-amber-50 text-signal-amber', value: 'text-ink-900' },
}

export function StatCard({ icon: Icon, label, value, hint, tone = 'neutral', to, index = 0 }) {
  const t = STAT_TONES[tone]
  const body = (
    <>
      <span className={`flex h-11 w-11 items-center justify-center rounded-xl ${t.chip}`}>
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className={`text-2xl font-semibold leading-none tabular-nums ${t.value}`}>{value}</p>
        <p className="mt-1.5 truncate text-sm text-ink-500">{label}</p>
        {hint && <p className="truncate text-xs text-ink-400">{hint}</p>}
      </div>
    </>
  )
  const cls = 'card stagger flex animate-rise-in items-center gap-4 p-4 sm:p-5'
  const style = { '--i': index }
  return to ? (
    <Link to={to} style={style} className={`${cls} card-hover`}>
      {body}
    </Link>
  ) : (
    <div style={style} className={cls}>
      {body}
    </div>
  )
}
