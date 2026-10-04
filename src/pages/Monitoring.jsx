import { lazy, Suspense, useState } from 'react'
import { Camera, CircleDot, Clock, Eye, MapPin, Radio, Square, SwitchCamera, Video } from 'lucide-react'
import { useAuth } from '../context/AuthContext.jsx'
import { useToast } from '../context/ToastContext.jsx'
import { useOperations } from '../context/OperationsContext.jsx'
import { useConstableLookup } from '../hooks/useConstableLookup.js'
import { issueCommand } from '../api/commands.js'
import { friendlyErrorMessage } from '../api/client.js'
import { LoadingSkeleton, ErrorState, EmptyState, ConfirmDialog, PageHeader } from '../components/Primitives.jsx'
import StatusBadge from '../components/StatusBadge.jsx'
import Battery from '../components/ui/Battery.jsx'
import FilterTabs from '../components/ui/FilterTabs.jsx'
import SearchInput from '../components/ui/SearchInput.jsx'
import { canIssueCommands } from '../utils/roles.js'
import { formatElapsed, formatRelativeTime } from '../utils/format.js'
import { statusLabel } from '../utils/labels.js'

// Only pulls in the LiveKit SDK once something is actually being watched.
const LiveVideoView = lazy(() => import('../components/LiveVideoView.jsx'))

const STATUS_FILTERS = ['', 'online', 'recording', 'stale', 'offline']

const CARD_BORDER = {
  offline: 'border-red-200',
  stale: 'border-amber-200',
  recording: 'border-red-200',
}

