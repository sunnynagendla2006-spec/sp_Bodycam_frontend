import { useEffect, useState } from 'react'
import { Building2, Pencil, Phone, Plus, Trash2 } from 'lucide-react'
import { useAuth } from '../context/AuthContext.jsx'
import { useToast } from '../context/ToastContext.jsx'
import { listStations, createStation, updateStation, deleteStation } from '../api/stations.js'
import { friendlyErrorMessage } from '../api/client.js'
import { LoadingSkeleton, ErrorState, EmptyState, PageHeader, ConfirmDialog } from '../components/Primitives.jsx'
import Button from '../components/ui/Button.jsx'
import DataTable from '../components/ui/DataTable.jsx'
import { Field } from '../components/ui/Form.jsx'
import Modal from '../components/ui/Modal.jsx'
import { canManageStations } from '../utils/roles.js'

export default function PoliceStations() {
  const { user } = useAuth()
  const { notify } = useToast()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(null) // null = closed, {} = create, {...} = edit
  const [deleting, setDeleting] = useState(null)
  const [busy, setBusy] = useState(false)

  async function load() {
    setLoading(true)
    setError('')
    try {
      setRows(await listStations())
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
      await deleteStation(deleting.id)
      notify('Station removed', { tone: 'success' })
      setDeleting(null)
      await load()
    } catch (err) {
      notify(friendlyErrorMessage(err), { tone: 'error' })
    } finally {
      setBusy(false)
    }
  }

  const canManage = canManageStations(user?.role)

  const columns = [
    { key: 'name', header: 'Station', primary: true, cell: (s) => s.name },
    {
      key: 'contact',
      header: 'Phone',
      cell: (s) =>
        s.contact ? (
          <span className="inline-flex items-center gap-1.5">
            <Phone className="h-4 w-4 text-ink-400" aria-hidden="true" />
            {s.contact}
          </span>
        ) : (
          '—'
        ),
    },
    ...(canManage
      ? [
          {
            key: 'actions',
            header: '',
            cell: (s) => (
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" icon={Pencil} onClick={() => setEditing(s)}>
                  Edit
                </Button>
                <Button variant="danger-soft" size="sm" icon={Trash2} onClick={() => setDeleting(s)}>
                  Delete
                </Button>
              </div>
            ),
          },
        ]
      : []),
  ]

  return (
    <div>
      <PageHeader
        title="Police Stations"
        subtitle="Stations in the system"
        actions={
          canManage && (
            <Button icon={Plus} onClick={() => setEditing({})}>
              Add station
            </Button>
          )
        }
      />

      {loading ? (
        <LoadingSkeleton rows={4} />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : rows.length === 0 ? (
        <EmptyState icon={Building2} title="No stations found" />
      ) : (
        <DataTable columns={columns} rows={rows} />
      )}

      {editing != null && (
        <StationModal
          station={editing.id ? editing : null}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null)
            notify('Station saved', { tone: 'success' })
            await load()
          }}
        />
      )}

      <ConfirmDialog
        open={!!deleting}
        title="Delete this station?"
        message={`${deleting?.name || 'This station'} will be removed. This cannot be undone.`}
        confirmLabel="Delete"
        tone="danger"
        busy={busy}
        onCancel={() => setDeleting(null)}
        onConfirm={handleDelete}
      />
    </div>
  )
}

function StationModal({ station, onClose, onSaved }) {
  const { notify } = useToast()
  const [name, setName] = useState(station?.name || '')
  const [contact, setContact] = useState(station?.contact || '')
  const [lat, setLat] = useState(station?.latitude ?? '17.3850')
  const [lon, setLon] = useState(station?.longitude ?? '78.4867')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setSubmitting(true)
    const payload = { name, contact: contact || null, latitude: Number(lat), longitude: Number(lon) }
    try {
      if (station) await updateStation(station.id, payload)
      else await createStation(payload)
      onSaved()
    } catch (err) {
      notify(friendlyErrorMessage(err), { tone: 'error' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      title={station ? 'Edit station' : 'Add station'}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="station-form" loading={submitting}>
            {submitting ? 'Saving…' : 'Save'}
          </Button>
        </>
      }
    >
      <form id="station-form" onSubmit={handleSubmit} className="space-y-4 pt-2">
        <Field label="Station name">
          <input required value={name} onChange={(e) => setName(e.target.value)} className="input" />
        </Field>
        <Field label="Phone number (optional)">
          <input value={contact} onChange={(e) => setContact(e.target.value)} className="input" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Latitude">
            <input type="number" step="any" required value={lat} onChange={(e) => setLat(e.target.value)} className="input" />
          </Field>
          <Field label="Longitude">
            <input type="number" step="any" required value={lon} onChange={(e) => setLon(e.target.value)} className="input" />
          </Field>
        </div>
        <p className="text-xs text-ink-500">The map position is used to find the nearest station when an incident is reported.</p>
      </form>
    </Modal>
  )
}
