import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Copy, HardDrive, KeyRound, Plus, RefreshCw, ScrollText, ServerCog, ShieldOff, Trash2, Users, Video } from 'lucide-react'
import {
  getReceiverLocalRecordings, authorizeDevice, createAssignment, createReceiver, deleteReceiver, getBodycamOverview, getSiteRecording, issueGrant, listAssignments,
  listBodycamAudit, listDeviceAuthorizations, listGrants, listSiteRecordings, queueReceiverCommand, revokeAssignment, revokeDeviceAuthorization,
  revokeGrant, revokeReceiver, rotateReceiverToken,
} from '../../../api/bodycam.js'
import { listConstables } from '../../../api/constables.js'
import { listDevices } from '../../../api/devices.js'
import { friendlyErrorMessage } from '../../../api/client.js'
import { useToast } from '../../../context/ToastContext.jsx'
import { ConfirmDialog, EmptyState, ErrorState, LoadingSkeleton } from '../../Primitives.jsx'
import StatusBadge from '../../StatusBadge.jsx'
import Button from '../../ui/Button.jsx'
import { Field } from '../../ui/Form.jsx'
import Modal from '../../ui/Modal.jsx'
import { Card, CardHeader } from '../../ui/Card.jsx'
import { ageText } from '../../../utils/siteLevels.js'

const SECTIONS = [['receivers', 'Receivers'], ['recordings', 'Recordings'], ['assignments', 'Assignments'], ['devices', 'Devices'], ['grants', 'Offline grants'], ['audit', 'Audit']]

const SYNC_LABEL = {
  local_only: 'Stored at site only',
  partial: 'Partly at control room',
  incomplete: 'Completed with missing chunks',
  central: 'At control room',
  online: 'Uploaded directly',
}
const SYNC_TONE = {
  local_only: 'border-amber-300 bg-amber-50 text-amber-800',
  partial: 'border-amber-300 bg-amber-50 text-amber-800',
  incomplete: 'border-red-300 bg-red-50 text-red-800',
  central: 'border-emerald-300 bg-emerald-50 text-emerald-800',
  online: 'border-line bg-surface text-ink-700',
}

const fmtBytes = (n) => {
  if (n == null) return '—'
  const gib = n / 1024 ** 3
  return gib >= 1 ? `${gib.toFixed(1)} GiB` : `${Math.round(n / 1024 ** 2)} MiB`
}
const fmtTime = (t) => (t ? new Date(t).toLocaleString() : '—')

function Pill({ tone, children }) {
  return <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${tone}`}>{children}</span>
}

// Control-room view of the offline video transport for ONE site. Read-only for control_room; `admin` unlocks changes
// (the server enforces this regardless of what is shown here).
export default function VideoTransferTab({ siteId, admin }) {
  const { notify } = useToast()
  const [section, setSection] = useState('receivers')
  const [overview, setOverview] = useState(null)
  const [error, setError] = useState('')
  const [tick, setTick] = useState(0)
  const reload = useCallback(() => setTick((t) => t + 1), [])

  useEffect(() => {
    let live = true
    getBodycamOverview(siteId).then((o) => { if (live) { setOverview(o); setError('') } }).catch((e) => { if (live) setError(friendlyErrorMessage(e)) })
    return () => { live = false }
  }, [siteId, tick])

  // Receivers report every ~30 s; refresh the numbers at a similar pace while the tab is open.
  useEffect(() => {
    const id = setInterval(reload, 30000)
    return () => clearInterval(id)
  }, [reload])

  if (error && !overview) return <ErrorState message={error} onRetry={reload} />
  if (!overview) return <LoadingSkeleton rows={4} />

  return (
    <div className="space-y-4">
      {overview.alerts.length > 0 && (
        <div role="alert" className="rounded-2xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <p className="flex items-center gap-2 font-semibold"><AlertTriangle className="h-4 w-4" aria-hidden="true" /> Needs attention</p>
          <ul className="mt-1 list-disc pl-6">{overview.alerts.map((a) => <li key={a}>{a}</li>)}</ul>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Recordings via receiver" value={`${overview.recordings_via_receiver} / ${overview.recordings_total}`} />
        <Stat label="Chunks waiting at receivers" value={overview.receiver_pending_chunks} tone={overview.receiver_pending_chunks ? 'amber' : ''} />
        <Stat label="Quarantined chunks" value={overview.receiver_quarantined_chunks} tone={overview.receiver_quarantined_chunks ? 'red' : ''} />
        <Stat label="Active grants" value={overview.active_grants} />
      </div>
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Video transfer sections">
        {SECTIONS.map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={section === k} onClick={() => setSection(k)}
            className={`rounded-full border px-3 py-1 text-sm ${section === k ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-line text-ink-600'}`}>{label}</button>
        ))}
        <Button variant="ghost" size="sm" icon={RefreshCw} onClick={reload}>Refresh</Button>
      </div>
      {section === 'receivers' && <Receivers siteId={siteId} admin={admin} receivers={overview.receivers} onChanged={reload} notify={notify} />}
      {section === 'recordings' && <Recordings siteId={siteId} admin={admin} receivers={overview.receivers} notify={notify} />}
      {section === 'assignments' && <Assignments siteId={siteId} admin={admin} notify={notify} onChanged={reload} />}
      {section === 'devices' && <Devices siteId={siteId} admin={admin} notify={notify} onChanged={reload} />}
      {section === 'grants' && <Grants siteId={siteId} admin={admin} notify={notify} onChanged={reload} />}
      {section === 'audit' && <Audit siteId={siteId} admin={admin} />}
    </div>
  )
}

