import { useCallback, useEffect, useState } from 'react'
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Minus, Pencil, Plug, Plus, Power, PowerOff, Radar, Trash2, Video, X, ZoomIn } from 'lucide-react'
import { useAuth } from '../context/AuthContext.jsx'
import { useToast } from '../context/ToastContext.jsx'
import {
  listCameras,
  createCamera,
  updateCamera,
  deleteCamera,
  enableCamera,
  disableCamera,
  testCamera,
  requestCameraStream,
  discoverCameras,
} from '../api/cctv.js'
import { ApiError, friendlyErrorMessage } from '../api/client.js'
import { LoadingSkeleton, ErrorState, EmptyState, PageHeader, ConfirmDialog } from '../components/Primitives.jsx'
import { Card, CardHeader } from '../components/ui/Card.jsx'
import Button from '../components/ui/Button.jsx'
import { Field } from '../components/ui/Form.jsx'
import Modal from '../components/ui/Modal.jsx'
import StatusBadge from '../components/StatusBadge.jsx'
import { formatDateTime, formatRelativeTime } from '../utils/format.js'
import { canManageCCTV } from '../utils/roles.js'
import { useOpsSocket } from '../hooks/useOpsSocket.js'
import { getToken } from '../api/client.js'

const CCTV_TOUCHING_EVENTS = new Set([
  'cctv.registered', 'cctv.updated', 'cctv.deleted', 'cctv.enabled', 'cctv.disabled',
  'cctv.online', 'cctv.offline', 'cctv.status_changed',
])

export default function CCTVMonitoring() {
  const { user } = useAuth()
  const { notify } = useToast()
  const [cameras, setCameras] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [viewing, setViewing] = useState(null)
  const [busyId, setBusyId] = useState(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [scanResult, setScanResult] = useState(null) // null = modal closed, [] / [...] = results

  const canManage = canManageCCTV(user?.role)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setCameras(await listCameras())
    } catch (err) {
      setError(friendlyErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // Reuses the existing single /ws/control_room gateway directly -- CCTV
  // doesn't need OperationsContext's device/alert/recording state, so a
  // dedicated small subscription here (same hook everything else uses)
  // avoids growing that shared context with unrelated camera-roster state.
  const handleEvent = useCallback(
    (evt) => {
      if (CCTV_TOUCHING_EVENTS.has(evt.event)) load()
    },
    [load],
  )
  useOpsSocket(handleEvent, { enabled: !!getToken() })

  async function toggleEnabled(camera) {
    setBusyId(camera.id)
    try {
      if (camera.enabled) await disableCamera(camera.id)
      else await enableCamera(camera.id)
      notify(`${camera.camera_code} ${camera.enabled ? 'disabled' : 'enabled'}`, { tone: 'success' })
      await load()
    } catch (err) {
      notify(friendlyErrorMessage(err), { tone: 'error' })
    } finally {
      setBusyId(null)
    }
  }

  async function handleTest(camera) {
    setBusyId(camera.id)
    try {
      const result = await testCamera(camera.id)
      notify(
        result.status === 'online'
          ? `${camera.camera_code}: reachable (${Math.round(result.latency_ms ?? 0)}ms)`
          : `${camera.camera_code}: ${result.error || result.status}`,
        { tone: result.status === 'online' ? 'success' : 'warning' },
      )
      await load()
    } catch (err) {
      notify(friendlyErrorMessage(err), { tone: 'error' })
    } finally {
      setBusyId(null)
    }
  }

  async function handleDelete() {
    setDeleteBusy(true)
    try {
      await deleteCamera(deleting.id)
      notify(`${deleting.camera_code} removed`, { tone: 'success' })
      setDeleting(null)
      await load()
    } catch (err) {
      notify(friendlyErrorMessage(err), { tone: 'error' })
    } finally {
      setDeleteBusy(false)
    }
  }

  async function handleScan() {
    setScanning(true)
    setScanResult(null)
    try {
      const devices = await discoverCameras({ timeoutSeconds: 4 })
      setScanResult(devices)
    } catch (err) {
      notify(friendlyErrorMessage(err), { tone: 'error' })
    } finally {
      setScanning(false)
    }
  }

  return (
    <div>
      <PageHeader
        title="CCTV Monitoring"
        subtitle="Authorized, admin-registered cameras only. Network discovery is restricted to admin-authorized local subnets — never the public internet."
        actions={
          canManage && (
            <>
              <Button variant="secondary" icon={Radar} loading={scanning} onClick={handleScan}>
                Scan local network
              </Button>
              <Button icon={Plus} onClick={() => setEditing({})}>
                Add Camera
              </Button>
            </>
          )
        }
      />

      {loading ? (
        <LoadingSkeleton rows={4} />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : cameras.length === 0 ? (
        <EmptyState icon={Video} title="No cameras registered" />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {cameras.map((cam) => (
            <CameraCard
              key={cam.id}
              camera={cam}
              canManage={canManage}
              busy={busyId === cam.id}
              onOpen={() => setViewing(cam)}
              onEdit={() => setEditing(cam)}
              onDelete={() => setDeleting(cam)}
              onToggle={() => toggleEnabled(cam)}
              onTest={() => handleTest(cam)}
            />
          ))}
        </div>
      )}

      {editing != null && (
        <CameraModal
          camera={Object.keys(editing).length > 0 ? editing : null}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null)
            notify('Camera saved', { tone: 'success' })
            await load()
          }}
        />
      )}

      {viewing && <CameraDetailModal camera={viewing} onClose={() => setViewing(null)} />}

      {scanResult != null && (
        <ScanResultsModal
          devices={scanResult}
          onClose={() => setScanResult(null)}
          onAddDevice={(device) => {
            setScanResult(null)
            setEditing({ _prefillHost: device.address })
          }}
        />
      )}

      <ConfirmDialog
        open={!!deleting}
        title={`Remove ${deleting?.camera_code}?`}
        message={`${deleting?.name || 'This camera'} will be permanently removed. Stream session history is kept for audit. This cannot be undone.`}
        confirmLabel="Remove"
        tone="danger"
        busy={deleteBusy}
        onCancel={() => setDeleting(null)}
        onConfirm={handleDelete}
      />
    </div>
  )
}

