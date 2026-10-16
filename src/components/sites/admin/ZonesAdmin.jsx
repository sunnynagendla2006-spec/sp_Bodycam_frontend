import { useMemo, useState } from 'react'
import { MapPinned, Pencil, Plus, Trash2, Undo2 } from 'lucide-react'
import { createZone, deleteZone, updateZone } from '../../../api/sites.js'
import { friendlyErrorMessage } from '../../../api/client.js'
import { useToast } from '../../../context/ToastContext.jsx'
import { EmptyState } from '../../Primitives.jsx'
import Button from '../../ui/Button.jsx'
import { Field } from '../../ui/Form.jsx'
import Modal from '../../ui/Modal.jsx'
import { Card, CardHeader } from '../../ui/Card.jsx'
import FloorPlanView from '../FloorPlanView.jsx'
import { boundaryToText, nullable, numOrNull, parseBoundary } from './helpers.js'

const ZONE_TYPES = ['general', 'entrance', 'concourse', 'seating', 'ward', 'department', 'lobby', 'food_court', 'parking', 'pathway', 'sports_ground', 'perimeter', 'emergency_route']

// Zones need neither a floor nor coordinates. Give one a geographic boundary, a polygon drawn on a floor plan, both, or neither.
export default function ZonesAdmin({ siteId, zones, buildings, floors, aps, onChanged }) {
  const { notify } = useToast()
  const [editing, setEditing] = useState(null)

  async function remove(z) {
    try {
      await deleteZone(siteId, z.id)
      notify(`${z.code} removed`, { tone: 'success' })
      await onChanged()
    } catch (err) {
      notify(friendlyErrorMessage(err), { tone: 'error' })
    }
  }

  return (
    <Card className="p-4">
      <CardHeader icon={MapPinned} title="Zones" subtitle="Areas of the site. Thresholds are in active client associations." action={<Button size="sm" icon={Plus} onClick={() => setEditing({})}>Add zone</Button>} />
      {zones.length === 0 ? (
        <EmptyState icon={MapPinned} title="No zones yet" hint="Create at least one zone, then assign access points to it." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-ink-500"><tr><th className="py-2 pr-3">Zone</th><th className="pr-3">Type</th><th className="pr-3">Floor</th><th className="pr-3">Geometry</th><th className="pr-3">Warn / critical</th><th /></tr></thead>
            <tbody className="divide-y divide-line">
              {zones.map((z) => (
                <tr key={z.id}>
                  <td className="py-2 pr-3"><span className="font-medium text-ink-900">{z.name}</span> <span className="text-xs text-ink-500">{z.code}</span>{!z.active && <span className="ml-2 text-xs text-ink-500">(inactive)</span>}</td>
                  <td className="pr-3">{z.zone_type}</td>
                  <td className="pr-3">{floors.find((f) => f.id === z.floor_id)?.name || '—'}</td>
                  <td className="pr-3">{[z.boundary && 'geographic', z.plan_polygon && 'floor plan'].filter(Boolean).join(' + ') || 'none'}</td>
                  <td className="pr-3">{z.warning_threshold ?? '—'} / {z.critical_threshold ?? '—'}</td>
                  <td className="text-right whitespace-nowrap">
                    <Button variant="ghost" size="sm" icon={Pencil} onClick={() => setEditing(z)} aria-label={`Edit ${z.name}`} />
                    <Button variant="ghost" size="sm" icon={Trash2} onClick={() => remove(z)} aria-label={`Delete ${z.name}`} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing && (
        <ZoneModal siteId={siteId} zone={editing.id ? editing : null} zones={zones} buildings={buildings} floors={floors} aps={aps}
          onClose={() => setEditing(null)} onSaved={async () => { setEditing(null); await onChanged() }} />
      )}
    </Card>
  )
}

function ZoneModal({ siteId, zone, zones, buildings, floors, aps, onClose, onSaved }) {
  const [f, setF] = useState({
    code: zone?.code || '', name: zone?.name || '', zone_type: zone?.zone_type || 'general', description: zone?.description || '',
    building_id: zone?.building_id || '', floor_id: zone?.floor_id || '', capacity: zone?.capacity ?? '', warning: zone?.warning_threshold ?? '',
    critical: zone?.critical_threshold ?? '', boundary: boundaryToText(zone?.boundary), active: zone?.active ?? true, display_order: zone?.display_order ?? 0,
  })
  const [poly, setPoly] = useState(zone?.plan_polygon || [])
  const [drawing, setDrawing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const floor = floors.find((x) => x.id === f.floor_id)
  const floorsFiltered = useMemo(() => (f.building_id ? floors.filter((x) => x.building_id === f.building_id || !x.building_id) : floors), [floors, f.building_id])
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))

  async function submit(e) {
    e.preventDefault()
    setError('')
    let boundary
    try {
      boundary = parseBoundary(f.boundary)
    } catch (err) {
      setError(err.message)
      return
    }
    if (poly.length > 0 && poly.length < 3) {
      setError('A polygon drawn on the plan needs at least 3 points (or clear it).')
      return
    }
    const body = {
      name: f.name, zone_type: f.zone_type || 'general', description: nullable(f.description), building_id: nullable(f.building_id), floor_id: nullable(f.floor_id),
      capacity: numOrNull(f.capacity), display_order: Number(f.display_order) || 0,
    }
    setBusy(true)
    try {
      if (zone) {
        Object.assign(body, { active: f.active })
        if (f.warning === '' && f.critical === '') body.clear_thresholds = true
        else Object.assign(body, { warning_threshold: numOrNull(f.warning), critical_threshold: numOrNull(f.critical) })
        if (boundary) body.boundary = boundary
        else if (zone.boundary) body.clear_boundary = true
        if (poly.length >= 3) body.plan_polygon = poly
        else if (zone.plan_polygon) body.clear_plan_polygon = true
        await updateZone(siteId, zone.id, body)
      } else {
        await createZone(siteId, { ...body, code: f.code, warning_threshold: numOrNull(f.warning), critical_threshold: numOrNull(f.critical), boundary, plan_polygon: poly.length >= 3 ? poly : null })
      }
      onSaved()
    } catch (err) {
      setError(friendlyErrorMessage(err))
      setBusy(false)
    }
  }

  return (
    <Modal title={zone ? `Edit ${zone.name}` : 'Add zone'} onClose={onClose} size="lg" dismissible={!busy}
      footer={<><Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button><Button type="submit" form="zone-form" loading={busy}>Save</Button></>}>
      <form id="zone-form" onSubmit={submit} className="space-y-4 pt-2">
        {error && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-signal-red">{error}</p>}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Code"><input required disabled={!!zone} value={f.code} onChange={set('code')} className="input disabled:opacity-60" placeholder="ZN-FOODCOURT" /></Field>
          <Field label="Name"><input required value={f.name} onChange={set('name')} className="input" /></Field>
          <Field label="Zone type" hint="Pick one or type your own."><input list="zone-types" value={f.zone_type} onChange={set('zone_type')} className="input" /><datalist id="zone-types">{ZONE_TYPES.map((t) => <option key={t} value={t} />)}</datalist></Field>
          <Field label="Description (optional)"><input value={f.description} onChange={set('description')} className="input" /></Field>
          {buildings.length > 0 && (
            <Field label="Building (optional)"><select value={f.building_id} onChange={set('building_id')} className="input"><option value="">None</option>{buildings.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>
          )}
          {floors.length > 0 && (
            <Field label="Floor (optional)"><select value={f.floor_id} onChange={(e) => { set('floor_id')(e); setPoly([]) }} className="input"><option value="">None (outdoor / no floor)</option>{floorsFiltered.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></Field>
          )}
          <Field label="Capacity (optional)"><input type="number" min="1" value={f.capacity} onChange={set('capacity')} className="input" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Warning at"><input type="number" min="1" value={f.warning} onChange={set('warning')} className="input" /></Field>
            <Field label="Critical at"><input type="number" min="1" value={f.critical} onChange={set('critical')} className="input" /></Field>
          </div>
        </div>
        <Field label="Geographic boundary (optional)" hint="One corner per line as longitude,latitude. For outdoor and campus-scale zones.">
          <textarea rows={3} value={f.boundary} onChange={set('boundary')} className="input font-mono text-xs" />
        </Field>

        {floor?.has_plan && (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-ink-700">Area on the floor plan (optional)</span>
              <Button size="sm" variant={drawing ? 'primary' : 'secondary'} onClick={() => setDrawing((d) => !d)}>{drawing ? 'Finish drawing' : 'Draw on plan'}</Button>
              <Button size="sm" variant="ghost" icon={Undo2} disabled={poly.length === 0} onClick={() => setPoly((p) => p.slice(0, -1))}>Undo point</Button>
              <Button size="sm" variant="ghost" disabled={poly.length === 0} onClick={() => setPoly([])}>Clear</Button>
              <span className="text-xs text-ink-500">{poly.length} point{poly.length === 1 ? '' : 's'}{drawing ? ' · click the plan to add corners' : ''}</span>
            </div>
            <FloorPlanView siteId={siteId} floor={floor} zones={zones.filter((z) => z.id !== zone?.id)} aps={aps} summary={null}
              placing={drawing} onPlace={(x, y) => setPoly((p) => [...p, [x, y]])} draftPolygon={poly.length >= 3 ? [...poly, poly[0]] : poly} />
          </div>
        )}
        {zone && <label className="flex items-center gap-2 text-sm text-ink-700"><input type="checkbox" checked={f.active} onChange={set('active')} /> Active</label>}
      </form>
    </Modal>
  )
}