function Stat({ label, value, tone = '' }) {
  const color = tone === 'red' ? 'text-signal-red' : tone === 'amber' ? 'text-amber-700' : 'text-ink-900'
  return (
    <div className="rounded-2xl border border-line bg-surface p-3">
      <p className="text-xs text-ink-500">{label}</p>
      <p className={`text-xl font-semibold tabular-nums ${color}`}>{value}</p>
    </div>
  )
}

// ---- generic list loader ------------------------------------------------------------------------------------
function useList(loader, deps) {
  const [state, setState] = useState({ data: null, error: '' })
  const [tick, setTick] = useState(0)
  useEffect(() => {
    let live = true
    loader().then((data) => { if (live) setState({ data, error: '' }) }).catch((e) => { if (live) setState({ data: null, error: friendlyErrorMessage(e) }) })
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick])
  return [state, () => setTick((t) => t + 1)]
}

// ---- Receivers ------------------------------------------------------------------------------------------------------
function Receivers({ siteId, admin, receivers, onChanged, notify }) {
  const [creating, setCreating] = useState(false)
  const [issued, setIssued] = useState(null)
  const [confirm, setConfirm] = useState(null)
  const [busy, setBusy] = useState(false)

  async function run(fn, okMessage) {
    setBusy(true)
    try {
      const res = await fn()
      notify(okMessage, { tone: 'success' })
      setConfirm(null)
      onChanged()
      return res
    } catch (e) {
      notify(friendlyErrorMessage(e), { tone: 'error' })
    } finally {
      setBusy(false)
    }
  }

  async function doConfirm() {
    const { kind, receiver } = confirm
    if (kind === 'rotate') {
      const res = await run(() => rotateReceiverToken(siteId, receiver.id), `${receiver.code}: new credential issued`)
      if (res) setIssued(res)
    } else if (kind === 'revoke') await run(() => revokeReceiver(siteId, receiver.id), `${receiver.code}: revoked`)
    else if (kind === 'delete') await run(() => deleteReceiver(siteId, receiver.id), `${receiver.code}: deleted`)
  }

  return (
    <Card className="p-4">
      <CardHeader icon={ServerCog} title="Site receivers" subtitle="A receiver on the site network stores video from phones while the internet link is down and forwards it when it returns."
        action={admin && <Button size="sm" icon={Plus} onClick={() => setCreating(true)}>Add receiver</Button>} />
      {receivers.length === 0 ? (
        <EmptyState icon={ServerCog} title="No receivers" hint="Without a receiver, phones at this site can only upload while they have internet access." />
      ) : (
        <ul className="divide-y divide-line">
          {receivers.map((r) => (
            <li key={r.id} className="space-y-1 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-ink-900">{r.name}</span>
                  <span className="text-xs text-ink-500">{r.code}{r.version ? ` · v${r.version}` : ''}</span>
                  <StatusBadge status={r.revoked ? 'offline' : r.state} label={r.revoked ? 'Revoked' : undefined} />
                  {r.accepting_uploads === false && <Pill tone="border-red-300 bg-red-50 text-red-800">Not accepting uploads</Pill>}
                </div>
                {admin && !r.revoked && (
                  <div className="flex flex-wrap gap-1">
                    <Button variant="secondary" size="sm" onClick={() => run(() => queueReceiverCommand(siteId, r.id, { type: 'resync' }), 'Re-sync queued')}>Re-sync</Button>
                    <Button variant="secondary" size="sm" disabled={!r.quarantined_chunks} onClick={() => run(() => queueReceiverCommand(siteId, r.id, { type: 'retry_quarantined' }), 'Retry of quarantined chunks queued')}>Retry quarantined</Button>
                    <Button variant="secondary" size="sm" icon={RefreshCw} onClick={() => setConfirm({ kind: 'rotate', receiver: r })}>Rotate token</Button>
                    <Button variant="secondary" size="sm" icon={ShieldOff} onClick={() => setConfirm({ kind: 'revoke', receiver: r })}>Revoke</Button>
                    <Button variant="ghost" size="sm" icon={Trash2} aria-label={`Delete ${r.code}`} onClick={() => setConfirm({ kind: 'delete', receiver: r })} />
                  </div>
                )}
              </div>
              <p className="text-xs text-ink-500">
                Last heard {ageText(r.last_seen_at)} · last sync {ageText(r.last_sync_at)} · last control-room confirmation {ageText(r.last_central_ack_at)} · last upload from a phone {ageText(r.last_local_upload_at)}
              </p>
              <p className="flex flex-wrap items-center gap-x-3 text-xs text-ink-500">
                <span className="inline-flex items-center gap-1"><HardDrive className="h-3 w-3" aria-hidden="true" /> {fmtBytes(r.disk_free_bytes)} free of {fmtBytes(r.disk_total_bytes)}{r.disk_used_pct != null ? ` (${r.disk_used_pct}% used)` : ''}</span>
                {r.last_seen_at ? (
                  <span>{r.pending_chunks} stored here, waiting for the control room · {r.syncing_chunks} sending · <strong className={r.quarantined_chunks ? 'text-signal-red' : ''}>{r.quarantined_chunks} quarantined</strong> · {r.received_chunks_total} received from phones in total (counts as of its last report)</span>
                ) : (
                  <span>No report from this receiver yet, so its backlog is unknown (not zero).</span>
                )}
                {r.pending_commands > 0 && <span>{r.pending_commands} command(s) queued</span>}
              </p>
              {r.endpoint_url && <p className="text-xs text-ink-500">Phones connect to <span className="font-mono">{r.endpoint_url}</span>{r.local_live_enabled ? ' · site-local live view enabled' : ''}</p>}
              {r.alerts.length > 0 && <ul className="text-xs text-amber-800">{r.alerts.map((a) => <li key={a}>• {a}</li>)}</ul>}
              {r.failures.length > 0 && (
                <details className="text-xs text-ink-600">
                  <summary className="cursor-pointer">Recent failures ({r.failures.length})</summary>
                  <ul className="mt-1 space-y-0.5 font-mono">{r.failures.map((f, i) => <li key={i}>{[f.at, f.chunk_id, f.reason || f.error].filter(Boolean).join(' · ')}</li>)}</ul>
                </details>
              )}
            </li>
          ))}
        </ul>
      )}
      {creating && <ReceiverModal siteId={siteId} onClose={() => setCreating(false)} onCreated={(res) => { setCreating(false); setIssued(res); onChanged() }} />}
      {issued && <SecretModal title="Receiver credential" secret={issued.token} note={`Receiver ${issued.receiver.code}. Put it in the receiver's secret store (RECEIVER_CENTRAL_TOKEN_FILE). Never paste it into chat, tickets or source files.`} onClose={() => setIssued(null)} />}
      <ConfirmDialog
        open={!!confirm}
        title={confirm?.kind === 'rotate' ? 'Rotate credential?' : confirm?.kind === 'revoke' ? 'Revoke receiver?' : 'Delete receiver?'}
        message={confirm?.kind === 'rotate' ? 'A new token is issued and shown once. The old one keeps working for ten minutes.'
          : confirm?.kind === 'revoke' ? 'The receiver stops being accepted immediately. Video it holds stays on its disk until it is reconnected with a new credential.'
          : 'The receiver record is deleted. Recordings already received are kept.'}
        tone={confirm?.kind === 'rotate' ? 'default' : 'danger'}
        confirmLabel={confirm?.kind === 'rotate' ? 'Rotate' : confirm?.kind === 'revoke' ? 'Revoke' : 'Delete'}
        busy={busy} onCancel={() => setConfirm(null)} onConfirm={doConfirm}
      />
    </Card>
  )
}

