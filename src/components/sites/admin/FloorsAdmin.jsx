import { useRef, useState } from 'react'
import { Building2, Layers, Pencil, Plus, Trash2, Upload } from 'lucide-react'
import { createBuilding, createFloor, deleteBuilding, deleteFloor, updateBuilding, updateFloor, uploadFloorPlan } from '../../../api/sites.js'
import { friendlyErrorMessage } from '../../../api/client.js'
import { useToast } from '../../../context/ToastContext.jsx'
import { EmptyState } from '../../Primitives.jsx'
import Button from '../../ui/Button.jsx'
import { Field } from '../../ui/Form.jsx'
import Modal from '../../ui/Modal.jsx'
import { Card, CardHeader } from '../../ui/Card.jsx'
import { nullable, numOrNull, readImageSize } from './helpers.js'

// Buildings and floors are OPTIONAL. A site without them (an open ground, a campus described by zones only) simply
// leaves this section empty.
export default function FloorsAdmin({ siteId, buildings, floors, onChanged }) {
  const { notify } = useToast()
  const [editBuilding, setEditBuilding] = useState(null)
  const [editFloor, setEditFloor] = useState(null)
  const fileRef = useRef(null)
  const [uploadFor, setUploadFor] = useState(null)
  const [busy, setBusy] = useState(false)

  async function run(fn, ok) {
    setBusy(true)
    try {
      await fn()
      if (ok) notify(ok, { tone: 'success' })
      await onChanged()
    } catch (err) {
      notify(friendlyErrorMessage(err), { tone: 'error' })
    } finally {
      setBusy(false)
    }
  }

  async function handleFile(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !uploadFor) return
    const size = await readImageSize(file)
    await run(() => uploadFloorPlan(siteId, uploadFor.id, file, size), 'Floor plan uploaded')
    setUploadFor(null)
  }

  return (
    <div className="space-y-6">
      <Card className="p-4">
        <CardHeader icon={Building2} title="Buildings (optional)" subtitle="Only needed when the site has buildings. Outdoor areas need none." action={<Button size="sm" icon={Plus} onClick={() => setEditBuilding({})}>Add building</Button>} />
        {buildings.length === 0 ? <p className="text-sm text-ink-500">No buildings.</p> : (
          <ul className="divide-y divide-line">
            {buildings.map((b) => (
              <li key={b.id} className="flex items-center justify-between gap-2 py-2">
                <span className="text-sm text-ink-900">{b.name} <span className="text-xs text-ink-500">({b.code})</span></span>
                <span className="flex gap-1">
                  <Button variant="ghost" size="sm" icon={Pencil} onClick={() => setEditBuilding(b)} aria-label={`Edit ${b.name}`} />
                  <Button variant="ghost" size="sm" icon={Trash2} onClick={() => run(() => deleteBuilding(siteId, b.id), 'Building removed')} aria-label={`Delete ${b.name}`} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="p-4">
        <CardHeader icon={Layers} title="Floors (optional)" subtitle="Add a floor to attach a plan image, zones drawn on it and AP positions." action={<Button size="sm" icon={Plus} onClick={() => setEditFloor({})}>Add floor</Button>} />
        {floors.length === 0 ? <EmptyState icon={Layers} title="No floors" hint="Not required for outdoor or single-level sites." /> : (
          <ul className="divide-y divide-line">
            {floors.map((f) => (
              <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="text-sm text-ink-900">{f.name} <span className="text-xs text-ink-500">({f.code}{f.level != null ? `, level ${f.level}` : ''}) · {f.has_plan ? 'plan uploaded' : 'no plan'}</span></span>
                <span className="flex gap-1">
                  <Button variant="secondary" size="sm" icon={Upload} disabled={busy} onClick={() => { setUploadFor(f); fileRef.current?.click() }}>{f.has_plan ? 'Replace plan' : 'Upload plan'}</Button>
                  <Button variant="ghost" size="sm" icon={Pencil} onClick={() => setEditFloor(f)} aria-label={`Edit ${f.name}`} />
                  <Button variant="ghost" size="sm" icon={Trash2} onClick={() => run(() => deleteFloor(siteId, f.id), 'Floor removed')} aria-label={`Delete ${f.name}`} />
                </span>
              </li>
            ))}
          </ul>
        )}
        <input ref={fileRef} type="file" accept="image/png,image/jpeg" className="hidden" onChange={handleFile} />
        <p className="mt-2 text-xs text-ink-500">PNG or JPEG, up to the server limit. The plan is stored with the other evidence files and shown only to authorized users.</p>
      </Card>

      {editBuilding && <BuildingModal siteId={siteId} building={editBuilding.id ? editBuilding : null} onClose={() => setEditBuilding(null)} onSaved={async () => { setEditBuilding(null); await onChanged() }} />}
      {editFloor && <FloorModal siteId={siteId} floor={editFloor.id ? editFloor : null} buildings={buildings} onClose={() => setEditFloor(null)} onSaved={async () => { setEditFloor(null); await onChanged() }} />}
    </div>
  )
}

function BuildingModal({ siteId, building, onClose, onSaved }) {
  const [f, setF] = useState({ code: building?.code || '', name: building?.name || '', description: building?.description || '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    try {
      if (building) await updateBuilding(siteId, building.id, { name: f.name, description: nullable(f.description) })
      else await createBuilding(siteId, { code: f.code, name: f.name, description: nullable(f.description) })
      onSaved()
    } catch (err) {
      setError(friendlyErrorMessage(err))
      setBusy(false)
    }
  }
  return (
    <Modal title={building ? 'Edit building' : 'Add building'} onClose={onClose} size="sm" dismissible={!busy}
      footer={<><Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button><Button type="submit" form="bld-form" loading={busy}>Save</Button></>}>
      <form id="bld-form" onSubmit={submit} className="space-y-3 pt-2">
        {error && <p role="alert" className="text-sm text-signal-red">{error}</p>}
        <Field label="Code"><input required disabled={!!building} value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} className="input disabled:opacity-60" /></Field>
        <Field label="Name"><input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className="input" /></Field>
        <Field label="Description (optional)"><input value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} className="input" /></Field>
      </form>
    </Modal>
  )
}

function FloorModal({ siteId, floor, buildings, onClose, onSaved }) {
  const [f, setF] = useState({ code: floor?.code || '', name: floor?.name || '', building_id: floor?.building_id || '', level: floor?.level ?? '', height_m: floor?.height_m ?? '', meters: floor?.plan_meters_per_pixel ?? '', display_order: floor?.display_order ?? 0 })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    const body = { name: f.name, building_id: nullable(f.building_id), level: numOrNull(f.level), height_m: numOrNull(f.height_m), plan_meters_per_pixel: numOrNull(f.meters), display_order: Number(f.display_order) || 0 }
    try {
      if (floor) await updateFloor(siteId, floor.id, body)
      else await createFloor(siteId, { ...body, code: f.code })
      onSaved()
    } catch (err) {
      setError(friendlyErrorMessage(err))
      setBusy(false)
    }
  }
  return (
    <Modal title={floor ? 'Edit floor' : 'Add floor'} onClose={onClose} size="md" dismissible={!busy}
      footer={<><Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button><Button type="submit" form="floor-form" loading={busy}>Save</Button></>}>
      <form id="floor-form" onSubmit={submit} className="grid grid-cols-1 gap-3 pt-2 sm:grid-cols-2">
        {error && <p role="alert" className="text-sm text-signal-red sm:col-span-2">{error}</p>}
        <Field label="Code"><input required disabled={!!floor} value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} className="input disabled:opacity-60" placeholder="L2" /></Field>
        <Field label="Name"><input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className="input" placeholder="Second floor" /></Field>
        <Field label="Building (optional)">
          <select value={f.building_id} onChange={(e) => setF({ ...f, building_id: e.target.value })} className="input">
            <option value="">None</option>
            {buildings.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </Field>
        <Field label="Level (optional)" hint="Orders floors in the layered view; basements are negative."><input type="number" value={f.level} onChange={(e) => setF({ ...f, level: e.target.value })} className="input" /></Field>
        <Field label="Storey height, m (optional)"><input type="number" step="any" min="0" value={f.height_m} onChange={(e) => setF({ ...f, height_m: e.target.value })} className="input" /></Field>
        <Field label="Plan scale, m per pixel (optional)"><input type="number" step="any" min="0" value={f.meters} onChange={(e) => setF({ ...f, meters: e.target.value })} className="input" /></Field>
      </form>
    </Modal>
  )
}
