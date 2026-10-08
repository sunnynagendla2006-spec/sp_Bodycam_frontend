import { statusLabel } from '../utils/labels.js'

const TONE_MAP = {
  // Incidents
  new: 'blue', verified: 'green', rejected: 'red', assigned: 'amber',
  en_route: 'amber', arrived: 'amber', resolved: 'green', closed: 'slate', needs_review: 'violet',
  // Evidence
  uploading: 'slate', uploaded: 'blue', archived: 'slate',
  // Constables
  available: 'green', busy: 'amber',
  // Assignments
  pending: 'amber', accepted: 'green', completed: 'green',
  // Accounts
  active: 'green', inactive: 'slate',
  // Camera status -- offline is safety-critical in this domain (a lost or
  // unreachable body camera), so it gets the strongest tone.
  online: 'green', stale: 'amber', offline: 'red',
  recording: 'red',
  // Alerts
  open: 'red', acknowledged: 'amber',
  warning: 'amber', critical: 'red',
  // Recordings
  cancelled: 'slate', failed: 'red',
  // Remote actions
  sent: 'blue', executed: 'green', timeout: 'red',
  // Live view
  live: 'red', ended: 'slate',
  // AP-based presence (PresenceConnectionStatus) -- "disconnected" reuses
  // the same slate/gray tone LiveMap.jsx's "no location yet" state uses,
  // not a new color; "moving" is a client-only transient label (never a
  // backend enum value) layered on top in the Virtual AP page itself.
  connected: 'green', disconnected: 'slate', moving: 'amber',
}

const TONE_CLASSES = {
  green: { pill: 'bg-signal-green/10 text-green-800 border-signal-green/25', dot: 'bg-signal-green' },
  amber: { pill: 'bg-signal-amber/10 text-amber-800 border-signal-amber/30', dot: 'bg-signal-amber' },
  red: { pill: 'bg-signal-red/10 text-red-800 border-signal-red/25', dot: 'bg-signal-red' },
  blue: { pill: 'bg-signal-blue/10 text-blue-800 border-signal-blue/25', dot: 'bg-signal-blue' },
  violet: { pill: 'bg-signal-violet/10 text-violet-800 border-signal-violet/25', dot: 'bg-signal-violet' },
  slate: { pill: 'bg-slate-100 text-slate-700 border-slate-200', dot: 'bg-slate-400' },
}

// Statuses that mean "happening right now" get a softly pulsing dot.
const LIVE_STATUSES = new Set(['recording', 'live', 'moving'])

export default function StatusBadge({ status, label }) {
  const tone = TONE_MAP[status] || 'slate'
  const text = label || (status ? statusLabel(status) : 'Unknown')
  const t = TONE_CLASSES[tone]
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-medium ${t.pill}`}>
      <span className="relative flex h-2 w-2">
        {LIVE_STATUSES.has(status) && <span className={`absolute inline-flex h-full w-full animate-ping-soft rounded-full ${t.dot}`} />}
        <span className={`relative inline-flex h-2 w-2 rounded-full ${t.dot}`} />
      </span>
      {text}
    </span>
  )
}
