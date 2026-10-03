import { useEffect, useState } from 'react'
import { Lock, Save } from 'lucide-react'
import { useAuth } from '../context/AuthContext.jsx'
import { useToast } from '../context/ToastContext.jsx'
import { fetchSettings, updateSettings } from '../api/settings.js'
import { friendlyErrorMessage } from '../api/client.js'
import { LoadingSkeleton, ErrorState, PageHeader } from '../components/Primitives.jsx'
import Button from '../components/ui/Button.jsx'
import { Card } from '../components/ui/Card.jsx'
import { Field } from '../components/ui/Form.jsx'
import { canEditSettings } from '../utils/roles.js'

export default function Settings() {
  const { user } = useAuth()
  const { notify } = useToast()
  const [form, setForm] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function load() {
    setLoading(true)
    setError('')
    try {
      setForm(await fetchSettings())
    } catch (err) {
      setError(friendlyErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    try {
      await updateSettings(form)
      notify('Settings saved', { tone: 'success' })
    } catch (err) {
      notify(friendlyErrorMessage(err), { tone: 'error' })
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <LoadingSkeleton rows={4} />
  if (error) return <ErrorState message={error} onRetry={load} />

  const readOnly = !canEditSettings(user?.role)

  return (
    <div>
      <PageHeader title="Settings" subtitle="Choose how the system behaves" />
      <Card className="max-w-xl animate-rise-in">
        <form onSubmit={handleSubmit} className="space-y-5 p-5 sm:p-6">
          {readOnly && (
            <p className="flex items-center gap-2 rounded-xl bg-canvas px-4 py-3 text-sm text-ink-700">
              <Lock className="h-4 w-4 shrink-0 text-ink-500" aria-hidden="true" />
              You can view these settings, but only an administrator can change them.
            </p>
          )}
          <Field label="Recording upload size (MB)" hint="Recordings are sent to the server in pieces of this size.">
            <input
              type="number"
              disabled={readOnly}
              value={form.chunk_size_mb}
              onChange={(e) => setForm({ ...form, chunk_size_mb: Number(e.target.value) })}
              className="input"
            />
          </Field>
          <Field label="Location boundary distance (metres)" hint="Used when checking whether a constable is inside their area.">
            <input
              type="number"
              disabled={readOnly}
              value={form.geofence_threshold_m}
              onChange={(e) => setForm({ ...form, geofence_threshold_m: Number(e.target.value) })}
              className="input"
            />
          </Field>
          <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-line px-4 py-3.5">
            <span>
              <span className="block text-sm font-medium text-ink-900">Sound for new alerts</span>
              <span className="block text-xs text-ink-500">Play a sound when an alert arrives.</span>
            </span>
            <span className="relative inline-flex shrink-0">
              <input
                type="checkbox"
                role="switch"
                disabled={readOnly}
                checked={form.audio_alerts}
                onChange={(e) => setForm({ ...form, audio_alerts: e.target.checked })}
                className="peer sr-only"
              />
              <span className="h-6 w-11 rounded-full bg-line-strong transition-colors peer-checked:bg-brand-600 peer-disabled:opacity-50 peer-focus-visible:ring-2 peer-focus-visible:ring-brand-500 peer-focus-visible:ring-offset-2" />
              <span className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-card transition-transform peer-checked:translate-x-5" />
            </span>
          </label>

          {!readOnly && (
            <Button type="submit" icon={Save} loading={saving}>
              {saving ? 'Saving…' : 'Save settings'}
            </Button>
          )}
        </form>
      </Card>
    </div>
  )
}
