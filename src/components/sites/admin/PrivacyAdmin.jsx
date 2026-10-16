import { useState } from 'react'
import { Download, Eye, Play, ShieldCheck, Trash2 } from 'lucide-react'
import { addToAllowlist, downloadCsv, runMonitor, runRetention } from '../../../api/sites.js'
import { client, friendlyErrorMessage } from '../../../api/client.js'
import { useToast } from '../../../context/ToastContext.jsx'
import Button from '../../ui/Button.jsx'
import { Field } from '../../ui/Form.jsx'
import Modal from '../../ui/Modal.jsx'
import { Card, CardHeader } from '../../ui/Card.jsx'

// Privacy, scope and operations. The allowlist textarea is write-only: identifiers are hashed by the server on receipt
// and only a count comes back.
export default function PrivacyAdmin({ site, onChanged }) {
  const { notify } = useToast()
  const [ids, setIds] = useState('')
  const [busy, setBusy] = useState(false)
  const [reveal, setReveal] = useState(false)

  async function guarded(fn, ok) {
    setBusy(true)
    try {
      const res = await fn()
      notify(typeof ok === 'function' ? ok(res) : ok, { tone: 'success' })
      await onChanged()
    } catch (err) {
      notify(friendlyErrorMessage(err), { tone: 'error' })
    } finally {
      setBusy(false)
    }
  }

  async function exportCsv(kind) {
    setBusy(true)
    try {
      const blob = await downloadCsv(site.id, { kind, scope: 'zone' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${site.code}-${kind}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      notify(friendlyErrorMessage(err), { tone: 'error' })
    } finally {
      setBusy(false)
    }
  }

  const p = site.policy
  return (
    <div className="space-y-6">
      <Card className="p-4">
        <CardHeader icon={ShieldCheck} title="Monitoring scope and privacy" />
        <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
          <div><dt className="text-xs text-ink-500">Scope</dt><dd>{p.scope_mode === 'allowlist' ? `Authorized devices only (${p.allowlist_size} on the allowlist)` : 'All clients, pseudonymized'}</dd></div>
          <div><dt className="text-xs text-ink-500">Retention</dt><dd>{p.retention_days} days</dd></div>
          {p.scope_mode !== 'allowlist' && <div className="sm:col-span-2"><dt className="text-xs text-ink-500">Authorization reference</dt><dd>{p.authorization_reference || '—'}</dd></div>}
          <div><dt className="text-xs text-ink-500">Raw identifiers</dt><dd>{p.store_raw_identifiers ? 'Stored encrypted' : 'Not stored (pseudonyms only)'}</dd></div>
        </dl>
        <p className="mt-3 text-xs text-ink-500">Devices are identified only by keyed pseudonyms. This is pseudonymization, not anonymization. Devices with randomized MAC addresses appear as new clients whenever the address changes, so unique-device figures can overstate.</p>

        {p.scope_mode === 'allowlist' && (
          <div className="mt-4 space-y-2">
            <Field label="Authorize devices" hint="One device identifier (MAC address) per line. They are hashed on receipt and not shown again.">
              <textarea rows={4} value={ids} onChange={(e) => setIds(e.target.value)} className="input font-mono text-xs" autoComplete="off" />
            </Field>
            <Button size="sm" loading={busy} disabled={!ids.trim()} onClick={() => guarded(async () => { const r = await addToAllowlist(site.id, ids.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)); setIds(''); return r }, (r) => `${r.added} device(s) authorized`)}>Add to allowlist</Button>
          </div>
        )}
        {p.store_raw_identifiers && <div className="mt-4"><Button variant="secondary" size="sm" icon={Eye} onClick={() => setReveal(true)}>Look up a raw identifier…</Button></div>}
      </Card>

      <Card className="p-4">
        <CardHeader icon={Play} title="Operations" />
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" icon={Play} loading={busy} onClick={() => guarded(() => runMonitor(site.id), (r) => `Evaluated: ${r.samples_written} samples, ${r.breaches_open} open breaches`)}>Evaluate now</Button>
          <Button variant="secondary" size="sm" icon={Trash2} loading={busy} onClick={() => guarded(() => runRetention(site.id), (r) => `Retention: removed ${r.events_deleted} events, ${r.samples_deleted} samples`)}>Apply retention now</Button>
          <Button variant="secondary" size="sm" icon={Download} disabled={busy} onClick={() => exportCsv('occupancy')}>Export occupancy CSV</Button>
          <Button variant="secondary" size="sm" icon={Download} disabled={busy} onClick={() => exportCsv('events')}>Export events CSV (masked)</Button>
        </div>
        <p className="mt-2 text-xs text-ink-500">Exports cover the last 24 hours, are limited in size and are recorded in the audit log.</p>
      </Card>
      {reveal && <RevealModal siteId={site.id} onClose={() => setReveal(false)} />}
    </div>
  )
}

function RevealModal({ siteId, onClose }) {
  const [f, setF] = useState({ client: '', reason: '' })
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const { data } = await client.post(`/sites/${siteId}/privacy/reveal`, f)
      setResult(data)
    } catch (err) {
      setError(friendlyErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal title="Look up a raw identifier" onClose={() => { setResult(null); onClose() }} size="sm"
      footer={<Button variant="secondary" onClick={() => { setResult(null); onClose() }}>Close</Button>}>
      <form onSubmit={submit} className="space-y-3 pt-2">
        <p className="text-xs text-ink-500">This is an audited action. State why it is needed.</p>
        {error && <p role="alert" className="text-sm text-signal-red">{error}</p>}
        <Field label="Client (pseudonym shown in the lists)"><input required minLength={8} value={f.client} onChange={(e) => setF({ ...f, client: e.target.value })} className="input font-mono" /></Field>
        <Field label="Reason"><input required minLength={5} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} className="input" /></Field>
        <Button type="submit" loading={busy}>Look up</Button>
        {result && <p className="rounded-xl bg-canvas px-3 py-2 font-mono text-sm">{result.identifier}</p>}
      </form>
    </Modal>
  )
}
