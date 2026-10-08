import { useEffect, useMemo, useState } from 'react'
import { MapPin, Pencil, Plus, Power, PowerOff, Trash2 } from 'lucide-react'
import { useAuth } from '../context/AuthContext.jsx'
import { useOperations } from '../context/OperationsContext.jsx'
import { useToast } from '../context/ToastContext.jsx'
import {
  createAccessPoint,
  updateAccessPoint,
  enableAccessPoint,
  disableAccessPoint,
  deleteAccessPoint,
} from '../api/accessPoints.js'
import { ApiError, friendlyErrorMessage } from '../api/client.js'
import { LoadingSkeleton, ErrorState, EmptyState, PageHeader, ConfirmDialog } from '../components/Primitives.jsx'
import Button from '../components/ui/Button.jsx'
import DataTable from '../components/ui/DataTable.jsx'
import { Field } from '../components/ui/Form.jsx'
import Modal from '../components/ui/Modal.jsx'
import StatusBadge from '../components/StatusBadge.jsx'
import { formatDateTime } from '../utils/format.js'
import { canManageAccessPoints } from '../utils/roles.js'

export default function AccessPoints() {
  const { user } = useAuth()
  // Reuses the SAME accessPoints/zones state OperationsContext already
  // loads for the Virtual AP map (one source of truth, no second fetch
  // loop) -- refreshAccessPoints() is the same function that page calls
  // after an admin enable/disable, since access_points.py publishes no
  // WebSocket event for either action.
  const { accessPoints, loading, error, refreshAccessPoints } = useOperations()
  const { notify } = useToast()
  const [editing, setEditing] = useState(null) // null = closed, {} = create, {...} = edit
  const [deleting, setDeleting] = useState(null)
  const [deleteBlocked, setDeleteBlocked] = useState(null) // {ap, activeCount, message}
  const [busy, setBusy] = useState(false)

  const canManage = canManageAccessPoints(user?.role)

  const zoneOptions = useMemo(() => {
    const set = new Set(accessPoints.map((a) => a.zone).filter(Boolean))
    return Array.from(set).sort()
  }, [accessPoints])

  async function toggleEnabled(ap) {
    setBusy(true)
    try {
      if (ap.enabled) await disableAccessPoint(ap.id)
      else await enableAccessPoint(ap.id)
      notify(`${ap.code} ${ap.enabled ? 'disabled' : 'enabled'}`, { tone: 'success' })
      await refreshAccessPoints()
    } catch (err) {
      notify(friendlyErrorMessage(err), { tone: 'error' })
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete(force = false) {
    const ap = deleting || deleteBlocked?.ap
    if (!ap) return
    setBusy(true)
    try {
      await deleteAccessPoint(ap.id, { force })
      notify(`${ap.code} deleted`, { tone: 'success' })
      setDeleting(null)
      setDeleteBlocked(null)
      await refreshAccessPoints()
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        // Backend refused because devices are currently associated -- see
        // app/routers/access_points.py::delete_access_point. Surface the
        // exact backend-provided count/message rather than guessing.
        setDeleting(null)
        setDeleteBlocked({ ap, message: err.detail })
      } else {
        notify(friendlyErrorMessage(err), { tone: 'error' })
      }
    } finally {
      setBusy(false)
    }
  }

  const columns = [
    { key: 'code', header: 'AP Code', primary: true, cell: (a) => a.code },
    { key: 'name', header: 'Name', cell: (a) => a.name },
    { key: 'zone', header: 'Zone', cell: (a) => a.zone || '—' },
    {
      key: 'status',
      header: 'Status',
      cell: (a) => <StatusBadge status={!a.enabled ? 'disconnected' : a.status} label={!a.enabled ? 'Disabled' : a.status === 'online' ? 'Online' : 'Offline'} />,
    },
    { key: 'police', header: 'Police Count', cell: (a) => a.associated_device_count ?? '—' },
    { key: 'updated', header: 'Last Updated', cell: (a) => formatDateTime(a.updated_at) },
    ...(canManage
      ? [
          {
            key: 'actions',
            header: '',
            cell: (a) => (
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" size="sm" icon={Pencil} onClick={() => setEditing(a)}>
                  Edit
                </Button>
                <Button variant="secondary" size="sm" icon={a.enabled ? PowerOff : Power} onClick={() => toggleEnabled(a)} disabled={busy}>
                  {a.enabled ? 'Disable' : 'Enable'}
                </Button>
                <Button variant="danger-soft" size="sm" icon={Trash2} onClick={() => setDeleting(a)}>
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
        title="Access Points"
        subtitle="VIRTUAL AP MODE — DEMO. Configured the same way a future physical Wi-Fi AP would be; see each AP's edge node id."
        actions={
          canManage && (
            <Button icon={Plus} onClick={() => setEditing({})}>
              + Add Access Point
            </Button>
          )
        }
      />

      {loading ? (
        <LoadingSkeleton rows={4} />
      ) : error ? (
        <ErrorState message={error} />
      ) : accessPoints.length === 0 ? (
        <EmptyState icon={MapPin} title="No access points configured" />
      ) : (
        <DataTable columns={columns} rows={accessPoints} />
      )}

      {editing != null && (
        <AccessPointModal
          ap={editing.id ? editing : null}
          zoneOptions={zoneOptions}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null)
            notify('Access point saved', { tone: 'success' })
            await refreshAccessPoints()
          }}
        />
      )}

      <ConfirmDialog
        open={!!deleting}
        title={`Delete ${deleting?.code}?`}
        message={`${deleting?.name || 'This access point'} will be permanently removed. Historical movement records are kept. This cannot be undone.`}
        confirmLabel="Delete"
        tone="danger"
        busy={busy}
        onCancel={() => setDeleting(null)}
        onConfirm={() => handleDelete(false)}
      />

      <ConfirmDialog
        open={!!deleteBlocked}
        title={`Cannot delete ${deleteBlocked?.ap?.code}`}
        message={`${deleteBlocked?.message || 'Police devices are currently associated with this access point.'} Disabling it is the recommended alternative — it stops new movement from targeting it while keeping history intact. Delete anyway?`}
        confirmLabel="Delete anyway"
        tone="danger"
        busy={busy}
        onCancel={() => setDeleteBlocked(null)}
        onConfirm={() => handleDelete(true)}
      />
    </div>
  )
}

function AccessPointModal({ ap, zoneOptions, onClose, onSaved }) {
  const { notify } = useToast()
  const [code, setCode] = useState(ap?.code || '')
  const [name, setName] = useState(ap?.name || '')
  const [description, setDescription] = useState(ap?.description || '')
  const [zone, setZone] = useState(ap?.zone || '')
  const [lat, setLat] = useState(ap?.latitude ?? '')
  const [lon, setLon] = useState(ap?.longitude ?? '')
  const [radius, setRadius] = useState(ap?.coverage_radius_m ?? '')
  const [edgeNodeId, setEdgeNodeId] = useState(ap?.edge_node_id || '')
  const [enabled, setEnabled] = useState(ap?.enabled ?? true)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setFormError('')

    const latNum = lat === '' ? null : Number(lat)
    const lonNum = lon === '' ? null : Number(lon)
    if ((lat !== '' && Number.isNaN(latNum)) || (lon !== '' && Number.isNaN(lonNum))) {
      setFormError('Latitude/longitude must be valid numbers.')
      return
    }
    if ((latNum != null) !== (lonNum != null)) {
      setFormError('Provide both latitude and longitude, or leave both blank.')
      return
    }
    const radiusNum = radius === '' ? null : Number(radius)
    if (radius !== '' && (Number.isNaN(radiusNum) || radiusNum <= 0)) {
      setFormError('Coverage radius must be a positive number.')
      return
    }

    setSubmitting(true)
    try {
      if (ap) {
        await updateAccessPoint(ap.id, {
          name, description: description || null, zone: zone || null,
          latitude: latNum, longitude: lonNum,
          coverage_radius_m: radiusNum, edge_node_id: edgeNodeId || null,
        })
        if (ap.enabled !== enabled) {
          if (enabled) await enableAccessPoint(ap.id)
          else await disableAccessPoint(ap.id)
        }
      } else {
        await createAccessPoint({
          code, name, description: description || null, zone: zone || null,
          latitude: latNum, longitude: lonNum,
          coverage_radius_m: radiusNum, edge_node_id: edgeNodeId || null,
        })
      }
      onSaved()
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setFormError(`An access point with code '${code}' already exists.`)
      } else {
        setFormError(friendlyErrorMessage(err))
        notify(friendlyErrorMessage(err), { tone: 'error' })
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      title={ap ? `Edit ${ap.code}` : 'Add Access Point'}
      onClose={onClose}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="ap-form" loading={submitting}>
            {submitting ? 'Saving…' : 'Save'}
          </Button>
        </>
      }
    >
      <form id="ap-form" onSubmit={handleSubmit} className="space-y-4 pt-2">
        {!ap && (
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
            VIRTUAL AP MODE — DEMO. This simulates AP association for development/demonstration; it is not a real Wi-Fi association. The same abstraction can be replaced by a real edge-reported physical AP later (see "Edge node id" below).
          </p>
        )}
        {formError && <p className="text-sm text-signal-red">{formError}</p>}

        <Field label="AP Code" hint={ap ? 'Not editable once created (stable identifier).' : 'Unique, e.g. AP-05'}>
          <input required disabled={!!ap} value={code} onChange={(e) => setCode(e.target.value)} className="input disabled:opacity-60" placeholder="AP-05" />
        </Field>
        <Field label="Name">
          <input required value={name} onChange={(e) => setName(e.target.value)} className="input" placeholder="Main Gate" />
        </Field>
        <Field label="Description (optional)">
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} className="input" rows={2} />
        </Field>
        <Field label="Zone">
          <input value={zone} onChange={(e) => setZone(e.target.value)} className="input" placeholder="ZONE-05" list="ap-zone-options" />
          <datalist id="ap-zone-options">
            {zoneOptions.map((z) => (
              <option key={z} value={z} />
            ))}
          </datalist>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Latitude">
            <input type="number" step="any" value={lat} onChange={(e) => setLat(e.target.value)} className="input" />
          </Field>
          <Field label="Longitude">
            <input type="number" step="any" value={lon} onChange={(e) => setLon(e.target.value)} className="input" />
          </Field>
        </div>
        <Field label="Coverage radius (meters, optional)" hint="Display/admin-config only — never used by presence/handoff matching logic.">
          <input type="number" step="any" min="0" value={radius} onChange={(e) => setRadius(e.target.value)} className="input" placeholder="100" />
        </Field>
        <Field label="Edge node id (optional)" hint="Placeholder for a future physical AP's hardware/edge-controller address — unused by any logic today.">
          <input value={edgeNodeId} onChange={(e) => setEdgeNodeId(e.target.value)} className="input" />
        </Field>
        {ap && (
          <label className="flex items-center gap-2 text-sm font-medium text-ink-700">
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="h-4 w-4 rounded border-line-strong" />
            Enabled (a disabled AP cannot be selected as a movement destination)
          </label>
        )}
      </form>
    </Modal>
  )
}
