import { useEffect, useState } from 'react'
import { Copy, KeyRound, Plus, RefreshCw, ServerCog, ShieldOff, Trash2 } from 'lucide-react'
import { createCollector, deleteCollector, listAdapters, revokeCollector, rotateCollectorToken } from '../../../api/sites.js'
import { friendlyErrorMessage } from '../../../api/client.js'
import { useToast } from '../../../context/ToastContext.jsx'
import { ConfirmDialog, EmptyState } from '../../Primitives.jsx'
import StatusBadge from '../../StatusBadge.jsx'
import Button from '../../ui/Button.jsx'
import { Field } from '../../ui/Form.jsx'
import Modal from '../../ui/Modal.jsx'
import { Card, CardHeader } from '../../ui/Card.jsx'
import { ageText } from '../../../utils/siteLevels.js'

export default function CollectorsAdmin({ siteId, collectors, onChanged }) {
  const { notify } = useToast()
  const [creating, setCreating] = useState(false)
  const [issued, setIssued] = useState(null) // { collector, token } -- shown once, then discarded
  const [confirm, setConfirm] = useState(null) // { kind, collector }
  const [busy, setBusy] = useState(false)

  async function doConfirm() {
    const { kind, collector } = confirm
    setBusy(true)
    try {
      if (kind === 'rotate') setIssued(await rotateCollectorToken(siteId, collector.id))
      else if (kind === 'revoke') await revokeCollector(siteId, collector.id)
      else await deleteCollector(siteId, collector.id)
      notify(`${collector.code}: ${kind} done`, { tone: 'success' })
      setConfirm(null)
      await onChanged()
    } catch (err) {
      notify(friendlyErrorMessage(err), { tone: 'error' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="p-4">
      <CardHeader icon={ServerCog} title="Collectors" subtitle="A collector runs on the site's LAN, reads the network equipment through an adapter and forwards telemetry here. Each has its own credential, valid for this site only." action={<Button size="sm" icon={Plus} onClick={() => setCreating(true)}>Add collector</Button>} />
      {collectors.length === 0 ? (
        <EmptyState icon={ServerCog} title="No collectors" hint="Without a collector no telemetry reaches this site. See docs/NETWORK_MONITORING_PLATFORM.md for installation." />
      ) : (
        <ul className="divide-y divide-line">
          {collectors.map((c) => (
            <li key={c.id} className="space-y-1 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-ink-900">{c.name}</span>
                  <span className="text-xs text-ink-500">{c.code} · {c.adapter_kind}</span>
                  <StatusBadge status={c.revoked ? 'offline' : c.state} label={c.revoked ? 'Revoked' : undefined} />
                  {c.is_simulated && <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800">SIMULATED</span>}
                </div>
                <div className="flex gap-1">
                  <Button variant="secondary" size="sm" icon={RefreshCw} onClick={() => setConfirm({ kind: 'rotate', collector: c })}>Rotate token</Button>
                  <Button variant="secondary" size="sm" icon={ShieldOff} disabled={c.revoked} onClick={() => setConfirm({ kind: 'revoke', collector: c })}>Revoke</Button>
                  <Button variant="ghost" size="sm" icon={Trash2} onClick={() => setConfirm({ kind: 'delete', collector: c })} aria-label={`Delete ${c.code}`} />
                </div>
              </div>
              <p className="text-xs text-ink-500">
                Last heard {ageText(c.last_seen_at)} · last data {ageText(c.last_ingest_at)} · token …{c.token_hint || '????'} (v{c.token_version})
                {c.version ? ` · collector ${c.version}` : ''} · buffer {c.buffer_depth} queued, {c.dropped_events} dropped
              </p>
              <p className="text-xs text-ink-500">
                Capabilities: {c.capabilities.length ? c.capabilities.join(', ') : 'not reported yet'}
                {c.adapter_health && c.adapter_health.ok === false ? ` · adapter problem: ${c.adapter_health.last_error || 'unknown'}` : ''}
              </p>
            </li>
          ))}
        </ul>
      )}

      {creating && <CollectorModal siteId={siteId} onClose={() => setCreating(false)} onCreated={async (res) => { setCreating(false); setIssued(res); await onChanged() }} />}
      {issued && <TokenModal issued={issued} onClose={() => setIssued(null)} />}
      <ConfirmDialog
        open={!!confirm}
        title={confirm?.kind === 'rotate' ? 'Rotate credential?' : confirm?.kind === 'revoke' ? 'Revoke collector?' : 'Delete collector?'}
        message={
          confirm?.kind === 'rotate'
            ? 'A new token is issued and shown once. The old token keeps working for ten minutes so the collector can be reconfigured.'
            : confirm?.kind === 'revoke'
              ? 'The collector stops being accepted immediately. Data it has buffered stays on its computer until a new token is configured.'
              : 'The collector record and its credential are deleted. Telemetry already stored is kept.'
        }
        tone={confirm?.kind === 'rotate' ? 'default' : 'danger'}
        confirmLabel={confirm?.kind === 'rotate' ? 'Rotate' : confirm?.kind === 'revoke' ? 'Revoke' : 'Delete'}
        busy={busy}
        onCancel={() => setConfirm(null)}
        onConfirm={doConfirm}
      />
    </Card>
  )
}

function CollectorModal({ siteId, onClose, onCreated }) {
  const { notify } = useToast()
  const [adapters, setAdapters] = useState([])
  const [f, setF] = useState({ code: '', name: '', adapter_kind: 'synthetic', config: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    listAdapters().then(setAdapters).catch((err) => notify(friendlyErrorMessage(err), { tone: 'error' }))
  }, [notify])

  const selected = adapters.find((a) => a.kind === f.adapter_kind)

  async function submit(e) {
    e.preventDefault()
    setError('')
    let config = null
    if (f.config.trim()) {
      try {
        config = JSON.parse(f.config)
      } catch {
        setError('Operational settings must be valid JSON.')
        return
      }
    }
    setBusy(true)
    try {
      onCreated(await createCollector(siteId, { code: f.code, name: f.name, adapter_kind: f.adapter_kind, config }))
    } catch (err) {
      setError(friendlyErrorMessage(err))
      setBusy(false)
    }
  }

  return (
    <Modal title="Add collector" onClose={onClose} size="md" dismissible={!busy}
      footer={<><Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button><Button type="submit" form="col-form" loading={busy}>Create</Button></>}>
      <form id="col-form" onSubmit={submit} className="space-y-3 pt-2">
        {error && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-signal-red">{error}</p>}
        <Field label="Code"><input required value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} className="input" placeholder="COL-MAIN" /></Field>
        <Field label="Name"><input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className="input" /></Field>
        <Field label="Telemetry adapter" hint="Chosen here for the record; the collector's own configuration decides what it actually runs.">
          <input list="adapter-kinds" value={f.adapter_kind} onChange={(e) => setF({ ...f, adapter_kind: e.target.value })} className="input" />
          <datalist id="adapter-kinds">{adapters.map((a) => <option key={a.kind} value={a.kind} />)}</datalist>
        </Field>
        {selected && (
          <p className={`rounded-xl border px-3 py-2 text-xs ${selected.simulated ? 'border-amber-300 bg-amber-50 text-amber-900' : 'border-line text-ink-600'}`}>
            {selected.description} {selected.simulated ? 'Everything it sends will be labelled SIMULATED.' : ''} {selected.production_ready ? '' : 'Not production-ready.'}
          </p>
        )}
        <Field label="Operational settings, JSON (optional)" hint="Non-secret settings only, such as poll intervals. Credentials belong in the collector's environment, never here.">
          <textarea rows={3} value={f.config} onChange={(e) => setF({ ...f, config: e.target.value })} className="input font-mono text-xs" />
        </Field>
      </form>
    </Modal>
  )
}

function TokenModal({ issued, onClose }) {
  const { notify } = useToast()
  const [copied, setCopied] = useState(false)
  async function copy() {
    try {
      await navigator.clipboard.writeText(issued.token)
      setCopied(true)
    } catch {
      notify('Copy failed: select the token and copy it manually.', { tone: 'warning' })
    }
  }
  return (
    <Modal title="Collector credential" onClose={onClose} size="md"
      footer={<Button onClick={onClose}>I have stored it</Button>}>
      <div className="space-y-3 pt-2 text-sm text-ink-700">
        <p className="flex items-start gap-2"><KeyRound className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> Copy this token into the collector's secret store now. <strong>It is shown only once</strong> and cannot be retrieved later; rotate to issue another.</p>
        <textarea readOnly value={issued.token} rows={3} onFocus={(e) => e.target.select()} className="input font-mono text-xs" aria-label="Collector token" />
        <Button variant="secondary" size="sm" icon={Copy} onClick={copy}>{copied ? 'Copied' : 'Copy'}</Button>
        <p className="text-xs text-ink-500">Collector {issued.collector.code}. Do not paste the token into chat, tickets or source files.</p>
      </div>
    </Modal>
  )
}
