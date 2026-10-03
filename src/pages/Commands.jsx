import { useEffect, useState } from 'react'
import { Radio } from 'lucide-react'
import { listAllCommands } from '../api/commands.js'
import { useOperations } from '../context/OperationsContext.jsx'
import { useConstableLookup } from '../hooks/useConstableLookup.js'
import { friendlyErrorMessage } from '../api/client.js'
import { LoadingSkeleton, ErrorState, EmptyState, PageHeader } from '../components/Primitives.jsx'
import StatusBadge from '../components/StatusBadge.jsx'
import DataTable from '../components/ui/DataTable.jsx'
import Pagination from '../components/ui/Pagination.jsx'
import { formatDateTimeShort } from '../utils/format.js'
import { COMMAND_TYPE_OPTIONS, commandTypeLabel, friendlyFailure, statusLabel } from '../utils/labels.js'

const STATUS_OPTIONS = ['pending', 'sent', 'acknowledged', 'executed', 'failed', 'timeout', 'cancelled']
const PAGE_SIZE = 50

export default function Commands() {
  const { devices } = useOperations()
  const { label: constableLabel } = useConstableLookup()
  const [rows, setRows] = useState([])
  const [status, setStatus] = useState('')
  const [commandType, setCommandType] = useState('')
  const [offset, setOffset] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    try {
      setRows(await listAllCommands({ status: status || undefined, command_type: commandType || undefined, limit: PAGE_SIZE, offset }))
    } catch (err) {
      setError(friendlyErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, commandType, offset])

  const constableByDevice = Object.fromEntries((devices || []).map((d) => [d.id, d.constable_id]))

  const columns = [
    { key: 'command', header: 'Action', primary: true, cell: (c) => commandTypeLabel(c.command_type) },
    { key: 'camera', header: 'Camera of', cell: (c) => (constableByDevice[c.device_id] ? constableLabel(constableByDevice[c.device_id]) : '—') },
    { key: 'status', header: 'Result', cell: (c) => <StatusBadge status={c.status} /> },
    { key: 'created', header: 'Requested', cell: (c) => <span className="whitespace-nowrap text-ink-500">{formatDateTimeShort(c.created_at)}</span> },
    { key: 'executed', header: 'Completed', cell: (c) => <span className="whitespace-nowrap text-ink-500">{formatDateTimeShort(c.executed_at)}</span> },
    { key: 'failure', header: 'Problem', cell: (c) => <span className="text-signal-red" title={c.failure_reason || undefined}>{friendlyFailure(c.failure_reason)}</span> },
  ]

  return (
    <div>
      <PageHeader title="Remote Actions" subtitle="Everything that has been sent to body cameras from the control room" />

      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:max-w-xl">
        <select value={status} onChange={(e) => { setStatus(e.target.value); setOffset(0) }} className="input" aria-label="Filter by result">
          <option value="">Any result</option>
          {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}
        </select>
        <select value={commandType} onChange={(e) => { setCommandType(e.target.value); setOffset(0) }} className="input" aria-label="Filter by action">
          <option value="">Any action</option>
          {COMMAND_TYPE_OPTIONS.map((t) => <option key={t} value={t}>{commandTypeLabel(t)}</option>)}
        </select>
      </div>

      {loading ? (
        <LoadingSkeleton rows={6} />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : rows.length === 0 ? (
        <EmptyState icon={Radio} title="Nothing here yet" hint="Actions you send to a camera, like starting a recording, will be listed here." />
      ) : (
        <DataTable columns={columns} rows={rows} />
      )}

      <Pagination offset={offset} pageSize={PAGE_SIZE} count={rows.length} onChange={setOffset} />
    </div>
  )
}