function cameraStatusLabel(camera) {
  if (!camera.enabled) return 'Disabled'
  if (camera.status === 'online') return 'Online'
  if (camera.status === 'offline') return 'Offline'
  if (camera.status === 'degraded') return 'Degraded'
  return 'Unknown'
}

function cameraStatusTone(camera) {
  if (!camera.enabled) return 'disconnected'
  return camera.status // online/offline/degraded/unknown all have StatusBadge tones already (degraded/unknown fall back to slate)
}

function CameraCard({ camera, canManage, busy, onOpen, onEdit, onDelete, onToggle, onTest }) {
  return (
    <Card className="animate-rise-in overflow-hidden">
      <button type="button" onClick={onOpen} className="block w-full text-left">
        <div className="flex aspect-video w-full items-center justify-center bg-ink-900 text-ink-400">
          <Video className="h-10 w-10" aria-hidden="true" />
        </div>
      </button>
      <div className="space-y-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate font-semibold text-ink-900">{camera.camera_code}</p>
            <p className="truncate text-sm text-ink-500">{camera.manufacturer ? `${camera.manufacturer} — ${camera.name}` : camera.name}</p>
          </div>
          <StatusBadge status={cameraStatusTone(camera)} label={cameraStatusLabel(camera)} />
        </div>
        <p className="text-xs text-ink-500">{camera.zone || 'No zone assigned'}</p>
        <CompatibilityBadges capabilities={camera.capabilities} />
        <div className="flex flex-wrap gap-2 pt-1">
          <Button variant="secondary" size="sm" icon={Plug} loading={busy} onClick={onTest}>
            Test
          </Button>
          {canManage && (
            <>
              <Button variant="secondary" size="sm" icon={Pencil} onClick={onEdit}>
                Edit
              </Button>
              <Button variant="secondary" size="sm" icon={camera.enabled ? PowerOff : Power} loading={busy} onClick={onToggle}>
                {camera.enabled ? 'Disable' : 'Enable'}
              </Button>
              <Button variant="danger-soft" size="sm" icon={Trash2} onClick={onDelete}>
                Remove
              </Button>
            </>
          )}
        </div>
      </div>
    </Card>
  )
}

