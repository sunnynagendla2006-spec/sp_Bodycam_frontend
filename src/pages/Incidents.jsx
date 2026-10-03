import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { BadgeCheck, Ban, FileText, Flag, Plus, Send } from 'lucide-react'
import { useAuth } from '../context/AuthContext.jsx'
import { useToast } from '../context/ToastContext.jsx'
import {
  listIncidents,
  createIncident,
  verifyIncident,
  rejectIncident,
  flagIncidentNeedsReview,
  dispatchIncident,
} from '../api/incidents.js'
import { friendlyErrorMessage } from '../api/client.js'
import { LoadingSkeleton, ErrorState, EmptyState, PageHeader, ConfirmDialog } from '../components/Primitives.jsx'
import StatusBadge from '../components/StatusBadge.jsx'
import Button from '../components/ui/Button.jsx'
import DataTable from '../components/ui/DataTable.jsx'
import { Field } from '../components/ui/Form.jsx'
import Modal from '../components/ui/Modal.jsx'
import SearchInput from '../components/ui/SearchInput.jsx'
import { canCreateIncident, canVerifyIncident, canDispatch } from '../utils/roles.js'
import { formatDateTimeShort } from '../utils/format.js'
import { statusLabel } from '../utils/labels.js'

const STATUS_OPTIONS = ['new', 'verified', 'rejected', 'assigned', 'en_route', 'arrived', 'resolved', 'closed', 'needs_review']

export default function Incidents() {
  const { user } = useAuth()
  const { notify } = useToast()
  const [incidents, setIncidents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [busyId, setBusyId] = useState(null)
  const [reasonFor, setReasonFor] = useState(null) // { id, kind: 'reject' | 'review' }

  async function load() {
    setLoading(true)
    setError('')
    try {
      setIncidents(await listIncidents())
    } catch (err) {
      setError(friendlyErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const filtered = useMemo(() => {
    return incidents.filter((i) => {
      if (statusFilter && i.status !== statusFilter) return false
      if (search) {
        const needle = search.toLowerCase()
        const haystack = `${i.display_id || ''} ${i.description || ''} ${i.id}`.toLowerCase()
        if (!haystack.includes(needle)) return false
      }
      return true
    })
  }, [incidents, search, statusFilter])

  async function runAction(id, fn, successMessage) {
    setBusyId(id)
    try {
      await fn(id)
      notify(successMessage, { tone: 'success' })
      await load()
    } catch (err) {
      notify(friendlyErrorMessage(err), { tone: 'error' })
    } finally {
      setBusyId(null)
    }
  }

  async function confirmReason(reason) {
    const { id, kind } = reasonFor
    setReasonFor(null)
    if (kind === 'reject') await runAction(id, () => rejectIncident(id, reason), 'Incident rejected')
    else await runAction(id, () => flagIncidentNeedsReview(id, reason), 'Incident marked for review')
  }

  const columns = [
    {
      key: 'id',
      header: 'Incident',
      primary: true,
      cell: (i) => (
        <Link to={`/incidents/${i.id}`} className="text-brand-600 hover:text-brand-800 hover:underline">
          {i.display_id || 'Incident'}
        </Link>
      ),
    },
    { key: 'status', header: 'Status', cell: (i) => <StatusBadge status={i.status} /> },
    { key: 'description', header: 'What happened', cell: (i) => <span className="line-clamp-2 max-w-sm text-ink-700">{i.description || '—'}</span> },
    { key: 'created', header: 'Reported', cell: (i) => <span className="whitespace-nowrap text-ink-500">{formatDateTimeShort(i.created_at)}</span> },
    {
      key: 'actions',
      header: '',
      cell: (i) => (
        <div className="flex flex-wrap justify-end gap-2 md:justify-start">
          {canVerifyIncident(user?.role) && i.status === 'new' && (
            <>
              <Button variant="secondary" size="sm" icon={BadgeCheck} disabled={busyId === i.id} onClick={() => runAction(i.id, verifyIncident, 'Incident verified')}>
                Verify
              </Button>
              <Button variant="danger-soft" size="sm" icon={Ban} disabled={busyId === i.id} onClick={() => setReasonFor({ id: i.id, kind: 'reject' })}>
                Reject
              </Button>
              <Button variant="ghost" size="sm" icon={Flag} disabled={busyId === i.id} onClick={() => setReasonFor({ id: i.id, kind: 'review' })}>
                Needs review
              </Button>
            </>
          )}
          {canDispatch(user?.role) && i.status === 'verified' && (
            <Button size="sm" icon={Send} disabled={busyId === i.id} onClick={() => runAction(i.id, dispatchIncident, 'Dispatch requested')}>
              Dispatch
            </Button>
          )}
        </div>
      ),
    },
  ]

  return (
    <div>
      <PageHeader
        title="Incidents"
        subtitle="Reports of things that happened, and what is being done about them"
        actions={
          canCreateIncident(user?.role) && (
            <Button icon={Plus} onClick={() => setShowCreate(true)}>
              New incident
            </Button>
          )
        }
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-[minmax(0,24rem)_14rem]">
        <SearchInput value={search} onChange={setSearch} placeholder="Search incidents" />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="input" aria-label="Filter by status">
          <option value="">Any status</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {statusLabel(s)}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <LoadingSkeleton rows={6} />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : filtered.length === 0 ? (
        <EmptyState icon={FileText} title="No incidents found" hint="Try clearing the search or filter, or create a new incident." />
      ) : (
        <DataTable columns={columns} rows={filtered} />
      )}

      {showCreate && (
        <CreateIncidentModal
          onClose={() => setShowCreate(false)}
          onCreated={async () => {
            setShowCreate(false)
            notify('Incident created', { tone: 'success' })
            await load()
          }}
        />
      )}

      <ConfirmDialog
        open={!!reasonFor}
        title={reasonFor?.kind === 'reject' ? 'Reject this incident?' : 'Mark this incident for review?'}
        message={reasonFor?.kind === 'reject' ? 'This incident will be marked as rejected.' : 'It will be flagged for a closer look.'}
        reasonLabel="Reason (optional)"
        confirmLabel={reasonFor?.kind === 'reject' ? 'Reject' : 'Mark for review'}
        tone={reasonFor?.kind === 'reject' ? 'danger' : 'default'}
        onCancel={() => setReasonFor(null)}
        onConfirm={confirmReason}
      />
    </div>
  )
}

function CreateIncidentModal({ onClose, onCreated }) {
  const { notify } = useToast()
  const [lat, setLat] = useState('17.3850')
  const [lon, setLon] = useState('78.4867')
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setSubmitting(true)
    try {
      await createIncident({ location_lat: Number(lat), location_lon: Number(lon), description: description || null })
      onCreated()
    } catch (err) {
      notify(friendlyErrorMessage(err), { tone: 'error' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      title="New incident"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="create-incident" loading={submitting}>
            {submitting ? 'Creating…' : 'Create incident'}
          </Button>
        </>
      }
    >
      <form id="create-incident" onSubmit={handleSubmit} className="space-y-4 pt-2">
        <Field label="What is happening?">
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Describe the incident" rows={3} className="input" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Latitude">
            <input type="number" step="any" required value={lat} onChange={(e) => setLat(e.target.value)} className="input" />
          </Field>
          <Field label="Longitude">
            <input type="number" step="any" required value={lon} onChange={(e) => setLon(e.target.value)} className="input" />
          </Field>
        </div>
        <p className="text-xs text-ink-500">The place where it happened. It is used to find the nearest police station.</p>
      </form>
    </Modal>
  )
}