function ReceiverModal({ siteId, onClose, onCreated }) {
  const [f, setF] = useState({ code: '', name: '', endpoint_url: '', local_live_enabled: false, local_live_url: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      onCreated(await createReceiver(siteId, { code: f.code, name: f.name, endpoint_url: f.endpoint_url || null, local_live_enabled: f.local_live_enabled, local_live_url: f.local_live_url || null }))
    } catch (err) {
      setError(friendlyErrorMessage(err))
      setBusy(false)
    }
  }
  return (
    <Modal title="Add receiver" onClose={onClose} dismissible={!busy}
      footer={<><Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button><Button type="submit" form="rcv-form" loading={busy}>Create</Button></>}>
      <form id="rcv-form" onSubmit={submit} className="space-y-3 pt-2">
        {error && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-signal-red">{error}</p>}
        <Field label="Code"><input required value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} className="input" placeholder="RCV-GATE1" /></Field>
        <Field label="Name"><input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className="input" /></Field>
        <Field label="Address phones use on the site network" hint="Use https with a certificate the phones trust, e.g. https://receiver.site.example:8443."><input value={f.endpoint_url} onChange={(e) => setF({ ...f, endpoint_url: e.target.value })} className="input" /></Field>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.local_live_enabled} onChange={(e) => setF({ ...f, local_live_enabled: e.target.checked })} /> Site-local live view (needs a LiveKit server on the site)</label>
        {f.local_live_enabled && <Field label="Local LiveKit address"><input value={f.local_live_url} onChange={(e) => setF({ ...f, local_live_url: e.target.value })} className="input" /></Field>}
      </form>
    </Modal>
  )
}