// A camera's "live picture" state, honestly derived from the real
// backend response -- never fabricated. See cctv_providers.py: every
// stream request today ends in status=failed with a real error (no media
// gateway configured in this environment) -- that is reported as NOT
// CONFIGURED, never as LIVE or a fake DEMO video pretending to be real.
export function CameraDetailModal({ camera, onClose }) {
  const { notify } = useToast()
  const [streamState, setStreamState] = useState('idle') // idle | requesting | not_configured | active | error
  const [streamError, setStreamError] = useState('')

  async function handleWatch() {
    setStreamState('requesting')
    setStreamError('')
    try {
      const result = await requestCameraStream(camera.id)
      if (result.session.status === 'active' && result.livekit_url && result.token) {
        setStreamState('active')
      } else {
        setStreamState('not_configured')
        setStreamError(result.session.error || 'No media gateway is configured for this camera in this environment.')
      }
    } catch (err) {
      setStreamState('error')
      setStreamError(err instanceof ApiError ? friendlyErrorMessage(err) : 'Could not request a stream.')
      notify(friendlyErrorMessage(err), { tone: 'error' })
    }
  }

  return (
    <Modal title={`${camera.camera_code} — ${camera.name}`} onClose={onClose} size="lg">
      <div className="space-y-4">
        <div className="relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-2xl bg-ink-900 text-center text-ink-300">
          {streamState === 'idle' && (
            <div className="space-y-3">
              <Video className="mx-auto h-10 w-10 text-ink-500" aria-hidden="true" />
              <Button onClick={handleWatch} disabled={!camera.enabled}>
                {camera.enabled ? 'Request stream' : 'Camera is disabled'}
              </Button>
            </div>
          )}
          {streamState === 'requesting' && <p className="text-sm">Requesting stream…</p>}
          {streamState === 'not_configured' && (
            <div className="space-y-2 px-6">
              <StatusBadge status="offline" label="NOT CONFIGURED" />
              <p className="text-sm text-ink-400">{streamError}</p>
            </div>
          )}
          {streamState === 'error' && (
            <div className="space-y-2 px-6">
              <StatusBadge status="offline" label="ERROR" />
              <p className="text-sm text-ink-400">{streamError}</p>
            </div>
          )}
          {streamState === 'active' && <p className="text-sm">Live — media bridge connected.</p>}
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-ink-500">Status</p>
            <p className="mt-0.5"><StatusBadge status={cameraStatusTone(camera)} label={cameraStatusLabel(camera)} /></p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-ink-500">Zone</p>
            <p className="mt-0.5 text-ink-900">{camera.zone || '—'}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-ink-500">Manufacturer</p>
            <p className="mt-0.5 text-ink-900">{camera.manufacturer || '—'}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-ink-500">Model</p>
            <p className="mt-0.5 text-ink-900">{camera.model || '—'}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-ink-500">Protocol</p>
            <p className="mt-0.5 text-ink-900 uppercase">{camera.provider_type}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-ink-500">Last seen</p>
            <p className="mt-0.5 text-ink-900">{formatRelativeTime(camera.last_seen_at)}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-ink-500">Camera ID</p>
            <p className="mt-0.5 break-all text-ink-900">{camera.id}</p>
          </div>
        </div>

        <div>
          <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-ink-500">Capabilities</p>
          <CompatibilityBadges capabilities={camera.capabilities} size="md" />
        </div>

        <PTZSection capabilities={camera.capabilities} />

        <div className="flex justify-end gap-2 border-t border-line pt-4">
          <Button variant="secondary" icon={X} onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Modal>
  )
}

const _CAPABILITY_LABELS = { onvif: 'ONVIF', rtsp: 'RTSP', ptz: 'PTZ', audio: 'Audio', snapshot: 'Snapshot', multiple_streams: 'Multi-stream' }

