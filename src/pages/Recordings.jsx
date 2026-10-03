import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Clapperboard, TriangleAlert } from 'lucide-react'
import { listRecordings } from '../api/recordings.js'
import { useConstableLookup } from '../hooks/useConstableLookup.js'
import { friendlyErrorMessage } from '../api/client.js'
import { LoadingSkeleton, ErrorState, EmptyState, PageHeader } from '../components/Primitives.jsx'
import StatusBadge from '../components/StatusBadge.jsx'
import DataTable from '../components/ui/DataTable.jsx'
import FilterTabs from '../components/ui/FilterTabs.jsx'
import Pagination from '../components/ui/Pagination.jsx'
import { formatDateTimeShort } from '../utils/format.js'
import { statusLabel, triggerLabel } from '../utils/labels.js'

const STATUS_TABS = ['', 'recording', 'completed', 'cancelled', 'failed'].map((s) => ({ value: s, label: s ? statusLabel(s) : 'All' }))
const PAGE_SIZE = 25

export default function Recordings() {
  const { label: constableLabel } = useConstableLookup()
  const [rows, setRows] = useState([])
  const [statusFilter, setStatusFilter] = useState('')
  const [offset, setOffset] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    try {
      setRows(await listRecordings({ status: statusFilter || undefined, limit: PAGE_SIZE, offset }))
    } catch (err) {
      setError(friendlyErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, offset])

  const columns = [
    {
      key: 'constable',
      header: 'Constable',
      primary: true,
      cell: (r) => (
        <Link to={`/recordings/${r.id}`} className="text-brand-600 hover:text-brand-800 hover:underline">
          {constableLabel(r.constable_id)}
        </Link>
      ),
    },
    { key: 'status', header: 'Status', cell: (r) => <StatusBadge status={r.status} /> },
    { key: 'started', header: 'Started', cell: (r) => <span className="whitespace-nowrap text-ink-500">{formatDateTimeShort(r.started_at)}</span> },
    { key: 'trigger', header: 'How it started', cell: (r) => <span className="text-ink-700">{triggerLabel(r.trigger_type)}</span> },
    {
      key: 'health',
      header: 'Video',
      cell: (r) =>
        r.missing_chunk_numbers?.length > 0 ? (
          <span className="inline-flex items-center gap-1.5 text-signal-red">
            <TriangleAlert className="h-4 w-4" aria-hidden="true" />
            Some parts missing
          </span>
        ) : (
          <span className="text-ink-500">All received</span>
        ),
    },
  ]

  return (
    <div>
      <PageHeader title="Recordings" subtitle="Videos recorded by body cameras. Open one to watch it." />

      <div className="mb-5">
        <FilterTabs options={STATUS_TABS} value={statusFilter} onChange={(v) => { setStatusFilter(v); setOffset(0) }} label="Filter by status" />
      </div>

      {loading ? (
        <LoadingSkeleton rows={6} />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : rows.length === 0 ? (
        <EmptyState icon={Clapperboard} title="No recordings found" hint="Try a different filter." />
      ) : (
        <DataTable columns={columns} rows={rows} />
      )}

      <Pagination offset={offset} pageSize={PAGE_SIZE} count={rows.length} onChange={setOffset} />
    </div>
  )
}
