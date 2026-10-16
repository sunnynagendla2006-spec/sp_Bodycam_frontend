import { useState } from 'react'
import { Cable, Network, Pencil, Plus, Radio, Trash2 } from 'lucide-react'
import { createController, createSwitch, deleteController, deleteSwitch, registerAP, updateController, updateSiteAP, updateSwitch } from '../../../api/sites.js'
import { friendlyErrorMessage } from '../../../api/client.js'
import { useToast } from '../../../context/ToastContext.jsx'
import { EmptyState } from '../../Primitives.jsx'
import StatusBadge from '../../StatusBadge.jsx'
import Button from '../../ui/Button.jsx'
import { Field } from '../../ui/Form.jsx'
import Modal from '../../ui/Modal.jsx'
import { Card, CardHeader } from '../../ui/Card.jsx'
import FloorPlanView from '../FloorPlanView.jsx'
import { nullable, numOrNull } from './helpers.js'

const ln = String.fromCharCode(10)

export default function InfraAdmin({ siteId, aps, zones, buildings, floors, switches, controllers, onChanged }) {
  const { notify } = useToast()
  const [editAP, setEditAP] = useState(null)
  const [editSwitch, setEditSwitch] = useState(null)
  const [editController, setEditController] = useState(null)

  async function remove(fn, label) {
    try {
      await fn()
      notify(`${label} removed`, { tone: 'success' })
      await onChanged()
    } catch (err) {
      notify(friendlyErrorMessage(err), { tone: 'error' })
    }
  }

  return (
    <div className="space-y-6">
      <Card className="p-4">
        <CardHeader icon={Radio} title="Access points" subtitle="Management IP, BSSID and client MAC are different identifiers. Each AP normally has its own management IP." action={<Button size="sm" icon={Plus} onClick={() => setEditAP({})}>Register AP</Button>} />
        {aps.length === 0 ? <EmptyState icon={Radio} title="No access points registered" hint="State is shown as unknown until real telemetry arrives." /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-ink-500"><tr><th className="py-2 pr-3">AP</th><th className="pr-3">Management IP</th><th className="pr-3">BSSID</th><th className="pr-3">Zone</th><th className="pr-3">Switch port</th><th className="pr-3">State</th><th /></tr></thead>
              <tbody className="divide-y divide-line">
                {aps.map((a) => (
                  <tr key={a.id}>
                    <td className="py-2 pr-3"><span className="font-medium text-ink-900">{a.name}</span> <span className="text-xs text-ink-500">{a.code}</span></td>
                    <td className="pr-3 font-mono text-xs">{a.management_ip || '—'}</td>
                    <td className="pr-3 font-mono text-xs">{a.bssid || (a.radios[0]?.bssid ?? '—')}</td>
                    <td className="pr-3">{zones.find((z) => z.id === a.zone_id)?.name || '—'}</td>
                    <td className="pr-3">{a.switch_id ? `${switches.find((s) => s.id === a.switch_id)?.code || '?'} / ${a.switch_port || '?'}` : '—'}</td>
                    <td className="pr-3"><StatusBadge status={a.state} /></td>
                    <td className="text-right"><Button variant="ghost" size="sm" icon={Pencil} onClick={() => setEditAP(a)} aria-label={`Edit ${a.code}`} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="p-4">
        <CardHeader icon={Cable} title="Switches and ports" subtitle="Optional. Map each AP to the switch port it is cabled to." action={<Button size="sm" icon={Plus} onClick={() => setEditSwitch({})}>Add switch</Button>} />
        {switches.length === 0 ? <p className="text-sm text-ink-500">No switches registered. Switch data is not required for monitoring.</p> : (
          <ul className="divide-y divide-line">
            {switches.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <span><span className="font-medium text-ink-900">{s.name}</span> <span className="text-xs text-ink-500">{s.code} · {s.management_ip || 'no IP'} · {s.ports.length} port(s), {s.ports.filter((p) => p.ap_id).length} with an AP</span></span>
                <span><Button variant="ghost" size="sm" icon={Pencil} onClick={() => setEditSwitch(s)} aria-label={`Edit ${s.code}`} /><Button variant="ghost" size="sm" icon={Trash2} onClick={() => remove(() => deleteSwitch(siteId, s.id), s.code)} aria-label={`Delete ${s.code}`} /></span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="p-4">
        <CardHeader icon={Network} title="Controllers and gateways" subtitle="Optional. Health is only ever set from real collector reports." action={<Button size="sm" icon={Plus} onClick={() => setEditController({})}>Add controller</Button>} />
        {controllers.length === 0 ? <p className="text-sm text-ink-500">No controllers registered.</p> : (
          <ul className="divide-y divide-line">
            {controllers.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <span><span className="font-medium text-ink-900">{c.name}</span> <span className="text-xs text-ink-500">{c.code} · {c.vendor || 'vendor unknown'}</span> <StatusBadge status={c.state} /></span>
                <span><Button variant="ghost" size="sm" icon={Pencil} onClick={() => setEditController(c)} aria-label={`Edit ${c.code}`} /><Button variant="ghost" size="sm" icon={Trash2} onClick={() => remove(() => deleteController(siteId, c.id), c.code)} aria-label={`Delete ${c.code}`} /></span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {editAP && <APModal siteId={siteId} ap={editAP.id ? editAP : null} {...{ aps, zones, buildings, floors, switches, controllers }} onClose={() => setEditAP(null)} onSaved={async () => { setEditAP(null); await onChanged() }} />}
      {editSwitch && <SwitchModal siteId={siteId} sw={editSwitch.id ? editSwitch : null} aps={aps} floors={floors} onClose={() => setEditSwitch(null)} onSaved={async () => { setEditSwitch(null); await onChanged() }} />}
      {editController && <ControllerModal siteId={siteId} c={editController.id ? editController : null} onClose={() => setEditController(null)} onSaved={async () => { setEditController(null); await onChanged() }} />}
    </div>
  )
}

function APModal({ siteId, ap, aps, zones, buildings, floors, switches, controllers, onClose, onSaved }) {
  const [f, setF] = useState({
    code: ap?.code || '', name: ap?.name || '', manufacturer: ap?.manufacturer || '', model: ap?.model || '', serial_number: ap?.serial_number || '',
    management_ip: ap?.management_ip || '', bssid: ap?.bssid || '', ssids: (ap?.ssids || []).join(', '), environment: ap?.environment || 'unknown',
    zone_id: ap?.zone_id || '', floor_id: ap?.floor_id || '', controller_id: ap?.controller_id || '', switch_id: ap?.switch_id || '', switch_port: ap?.switch_port || '',
    latitude: ap?.latitude ?? '', longitude: ap?.longitude ?? '', plan_x: ap?.plan_x ?? '', plan_y: ap?.plan_y ?? '', client_capacity: ap?.client_capacity ?? '',
  })
  const [radios, setRadios] = useState(ap?.radios?.length ? ap.radios.map((r) => ({ band: r.band || '', channel: r.channel ?? '', bssid: r.bssid || '', ssid: r.ssid || '' })) : [])
  const [placing, setPlacing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }))
  const floor = floors.find((x) => x.id === f.floor_id)

  async function submit(e) {
    e.preventDefault()
    setError('')
    const body = {
      name: f.name, manufacturer: nullable(f.manufacturer), model: nullable(f.model), serial_number: nullable(f.serial_number),
      management_ip: nullable(f.management_ip), bssid: nullable(f.bssid), environment: f.environment,
      radios: radios.filter((r) => r.band || r.bssid || r.ssid).map((r) => ({ band: nullable(r.band), channel: numOrNull(r.channel), bssid: nullable(r.bssid), ssid: nullable(r.ssid) })),
      ssids: f.ssids.split(',').map((s) => s.trim()).filter(Boolean), controller_id: nullable(f.controller_id), client_capacity: numOrNull(f.client_capacity),
    }
    if (f.zone_id) body.zone_id = f.zone_id
    else if (ap?.zone_id) body.clear_zone = true
    if (f.floor_id) body.floor_id = f.floor_id
    if (f.switch_id) Object.assign(body, { switch_id: f.switch_id, switch_port: nullable(f.switch_port) })
    else if (ap?.switch_id) body.clear_switch = true
    if (f.latitude !== '' && f.longitude !== '') Object.assign(body, { latitude: Number(f.latitude), longitude: Number(f.longitude) })
    if (f.plan_x !== '' && f.plan_y !== '') Object.assign(body, { plan_x: Number(f.plan_x), plan_y: Number(f.plan_y) })
    setBusy(true)
    try {
      if (ap) await updateSiteAP(siteId, ap.id, body)
      else await registerAP(siteId, { ...body, code: f.code })
      onSaved()
    } catch (err) {
      setError(friendlyErrorMessage(err))
      setBusy(false)
    }
  }

  return (
    <Modal title={ap ? `Edit ${ap.code}` : 'Register access point'} onClose={onClose} size="lg" dismissible={!busy}
      footer={<><Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button><Button type="submit" form="ap-form" loading={busy}>Save</Button></>}>
      <form id="ap-form" onSubmit={submit} className="space-y-4 pt-2">
        {error && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-signal-red">{error}</p>}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="AP code"><input required disabled={!!ap} value={f.code} onChange={set('code')} className="input disabled:opacity-60" placeholder="AP-F2-07" /></Field>
          <Field label="Friendly name"><input required value={f.name} onChange={set('name')} className="input" /></Field>
          <Field label="Manufacturer"><input value={f.manufacturer} onChange={set('manufacturer')} className="input" /></Field>
          <Field label="Model"><input value={f.model} onChange={set('model')} className="input" /></Field>
          <Field label="Serial number"><input value={f.serial_number} onChange={set('serial_number')} className="input" /></Field>
          <Field label="Management IP" hint="The AP's own address for administration. Not a client address."><input value={f.management_ip} onChange={set('management_ip')} className="input" placeholder="10.20.5.31" /></Field>
          <Field label="Primary BSSID" hint="aa:bb:cc:dd:ee:ff. Telemetry is matched to the AP by BSSID, then serial, management IP, code."><input value={f.bssid} onChange={set('bssid')} className="input font-mono" /></Field>
          <Field label="SSIDs (comma separated)"><input value={f.ssids} onChange={set('ssids')} className="input" /></Field>
          <Field label="Environment"><select value={f.environment} onChange={set('environment')} className="input"><option value="unknown">Unknown</option><option value="indoor">Indoor</option><option value="outdoor">Outdoor</option></select></Field>
          <Field label="Client capacity (optional)" hint="Warning at 80%, critical at capacity. Overrides the site defaults."><input type="number" min="1" value={f.client_capacity} onChange={set('client_capacity')} className="input" /></Field>
        </div>

        <fieldset className="space-y-2">
          <legend className="text-sm font-semibold text-ink-900">Radios (optional)</legend>
          {radios.map((r, i) => (
            <div key={i} className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              <input aria-label="Band" placeholder="5GHz" value={r.band} onChange={(e) => setRadios((p) => p.map((x, j) => (j === i ? { ...x, band: e.target.value } : x)))} className="input" />
              <input aria-label="Channel" type="number" placeholder="Channel" value={r.channel} onChange={(e) => setRadios((p) => p.map((x, j) => (j === i ? { ...x, channel: e.target.value } : x)))} className="input" />
              <input aria-label="Radio BSSID" placeholder="BSSID" value={r.bssid} onChange={(e) => setRadios((p) => p.map((x, j) => (j === i ? { ...x, bssid: e.target.value } : x)))} className="input font-mono sm:col-span-2" />
              <Button variant="ghost" size="sm" icon={Trash2} onClick={() => setRadios((p) => p.filter((_, j) => j !== i))} aria-label="Remove radio" />
            </div>
          ))}
          <Button variant="secondary" size="sm" icon={Plus} onClick={() => setRadios((p) => [...p, { band: '', channel: '', bssid: '', ssid: '' }])}>Add radio</Button>
        </fieldset>

        <fieldset className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <legend className="mb-1 text-sm font-semibold text-ink-900">Placement</legend>
          <Field label="Zone"><select value={f.zone_id} onChange={set('zone_id')} className="input"><option value="">None</option>{zones.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}</select></Field>
          {floors.length > 0 && <Field label="Floor"><select value={f.floor_id} onChange={set('floor_id')} className="input"><option value="">None</option>{floors.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></Field>}
          <Field label="Latitude (outdoor)"><input type="number" step="any" value={f.latitude} onChange={set('latitude')} className="input" /></Field>
          <Field label="Longitude (outdoor)"><input type="number" step="any" value={f.longitude} onChange={set('longitude')} className="input" /></Field>
          {controllers.length > 0 && <Field label="Controller"><select value={f.controller_id} onChange={set('controller_id')} className="input"><option value="">None</option>{controllers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>}
          {switches.length > 0 && (
            <>
              <Field label="Switch"><select value={f.switch_id} onChange={set('switch_id')} className="input"><option value="">None</option>{switches.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
              {f.switch_id && <Field label="Switch port"><input value={f.switch_port} onChange={set('switch_port')} className="input" placeholder="Gi1/0/12" /></Field>}
            </>
          )}
        </fieldset>

        {floor?.has_plan && (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant={placing ? 'primary' : 'secondary'} onClick={() => setPlacing((p) => !p)}>{placing ? 'Click the plan…' : 'Position on plan'}</Button>
              <span className="text-xs text-ink-500">{f.plan_x !== '' ? `Position ${Number(f.plan_x).toFixed(3)}, ${Number(f.plan_y).toFixed(3)}` : 'Not positioned'}</span>
            </div>
            <FloorPlanView siteId={siteId} floor={floor} zones={zones} aps={[...aps.filter((a) => a.id !== ap?.id), ...(f.plan_x !== '' ? [{ id: 'draft', code: 'this AP', floor_id: floor.id, plan_x: Number(f.plan_x), plan_y: Number(f.plan_y), state: 'unknown' }] : [])]} summary={null}
              placing={placing} onPlace={(x, y) => { setF((p) => ({ ...p, plan_x: x, plan_y: y })); setPlacing(false) }} />
          </div>
        )}
      </form>
    </Modal>
  )
}

function SwitchModal({ siteId, sw, aps, onClose, onSaved }) {
  const [f, setF] = useState({ code: sw?.code || '', name: sw?.name || '', management_ip: sw?.management_ip || '', vendor: sw?.vendor || '', model: sw?.model || '' })
  const [ports, setPorts] = useState((sw?.ports || []).map((p) => ({ port: p.port, ap_id: p.ap_id || '', vlan: p.vlan ?? '', description: p.description || '' })))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function submit(e) {
    e.preventDefault()
    const body = {
      name: f.name, management_ip: nullable(f.management_ip), vendor: nullable(f.vendor), model: nullable(f.model),
      ports: ports.filter((p) => p.port.trim()).map((p) => ({ port: p.port.trim(), ap_id: nullable(p.ap_id), vlan: numOrNull(p.vlan), description: nullable(p.description) })),
    }
    setBusy(true)
    try {
      if (sw) await updateSwitch(siteId, sw.id, body)
      else await createSwitch(siteId, { ...body, code: f.code })
      onSaved()
    } catch (err) {
      setError(friendlyErrorMessage(err))
      setBusy(false)
    }
  }
  return (
    <Modal title={sw ? `Edit ${sw.code}` : 'Add switch'} onClose={onClose} size="lg" dismissible={!busy}
      footer={<><Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button><Button type="submit" form="sw-form" loading={busy}>Save</Button></>}>
      <form id="sw-form" onSubmit={submit} className="space-y-4 pt-2">
        {error && <p role="alert" className="text-sm text-signal-red">{error}</p>}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Code"><input required disabled={!!sw} value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} className="input disabled:opacity-60" /></Field>
          <Field label="Name"><input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className="input" /></Field>
          <Field label="Management IP"><input value={f.management_ip} onChange={(e) => setF({ ...f, management_ip: e.target.value })} className="input" /></Field>
          <Field label="Vendor"><input value={f.vendor} onChange={(e) => setF({ ...f, vendor: e.target.value })} className="input" /></Field>
          <Field label="Model"><input value={f.model} onChange={(e) => setF({ ...f, model: e.target.value })} className="input" /></Field>
        </div>
        <fieldset className="space-y-2">
          <legend className="text-sm font-semibold text-ink-900">Ports</legend>
          {ports.map((p, i) => (
            <div key={i} className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              <input aria-label="Port" placeholder="Gi1/0/1" value={p.port} onChange={(e) => setPorts((x) => x.map((r, j) => (j === i ? { ...r, port: e.target.value } : r)))} className="input" />
              <select aria-label="Connected AP" value={p.ap_id} onChange={(e) => setPorts((x) => x.map((r, j) => (j === i ? { ...r, ap_id: e.target.value } : r)))} className="input sm:col-span-2"><option value="">No AP</option>{aps.map((a) => <option key={a.id} value={a.id}>{a.code}</option>)}</select>
              <input aria-label="VLAN" type="number" placeholder="VLAN" value={p.vlan} onChange={(e) => setPorts((x) => x.map((r, j) => (j === i ? { ...r, vlan: e.target.value } : r)))} className="input" />
              <Button variant="ghost" size="sm" icon={Trash2} onClick={() => setPorts((x) => x.filter((_, j) => j !== i))} aria-label="Remove port" />
            </div>
          ))}
          <Button variant="secondary" size="sm" icon={Plus} onClick={() => setPorts((x) => [...x, { port: '', ap_id: '', vlan: '', description: '' }])}>Add port</Button>
          <p className="text-xs text-ink-500">Link status is shown only when a telemetry source reports it; it is not assumed.</p>
        </fieldset>
      </form>
    </Modal>
  )
}

function ControllerModal({ siteId, c, onClose, onSaved }) {
  const [f, setF] = useState({ code: c?.code || '', name: c?.name || '', vendor: c?.vendor || '', model: c?.model || '', management_ip: c?.management_ip || '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function submit(e) {
    e.preventDefault()
    const body = { name: f.name, vendor: nullable(f.vendor), model: nullable(f.model), management_ip: nullable(f.management_ip) }
    setBusy(true)
    try {
      if (c) await updateController(siteId, c.id, body)
      else await createController(siteId, { ...body, code: f.code })
      onSaved()
    } catch (err) {
      setError(friendlyErrorMessage(err))
      setBusy(false)
    }
  }
  return (
    <Modal title={c ? `Edit ${c.code}` : 'Add controller'} onClose={onClose} size="md" dismissible={!busy}
      footer={<><Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button><Button type="submit" form="ctl-form" loading={busy}>Save</Button></>}>
      <form id="ctl-form" onSubmit={submit} className="grid grid-cols-1 gap-3 pt-2 sm:grid-cols-2">
        {error && <p role="alert" className="text-sm text-signal-red sm:col-span-2">{error}</p>}
        <Field label="Code"><input required disabled={!!c} value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} className="input disabled:opacity-60" /></Field>
        <Field label="Name"><input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className="input" /></Field>
        <Field label="Vendor"><input value={f.vendor} onChange={(e) => setF({ ...f, vendor: e.target.value })} className="input" /></Field>
        <Field label="Model"><input value={f.model} onChange={(e) => setF({ ...f, model: e.target.value })} className="input" /></Field>
        <Field label="Management IP" className="sm:col-span-2"><input value={f.management_ip} onChange={(e) => setF({ ...f, management_ip: e.target.value })} className="input" /></Field>
      </form>
    </Modal>
  )
}