function CompatibilityBadges({ capabilities, size = 'sm' }) {
  if (!capabilities) return null
  const textSize = size === 'md' ? 'text-xs' : 'text-[10px]'
  return (
    <div className="flex flex-wrap gap-1.5">
      {Object.entries(_CAPABILITY_LABELS).map(([key, label]) => {
        const supported = !!capabilities[key]
        return (
          <span
            key={key}
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-medium ${textSize} ${
              supported ? 'border-green-200 bg-green-50 text-green-800' : 'border-line bg-canvas text-ink-400'
            }`}
          >
            {supported ? '✓' : '✗'} {label}
          </span>
        )
      })}
    </div>
  )
}

// PTZ controls render ONLY when capabilities.ptz is true -- which requires
// a real probe to have set it (see cctv.py::test_camera). No camera in
// this environment has verified PTZ support (no physical PTZ-capable
// device exists here), so this honestly shows "PTZ NOT SUPPORTED" rather
// than a non-functional control surface.
function PTZSection({ capabilities }) {
  const supported = !!capabilities?.ptz
  return (
    <div>
      <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-ink-500">PTZ</p>
      {!supported ? (
        <p className="text-sm text-ink-500">PTZ NOT SUPPORTED</p>
      ) : (
        <div className="flex items-center gap-4">
          <div className="grid grid-cols-3 gap-1">
            <span />
            <Button variant="secondary" size="sm" icon={ChevronUp} aria-label="Tilt up" />
            <span />
            <Button variant="secondary" size="sm" icon={ChevronLeft} aria-label="Pan left" />
            <Button variant="secondary" size="sm" icon={Minus} aria-label="Stop" />
            <Button variant="secondary" size="sm" icon={ChevronRight} aria-label="Pan right" />
            <span />
            <Button variant="secondary" size="sm" icon={ChevronDown} aria-label="Tilt down" />
            <span />
          </div>
          <div className="flex flex-col gap-1">
            <Button variant="secondary" size="sm" icon={ZoomIn}>Zoom +</Button>
            <Button variant="secondary" size="sm" icon={ZoomIn}>Zoom −</Button>
          </div>
        </div>
      )}
    </div>
  )
}

function CameraModal({ camera, onClose, onSaved }) {
  const { notify } = useToast()
  const [cameraCode, setCameraCode] = useState(camera?.camera_code || '')
  const [name, setName] = useState(camera?.name || '')
  const [description, setDescription] = useState(camera?.description || '')
  const [manufacturer, setManufacturer] = useState(camera?.manufacturer || '')
  const [model, setModel] = useState(camera?.model || '')
  const [providerType, setProviderType] = useState(camera?.provider_type || 'rtsp')
  const [zone, setZone] = useState(camera?.zone || '')
  const [lat, setLat] = useState(camera?.latitude ?? '')
  const [lon, setLon] = useState(camera?.longitude ?? '')
  // _prefillHost: set when this modal was opened from a "SCAN LOCAL NETWORK"
  // discovery result (see ScanResultsModal below) -- the admin still
  // explicitly reviews and saves; nothing here auto-registers a camera.
  const [streamHost, setStreamHost] = useState(camera?.stream_host || camera?._prefillHost || '')
  const [streamPort, setStreamPort] = useState(camera?.stream_port ?? 554)
  const [streamPath, setStreamPath] = useState(camera?.stream_path || '')
  const [managementUrl, setManagementUrl] = useState(camera?.management_url || '')
  const [username, setUsername] = useState(camera?.username || '')
  const [secret, setSecret] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState('')

  const isEditing = !!camera?.id

  async function handleSubmit(e) {
    e.preventDefault()
    setFormError('')
    setSubmitting(true)
    try {
      if (isEditing) {
        const payload = {
          name, description: description || null, manufacturer: manufacturer || null, model: model || null, zone: zone || null,
          latitude: lat === '' ? null : Number(lat), longitude: lon === '' ? null : Number(lon),
          provider_type: providerType, stream_host: streamHost, stream_port: Number(streamPort), stream_path: streamPath || null,
          management_url: managementUrl || null, username: username || null,
        }
        if (secret) payload.secret = secret
        await updateCamera(camera.id, payload)
      } else {
        await createCamera({
          camera_code: cameraCode, name, description: description || null, manufacturer: manufacturer || null, model: model || null, zone: zone || null,
          latitude: Number(lat), longitude: Number(lon),
          provider_type: providerType, stream_host: streamHost, stream_port: Number(streamPort), stream_path: streamPath || null,
          management_url: managementUrl || null, username: username || null, secret: secret || null,
        })
      }
      onSaved()
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setFormError(`A camera with code '${cameraCode}' already exists.`)
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
      title={isEditing ? `Edit ${camera.camera_code}` : 'Add Camera'}
      onClose={onClose}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="camera-form" loading={submitting}>
            {submitting ? 'Saving…' : 'Save'}
          </Button>
        </>
      }
    >
      <form id="camera-form" onSubmit={handleSubmit} className="space-y-4 pt-2">
        {formError && <p className="text-sm text-signal-red">{formError}</p>}
        {camera?._prefillHost && (
          <p className="rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-medium text-violet-800">
            Pre-filled from a local network scan result ({camera._prefillHost}). Review and complete the remaining fields before saving — nothing is registered automatically.
          </p>
        )}

        <Field label="Camera code" hint={isEditing ? 'Not editable once created.' : 'Unique, e.g. CCTV-05'}>
          <input required disabled={isEditing} value={cameraCode} onChange={(e) => setCameraCode(e.target.value)} className="input disabled:opacity-60" placeholder="CCTV-05" />
        </Field>
        <Field label="Name">
          <input required value={name} onChange={(e) => setName(e.target.value)} className="input" placeholder="Temple Entrance" />
        </Field>
        <Field label="Description (optional)">
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} className="input" rows={2} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Manufacturer (optional)" hint="Informational only — never changes how the camera connects.">
            <input value={manufacturer} onChange={(e) => setManufacturer(e.target.value)} className="input" placeholder="Hikvision" />
          </Field>
          <Field label="Model (optional)">
            <input value={model} onChange={(e) => setModel(e.target.value)} className="input" placeholder="DS-2CD2xxx" />
          </Field>
        </div>
        <Field label="Zone">
          <input value={zone} onChange={(e) => setZone(e.target.value)} className="input" placeholder="ZONE-02" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Latitude">
            <input required type="number" step="any" value={lat} onChange={(e) => setLat(e.target.value)} className="input" />
          </Field>
          <Field label="Longitude">
            <input required type="number" step="any" value={lon} onChange={(e) => setLon(e.target.value)} className="input" />
          </Field>
        </div>

        <p className="text-xs font-semibold uppercase tracking-wider text-ink-400">Connection</p>
        <Field label="Provider" hint="ONVIF: a genuine SOAP probe is used to test/verify. Generic RTSP: a genuine RTSP OPTIONS probe is used.">
          <select className="input" value={providerType} onChange={(e) => setProviderType(e.target.value)}>
            <option value="rtsp">Generic RTSP</option>
            <option value="onvif">ONVIF</option>
            <option value="nvr">NVR (not implemented yet)</option>
            <option value="vms">VMS (not implemented yet)</option>
          </select>
        </Field>
        <div className="grid grid-cols-[1fr_120px] gap-3">
          <Field label="Host" hint="Hostname or bare IP — no scheme, no credentials in the URL.">
            <input required value={streamHost} onChange={(e) => setStreamHost(e.target.value)} className="input" placeholder="192.168.10.21" />
          </Field>
          <Field label="Port">
            <input required type="number" value={streamPort} onChange={(e) => setStreamPort(e.target.value)} className="input" />
          </Field>
        </div>
        <Field label="Stream path (optional)" hint="RTSP path, e.g. /live">
          <input value={streamPath} onChange={(e) => setStreamPath(e.target.value)} className="input" placeholder="/live" />
        </Field>
        {providerType === 'onvif' && (
          <Field label="ONVIF device service URL (optional)" hint="Defaults to http://{host}:80/onvif/device_service if left blank.">
            <input value={managementUrl} onChange={(e) => setManagementUrl(e.target.value)} className="input" placeholder="http://192.168.10.21:80/onvif/device_service" />
          </Field>
        )}
        <Field label="Username (optional)">
          <input value={username} onChange={(e) => setUsername(e.target.value)} className="input" autoComplete="off" />
        </Field>
        <Field label={isEditing ? 'New password (leave blank to keep current)' : 'Password (optional)'} hint="Never displayed back — stored encrypted.">
          <input type="password" value={secret} onChange={(e) => setSecret(e.target.value)} className="input" autoComplete="new-password" />
        </Field>
      </form>
    </Modal>
  )
}

// Real WS-Discovery results (see app/services/cctv_discovery.py) --
// candidates only, restricted to the backend's CCTV_ALLOWED_NETWORKS and
// inherently limited to the local multicast domain. Never auto-registers
// anything; "ADD CAMERA" just opens the normal form pre-filled with the
// discovered address for the admin to review and complete.
function ScanResultsModal({ devices, onClose, onAddDevice }) {
  return (
    <Modal title="Local network scan" onClose={onClose} size="lg">
      <div className="space-y-4">
        <p className="text-sm text-ink-500">
          WS-Discovery probe sent to the local multicast domain, restricted to admin-authorized subnets (CCTV_ALLOWED_NETWORKS). This can never reach the public internet.
        </p>
        {devices.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line-strong bg-canvas/60 px-4 py-6 text-center text-sm text-ink-500">
            No ONVIF devices responded. This is the expected, honest result when no physical ONVIF camera is reachable on this network.
          </p>
        ) : (
          <ul className="space-y-2">
            {devices.map((d) => (
              <li key={d.address} className="flex items-center justify-between gap-3 rounded-xl border border-line px-3 py-2.5">
                <div className="min-w-0">
                  <p className="font-medium text-ink-900">{d.address}</p>
                  <p className="truncate text-xs text-ink-500">{d.types.join(', ') || 'Unknown device type'}</p>
                </div>
                <Button size="sm" onClick={() => onAddDevice(d)}>
                  Add camera
                </Button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex justify-end border-t border-line pt-4">
          <Button variant="secondary" icon={X} onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Modal>
  )
}
