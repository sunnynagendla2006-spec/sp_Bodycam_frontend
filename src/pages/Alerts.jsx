import { useEffect, useState } from 'react'
import { CircleCheck } from 'lucide-react'
import { listAlerts } from '../api/alerts.js'
import { useConstableLookup } from '../hooks/useConstableLookup.js'
import { friendlyErrorMessage } from '../api/client.js'
import { LoadingSkeleton, ErrorState, EmptyState, PageHeader } from '../components/Primitives.jsx'
import StatusBadge from '../components/StatusBadge.jsx'
import DataTable from '../components/ui/DataTable.jsx'
import FilterTabs from '../components/ui/FilterTabs.jsx'
import Pagination from '../components/ui/Pagination.jsx'
import { formatDateTimeShort } from '../utils/format.js'
import { ALERT_TYPE_OPTIONS, alertTypeLabel } from '../utils/labels.js'

const STATUS_TABS = [
  { value: '', label: 'All' },
  { value: 'open', label: 'Open' },
  { value: 'acknowledged', label: 'Seen' },
  { value: 'resolved', label: 'Resolved' },
]
const SEVERITY_TABS = [
  { value: '', label: 'Any importance' },
  { value: 'critical', label: 'Urgent' },
  { value: 'warning', label: 'Warning' },
]
const PAGE_SIZE = 50

export default function Alerts() {
  const { label: constableLabel } = useConstableLookup()
  const [rows, setRows] = useState([])
  const [status, setStatus] = useState('')
  const [severity, setSeverity] = useState('')
  const [type, setType] = useState('')
  const [offset, setOffset] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    try {
      setRows(await listAlerts({ status: status || undefined, severity: severity || undefined, type: type || undefined, limit: PAGE_SIZE, offset }))
    } catch (err) {
      setError(friendlyErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, severity, type, offset])

  const columns = [
    { key: 'severity', header: 'Importance', cell: (a) => <StatusBadge status={a.severity} /> },
    { key: 'type', header: 'What happened', primary: true, cell: (a) => <span title={a.message || undefined}>{alertTypeLabel(a.type)}</span> },
    { key: 'constable', header: 'Constable', cell: (a) => constableLabel(a.constable_id) },
    { key: 'status', header: 'Status', cell: (a) => <StatusBadge status={a.status} /> },
    { key: 'created', header: 'When', cell: (a) => <span className="whitespace-nowrap text-ink-500">{formatDateTimeShort(a.created_at)}</span> },
  ]

  return (
    <div>
      <PageHeader title="Alerts" subtitle="Things that may need your attention, such as low battery or a camera going offline" />

      <div className="mb-5 space-y-3">
        <FilterTabs options={STATUS_TABS} value={status} onChange={(v) => { setStatus(v); setOffset(0) }} label="Filter by status" />
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <FilterTabs options={SEVERITY_TABS} value={severity} onChange={(v) => { setSeverity(v); setOffset(0) }} label="Filter by importance" />
          <select
            value={type}
            onChange={(e) => { setType(e.target.value); setOffset(0) }}
            className="input sm:ml-auto sm:w-64"
            aria-label="Filter by kind of alert"
          >
            <option value="">All kinds of alerts</option>
            {ALERT_TYPE_OPTIONS.map((t) => <option key={t} value={t}>{alertTypeLabel(t)}</option>)}
          </select>
        </div>
      </div>

      {loading ? (
        <LoadingSkeleton rows={6} />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : rows.length === 0 ? (
        <EmptyState icon={CircleCheck} title="No alerts found" hint="Nothing needs attention right now, or no alert matches your filters." />
      ) : (
        <DataTable
          columns={columns}
          rows={rows}
          rowClassName={(a) => (a.severity === 'critical' && a.status === 'open' ? 'border-red-200 bg-red-50/40 md:bg-red-50/40' : '')}
        />
      )}

      <Pagination offset={offset} pageSize={PAGE_SIZE} count={rows.length} onChange={setOffset} />
    </div>
  )
}
