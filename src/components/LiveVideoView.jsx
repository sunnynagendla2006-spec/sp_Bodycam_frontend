import { Loader2, TriangleAlert, X } from 'lucide-react'
import { useLiveStreamFeed } from '../hooks/useLiveStreamFeed.js'
import Button from './ui/Button.jsx'
import StatusBadge from './StatusBadge.jsx'
import LiveTrackVideo from './LiveTrackVideo.jsx'

// Subscribe-only viewer for one live-stream session. Any number of these
// can be mounted concurrently (in this tab, in other admins' own browser
// tabs/sessions) against the SAME session_id -- each gets its own
// subscribe-only LiveKit token and its own Room connection; the LiveKit
// SFU handles fanning the same camera feed out to all of them. Nothing
// here ever writes the video anywhere -- it's attached directly to a
// <video> element and discarded on unmount/disconnect.
export default function LiveVideoView({ sessionId, onClose }) {
  const { status, error, videoTrack } = useLiveStreamFeed(sessionId)

  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
      <div className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
        <span className="flex items-center gap-2 font-medium text-ink-700">
          {status === 'connecting' && (
            <>
              <Loader2 className="h-4 w-4 animate-spin text-ink-500" aria-hidden="true" />
              Connecting…
            </>
          )}
          {status === 'live' && <StatusBadge status="live" />}
          {status === 'ended' && 'Live view ended'}
          {status === 'error' && (
            <span className="flex items-center gap-2 text-signal-red">
              <TriangleAlert className="h-4 w-4" aria-hidden="true" />
              {error || 'Could not connect'}
            </span>
          )}
        </span>
        {onClose && (
          <Button variant="secondary" size="sm" icon={X} onClick={onClose}>
            Close
          </Button>
        )}
      </div>
      <LiveTrackVideo track={videoTrack} className="aspect-video w-full bg-black" />
    </div>
  )
}
