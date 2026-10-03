import { Link } from 'react-router-dom'
import { Loader2 } from 'lucide-react'

const BASE =
  'inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-all duration-150 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50'

const VARIANTS = {
  primary: 'bg-brand-600 text-white shadow-card hover:bg-brand-700',
  secondary: 'border border-line-strong bg-surface text-ink-700 hover:border-ink-400 hover:bg-canvas',
  danger: 'bg-signal-red text-white shadow-card hover:bg-red-700',
  'danger-soft': 'bg-red-50 text-red-700 hover:bg-red-100',
  ghost: 'text-ink-700 hover:bg-line/60',
}

const SIZES = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2.5 text-sm',
  lg: 'px-5 py-3 text-base',
}

export function buttonClasses(variant = 'primary', size = 'md') {
  return `${BASE} ${VARIANTS[variant]} ${SIZES[size]}`
}

export default function Button({
  variant = 'primary',
  size = 'md',
  icon: Icon,
  loading = false,
  className = '',
  children,
  type = 'button',
  disabled,
  ...rest
}) {
  return (
    <button type={type} disabled={disabled || loading} className={`${buttonClasses(variant, size)} ${className}`} {...rest}>
      {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : Icon && <Icon className="h-4 w-4" aria-hidden="true" />}
      {children}
    </button>
  )
}

export function LinkButton({ to, variant = 'secondary', size = 'md', icon: Icon, className = '', children, ...rest }) {
  return (
    <Link to={to} className={`${buttonClasses(variant, size)} ${className}`} {...rest}>
      {Icon && <Icon className="h-4 w-4" aria-hidden="true" />}
      {children}
    </Link>
  )
}
