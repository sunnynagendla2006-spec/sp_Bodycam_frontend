import { useCallback, useEffect, useRef, useState } from 'react'
import { Building2, MonitorPlay, Pencil, Plug, Plus, Power, PowerOff, Trash2, Video } from 'lucide-react'
import { useToast } from '../context/ToastContext.jsx'
import {
  assignCameraToBuilding, deleteBuilding, disableBuilding, enableBuilding, listBuildings, listBuildingZones,
  listUnassignedCameras, testBuilding,
} from '../api/buildings.js'
import { friendlyErrorMessage } from '../api/client.js'
import { EmptyState, ErrorState, LoadingSkeleton, PageHeader } from '../components/Primitives.jsx'
import { Card, CardHeader } from '../components/ui/Card.jsx'
import Button, { LinkButton } from '../components/ui/Button.jsx'
import { Field } from '../components/ui/Form.jsx'
import Modal from '../components/ui/Modal.jsx'
import Pagination from '../components/ui/Pagination.jsx'
import SearchInput from '../components/ui/SearchInput.jsx'
import StatusBadge from '../components/StatusBadge.jsx'
import BuildingForm from '../components/cctv/BuildingForm.jsx'

const PAGE_SIZE = 20
const MODE_LABEL = { nvr: 'NVR / DVR', direct_ip: 'Direct IP' }
const ACCESS_LABEL = { vpn: 'VPN', tunnel: 'Tunnel', lan: 'Private LAN', public_direct: 'Public endpoint' }

