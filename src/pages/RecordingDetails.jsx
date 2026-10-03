import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Camera, Check, CircleCheck, Clapperboard, TriangleAlert, X } from 'lucide-react'
import { getRecording, getRecordingManifest } from '../api/recordings.js'
import { useConstableLookup } from '../hooks/useConstableLookup.js'
import { friendlyErrorMessage } from '../api/client.js'
import { LoadingSkeleton, ErrorState, EmptyState, PageHeader } from '../components/Primitives.jsx'
import StatusBadge from '../components/StatusBadge.jsx'
import ChunkPlaybackView from '../components/ChunkPlaybackView.jsx'
import { Card, CardHeader, Info, InfoGrid } from '../components/ui/Card.jsx'
import { formatDateTime, formatBytes } from '../utils/format.js'
import { triggerLabel } from '../utils/labels.js'

export default function RecordingDetails() {
  const { id } = useParams()
  const { label: constableLabel, byId: constablesById } = useConstableLookup()
  const [recording, setRecording] = useState(null)
  const [manifest, setManifest] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    try {
      const [r, m] = await Promise.all([getRecording(id), getRecordingManifest(id)])
      setRecording(r)
      setManifest(m)
    } catch (err) {
      setError(friendlyErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  if (loading) return <LoadingSkeleton rows={8} />
  if (error) return <ErrorState message={error} onRetry={load} />
  if (!recording) return <EmptyState icon={Clapperboard} title="Recording not found" />

  const missingSet = new Set(manifest?.missing_chunk_numbers || [])
  const highest = manifest?.highest_chunk_number || 0
  const timeline = Array.from({ length: highest }, (_, i) => i + 1)
  // Station comes from the recording's constable record, exactly like
  // LiveMap.jsx's own popup (r.constable.station_name) -- not a second,
  // separate lookup.
  const stationName = constablesById?.[recording.constable_id]?.station_name
  const missingCount = recording.missing_chunk_numbers?.length || 0
  const hasVideo = (manifest?.chunks || []).some((c) => c.upload_status === 'uploaded')

  return (
    <div className="space-y-6">
      <PageHeader
        back={{ to: '/recordings', label: 'Back to recordings' }}
        title={constableLabel(recording.constable_id)}
        subtitle={`Recording started ${formatDateTime(recording.started_at)}`}
        actions={<StatusBadge status={recording.status} />}
      />

      {missingCount > 0 ? (
        <div className="flex animate-rise-in items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-signal-amber" aria-hidden="true" />
          <div>
            <p className="font-semibold text-amber-900">Some parts of this video are missing</p>
            <p className="text-sm text-amber-800/90">
              {recording.status === 'recording' ? 'The camera may still be sending them.' : 'They were not received from the camera.'} What was received can still be watched.
            </p>
          </div>
        </div>
      ) : (
        manifest?.is_complete && hasVideo && (
          <div className="flex animate-rise-in items-center gap-3 rounded-2xl border border-green-200 bg-green-50 p-4">
            <CircleCheck className="h-5 w-5 shrink-0 text-signal-green" aria-hidden="true" />
            <p className="font-semibold text-green-900">The full video was received</p>
          </div>
        )
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="animate-rise-in lg:col-span-2">
          <CardHeader icon={Clapperboard} title="Watch recording" />
          <div className="p-5">
            <ChunkPlaybackView
              recordingId={recording.id}
              chunks={manifest?.chunks || []}
              emptyMessage={recording.status === 'recording' ? 'Nothing to watch yet. Video appears here as it is uploaded.' : 'No video was saved for this recording.'}
            />
          </div>
        </Card>

        <Card className="animate-rise-in">
          <CardHeader icon={Camera} title="Details" />
          <div className="p-5">
            <InfoGrid columns={1}>
              <Info label="Started">{formatDateTime(recording.started_at)}</Info>
              <Info label="Ended">{recording.ended_at ? formatDateTime(recording.ended_at) : recording.status === 'recording' ? 'Still recording' : '—'}</Info>
              <Info label="How it started">{triggerLabel(recording.trigger_type)}</Info>
              <Info label="Station">{stationName || '—'}</Info>
              <Info label="Camera">
                {recording.device_id ? (
                  <Link to={`/devices/${recording.device_id}`} className="font-medium text-brand-600 hover:underline">
                    View camera
                  </Link>
                ) : (
                  '—'
                )}
              </Info>
            </InfoGrid>
          </div>
        </Card>
      </div>

      <details className="card animate-rise-in px-5 py-4 text-sm">
        <summary className="cursor-pointer select-none font-medium text-ink-700 marker:text-ink-400">Upload details</summary>

        <h3 className="mb-3 mt-5 text-sm font-semibold text-ink-900">Video parts</h3>
        {timeline.length === 0 ? (
          <p className="text-ink-500">No chunks received yet</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {timeline.map((n) => {
              const missing = missingSet.has(n)
              return (
                <div
                  key={n}
                  title={missing ? `Chunk ${n} — missing` : `Chunk ${n} — received`}
                  className={`flex h-12 w-12 flex-col items-center justify-center rounded-xl border text-xs font-medium ${
                    missing ? 'border-red-200 bg-red-50 text-signal-red' : 'border-green-200 bg-green-50 text-green-800'
                  }`}
                >
                  <span>{n}</span>
                  {missing ? <X className="h-3.5 w-3.5" aria-hidden="true" /> : <Check className="h-3.5 w-3.5" aria-hidden="true" />}
                </div>
              )
            })}
          </div>
        )}

        <h3 className="mb-3 mt-6 text-sm font-semibold text-ink-900">Part-by-part information</h3>
        {manifest?.chunks?.length ? (
          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-semibold uppercase tracking-wide text-ink-500">
                  <th className="pb-2 pr-4">Part</th>
                  <th className="pb-2 pr-4">Size</th>
                  <th className="pb-2 pr-4">Length</th>
                  <th className="pb-2 pr-4">Format</th>
                  <th className="pb-2 pr-4">Location</th>
                  <th className="pb-2">Uploaded</th>
                </tr>
              </thead>
              <tbody>
                {manifest.chunks.map((c) => (
                  <tr key={c.id} className="border-t border-line">
                    <td className="py-2.5 pr-4 text-ink-900">{c.chunk_number}{c.is_last_chunk ? ' (last)' : ''}</td>
                    <td className="py-2.5 pr-4 text-ink-700">{formatBytes(c.file_size)}</td>
                    <td className="py-2.5 pr-4 text-ink-700">{c.duration_seconds != null ? `${c.duration_seconds}s` : '—'}</td>
                    <td className="py-2.5 pr-4 text-ink-700">{c.mime_type || '—'}</td>
                    <td className="py-2.5 pr-4 text-ink-700">
                      {c.latitude != null && c.longitude != null ? `${c.latitude.toFixed(5)}, ${c.longitude.toFixed(5)}` : '—'}
                    </td>
                    <td className="py-2.5 text-ink-500">{formatDateTime(c.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-ink-500">No chunk metadata available</p>
        )}
      </details>
    </div>
  )
}
