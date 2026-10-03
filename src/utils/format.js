// Fixed to Asia/Kolkata (IST) regardless of the viewing machine's own
// locale/timezone -- every constable, station, and control room operator
// is in India, so times must read the same for everyone instead of
// silently shifting with whatever timezone the browser happens to be set
// to (the previous plain `toLocaleString()` had no timeZone, so it used
// the browser's local one).
const IST_FORMATTER = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata',
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: true,
})

export function formatDateTime(value) {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return `${IST_FORMATTER.format(d)} IST`
}

// Compact version for table cells: "03 Oct, 09:59 am IST" (the year is only
// added when it is not the current one).
const IST_SHORT_FORMATTER = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata',
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hour12: true,
})
const IST_YEAR_FORMATTER = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', year: 'numeric' })

export function formatDateTimeShort(value) {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  const year = IST_YEAR_FORMATTER.format(d)
  const sameYear = year === IST_YEAR_FORMATTER.format(new Date())
  return `${IST_SHORT_FORMATTER.format(d)}${sameYear ? '' : `, ${year}`} IST`
}

export function formatBytes(bytes) {
  if (bytes == null) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function shortId(id) {
  return id ? String(id).slice(0, 8) : '—'
}

// "5s ago" / "12m ago" / "3h ago" -- used where the exact absolute
// timestamp is secondary to how STALE the data is (e.g. the Live Map
// sidebar's "Updated Xs ago"); formatDateTime above remains the absolute-
// timestamp convention used everywhere else (e.g. popup "Last Update").
export function formatRelativeTime(value) {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  const seconds = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000))
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

// "12 min" / "1 h 5 min" -- how long something has been going on.
export function formatElapsed(startedAt) {
  if (!startedAt) return '—'
  const ms = Date.now() - new Date(startedAt).getTime()
  if (Number.isNaN(ms) || ms < 0) return '—'
  const mins = Math.floor(ms / 60000)
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return h > 0 ? `${h} h ${m} min` : `${m} min`
}

export function titleCase(value) {
  if (!value) return '—'
  return String(value).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}