// Admin-only (the route is only linked for admins and the backend enforces it regardless).
export default function CCTVBuildings() {
  const { notify } = useToast()
  const [zones, setZones] = useState([])
  const [zone, setZone] = useState('')
  const [query, setQuery] = useState('')
  const [offset, setOffset] = useState(0)
  const [data, setData] = useState({ items: [], total: 0 })
  const [unassigned, setUnassigned] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(null) // {} = create, building = edit
  const [deleting, setDeleting] = useState(null)
  const [assigning, setAssigning] = useState(null)
  const [busyId, setBusyId] = useState(null)

  const filters = useRef({ zone, query, offset })
  filters.current = { zone, query, offset }

  const load = useCallback(async () => {
    const f = filters.current
    try {
      const [buildings, orphans, zs] = await Promise.all([
        listBuildings({ zone: f.zone || undefined, q: f.query || undefined, limit: PAGE_SIZE, offset: f.offset }),
        listUnassignedCameras({ limit: 100 }),
        listBuildingZones(),
      ])
      setData(buildings)
      setUnassigned(orphans)
      setZones(zs)
      setError('')
    } catch (err) {
      setError(friendlyErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    setLoading(true)
    const t = setTimeout(load, query ? 300 : 0)
    return () => clearTimeout(t)
  }, [zone, query, offset, load])

  async function run(building, action, success) {
    setBusyId(building.id)
    try {
      await action()
      notify(success, { tone: 'success' })
      await load()
    } catch (err) {
      notify(friendlyErrorMessage(err), { tone: 'error' })
    } finally {
      setBusyId(null)
    }
  }

  async function handleTest(building) {
    setBusyId(building.id)
    try {
      const result = await testBuilding(building.id)
      const bad = result.results.filter((r) => r.status !== 'online')
      notify(
        bad.length === 0
          ? `${building.code}: all ${result.results.length} endpoint(s) reachable`
          : `${building.code}: ${bad.map((r) => `${r.target} ${r.status}${r.error ? ` (${r.error})` : ''}`).join('; ')}`,
        { tone: bad.length === 0 ? 'success' : 'warning' },
      )
      await load()
    } catch (err) {
      notify(friendlyErrorMessage(err), { tone: 'error' })
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div>
      <PageHeader
        title="CCTV Buildings"
        subtitle="Register buildings and their cameras. Each enabled building becomes one slot on the CCTV Wall."
        actions={
          <>
            <LinkButton to="/cctv/wall" icon={MonitorPlay}>Open CCTV Wall</LinkButton>
            <Button icon={Plus} onClick={() => setEditing({})}>Add Building</Button>
          </>
        }
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <select value={zone} onChange={(e) => { setOffset(0); setZone(e.target.value) }} className="input sm:w-56" aria-label="Filter by zone">
          <option value="">All zones</option>
          {zones.map((z) => <option key={z} value={z}>{z}</option>)}
        </select>
        <SearchInput value={query} onChange={(v) => { setOffset(0); setQuery(v) }} placeholder="Search building name or code" className="sm:w-72" />
      </div>

      {loading && data.items.length === 0 ? (
        <LoadingSkeleton rows={4} />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : data.items.length === 0 ? (
        <EmptyState icon={Building2} title="No buildings registered" hint="Add a building, then its cameras." />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {data.items.map((b) => (
              <Card key={b.id} className="space-y-3 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-ink-900">{b.name}</p>
                    <p className="text-xs text-ink-500">{b.code} · {b.zone || 'No zone'}</p>
                  </div>
                  <StatusBadge status={b.enabled ? (b.health === 'empty' ? 'unknown' : b.health) : 'disabled'} label={!b.enabled ? 'Disabled' : b.health === 'empty' ? 'No cameras' : undefined} />
                </div>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-ink-600">
                  <div><dt className="inline text-ink-500">Cameras: </dt><dd className="inline">{b.camera_count} ({b.online_count} online)</dd></div>
                  <div><dt className="inline text-ink-500">Method: </dt><dd className="inline">{MODE_LABEL[b.connection_mode]} via {ACCESS_LABEL[b.network_access]}</dd></div>
                  {b.public_ip && <div><dt className="inline text-ink-500">Public IP: </dt><dd className="inline">{b.public_ip}</dd></div>}
                  {b.owner_name && <div><dt className="inline text-ink-500">Owner: </dt><dd className="inline">{b.owner_name}</dd></div>}
                </dl>
                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" size="sm" icon={Pencil} onClick={() => setEditing(b)}>Edit</Button>
                  <Button variant="secondary" size="sm" icon={Plug} loading={busyId === b.id} onClick={() => handleTest(b)}>Test</Button>
                  {b.enabled ? (
                    <Button variant="secondary" size="sm" icon={PowerOff} disabled={busyId === b.id} onClick={() => run(b, () => disableBuilding(b.id), `${b.code} disabled`)}>Disable</Button>
                  ) : (
                    <Button variant="secondary" size="sm" icon={Power} disabled={busyId === b.id} onClick={() => run(b, () => enableBuilding(b.id), `${b.code} enabled`)}>Enable</Button>
                  )}
                  <Button variant="danger-soft" size="sm" icon={Trash2} onClick={() => setDeleting(b)}>Delete</Button>
                </div>
              </Card>
            ))}
          </div>
          <Pagination offset={offset} pageSize={PAGE_SIZE} count={offset + PAGE_SIZE < data.total ? PAGE_SIZE : 0} onChange={setOffset} />
        </>
      )}

      {unassigned.length > 0 && (
        <Card className="mt-8 p-4">
          <CardHeader icon={Video} title="Cameras not in a building" subtitle="Registered before buildings existed. They keep working; assign them to include them on the CCTV Wall." />
          <ul className="divide-y divide-line">
            {unassigned.map((cam) => (
              <li key={cam.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink-900">{cam.name}</p>
                  <p className="text-xs text-ink-500">{cam.camera_code}{cam.zone ? ` · ${cam.zone}` : ''}</p>
                </div>
                <Button variant="secondary" size="sm" onClick={() => setAssigning(cam)}>Assign to building</Button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {editing && (
        <BuildingForm
          building={editing.id ? editing : null}
          onClose={() => setEditing(null)}
          onSaved={(saved) => {
            setEditing(null)
            notify(`${saved.code} saved`, { tone: 'success' })
            load()
          }}
        />
      )}
      {deleting && (
        <DeleteBuildingModal
          building={deleting}
          onClose={() => setDeleting(null)}
          onDeleted={() => {
            setDeleting(null)
            load()
          }}
        />
      )}
      {assigning && (
        <AssignModal
          camera={assigning}
          onClose={() => setAssigning(null)}
          onAssigned={() => {
            setAssigning(null)
            notify('Camera assigned', { tone: 'success' })
            load()
          }}
        />
      )}
    </div>
  )
}

function DeleteBuildingModal({ building, onClose, onDeleted }) {
  const { notify } = useToast()
  const [choice, setChoice] = useState(building.camera_count > 0 ? 'detach' : 'reject')
  const [busy, setBusy] = useState(false)

  async function confirm() {
    setBusy(true)
    try {
      await deleteBuilding(building.id, { cameras: choice })
      notify(`${building.code} deleted`, { tone: 'success' })
      onDeleted()
    } catch (err) {
      notify(friendlyErrorMessage(err), { tone: 'error' })
      setBusy(false)
    }
  }

  return (
    <Modal
      title={`Delete ${building.name}?`}
      onClose={onClose}
      size="sm"
      dismissible={!busy}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="danger" loading={busy} onClick={confirm}>Delete building</Button>
        </>
      }
    >
      {building.camera_count > 0 ? (
        <fieldset className="space-y-2 pt-2 text-sm text-ink-700">
          <legend className="mb-2">This building has {building.camera_count} camera(s). What should happen to them?</legend>
          <label className="flex items-start gap-2"><input type="radio" name="cams" checked={choice === 'detach'} onChange={() => setChoice('detach')} className="mt-1" /> Keep them as unassigned cameras (recommended)</label>
          <label className="flex items-start gap-2"><input type="radio" name="cams" checked={choice === 'delete'} onChange={() => setChoice('delete')} className="mt-1" /> Delete them too</label>
        </fieldset>
      ) : (
        <p className="pt-2 text-sm text-ink-700">This building has no cameras. It will be removed.</p>
      )}
    </Modal>
  )
}

function AssignModal({ camera, onClose, onAssigned }) {
  const { notify } = useToast()
  const [buildings, setBuildings] = useState([])
  const [buildingId, setBuildingId] = useState('')

  // The page shows one page of buildings; the picker needs all of them (up to the API maximum).
  useEffect(() => {
    let cancelled = false
    listBuildings({ limit: 200 })
      .then((res) => {
        if (cancelled) return
        setBuildings(res.items)
        setBuildingId((id) => id || res.items[0]?.id || '')
      })
      .catch((err) => !cancelled && notify(friendlyErrorMessage(err), { tone: 'error' }))
    return () => {
      cancelled = true
    }
  }, [notify])
  const [channel, setChannel] = useState('')
  const [busy, setBusy] = useState(false)
  const target = buildings.find((b) => b.id === buildingId)

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    try {
      await assignCameraToBuilding(camera.id, { buildingId, channel: channel ? Number(channel) : undefined })
      onAssigned()
    } catch (err) {
      notify(friendlyErrorMessage(err), { tone: 'error' })
      setBusy(false)
    }
  }

  return (
    <Modal
      title={`Assign ${camera.name}`}
      onClose={onClose}
      size="sm"
      dismissible={!busy}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button type="submit" form="assign-form" loading={busy} disabled={!buildingId}>Assign</Button>
        </>
      }
    >
      <form id="assign-form" onSubmit={submit} className="space-y-4 pt-2">
        <Field label="Building">
          <select required value={buildingId} onChange={(e) => setBuildingId(e.target.value)} className="input">
            {buildings.map((b) => <option key={b.id} value={b.id}>{b.name} ({b.code})</option>)}
          </select>
        </Field>
        {target?.connection_mode === 'nvr' && (
          <Field label="NVR channel" hint="This camera will be streamed through the building's recorder on this channel.">
            <input required type="number" min="1" max="512" value={channel} onChange={(e) => setChannel(e.target.value)} className="input" />
          </Field>
        )}
      </form>
    </Modal>
  )
}
