import { useState } from 'react'
import { createSite, updateSite } from '../../../api/sites.js'
import { friendlyErrorMessage } from '../../../api/client.js'
import Button from '../../ui/Button.jsx'
import { Field } from '../../ui/Form.jsx'
import Modal from '../../ui/Modal.jsx'
import { boundaryToText, nullable, numOrNull, parseBoundary } from './helpers.js'

const SITE_TYPES = [
  ['campus', 'Campus'], ['building', 'Single building'], ['mall', 'Shopping mall'], ['hospital', 'Hospital'], ['transport_hub', 'Railway / bus station'],
  ['airport', 'Airport'], ['stadium', 'Stadium'], ['convention_centre', 'Convention centre'], ['festival', 'Festival / public gathering'],
  ['outdoor_grounds', 'Outdoor grounds / square'], ['industrial', 'Industrial campus'], ['custom', 'Custom'],
]

// Optional fields stay optional: only what is filled in is sent.
export default function SiteFormModal({ site, onClose, onSaved }) {
  const editing = !!site
  const [f, setF] = useState({
    code: site?.code || '', name: site?.name || '', site_type: site?.site_type || 'custom', custom_type_label: site?.custom_type_label || '',
    organization: site?.organization || '', description: site?.description || '', address: site?.address || '',
    latitude: site?.latitude ?? '', longitude: site?.longitude ?? '', timezone: site?.timezone || 'UTC', boundary: boundaryToText(site?.boundary),
    access_mode: site?.access_mode || 'all_control_room', ap_warning_clients: site?.ap_warning_clients ?? '', ap_critical_clients: site?.ap_critical_clients ?? '',
    scope_mode: site?.policy?.scope_mode || 'allowlist', authorization_reference: site?.policy?.authorization_reference || '',
    retention_days: site?.policy?.retention_days ?? 30, store_raw_identifiers: site?.policy?.store_raw_identifiers || false,
    viewers: (site?.viewer_user_ids || []).join(String.fromCharCode(10)),
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
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
    const hasCoords = f.latitude !== '' && f.longitude !== ''
    const body = {
      name: f.name, site_type: f.site_type, custom_type_label: nullable(f.custom_type_label), organization: nullable(f.organization),
      description: nullable(f.description), address: nullable(f.address), timezone: f.timezone || 'UTC', access_mode: f.access_mode,
      viewer_user_ids: f.access_mode === 'restricted' ? f.viewers.split(String.fromCharCode(10)).map((l) => l.trim()).filter(Boolean) : [],
      ap_warning_clients: numOrNull(f.ap_warning_clients), ap_critical_clients: numOrNull(f.ap_critical_clients),
      policy: {
        scope_mode: f.scope_mode, retention_days: Number(f.retention_days) || 30, store_raw_identifiers: f.store_raw_identifiers,
        authorization_reference: nullable(f.authorization_reference),
      },
    }
    if (hasCoords) Object.assign(body, { latitude: Number(f.latitude), longitude: Number(f.longitude) })
    if (boundary) body.boundary = boundary
    else if (editing && site.boundary) body.clear_boundary = true
    setBusy(true)
    try {
      const saved = editing ? await updateSite(site.id, body) : await createSite({ ...body, code: f.code })
      onSaved(saved)
    } catch (err) {
      setError(friendlyErrorMessage(err))
      setBusy(false)
    }
  }

  return (
    <Modal
      title={editing ? `Edit ${site.name}` : 'Add site'}
      onClose={onClose}
      size="lg"
      dismissible={!busy}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button type="submit" form="site-form" loading={busy}>Save</Button>
        </>
      }
    >
      <form id="site-form" onSubmit={submit} className="space-y-5 pt-2">
        {error && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-signal-red">{error}</p>}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Code" hint={editing ? 'Not editable once created.' : 'Unique, e.g. CAMPUS-N'}>
            <input required disabled={editing} value={f.code} onChange={set('code')} className="input disabled:opacity-60" />
          </Field>
          <Field label="Name"><input required value={f.name} onChange={set('name')} className="input" /></Field>
          <Field label="Site type">
            <select value={f.site_type} onChange={set('site_type')} className="input">
              {SITE_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </Field>
          {f.site_type === 'custom' && <Field label="Custom type label (optional)"><input value={f.custom_type_label} onChange={set('custom_type_label')} className="input" /></Field>}
          <Field label="Organization (optional)"><input value={f.organization} onChange={set('organization')} className="input" /></Field>
          <Field label="Time zone" hint="IANA name, e.g. Asia/Kolkata"><input value={f.timezone} onChange={set('timezone')} className="input" /></Field>
          <Field label="Address (optional)" className="sm:col-span-2"><input value={f.address} onChange={set('address')} className="input" /></Field>
          <Field label="Description (optional)" className="sm:col-span-2"><textarea rows={2} value={f.description} onChange={set('description')} className="input" /></Field>
        </div>

        <fieldset className="space-y-3">
          <legend className="text-sm font-semibold text-ink-900">Location (optional)</legend>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Latitude"><input type="number" step="any" min="-90" max="90" value={f.latitude} onChange={set('latitude')} className="input" /></Field>
            <Field label="Longitude"><input type="number" step="any" min="-180" max="180" value={f.longitude} onChange={set('longitude')} className="input" /></Field>
          </div>
          <Field label="Site boundary (optional)" hint="One corner per line as longitude,latitude. The polygon is closed automatically. Leave empty if unknown.">
            <textarea rows={4} value={f.boundary} onChange={set('boundary')} className="input font-mono text-xs" placeholder={'79.4192,13.6288\n79.4210,13.6288\n79.4210,13.6270'} />
          </Field>
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="text-sm font-semibold text-ink-900">Load thresholds per AP (optional)</legend>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Warning at (active clients)"><input type="number" min="1" value={f.ap_warning_clients} onChange={set('ap_warning_clients')} className="input" /></Field>
            <Field label="Critical at (active clients)"><input type="number" min="1" value={f.ap_critical_clients} onChange={set('ap_critical_clients')} className="input" /></Field>
          </div>
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="text-sm font-semibold text-ink-900">Visibility, monitoring scope and retention</legend>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Who can view" hint="Restricted sites are visible to admins and to listed control-room users only.">
              <select value={f.access_mode} onChange={set('access_mode')} className="input">
                <option value="all_control_room">All control-room users</option>
                <option value="restricted">Restricted</option>
              </select>
            </Field>
            {f.access_mode === 'restricted' && (
              <Field label="Allowed control-room user IDs" hint="One user ID per line. Admins always have access." className="sm:col-span-2">
                <textarea rows={3} value={f.viewers} onChange={set('viewers')} className="input font-mono text-xs" />
              </Field>
            )}
            <Field label="Monitoring scope" hint="Allowlist tracks only devices you explicitly authorize. Monitoring every client needs a recorded authorization.">
              <select value={f.scope_mode} onChange={set('scope_mode')} className="input">
                <option value="allowlist">Authorized devices only (allowlist)</option>
                <option value="all_clients_pseudonymized">All clients, pseudonymized</option>
              </select>
            </Field>
            {f.scope_mode === 'all_clients_pseudonymized' && (
              <Field label="Authorization reference" hint="Who or what authorizes monitoring all clients (policy, order, signed notice)." className="sm:col-span-2">
                <input required value={f.authorization_reference} onChange={set('authorization_reference')} className="input" />
              </Field>
            )}
            <Field label="Retention (days)" hint="Event history and samples older than this are deleted."><input type="number" min="1" max="365" value={f.retention_days} onChange={set('retention_days')} className="input" /></Field>
            <label className="flex items-start gap-2 self-end pb-2 text-sm text-ink-700">
              <input type="checkbox" checked={f.store_raw_identifiers} onChange={set('store_raw_identifiers')} className="mt-1" />
              Keep encrypted raw device identifiers for authorized lookups (needs a server key; off by default)
            </label>
          </div>
          <p className="text-xs text-ink-500">Pseudonymization is not anonymization. Client identifiers are replaced by keyed pseudonyms on arrival; confirm local legal requirements before monitoring visitors.</p>
        </fieldset>
      </form>
    </Modal>
  )
}
