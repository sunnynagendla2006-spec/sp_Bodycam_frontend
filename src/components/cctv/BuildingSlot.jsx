import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Loader2, Pause, Play, RefreshCw, VideoOff } from 'lucide-react'
import { Card } from '../ui/Card.jsx'
import StatusBadge from '../StatusBadge.jsx'
import { reportPlayback } from '../../api/buildings.js'
import { useCameraRotation } from '../../hooks/useCameraRotation.js'
import { useCameraStreams } from '../../hooks/useCameraStreams.js'
import { useInView, usePageVisible } from '../../hooks/useInView.js'

const REPORT_MIN_INTERVAL_MS = 15000

const DOT = { online: 'bg-emerald-500', degraded: 'bg-amber-500', offline: 'bg-red-500', unknown: 'bg-slate-400', disabled: 'bg-slate-300' }

function Overlay({ icon: Icon, spin = false, title, detail, action }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-ink-900/85 px-4 text-center text-white">
      {Icon && <Icon className={`h-7 w-7 ${spin ? 'animate-spin' : ''}`} aria-hidden="true" />}
      <p className="text-sm font-semibold">{title}</p>
      {detail && <p className="max-w-xs text-xs text-ink-300">{detail}</p>}
      {action}
    </div>
  )
}

/**
 * ONE control-room slot for ONE building. Rotates through the building's cameras
 * on its own timer (default every 5 s), holds at most one live stream (plus one
 * optional warm stream), and releases everything when it is off screen, the tab is
 * hidden, the building is disabled, or the slot unmounts.
 */