function SecretModal({ title, secret, note, onClose }) {
  const { notify } = useToast()
  const [copied, setCopied] = useState(false)
  async function copy() {
    try {
      await navigator.clipboard.writeText(secret)
      setCopied(true)
    } catch {
      notify('Copy failed: select the text and copy it manually.', { tone: 'warning' })
    }
  }
  return (
    <Modal title={title} onClose={onClose} footer={<Button onClick={onClose}>I have stored it</Button>}>
      <div className="space-y-3 pt-2 text-sm text-ink-700">
        <p className="flex items-start gap-2"><KeyRound className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> <span><strong>Shown only once</strong> and cannot be retrieved later.</span></p>
        <textarea readOnly value={secret} rows={4} onFocus={(e) => e.target.select()} className="input font-mono text-xs" aria-label={title} />
        <Button variant="secondary" size="sm" icon={Copy} onClick={copy}>{copied ? 'Copied' : 'Copy'}</Button>
        <p className="text-xs text-ink-500">{note}</p>
      </div>
    </Modal>
  )
}

// ---- Recordings ----------------------------------------------------------------------------------------------------------
function Recordings({ siteId, admin, receivers, notify }) {
  const [origin, setOrigin] = useState('')
  const [offset, setOffset] = useState(0)
  const limit = 25
  const [{ data, error }, reload] = useList(() => listSiteRecordings(siteId, { limit, offset, ...(origin ? { origin } : {}) }), [siteId, origin, offset])
  const [open, setOpen] = useState(null)
  const [local, setLocal] = useState({ rows: [], error: '', loaded: false })

  // Receiver-reported (local) recordings. These are the RECEIVER'S statement, shown separately from the control room's own records.
  useEffect(() => {
    let live = true
    Promise.all(receivers.filter((r) => !r.revoked).map((r) => getReceiverLocalRecordings(siteId, r.id).then((d) => ({ receiver: r, data: d }))))
      .then((res) => { if (live) setLocal({ rows: res, error: '', loaded: true }) })
      .catch((e) => { if (live) setLocal({ rows: [], error: friendlyErrorMessage(e), loaded: true }) })
    return () => { live = false }
  }, [siteId, receivers])

  const localOnly = local.rows.flatMap(({ receiver, data }) => data.items.filter((i) => !i.registered_centrally).map((i) => ({ ...i, receiver, stale: data.stale, reported_at: data.reported_at })))
  const localById = {}
  local.rows.forEach(({ data }) => data.items.filter((i) => i.registered_centrally).forEach((i) => { localById[i.recording_id] = { ...i, stale: data.stale } }))

  return (
    <>
    {localOnly.length > 0 && (
      <Card className="mb-4 p-4">
        <CardHeader icon={HardDrive} title="Held at the site receiver, not yet at the control room" subtitle="Reported by the receiver itself. The control room has no record of these recordings yet, so none of their chunks are centrally archived." />
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-ink-500"><tr><th className="py-2 pr-3">Recording</th><th className="pr-3">Receiver</th><th className="pr-3">Officer</th><th className="pr-3">Started</th><th className="pr-3">Chunks at receiver</th><th className="pr-3">Expected</th><th className="pr-3">State</th></tr></thead>
            <tbody className="divide-y divide-line">
              {localOnly.map((i) => (
                <tr key={`${i.receiver.id}-${i.recording_id}`}>
                  <td className="py-2 pr-3 font-mono text-xs">{i.recording_id.slice(0, 8)}…</td>
                  <td className="pr-3">{i.receiver.code}{i.stale && <span className="ml-1 rounded-full border border-amber-300 bg-amber-50 px-1.5 text-xs text-amber-800">report is old</span>}</td>
                  <td className="pr-3">{i.constable_label || '—'}</td>
                  <td className="pr-3 whitespace-nowrap">{fmtTime(i.started_at)}</td>
                  <td className="pr-3 tabular-nums">{i.chunks_received}{i.chunks_quarantined > 0 && <span className="text-signal-red"> ({i.chunks_quarantined} quarantined)</span>}</td>
                  <td className="pr-3">{i.expected_chunks != null ? i.expected_chunks : 'unknown'}</td>
                  <td className="pr-3"><Pill tone="border-amber-300 bg-amber-50 text-amber-800">{i.status === 'completed' ? 'Complete at site, waiting for forwarding' : 'Recording or incomplete'}</Pill>{i.last_error && <span className="ml-1 text-xs text-ink-500">{i.last_error}</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    )}
    {local.error && <p className="mb-2 text-xs text-ink-500">Receiver-held recordings could not be loaded: {local.error}</p>}
    <Card className="p-4">
      <CardHeader icon={Video} title="Site recordings" subtitle="Recordings made at this site, how they arrived, and whether the control room holds every chunk."
        action={<div className="flex gap-2">
          <select value={origin} onChange={(e) => { setOffset(0); setOrigin(e.target.value) }} className="input !py-1 text-sm" aria-label="Arrival path">
            <option value="">All</option><option value="site_receiver">Via receiver</option><option value="central">Direct</option>
          </select>
          <Button variant="ghost" size="sm" icon={RefreshCw} onClick={reload}>Refresh</Button>
        </div>} />
      {error && <ErrorState message={error} onRetry={reload} />}
      {!data && !error && <LoadingSkeleton rows={4} />}
      {data && data.items.length === 0 && <EmptyState icon={Video} title="No recordings" hint="Recordings made under a site assignment appear here." />}
      {data && data.items.length > 0 && (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-ink-500"><tr><th className="py-2 pr-3">Started</th><th className="pr-3">Officer</th><th className="pr-3">Device</th><th className="pr-3">Chunks</th><th className="pr-3">Transfer</th><th /></tr></thead>
              <tbody className="divide-y divide-line">
                {data.items.map((r) => (
                  <tr key={r.id}>
                    <td className="py-2 pr-3 whitespace-nowrap">{fmtTime(r.started_at)}</td>
                    <td className="pr-3">{r.constable_label || '—'}</td>
                    <td className="pr-3 font-mono text-xs">{r.device_identifier ? `${r.device_identifier.slice(0, 8)}…` : '—'}</td>
                    <td className="pr-3 tabular-nums">{r.chunk_count}{r.missing_chunk_numbers.length > 0 ? <span className="text-signal-red"> ({r.missing_chunk_numbers.length} missing)</span> : ''}</td>
                    <td className="pr-3"><Pill tone={SYNC_TONE[r.sync_state] || SYNC_TONE.online}>{SYNC_LABEL[r.sync_state] || r.sync_state}</Pill>{r.flags.length > 0 && <span className="ml-1 text-xs text-amber-800">{r.flags.join(', ')}</span>}
                      {localById[r.id] && <span className="mt-0.5 block text-xs text-ink-500">Receiver: {localById[r.id].chunks_synced}/{localById[r.id].chunks_received} chunks confirmed centrally{localById[r.id].chunks_quarantined > 0 ? `, ${localById[r.id].chunks_quarantined} quarantined` : ''}{localById[r.id].stale ? ' (old report)' : ''}</span>}</td>
                    <td><Button variant="ghost" size="sm" onClick={() => setOpen(r.id)}>Chunks</Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex items-center justify-between text-xs text-ink-500">
            <span>{offset + 1}–{Math.min(offset + limit, data.total)} of {data.total}</span>
            <span className="flex gap-2">
              <Button variant="secondary" size="sm" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - limit))}>Previous</Button>
              <Button variant="secondary" size="sm" disabled={offset + limit >= data.total} onClick={() => setOffset(offset + limit)}>Next</Button>
            </span>
          </div>
        </>
      )}
      {open && <RecordingModal siteId={siteId} id={open} admin={admin} receivers={receivers} notify={notify} onClose={() => setOpen(null)} />}
    </Card>
    </>
  )
}

function RecordingModal({ siteId, id, admin, receivers, notify, onClose }) {
  const [{ data, error }] = useList(() => getSiteRecording(siteId, id), [siteId, id])
  const receiver = useMemo(() => receivers.find((r) => r.id === data?.receiver_id), [receivers, data])

  async function retry() {
    try {
      await queueReceiverCommand(siteId, receiver.id, { type: 'retry_recording', recording_id: id })
      notify('Retry queued; it is delivered at the receiver\'s next sync.', { tone: 'success' })
    } catch (e) {
      notify(friendlyErrorMessage(e), { tone: 'error' })
    }
  }

  return (
    <Modal title="Recording chunks" onClose={onClose} size="lg" footer={<>
      {admin && receiver && data?.sync_state !== 'central' && <Button variant="secondary" onClick={retry}>Retry from receiver</Button>}
      <Button onClick={onClose}>Close</Button></>}>
      <div className="space-y-3 pt-2 text-sm">
        {error && <ErrorState message={error} />}
        {!data && !error && <LoadingSkeleton rows={3} />}
        {data && (
          <>
            <p className="text-xs text-ink-500">Recording <span className="font-mono">{data.id}</span> · {data.origin === 'site_receiver' ? `via receiver ${receiver?.code || ''}` : 'uploaded directly'} · {data.status}</p>
            <p className="rounded-xl border border-line bg-surface p-2 text-xs text-ink-600">
              <strong>Original</strong> is the file exactly as the phone sent it (its SHA-256 proves it is unchanged). <strong>Derived</strong> is the watermarked playback copy; the original is kept alongside it.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="text-ink-500"><tr><th className="py-1 pr-2">#</th><th className="pr-2">Size</th><th className="pr-2">Original SHA-256</th><th className="pr-2">Derived</th><th className="pr-2">Via</th><th>At site</th></tr></thead>
                <tbody className="divide-y divide-line">
                  {data.chunks.map((c) => (
                    <tr key={c.chunk_id}>
                      <td className="py-1 pr-2 tabular-nums">{c.chunk_number}</td>
                      <td className="pr-2">{fmtBytes(c.file_size)}</td>
                      <td className="pr-2 font-mono">{c.original_hash ? `${c.original_hash.slice(0, 16)}…` : <span className="text-amber-800">not recorded</span>}</td>
                      <td className="pr-2">{c.derived_hash ? 'yes' : '—'}{c.has_original ? '' : ' (no original)'}</td>
                      <td className="pr-2">{c.received_via}</td>
                      <td>{fmtTime(c.site_received_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {data.missing_chunk_numbers.length > 0 && <p className="text-signal-red">Missing chunk numbers: {data.missing_chunk_numbers.join(', ')}</p>}
          </>
        )}
      </div>
    </Modal>
  )
}

// ---- Assignments ----------------------------------------------------------------------------------------------------------------
function Assignments({ siteId, admin, notify, onChanged }) {
  const [{ data, error }, reload] = useList(() => listAssignments(siteId), [siteId])
  const [adding, setAdding] = useState(false)
  const [confirm, setConfirm] = useState(null)
  const [busy, setBusy] = useState(false)

  async function doRevoke() {
    setBusy(true)
    try {
      await revokeAssignment(siteId, confirm.id, 'revoked from the control room')
      notify('Assignment revoked; the officer\'s offline grants for this site were revoked too.', { tone: 'success' })
      setConfirm(null)
      reload()
      onChanged()
    } catch (e) {
      notify(friendlyErrorMessage(e), { tone: 'error' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="p-4">
      <CardHeader icon={Users} title="Officer assignments" subtitle="Only assigned officers receive an offline grant for this site." action={admin && <Button size="sm" icon={Plus} onClick={() => setAdding(true)}>Assign officer</Button>} />
      {error && <ErrorState message={error} onRetry={reload} />}
      {!data && !error && <LoadingSkeleton rows={3} />}
      {data && data.length === 0 && <EmptyState icon={Users} title="No assignments" hint="Assign officers to this site to let them record through its receiver." />}
      {data && data.length > 0 && (
        <ul className="divide-y divide-line">
          {data.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
              <span><strong>{a.constable_label || a.constable_id}</strong> <span className="text-xs text-ink-500">from {fmtTime(a.valid_from)}{a.valid_until ? ` until ${fmtTime(a.valid_until)}` : ''}{a.notes ? ` · ${a.notes}` : ''}</span></span>
              <span className="flex items-center gap-2"><Pill tone={a.status === 'active' ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-line text-ink-600'}>{a.status}</Pill>
                {admin && a.status === 'active' && <Button variant="secondary" size="sm" icon={ShieldOff} onClick={() => setConfirm(a)}>Revoke</Button>}</span>
            </li>
          ))}
        </ul>
      )}
      {adding && <AssignModal siteId={siteId} onClose={() => setAdding(false)} onDone={() => { setAdding(false); reload(); onChanged() }} />}
      <ConfirmDialog open={!!confirm} title="Revoke assignment?" message="The officer can no longer use this site's receiver and every unexpired offline grant they hold for it is revoked. Receivers learn of this at their next sync." tone="danger" confirmLabel="Revoke" busy={busy} onCancel={() => setConfirm(null)} onConfirm={doRevoke} />
    </Card>
  )
}

function AssignModal({ siteId, onClose, onDone }) {
  const [constables, setConstables] = useState([])
  const [f, setF] = useState({ constable_id: '', valid_until: '', notes: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => { listConstables().then(setConstables).catch((e) => setError(friendlyErrorMessage(e))) }, [])
  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await createAssignment(siteId, { constable_id: f.constable_id, valid_until: f.valid_until ? new Date(f.valid_until).toISOString() : null, notes: f.notes || null })
      onDone()
    } catch (err) {
      setError(friendlyErrorMessage(err))
      setBusy(false)
    }
  }
  return (
    <Modal title="Assign officer" onClose={onClose} dismissible={!busy}
      footer={<><Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button><Button type="submit" form="asg-form" loading={busy}>Assign</Button></>}>
      <form id="asg-form" onSubmit={submit} className="space-y-3 pt-2">
        {error && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-signal-red">{error}</p>}
        <Field label="Officer"><select required value={f.constable_id} onChange={(e) => setF({ ...f, constable_id: e.target.value })} className="input">
          <option value="">Select…</option>{constables.map((c) => <option key={c.id} value={c.id}>{c.badge_number || c.id}</option>)}</select></Field>
        <Field label="Valid until (optional)"><input type="datetime-local" value={f.valid_until} onChange={(e) => setF({ ...f, valid_until: e.target.value })} className="input" /></Field>
        <Field label="Notes (optional)"><input value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} className="input" maxLength={500} /></Field>
      </form>
    </Modal>
  )
}

// ---- Device authorizations ---------------------------------------------------------------------------------------------------
function Devices({ siteId, admin, notify, onChanged }) {
  const [{ data, error }, reload] = useList(() => listDeviceAuthorizations(siteId), [siteId])
  const [adding, setAdding] = useState(false)
  const [confirm, setConfirm] = useState(null)
  const [busy, setBusy] = useState(false)

  async function doRevoke() {
    setBusy(true)
    try {
      await revokeDeviceAuthorization(siteId, confirm.id, 'revoked from the control room')
      notify('Device authorization revoked; its offline grants were revoked too.', { tone: 'success' })
      setConfirm(null)
      reload()
      onChanged()
    } catch (e) {
      notify(friendlyErrorMessage(e), { tone: 'error' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="p-4">
      <CardHeader icon={HardDrive} title="Authorized devices" subtitle="A phone needs an authorization for the site as well as an assigned officer." action={admin && <Button size="sm" icon={Plus} onClick={() => setAdding(true)}>Authorize device</Button>} />
      {error && <ErrorState message={error} onRetry={reload} />}
      {!data && !error && <LoadingSkeleton rows={3} />}
      {data && data.length === 0 && <EmptyState icon={HardDrive} title="No authorized devices" hint="Authorize an officer's phone for this site." />}
      {data && data.length > 0 && (
        <ul className="divide-y divide-line">
          {data.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
              <span><span className="font-mono text-xs">{d.device_identifier ? `${d.device_identifier.slice(0, 12)}…` : d.device_id}</span> · {d.constable_label || '—'}
                <span className="block text-xs text-ink-500">authorized {fmtTime(d.authorized_at)}{d.valid_until ? ` until ${fmtTime(d.valid_until)}` : ''} · last seen at a receiver {ageText(d.last_seen_by_receiver_at)}</span></span>
              <span className="flex items-center gap-2"><Pill tone={d.status === 'authorized' ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-line text-ink-600'}>{d.status}</Pill>
                {admin && d.status === 'authorized' && <Button variant="secondary" size="sm" icon={ShieldOff} onClick={() => setConfirm(d)}>Revoke</Button>}</span>
            </li>
          ))}
        </ul>
      )}
      {adding && <AuthorizeModal siteId={siteId} onClose={() => setAdding(false)} onDone={() => { setAdding(false); reload(); onChanged() }} />}
      <ConfirmDialog open={!!confirm} title="Revoke device?" message="The phone can no longer use this site's receiver, and its unexpired offline grants for this site are revoked." tone="danger" confirmLabel="Revoke" busy={busy} onCancel={() => setConfirm(null)} onConfirm={doRevoke} />
    </Card>
  )
}

function AuthorizeModal({ siteId, onClose, onDone }) {
  const [devices, setDevices] = useState([])
  const [f, setF] = useState({ device_id: '', valid_until: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => { listDevices().then(setDevices).catch((e) => setError(friendlyErrorMessage(e))) }, [])
  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await authorizeDevice(siteId, { device_id: f.device_id, valid_until: f.valid_until ? new Date(f.valid_until).toISOString() : null })
      onDone()
    } catch (err) {
      setError(friendlyErrorMessage(err))
      setBusy(false)
    }
  }
  return (
    <Modal title="Authorize device" onClose={onClose} dismissible={!busy}
      footer={<><Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button><Button type="submit" form="dev-form" loading={busy}>Authorize</Button></>}>
      <form id="dev-form" onSubmit={submit} className="space-y-3 pt-2">
        {error && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-signal-red">{error}</p>}
        <Field label="Device"><select required value={f.device_id} onChange={(e) => setF({ ...f, device_id: e.target.value })} className="input">
          <option value="">Select…</option>{devices.map((d) => <option key={d.id} value={d.id}>{(d.device_model || 'Phone')} · {String(d.device_identifier).slice(0, 12)}…</option>)}</select></Field>
        <Field label="Valid until (optional)"><input type="datetime-local" value={f.valid_until} onChange={(e) => setF({ ...f, valid_until: e.target.value })} className="input" /></Field>
      </form>
    </Modal>
  )
}

// ---- Offline grants ---------------------------------------------------------------------------------------------------------------
const GRANT_TONE = { valid: 'border-emerald-300 bg-emerald-50 text-emerald-800', expired: 'border-line text-ink-600', revoked: 'border-red-300 bg-red-50 text-red-800' }

function Grants({ siteId, admin, notify, onChanged }) {
  const [state, setState] = useState('')
  const [{ data, error }, reload] = useList(() => listGrants(siteId, state), [siteId, state])
  const [issuing, setIssuing] = useState(false)
  const [issued, setIssued] = useState(null)
  const [confirm, setConfirm] = useState(null)
  const [busy, setBusy] = useState(false)

  async function doRevoke() {
    setBusy(true)
    try {
      await revokeGrant(siteId, confirm.id, 'revoked from the control room')
      notify('Grant revoked. Receivers stop accepting it at their next sync.', { tone: 'success' })
      setConfirm(null)
      reload()
      onChanged()
    } catch (e) {
      notify(friendlyErrorMessage(e), { tone: 'error' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="p-4">
      <CardHeader icon={KeyRound} title="Offline grants" subtitle="Signed permits that let an officer's phone upload to a receiver with no internet. Phones normally renew theirs automatically while online; revocation reaches a receiver only when it next syncs, so a revoked grant can stay usable on an offline site until it expires."
        action={<div className="flex gap-2">
          <select value={state} onChange={(e) => setState(e.target.value)} className="input !py-1 text-sm" aria-label="Grant state"><option value="">All</option><option value="valid">Valid</option><option value="expired">Expired</option><option value="revoked">Revoked</option></select>
          {admin && <Button size="sm" icon={Plus} onClick={() => setIssuing(true)}>Issue grant</Button>}</div>} />
      {error && <ErrorState message={error} onRetry={reload} />}
      {!data && !error && <LoadingSkeleton rows={3} />}
      {data && data.length === 0 && <EmptyState icon={KeyRound} title="No grants" hint="Grants are issued when an assigned officer's phone provisions itself while online." />}
      {data && data.length > 0 && (
        <ul className="divide-y divide-line">
          {data.map((g) => (
            <li key={g.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
              <span><span className="font-mono text-xs">{g.id.slice(0, 8)}…</span> · issued {fmtTime(g.issued_at)} · expires {fmtTime(g.expires_at)}
                <span className="block text-xs text-ink-500">{g.operations.join(', ')}{g.key_id ? ` · key ${g.key_id}` : ''}{g.revoked_reason ? ` · ${g.revoked_reason}` : ''}</span></span>
              <span className="flex items-center gap-2"><Pill tone={GRANT_TONE[g.state]}>{g.state}</Pill>
                {admin && g.state === 'valid' && <Button variant="secondary" size="sm" icon={ShieldOff} onClick={() => setConfirm(g)}>Revoke</Button>}</span>
            </li>
          ))}
        </ul>
      )}
      {issuing && <IssueModal siteId={siteId} onClose={() => setIssuing(false)} onIssued={(res) => { setIssuing(false); setIssued(res); reload(); onChanged() }} />}
      {issued && <SecretModal title="Offline grant" secret={issued.token} note="Normally a phone fetches its own grant. Issue one by hand only for provisioning or support; treat it like a password." onClose={() => setIssued(null)} />}
      <ConfirmDialog open={!!confirm} title="Revoke grant?" message="The phone can no longer upload through this site's receivers once they have synced this revocation." tone="danger" confirmLabel="Revoke" busy={busy} onCancel={() => setConfirm(null)} onConfirm={doRevoke} />
    </Card>
  )
}

function IssueModal({ siteId, onClose, onIssued }) {
  const [devices, setDevices] = useState([])
  const [deviceId, setDeviceId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => { listDevices().then(setDevices).catch((e) => setError(friendlyErrorMessage(e))) }, [])
  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      onIssued(await issueGrant(siteId, { device_id: deviceId }))
    } catch (err) {
      setError(friendlyErrorMessage(err))
      setBusy(false)
    }
  }
  return (
    <Modal title="Issue offline grant" onClose={onClose} dismissible={!busy}
      footer={<><Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button><Button type="submit" form="gr-form" loading={busy}>Issue</Button></>}>
      <form id="gr-form" onSubmit={submit} className="space-y-3 pt-2">
        {error && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-signal-red">{error}</p>}
        <Field label="Device" hint="The officer and device must be assigned/authorized for this site."><select required value={deviceId} onChange={(e) => setDeviceId(e.target.value)} className="input">
          <option value="">Select…</option>{devices.map((d) => <option key={d.id} value={d.id}>{(d.device_model || 'Phone')} · {String(d.device_identifier).slice(0, 12)}…</option>)}</select></Field>
      </form>
    </Modal>
  )
}

// ---- Audit -----------------------------------------------------------------------------------------------------------------------------
function Audit({ siteId, admin }) {
  const [{ data, error }, reload] = useList(() => (admin ? listBodycamAudit(siteId, 100) : Promise.resolve(null)), [siteId, admin])
  if (!admin) return <Card className="p-4"><EmptyState icon={ScrollText} title="Administrators only" hint="The audit trail of grants, assignments and receivers is visible to administrators." /></Card>
  return (
    <Card className="p-4">
      <CardHeader icon={ScrollText} title="Audit trail" subtitle="Grants, revocations, assignments and receiver changes for this site." action={<Button variant="ghost" size="sm" icon={RefreshCw} onClick={reload}>Refresh</Button>} />
      {error && <ErrorState message={error} onRetry={reload} />}
      {!data && !error && <LoadingSkeleton rows={4} />}
      {data && data.length === 0 && <EmptyState icon={ScrollText} title="Nothing recorded yet" />}
      {data && data.length > 0 && (
        <ul className="divide-y divide-line text-xs">
          {data.map((a) => (
            <li key={a.id} className="py-1.5"><span className="font-semibold text-ink-800">{a.action}</span> <span className="text-ink-500">{fmtTime(a.timestamp)}</span>
              {a.details && <span className="block font-mono text-ink-500">{Object.entries(a.details).map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`).join(' · ')}</span>}</li>
          ))}
        </ul>
      )}
    </Card>
  )
}
