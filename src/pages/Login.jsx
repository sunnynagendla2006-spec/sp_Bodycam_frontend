import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Bell, Camera, Eye, EyeOff, Map as MapIcon, Shield } from 'lucide-react'
import { useAuth } from '../context/AuthContext.jsx'
import { friendlyErrorMessage } from '../api/client.js'
import Button from '../components/ui/Button.jsx'
import { Field } from '../components/ui/Form.jsx'

const HIGHLIGHTS = [
  { icon: Camera, text: 'Watch body cameras and recordings' },
  { icon: MapIcon, text: 'See where every constable is' },
  { icon: Bell, text: 'Get alerts the moment something needs attention' },
]

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setSubmitting(true)
    setError('')
    try {
      await login(username, password)
      const redirectTo = location.state?.from?.pathname || '/'
      navigate(redirectTo, { replace: true })
    } catch (err) {
      setError(friendlyErrorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="grid min-h-screen bg-canvas lg:grid-cols-2">
      <aside className="relative hidden overflow-hidden bg-brand-50 lg:flex lg:flex-col lg:justify-center lg:px-16">
        <div className="absolute -right-24 -top-24 h-80 w-80 rounded-full bg-brand-100/70" aria-hidden="true" />
        <div className="absolute -bottom-32 -left-16 h-96 w-96 rounded-full bg-brand-100/50" aria-hidden="true" />
        <div className="relative max-w-md animate-rise-in">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-600 text-white shadow-lift">
            <Shield className="h-7 w-7" aria-hidden="true" />
          </span>
          <h2 className="mt-8 text-3xl font-semibold leading-tight tracking-tight text-ink-900">Police Control Room</h2>
          <p className="mt-3 text-ink-700">Everything you need to keep track of your team in the field, in one place.</p>
          <ul className="mt-10 space-y-5">
            {HIGHLIGHTS.map((h, i) => (
              <li key={h.text} style={{ '--i': i + 2 }} className="stagger flex animate-rise-in items-center gap-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface text-brand-600 shadow-card">
                  <h.icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <span className="text-ink-700">{h.text}</span>
              </li>
            ))}
          </ul>
        </div>
      </aside>

      <main className="flex items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-sm animate-rise-in">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-600 text-white shadow-card">
              <Shield className="h-6 w-6" aria-hidden="true" />
            </span>
            <span className="text-lg font-semibold text-ink-900">Police Control Room</span>
          </div>

          <h1 className="text-2xl font-semibold tracking-tight text-ink-900">Welcome back</h1>
          <p className="mt-1.5 text-sm text-ink-500">Sign in to continue.</p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
            <Field label="Phone number">
              <input
                className="input"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                placeholder="9990001001"
                required
              />
            </Field>
            <Field label="Password">
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  className="input pr-12"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-ink-500 transition-colors hover:bg-line/60 hover:text-ink-900"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="h-[18px] w-[18px]" /> : <Eye className="h-[18px] w-[18px]" />}
                </button>
              </div>
            </Field>

            {error && (
              <p role="alert" className="animate-pop-in rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                {error}
              </p>
            )}

            <Button type="submit" size="lg" loading={submitting} className="w-full">
              {submitting ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>
        </div>
      </main>
    </div>
  )
}
