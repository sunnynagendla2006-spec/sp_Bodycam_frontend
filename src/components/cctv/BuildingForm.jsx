import { useEffect, useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import { Field } from '../ui/Form.jsx'
import Modal from '../ui/Modal.jsx'
import Button from '../ui/Button.jsx'
import { friendlyErrorMessage } from '../../api/client.js'
import { addBuildingCamera, createBuilding, listBuildingCameras, reorderBuildingCameras, updateBuilding, updateBuildingCamera } from '../../api/buildings.js'
import { deleteCamera } from '../../api/cctv.js'

const MAX_ROWS = 64

let rowSeq = 0
function newRow(mode, index, extra = {}) {
  rowSeq += 1
  return {
    key: `new-${rowSeq}`,
    id: null,
    name: `Camera ${index + 1}`,
    channel: mode === 'nvr' ? String(index + 1) : '',
    enabled: true,
    stream_host: '',
    stream_port: '554',
    stream_path: '',
    username: '',
    secret: '', // write-only: never populated from the server
    credentials_configured: false,
    dirty: true,
    ...extra,
  }
}

function rowFromCamera(cam) {
  return {
    key: cam.id, id: cam.id, name: cam.name, channel: cam.channel ? String(cam.channel) : '', enabled: cam.enabled,
    stream_host: cam.stream_host || '', stream_port: String(cam.stream_port || 554), stream_path: cam.stream_path || '',
    username: cam.username || '', secret: '', credentials_configured: !!cam.credentials_configured, dirty: false,
  }
}

const emptyForm = {
  name: '', code: '', zone: '', owner_name: '', owner_contact: '', address: '', latitude: '', longitude: '',
  public_ip: '', connection_mode: 'nvr', network_access: 'vpn', authorized_networks: '',
  recorder_vendor: 'custom', recorder_protocol: 'rtsp', recorder_host: '', recorder_port: '554',
  stream_path_template: '', recorder_username: '', recorder_secret: '',
}

function formFromBuilding(b) {
  return {
    ...emptyForm,
    name: b.name, code: b.code, zone: b.zone || '', owner_name: b.owner_name || '', owner_contact: b.owner_contact || '',
    address: b.address || '', latitude: b.latitude ?? '', longitude: b.longitude ?? '', public_ip: b.public_ip || '',
    connection_mode: b.connection_mode, network_access: b.network_access, authorized_networks: (b.authorized_networks || []).join('\n'),
    recorder_vendor: b.recorder_vendor, recorder_protocol: b.recorder_protocol, recorder_host: b.recorder_host || '',
    recorder_port: String(b.recorder_port || 554), stream_path_template: b.stream_path_template || '', recorder_username: b.recorder_username || '',
  }
}

const nullable = (v) => (v === '' || v == null ? null : v)

/**
 * Create / edit a building and its cameras.
 *  - Create: "Number of cameras" generates that many rows; everything is sent in one request.
 *  - Edit: existing cameras are loaded from the backend; changes are applied per camera
 *    (add / update / remove / reorder) after the building itself is saved.
 * Passwords are write-only: they are never filled from the server and are cleared after saving.
 */
export default function BuildingForm({ building, onClose, onSaved }) {
  const isEditing = !!building
  const [form, setForm] = useState(isEditing ? formFromBuilding(building) : emptyForm)
  const [rows, setRows] = useState([])
  const [original, setOriginal] = useState([])
  const [loadingRows, setLoadingRows] = useState(isEditing)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState('')

  useEffect(() => {
    if (!isEditing) return undefined
    let cancelled = false
    listBuildingCameras(building.id)
      .then((cams) => {
        if (cancelled) return
        const loaded = cams.map(rowFromCamera)
        setRows(loaded)
        setOriginal(loaded)
      })
      .catch((err) => !cancelled && setFormError(friendlyErrorMessage(err)))
      .finally(() => !cancelled && setLoadingRows(false))
    return () => {
      cancelled = true
    }
  }, [isEditing, building?.id])

  const nvr = form.connection_mode === 'nvr'
  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }))
  const hasCameras = useMemo(() => rows.length > 0, [rows])

  function setRow(key, patch) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch, dirty: true } : r)))
  }

  function setCount(raw) {
    const n = Math.max(0, Math.min(MAX_ROWS, Number(raw) || 0))
    setRows((prev) => {
      if (n >= prev.length) return [...prev, ...Array.from({ length: n - prev.length }, (_, i) => newRow(form.connection_mode, prev.length + i))]
      // Shrink only by dropping trailing rows that have not been saved yet.
      const next = [...prev]
      while (next.length > n && !next[next.length - 1].id) next.pop()
      return next
    })
  }

  function move(index, dir) {
    setRows((prev) => {
      const target = index + dir
      if (target < 0 || target >= prev.length) return prev
      const next = [...prev]
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
  }

  function cameraPayload(r, forUpdate) {
    const base = { name: r.name, enabled: r.enabled }
    if (nvr) return { ...base, channel: r.channel ? Number(r.channel) : null }
    const direct = { ...base, stream_host: nullable(r.stream_host), stream_port: Number(r.stream_port) || 554, stream_path: nullable(r.stream_path), username: nullable(r.username) }
    if (r.secret) direct.secret = r.secret
    return forUpdate ? direct : { ...direct, channel: r.channel ? Number(r.channel) : null }
  }

  function buildingPayload() {
    const payload = {
      name: form.name, zone: nullable(form.zone), owner_name: nullable(form.owner_name), owner_contact: nullable(form.owner_contact),
      address: nullable(form.address), latitude: Number(form.latitude), longitude: Number(form.longitude),
      network_access: form.network_access,
      authorized_networks: form.authorized_networks.split('\n').map((l) => l.trim()).filter(Boolean),
      recorder_vendor: form.recorder_vendor, recorder_protocol: form.recorder_protocol,
      recorder_host: nullable(form.recorder_host), recorder_port: Number(form.recorder_port) || 554,
      stream_path_template: form.recorder_vendor === 'custom' ? nullable(form.stream_path_template) : null,
      recorder_username: nullable(form.recorder_username),
    }
    if (form.recorder_secret) payload.recorder_secret = form.recorder_secret
    return payload
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setFormError('')
    setSubmitting(true)
    try {
      let saved
      if (!isEditing) {
        saved = await createBuilding({
          ...buildingPayload(), code: form.code, connection_mode: form.connection_mode, public_ip: nullable(form.public_ip),
          cameras: rows.map((r, i) => ({ ...cameraPayload(r, false), sort_order: i })),
        })
      } else {
        const payload = buildingPayload()
        if (form.connection_mode !== building.connection_mode) payload.connection_mode = form.connection_mode
        if (form.public_ip) payload.public_ip = form.public_ip
        else if (building.public_ip) payload.clear_public_ip = true
        saved = await updateBuilding(building.id, payload)
        await saveCameras(saved.id)
      }
      setForm((f) => ({ ...f, recorder_secret: '' })) // never keep a typed password in state
      setRows((prev) => prev.map((r) => ({ ...r, secret: '' })))
      onSaved(saved)
    } catch (err) {
      setFormError(friendlyErrorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  // Edit mode: apply per-camera changes (sequentially so an error names the failing step).
  async function saveCameras(buildingId) {
    const keptIds = new Set(rows.filter((r) => r.id).map((r) => r.id))
    for (const old of original) {
      if (!keptIds.has(old.id)) await deleteCamera(old.id)
    }
    const orderedIds = []
    for (const r of rows) {
      if (!r.id) {
        const created = await addBuildingCamera(buildingId, cameraPayload(r, false))
        orderedIds.push(created.id)
      } else {
        if (r.dirty) await updateBuildingCamera(buildingId, r.id, cameraPayload(r, true))
        orderedIds.push(r.id)
      }
    }
    if (orderedIds.length > 0) await reorderBuildingCameras(buildingId, orderedIds)
  }

  const cameraNote = isEditing
    ? 'Changes to cameras are applied when you save. Removing a camera deletes it.'
    : 'Set how many cameras to start with; you can add or remove more later.'

  return (
    <Modal
      title={isEditing ? `Edit ${building.name}` : 'Add Building'}
      onClose={onClose}
      size="lg"
      dismissible={!submitting}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button type="submit" form="building-form" loading={submitting}>{submitting ? 'Saving…' : 'Save'}</Button>
        </>
      }
    >
      <form id="building-form" onSubmit={handleSubmit} className="space-y-5 pt-2">
        {formError && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-signal-red">{formError}</p>}

        <fieldset className="space-y-3">
          <legend className="text-sm font-semibold text-ink-900">Building</legend>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Name"><input required value={form.name} onChange={set('name')} className="input" placeholder="City Mall" /></Field>
            <Field label="Code" hint={isEditing ? 'Not editable once created.' : 'Unique, e.g. BLD-A'}>
              <input required disabled={isEditing} value={form.code} onChange={set('code')} className="input disabled:opacity-60" placeholder="BLD-A" />
            </Field>
            <Field label="Zone"><input value={form.zone} onChange={set('zone')} className="input" placeholder="ZONE-02" /></Field>
            <Field label="Owner / responsible contact (optional)"><input value={form.owner_name} onChange={set('owner_name')} className="input" /></Field>
            <Field label="Contact details (optional)" hint="Business phone or email only."><input value={form.owner_contact} onChange={set('owner_contact')} className="input" /></Field>
            <Field label="Address (optional)"><input value={form.address} onChange={set('address')} className="input" /></Field>
            <Field label="Latitude"><input required type="number" step="any" min="-90" max="90" value={form.latitude} onChange={set('latitude')} className="input" /></Field>
            <Field label="Longitude"><input required type="number" step="any" min="-180" max="180" value={form.longitude} onChange={set('longitude')} className="input" /></Field>
          </div>
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="text-sm font-semibold text-ink-900">Connectivity</legend>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Connection method" hint={isEditing && hasCameras ? 'Cannot be changed while the building has cameras.' : 'NVR/DVR is recommended: one recorder, cameras addressed by channel.'}>
              <select value={form.connection_mode} onChange={set('connection_mode')} disabled={isEditing && hasCameras} className="input disabled:opacity-60">
                <option value="nvr">NVR / DVR (recorder + channels)</option>
                <option value="direct_ip">Direct IP cameras</option>
              </select>
            </Field>
            <Field label="Secure access" hint="VPN or an outbound tunnel avoids exposing camera ports publicly.">
              <select value={form.network_access} onChange={set('network_access')} className="input">
                <option value="vpn">Site-to-site VPN</option>
                <option value="tunnel">Authenticated outbound tunnel</option>
                <option value="lan">Same private network</option>
                <option value="public_direct">Public endpoint (explicitly approved)</option>
              </select>
            </Field>
            <Field label="Public / static IP (optional)" hint={form.network_access === 'public_direct' ? 'Required for a public endpoint. Authorizes exactly this address.' : "The building's router address. Not the camera or recorder address."}>
              <input value={form.public_ip} onChange={set('public_ip')} required={form.network_access === 'public_direct'} className="input" placeholder="203.0.113.10" />
            </Field>
            <Field label="Authorized networks" hint="One CIDR per line (e.g. the VPN subnet the recorder is on). Only these networks, plus the public IP above, may be contacted for this building.">
              <textarea value={form.authorized_networks} onChange={set('authorized_networks')} className="input" rows={3} placeholder="10.20.5.0/24" />
            </Field>
          </div>
        </fieldset>

        {nvr && (
          <fieldset className="space-y-3">
            <legend className="text-sm font-semibold text-ink-900">Recorder (NVR / DVR)</legend>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Recorder host"><input required value={form.recorder_host} onChange={set('recorder_host')} className="input" placeholder="10.20.5.2" /></Field>
              <Field label="Port"><input required type="number" min="1" max="65535" value={form.recorder_port} onChange={set('recorder_port')} className="input" /></Field>
              <Field label="Recorder type" hint="Selects the RTSP channel path. Choose Custom for other brands.">
                <select value={form.recorder_vendor} onChange={set('recorder_vendor')} className="input">
                  <option value="custom">Custom path template</option>
                  <option value="hikvision">Hikvision</option>
                  <option value="dahua">Dahua</option>
                </select>
              </Field>
              <Field label="Protocol">
                <select value={form.recorder_protocol} onChange={set('recorder_protocol')} className="input">
                  <option value="rtsp">RTSP</option>
                  <option value="rtsps">RTSPS (TLS)</option>
                </select>
              </Field>
              {form.recorder_vendor === 'custom' && (
                <Field label="Stream path template" hint="Must contain {channel}, e.g. /stream/{channel}" className="sm:col-span-2">
                  <input required value={form.stream_path_template} onChange={set('stream_path_template')} className="input" placeholder="/stream/{channel}" />
                </Field>
              )}
              <Field label="Recorder username"><input value={form.recorder_username} onChange={set('recorder_username')} className="input" autoComplete="off" /></Field>
              <Field label="Recorder password" hint={building?.recorder_credentials_configured ? 'A password is saved. Leave blank to keep it.' : 'Stored encrypted and never shown again.'}>
                <input type="password" value={form.recorder_secret} onChange={set('recorder_secret')} className="input" autoComplete="new-password" />
              </Field>
            </div>
          </fieldset>
        )}

        <fieldset className="space-y-3">
          <legend className="text-sm font-semibold text-ink-900">Cameras</legend>
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Number of cameras" className="w-40">
              <input type="number" min="0" max={MAX_ROWS} value={rows.length} onChange={(e) => setCount(e.target.value)} className="input" />
            </Field>
            <Button variant="secondary" size="sm" icon={Plus} disabled={rows.length >= MAX_ROWS} onClick={() => setRows((p) => [...p, newRow(form.connection_mode, p.length)])}>
              Add camera
            </Button>
          </div>
          <p className="text-xs text-ink-500">{cameraNote} Cameras rotate in the order shown.</p>

          {loadingRows ? (
            <p className="text-sm text-ink-500">Loading cameras…</p>
          ) : (
            <ul className="space-y-3">
              {rows.map((r, i) => (
                <li key={r.key} className="rounded-xl border border-line p-3">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-6">
                    <Field label={`Camera ${i + 1} name`} className="sm:col-span-3">
                      <input required value={r.name} onChange={(e) => setRow(r.key, { name: e.target.value })} className="input" />
                    </Field>
                    {nvr ? (
                      <Field label="NVR channel" className="sm:col-span-1">
                        <input required type="number" min="1" max="512" value={r.channel} onChange={(e) => setRow(r.key, { channel: e.target.value })} className="input" />
                      </Field>
                    ) : null}
                    <label className="flex items-center gap-2 self-end pb-2 text-sm text-ink-700 sm:col-span-1">
                      <input type="checkbox" checked={r.enabled} onChange={(e) => setRow(r.key, { enabled: e.target.checked })} /> Enabled
                    </label>
                    <div className="flex items-end justify-end gap-1 sm:col-span-1">
                      <button type="button" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)} className="rounded-lg p-2 text-ink-600 hover:bg-line/60 disabled:opacity-40"><ArrowUp className="h-4 w-4" /></button>
                      <button type="button" aria-label="Move down" disabled={i === rows.length - 1} onClick={() => move(i, 1)} className="rounded-lg p-2 text-ink-600 hover:bg-line/60 disabled:opacity-40"><ArrowDown className="h-4 w-4" /></button>
                      <button type="button" aria-label="Remove camera" onClick={() => setRows((p) => p.filter((x) => x.key !== r.key))} className="rounded-lg p-2 text-signal-red hover:bg-red-50"><Trash2 className="h-4 w-4" /></button>
                    </div>
                    {!nvr && (
                      <>
                        <Field label="Camera host / IP" className="sm:col-span-2"><input required value={r.stream_host} onChange={(e) => setRow(r.key, { stream_host: e.target.value })} className="input" placeholder="10.20.5.31" /></Field>
                        <Field label="Port" className="sm:col-span-1"><input type="number" min="1" max="65535" value={r.stream_port} onChange={(e) => setRow(r.key, { stream_port: e.target.value })} className="input" /></Field>
                        <Field label="Stream path" className="sm:col-span-3"><input value={r.stream_path} onChange={(e) => setRow(r.key, { stream_path: e.target.value })} className="input" placeholder="/live" /></Field>
                        <Field label="Username" className="sm:col-span-3"><input value={r.username} onChange={(e) => setRow(r.key, { username: e.target.value })} className="input" autoComplete="off" /></Field>
                        <Field label="Password" hint={r.credentials_configured ? 'Saved. Leave blank to keep.' : undefined} className="sm:col-span-3">
                          <input type="password" value={r.secret} onChange={(e) => setRow(r.key, { secret: e.target.value })} className="input" autoComplete="new-password" />
                        </Field>
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </fieldset>
      </form>
    </Modal>
  )
}
