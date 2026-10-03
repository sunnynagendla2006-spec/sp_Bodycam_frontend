import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Trash2, Users } from 'lucide-react'
import { useAuth } from '../context/AuthContext.jsx'
import { useToast } from '../context/ToastContext.jsx'
import { listConstables, createConstable, deleteConstable } from '../api/constables.js'
import { friendlyErrorMessage } from '../api/client.js'
import { LoadingSkeleton, ErrorState, EmptyState, PageHeader, ConfirmDialog } from '../components/Primitives.jsx'
import StatusBadge from '../components/StatusBadge.jsx'
import Battery from '../components/ui/Battery.jsx'
import Button from '../components/ui/Button.jsx'
import DataTable from '../components/ui/DataTable.jsx'
import { Field } from '../components/ui/Form.jsx'
import Modal from '../components/ui/Modal.jsx'
import SearchInput from '../components/ui/SearchInput.jsx'
import { canManageConstables } from '../utils/roles.js'
import { formatDateTimeShort } from '../utils/format.js'

export default function Constables() {
  const { user } = useAuth()
  const { notify } = useToast()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [removing, setRemoving] = useState(null)
  const [busy, setBusy] = useState(false)

  async function load() {
    setLoading(true)
    setError('')
    try {
      setRows(await listConstables())
    } catch (err) {
      setError(friendlyErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  async function handleDelete() {
    setBusy(true)
    try {
      await deleteConstable(removing.id)
      notify('Constable removed', { tone: 'success' })
      setRemoving(null)
      await load()
    } catch (err) {
      notify(friendlyErrorMessage(err), { tone: 'error' })
    } finally {
      setBusy(false)
    }
  }

  const canManage = canManageConstables(user?.role)
  const needle = search.trim().toLowerCase()
  const filtered = rows.filter((c) => !needle || `${c.badge_number || ''} ${c.phone || ''}`.toLowerCase().includes(needle))

  const columns = [
    {
      key: 'badge',
      header: 'Badge number',
      primary: true,
      cell: (c) => (
        <Link to={`/constables/${c.id}`} className="text-brand-600 hover:text-brand-800 hover:underline">
          {c.badge_number || '—'}
        </Link>
      ),
    },
    { key: 'status', header: 'Status', cell: (c) => <StatusBadge status={c.status} /> },
    { key: 'phone', header: 'Phone', cell: (c) => c.phone || '—' },
    { key: 'battery', header: 'Battery', cell: (c) => <Battery percent={c.battery_level} /> },
    { key: 'login', header: 'Last signed in', cell: (c) => <span className="whitespace-nowrap text-ink-500">{formatDateTimeShort(c.last_login)}</span> },
    ...(canManage
      ? [
          {
            key: 'actions',
            header: '',
            cell: (c) => (
              <Button variant="danger-soft" size="sm" icon={Trash2} onClick={() => setRemoving(c)}>
                Remove
              </Button>
            ),
          },
        ]
      : []),
  ]

  return (
    <div>
      <PageHeader
        title="Constables"
        subtitle="The constables you can see and their current status"
        actions={
          canManage && (
            <Button icon={Plus} onClick={() => setShowCreate(true)}>
              Add constable
            </Button>
          )
        }
      />

      <SearchInput value={search} onChange={setSearch} placeholder="Search by badge number or phone" className="mb-5 sm:max-w-sm" />

      {loading ? (
        <LoadingSkeleton rows={6} />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : filtered.length === 0 ? (
        <EmptyState icon={Users} title="No constables found" hint={search ? 'Try a different search.' : undefined} />
      ) : (
        <DataTable columns={columns} rows={filtered} />
      )}

      {showCreate && (
        <CreateConstableModal
          onClose={() => setShowCreate(false)}
          onCreated={async () => {
            setShowCreate(false)
            notify('Constable added', { tone: 'success' })
            await load()
          }}
        />
      )}

      <ConfirmDialog
        open={!!removing}
        title="Remove this constable?"
        message={`${removing?.badge_number || removing?.phone || 'This constable'} will be removed from the system.`}
        confirmLabel="Remove"
        tone="danger"
        busy={busy}
        onCancel={() => setRemoving(null)}
        onConfirm={handleDelete}
      />
    </div>
  )
}

function CreateConstableModal({ onClose, onCreated }) {
  const { notify } = useToast()
  const [phone, setPhone] = useState('')
  const [badge, setBadge] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setSubmitting(true)
    try {
      await createConstable({ phone, badge_number: badge, password })
      onCreated()
    } catch (err) {
      notify(friendlyErrorMessage(err), { tone: 'error' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      title="Add constable"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="create-constable" loading={submitting}>
            {submitting ? 'Adding…' : 'Add constable'}
          </Button>
        </>
      }
    >
      <form id="create-constable" onSubmit={handleSubmit} className="space-y-4 pt-2">
        <Field label="Phone number">
          <input required value={phone} onChange={(e) => setPhone(e.target.value)} className="input" autoComplete="off" />
        </Field>
        <Field label="Badge number">
          <input required value={badge} onChange={(e) => setBadge(e.target.value)} className="input" autoComplete="off" />
        </Field>
        <Field label="Password for the mobile app" hint="At least 8 characters. The constable signs in to the app with this phone number and password.">
          <input
            required
            minLength={8}
            type="text"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Share this with the constable"
            className="input"
            autoComplete="off"
          />
        </Field>
      </form>
    </Modal>
  )
}
