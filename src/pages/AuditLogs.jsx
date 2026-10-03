import { useEffect, useState } from 'react'
import { History } from 'lucide-react'
import { listAuditLogs } from '../api/audit.js'
import { friendlyErrorMessage } from '../api/client.js'
import { LoadingSkeleton, ErrorState, EmptyState, PageHeader } from '../components/Primitives.jsx'
import DataTable from '../components/ui/DataTable.jsx'
import Pagination from '../components/ui/Pagination.jsx'
import { formatDateTimeShort } from '../utils/format.js'
import { ACTIVITY_FILTER_OPTIONS, activityLabel } from '../utils/labels.js'

const PAGE_SIZE = 50

// Turns the raw detail record into a short readable line. Internal ids,
// numbers and nested data are left out; they mean nothing to the person
// reading this.
function summarize(details) {
  if (!details || typeof details !== 'object') return '—'
  const parts = Object.entries(details)
    .filter(([key, value]) => !/(^|_)id$/i.test(key) && typeof value === 'string' && value !== '' && value.length <= 60)
    .map(([key, value]) => `${key.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase())}: ${String(value).replace(/_/g, ' ')}`)
  return parts.length ? parts.join(' · ') : '—'
}

export default function AuditLogs() {
  const [rows, setRows] = useState([])
  const [action, setAction] = useState('')
  const [offset, setOffset] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    try {
      setRows(await listAuditLogs({ action: action || undefined, limit: PAGE_SIZE, offset }))
    } catch (err) {
      setError(friendlyErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [action, offset])

  const columns = [
    { key: 'action', header: 'What happened', primary: true, cell: (a) => activityLabel(a.action) },
    { key: 'time', header: 'When', cell: (a) => <span className="whitespace-nowrap text-ink-500">{formatDateTimeShort(a.timestamp)}</span> },
    { key: 'details', header: 'More information', cell: (a) => <span className="text-ink-500">{summarize(a.details)}</span> },
  ]

  return (
    <div>
      <PageHeader title="Activity History" subtitle="A record of important actions taken in this system" />

      <div className="mb-5 sm:max-w-sm">
        <select value={action} onChange={(e) => { setAction(e.target.value); setOffset(0) }} className="input" aria-label="Filter by kind of activity">
          <option value="">All activity</option>
          {ACTIVITY_FILTER_OPTIONS.map((a) => <option key={a} value={a}>{activityLabel(a)}</option>)}
        </select>
      </div>

      {loading ? (
        <LoadingSkeleton rows={8} />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : rows.length === 0 ? (
        <EmptyState icon={History} title="No activity found" hint="Try choosing a different kind of activity." />
      ) : (
        <DataTable columns={columns} rows={rows} />
      )}

      <Pagination offset={offset} pageSize={PAGE_SIZE} count={rows.length} onChange={setOffset} />
    </div>
  )
}