// Small icon-only button for a card's control row -- same visual language
// everywhere (recording, live view, camera switch), never a labeled
// full-size Button: the whole point of this redesign is everything a
// camera needs fits ON the card itself, CCTV-wall style, with no second
// page to click through to.
function IconAction({ icon: Icon, tone = 'default', disabled, title, onClick }) {
  const TONES = {
    default: 'bg-line/60 text-ink-700 hover:bg-line disabled:opacity-40',
    danger: 'bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-40',
  }
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors disabled:pointer-events-none ${TONES[tone]}`}
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
    </button>
  )
}

export default function Monitoring() {
  const { user } = useAuth()
  const { notify } = useToast()
  const { devices, recordings, liveStreams, loading, error, refresh } = useOperations()
  const { label: constableLabel } = useConstableLookup()
  const [statusFilter, setStatusFilter] = useState('')
  const [search, setSearch] = useState('')
  const [watchingId, setWatchingId] = useState(null)
  const [confirming, setConfirming] = useState(null) // { device, type } | null
  const [busy, setBusy] = useState(false)

  if (loading) return <LoadingSkeleton rows={8} />
  if (error) return <ErrorState message={error} onRetry={refresh} />

  const canControl = canIssueCommands(user?.role)
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

  const watchingDevice = devices.find((d) => d.id === watchingId)
  const watchingLive = watchingDevice && liveByDevice[watchingDevice.id]

  const DIALOGS = {
    start_recording: (name) => ({ title: 'Start emergency recording?', message: `Ask ${name}'s camera to start recording right now?` }),
    stop_recording: (name) => ({ title: 'Stop recording?', message: `Ask ${name}'s camera to stop recording?` }),
    start_live_stream: (name) => ({ title: 'Request live view?', message: `Ask ${name}'s camera to turn on and show live video? It is only shown on screen, never saved.` }),
    stop_live_stream: (name) => ({ title: 'Stop live view?', message: `Ask ${name}'s camera to stop sharing live video?` }),
    switch_camera_front: (name) => ({ title: 'Switch to front camera?', message: `${name}'s phone will use the front camera from its next recording.` }),
    switch_camera_back: (name) => ({ title: 'Switch to back camera?', message: `${name}'s phone will use the back camera from its next recording.` }),
  }

  async function handleConfirm() {
    if (!confirming) return
    setBusy(true)
    try {
      await issueCommand(confirming.device.id, confirming.type)
      notify('Sent to the camera', { tone: 'success' })
      if (confirming.type === 'start_live_stream') setWatchingId(confirming.device.id)
      setConfirming(null)
    } catch (err) {
      notify(friendlyErrorMessage(err), { tone: 'error' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <PageHeader title="Body Cameras" subtitle="Every constable's camera and how it is doing right now" />

      {/* Currently watching -- the "big screen" for whichever camera was
          last clicked below, exactly like picking a camera on a CCTV
          wall to bring up its feed. */}
      {watchingDevice && (
        <div className="mb-6 animate-rise-in overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
          <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                <Camera className="h-4 w-4" aria-hidden="true" />
              </span>
              <p className="font-semibold text-ink-900">Watching: {constableLabel(watchingDevice.constable_id)}</p>
            </div>
            <button type="button" onClick={() => setWatchingId(null)} className="text-sm font-medium text-ink-500 hover:text-ink-900">
              Close
            </button>
          </div>
          <div className="bg-black">
            {watchingLive ? (
              <Suspense fallback={<div className="flex aspect-video items-center justify-center text-sm text-white/60">Loading player…</div>}>
                <LiveVideoView sessionId={watchingLive.id} />
              </Suspense>
            ) : (
              <div className="flex aspect-video flex-col items-center justify-center gap-2 text-white/60">
                <Video className="h-8 w-8" aria-hidden="true" />
                <p className="text-sm">Not sharing live video right now.</p>
                {canControl && watchingDevice.status !== 'offline' && (
                  <button
                    type="button"
                    onClick={() => setConfirming({ device: watchingDevice, type: 'start_live_stream' })}
                    className="mt-1 rounded-lg bg-white/10 px-3 py-1.5 text-sm font-medium text-white hover:bg-white/20"
                  >
                    Request live view
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="mb-5 space-y-3">
        <SearchInput value={search} onChange={setSearch} placeholder="Search by constable name" className="sm:max-w-sm" />
        <FilterTabs options={tabs} value={statusFilter} onChange={setStatusFilter} label="Filter by camera status" />
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={Camera} title="No cameras found" hint="Try a different search or filter." />
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 2xl:grid-cols-3">
          {filtered.map((d, i) => {
            const activeRecording = recordingByDevice[d.id]
            const activeLive = liveByDevice[d.id]
            const isOffline = d.status === 'offline'
            const isWatching = watchingId === d.id
            const name = constableLabel(d.constable_id)

            return (
              <div
                key={d.id}
                role="button"
                tabIndex={0}
                onClick={() => setWatchingId(d.id)}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setWatchingId(d.id)}
                style={{ '--i': Math.min(i, 12) }}
                className={`card card-hover stagger block animate-rise-in cursor-pointer overflow-hidden p-0 ${CARD_BORDER[d.status] || ''} ${isWatching ? 'ring-2 ring-brand-500' : ''}`}
              >
                <div className="flex items-center justify-between gap-3 px-5 pt-5">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                      <Camera className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <p className="truncate font-semibold text-ink-900">{name}</p>
                  </div>
                  <StatusBadge status={d.status} />
                </div>

                {/* "Screen" -- the CCTV-tile look. Never opens its own
                    live connection: a tile that's currently the "big
                    screen" above would otherwise open a SECOND LiveKit
                    connection for the exact same feed, doubling bandwidth
                    for nothing -- it just mirrors that it's the one being
                    watched. Every tile stays a cheap status tile, so 9+
                    cameras on screen never means 9+ live video
                    connections at once. */}
                <div className="relative mt-4 flex aspect-video items-center justify-center bg-ink-900/90 text-white/70">
                  <Camera className="h-8 w-8" aria-hidden="true" />
                  {activeLive && (
                    <span className="absolute left-2.5 top-2.5 inline-flex items-center gap-1 rounded-full bg-signal-red px-2 py-0.5 text-[11px] font-semibold text-white">
                      <span className="h-1.5 w-1.5 animate-ping-soft rounded-full bg-white" />
                      LIVE
                    </span>
                  )}
                  {isWatching && (
                    <span className="absolute right-2.5 top-2.5 rounded-full bg-brand-600 px-2 py-0.5 text-[11px] font-semibold text-white">Showing above</span>
                  )}
                  {!activeLive && isOffline && <span className="absolute bottom-2.5 text-xs">Offline</span>}
                </div>

                <div className="space-y-3 px-5 pb-5 pt-4">
                  {/* Controls -- small icons only, right on the card. */}
                  {canControl && (
                    <div className="flex items-center gap-2">
                      {activeRecording ? (
                        <IconAction icon={Square} tone="danger" title="Stop recording" disabled={isOffline} onClick={() => setConfirming({ device: d, type: 'stop_recording' })} />
                      ) : (
                        <IconAction icon={CircleDot} tone="danger" title="Start recording" disabled={isOffline} onClick={() => setConfirming({ device: d, type: 'start_recording' })} />
                      )}
                      {activeLive ? (
                        <IconAction icon={Eye} title="Watch live" onClick={() => setWatchingId(d.id)} />
                      ) : (
                        <IconAction icon={Video} title="Request live view" disabled={isOffline} onClick={() => setConfirming({ device: d, type: 'start_live_stream' })} />
                      )}
                      <IconAction icon={SwitchCamera} title="Switch to front camera" disabled={isOffline} onClick={() => setConfirming({ device: d, type: 'switch_camera_front' })} />
                      <IconAction icon={SwitchCamera} title="Switch to back camera" disabled={isOffline} onClick={() => setConfirming({ device: d, type: 'switch_camera_back' })} />
                    </div>
                  )}

                  {activeRecording && (
                    <p className="flex items-center gap-2 text-sm font-medium text-signal-red">
                      <Radio className="h-4 w-4" aria-hidden="true" />
                      Recording for {formatElapsed(activeRecording.started_at)}
                    </p>
                  )}

                  {/* Info spread above/below the screen, not crammed into
                      one grid -- battery+last-active on one line, location
                      on the next. */}
                  <div className="flex items-center justify-between border-t border-line pt-3 text-sm text-ink-900">
                    <Battery percent={d.battery_percent} charging={d.is_charging} />
                    <span className="flex items-center gap-1.5 text-ink-500">
                      <Clock className="h-4 w-4" aria-hidden="true" />
                      {formatRelativeTime(d.last_seen_at)}
                    </span>
                  </div>
                  <p className="flex items-center gap-1.5 text-sm text-ink-500">
                    <MapPin className="h-4 w-4 shrink-0" aria-hidden="true" />
                    {d.latitude != null ? `Updated ${formatRelativeTime(d.location_updated_at)}` : 'Location not available'}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <ConfirmDialog
        open={!!confirming}
        title={confirming && DIALOGS[confirming.type](constableLabel(confirming.device.constable_id)).title}
        message={confirming && DIALOGS[confirming.type](constableLabel(confirming.device.constable_id)).message}
        confirmLabel="Send now"
        tone={confirming?.type === 'stop_live_stream' || confirming?.type === 'stop_recording' ? 'danger' : 'default'}
        busy={busy}
        onCancel={() => setConfirming(null)}
        onConfirm={handleConfirm}
      />
    </div>
  )
}