function BuildingSlot({ building, config }) {
  const [rootRef, inView] = useInView(0.3)
  const pageVisible = usePageVisible()
  const [paused, setPaused] = useState(false)

  const gatewayReady = !!config?.gateway_configured
  const slotActive = inView && pageVisible && building.enabled && gatewayReady

  const rotation = useCameraRotation({
    cameras: building.cameras,
    dwellMs: (config?.rotation_seconds || 5) * 1000,
    running: slotActive && !paused,
  })
  const { current, currentId, nextId, markFailed } = rotation

  const lastReport = useRef(0)
  const erroredIds = useRef(new Set())
  const handleFailure = useCallback(
    (cameraId, info) => {
      markFailed(cameraId)
      erroredIds.current.add(cameraId)
      const now = Date.now()
      if (now - lastReport.current >= REPORT_MIN_INTERVAL_MS) {
        lastReport.current = now
        reportPlayback(cameraId, 'error', info.message)
      }
    },
    [markFailed],
  )

  const streamWanted = slotActive && !!current && current.status !== 'offline'
  const stream = useCameraStreams({ currentId, nextId, active: streamWanted, prefetch: !!config?.prefetch_next, onFailure: handleFailure })

  // Tell the backend when a camera that failed earlier plays again.
  useEffect(() => {
    if (stream.status === 'playing' && currentId && erroredIds.current.has(currentId)) {
      erroredIds.current.delete(currentId)
      reportPlayback(currentId, 'recovered')
    }
  }, [stream.status, currentId])

  const videoRef = useRef(null)
  useEffect(() => {
    const el = videoRef.current
    if (!el) return undefined
    el.srcObject = stream.stream || null
    if (stream.stream) el.play?.()?.catch(() => {})
    return () => {
      el.srcObject = null
    }
  }, [stream.stream])

  const enabledCams = building.cameras.filter((c) => c.enabled)

  let overlay = null
  if (!building.enabled) overlay = <Overlay icon={VideoOff} title="Building disabled" />
  else if (enabledCams.length === 0) overlay = <Overlay icon={VideoOff} title="No cameras configured" detail="An administrator can add cameras to this building." />
  else if (!gatewayReady) overlay = <Overlay icon={VideoOff} title="Live video not configured" detail="The media gateway is not set up on this server." />
  else if (!pageVisible) overlay = <Overlay icon={Pause} title="Paused (tab hidden)" />
  else if (!inView) overlay = <Overlay icon={Pause} title="Paused (off screen)" />
  else if (current && current.status === 'offline') overlay = <Overlay icon={VideoOff} title="Camera offline" detail={current.last_error || current.name} />
  else if (stream.status === 'error')
    overlay = (
      <Overlay
        icon={VideoOff}
        title="Stream unavailable"
        detail={stream.error}
        action={
          <button type="button" onClick={stream.retry} className="mt-1 inline-flex items-center gap-1.5 rounded-lg bg-white/15 px-3 py-1.5 text-xs font-medium hover:bg-white/25">
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> Retry
          </button>
        }
      />
    )
  else if (stream.status === 'capacity') overlay = <Overlay icon={Loader2} spin title="Waiting for a free stream slot…" />
  else if (stream.status === 'connecting') overlay = <Overlay icon={Loader2} spin title={`Connecting to ${current?.name || 'camera'}…`} />

  const zoneLabel = building.zone || 'No zone'

  return (
    <div ref={rootRef}>
    <Card className="overflow-hidden" data-testid={`building-slot-${building.code}`}>
      <div className="flex items-start justify-between gap-2 px-3 pb-2 pt-3">
        <div className="min-w-0">
          <p className="truncate font-semibold text-ink-900" title={building.name}>{building.name}</p>
          <p className="truncate text-xs text-ink-500">{zoneLabel}{building.address ? ` · ${building.address}` : ''}</p>
        </div>
        <StatusBadge status={building.health === 'empty' ? 'unknown' : building.health} label={building.health === 'empty' ? 'No cameras' : undefined} />
      </div>

      <div className="relative aspect-video w-full bg-ink-900">
        <video ref={videoRef} className="h-full w-full object-cover" muted playsInline autoPlay aria-label={current ? `Live view: ${current.name}` : 'Live view'} />
        {overlay}
        {current && !overlay && (
          <div className="pointer-events-none absolute left-2 top-2 rounded-md bg-ink-900/70 px-2 py-1 text-xs font-medium text-white">
            {current.name}{current.channel ? ` · CH ${current.channel}` : ''}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 px-3 py-2.5">
        <div className="flex items-center gap-1">
          <button type="button" onClick={rotation.prev} disabled={enabledCams.length < 2} aria-label="Previous camera" className="rounded-lg p-1.5 text-ink-600 hover:bg-line/60 disabled:opacity-40">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => setPaused((p) => !p)} aria-pressed={paused} aria-label={paused ? 'Resume rotation' : 'Pause rotation'} className="rounded-lg p-1.5 text-ink-600 hover:bg-line/60">
            {paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
          </button>
          <button type="button" onClick={rotation.next} disabled={enabledCams.length < 2} aria-label="Next camera" className="rounded-lg p-1.5 text-ink-600 hover:bg-line/60 disabled:opacity-40">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <span className="text-xs text-ink-500" aria-live="off">{rotation.position > 0 ? `${rotation.position}/${rotation.total}` : '—'}{paused ? ' · paused' : ''}</span>
      </div>

      {enabledCams.length > 0 && (
        <div className="flex flex-wrap gap-1.5 px-3 pb-3" role="group" aria-label="Cameras">
          {enabledCams.map((cam, i) => (
            <button
              key={cam.id}
              type="button"
              onClick={() => {
                rotation.select(cam.id)
                setPaused(true) // looking at a specific camera: hold it until the operator resumes
              }}
              aria-current={cam.id === currentId}
              title={`${cam.name} (${cam.status})`}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-xs ${cam.id === currentId ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-line text-ink-600 hover:border-ink-400'}`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${DOT[cam.status] || DOT.unknown}`} aria-hidden="true" />
              {cam.channel || i + 1}
            </button>
          ))}
        </div>
      )}
    </Card>
    </div>
  )
}

export default memo(BuildingSlot)
