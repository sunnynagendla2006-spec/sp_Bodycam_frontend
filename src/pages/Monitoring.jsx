import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Camera, Clock, MapPin, Radio, Video } from 'lucide-react'
import { useOperations } from '../context/OperationsContext.jsx'
import { useConstableLookup } from '../hooks/useConstableLookup.js'
import { LoadingSkeleton, ErrorState, EmptyState, PageHeader } from '../components/Primitives.jsx'
import StatusBadge from '../components/StatusBadge.jsx'
import Battery from '../components/ui/Battery.jsx'
import FilterTabs from '../components/ui/FilterTabs.jsx'
import SearchInput from '../components/ui/SearchInput.jsx'
import { formatElapsed, formatRelativeTime } from '../utils/format.js'
import { statusLabel } from '../utils/labels.js'

const STATUS_FILTERS = ['', 'online', 'recording', 'stale', 'offline']

const CARD_BORDER = {
  offline: 'border-red-200',
  stale: 'border-amber-200',
  recording: 'border-red-200',
}

export default function Monitoring() {
  const { devices, recordings, liveStreams, loading, error, refresh } = useOperations()
  const { label: constableLabel } = useConstableLookup()
  const [statusFilter, setStatusFilter] = useState('')
  const [search, setSearch] = useState('')

  if (loading) return <LoadingSkeleton rows={8} />
  if (error) return <ErrorState message={error} onRetry={refresh} />

  const recordingByDevice = Object.fromEntries(recordings.filter((r) => r.status === 'recording').map((r) => [r.device_id, r]))
  const liveByDevice = Object.fromEntries((liveStreams || []).map((s) => [s.device_id, s]))
  const needle = search.trim().toLowerCase()
  const filtered = devices.filter((d) => {
    if (statusFilter && d.status !== statusFilter) return false
    if (needle && !constableLabel(d.constable_id).toLowerCase().includes(needle) && !(d.device_identifier || '').toLowerCase().includes(needle)) return false
    return true
  })
  const tabs = STATUS_FILTERS.map((s) => ({
    value: s,
    label: s ? statusLabel(s) : 'All',
    count: s ? devices.filter((d) => d.status === s).length : devices.length,
  }))

  return (
    <div>
      <PageHeader title="Body Cameras" subtitle="Every constable's camera and how it is doing right now" />

      <div className="mb-5 space-y-3">
        <SearchInput value={search} onChange={setSearch} placeholder="Search by constable name" className="sm:max-w-sm" />
        <FilterTabs options={tabs} value={statusFilter} onChange={setStatusFilter} label="Filter by camera status" />
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={Camera} title="No cameras found" hint="Try a different search or filter." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
          {filtered.map((d, i) => {
            const activeRecording = recordingByDevice[d.id]
            const activeLive = liveByDevice[d.id]
            return (
              <Link
                key={d.id}
                to={`/devices/${d.id}`}
                style={{ '--i': Math.min(i, 12) }}
                className={`card card-hover stagger block animate-rise-in p-5 ${CARD_BORDER[d.status] || ''}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                      <Camera className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <p className="truncate font-semibold text-ink-900">{constableLabel(d.constable_id)}</p>
                  </div>
                  <StatusBadge status={d.status} />
                </div>

                {/* One simple row: recording, live view, and battery -- the
                    three things an operator scans a camera card for -- each
                    as a small icon instead of separate labeled blocks. */}
                <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-line pt-4 text-sm">
                  <span className={`inline-flex items-center gap-1.5 ${activeRecording ? 'font-medium text-signal-red' : 'text-ink-400'}`} title={activeRecording ? `Recording for ${formatElapsed(activeRecording.started_at)}` : 'Not recording'}>
                    <Radio className="h-4 w-4" aria-hidden="true" />
                    {activeRecording ? formatElapsed(activeRecording.started_at) : 'Not recording'}
                  </span>
                  <span className={`inline-flex items-center gap-1.5 ${activeLive ? 'font-medium text-signal-red' : 'text-ink-400'}`} title={activeLive ? 'Sharing live video' : 'Not sharing live video'}>
                    <Video className="h-4 w-4" aria-hidden="true" />
                    {activeLive ? 'Live' : 'Not live'}
                  </span>
                  <span className="inline-flex items-center text-ink-900">
                    <Battery percent={d.battery_percent} charging={d.is_charging} />
                  </span>
                </div>

                <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <dt className="text-xs text-ink-500">Last active</dt>
                    <dd className="mt-1 flex items-center gap-1.5 text-ink-900">
                      <Clock className="h-4 w-4 text-ink-400" aria-hidden="true" />
                      {formatRelativeTime(d.last_seen_at)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-ink-500">Location</dt>
                    <dd className="mt-1 flex items-center gap-1.5 text-ink-900">
                      <MapPin className="h-4 w-4 text-ink-400" aria-hidden="true" />
                      {d.latitude != null ? `Updated ${formatRelativeTime(d.location_updated_at)}` : 'Not available'}
                    </dd>
                  </div>
                </dl>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
