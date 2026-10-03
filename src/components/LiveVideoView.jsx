import { useEffect, useRef, useState } from 'react'
import { Room, RoomEvent, Track } from 'livekit-client'
import { Loader2, TriangleAlert, X } from 'lucide-react'
import { getViewerToken } from '../api/liveStream'
import { friendlyErrorMessage } from '../api/client'
import Button from './ui/Button.jsx'
import StatusBadge from './StatusBadge.jsx'

// Subscribe-only viewer for one live-stream session. Any number of these
// can be mounted concurrently (in this tab, in other admins' own browser
// tabs/sessions) against the SAME session_id -- each gets its own
// subscribe-only LiveKit token and its own Room connection; the LiveKit
// SFU handles fanning the same camera feed out to all of them. Nothing
// here ever writes the video anywhere -- it's attached directly to a
// <video> element and discarded on unmount/disconnect.
export default function LiveVideoView({ sessionId, onClose }) {
  const videoRef = useRef(null)
  const roomRef = useRef(null)
  const [status, setStatus] = useState('connecting') // connecting | live | error | ended
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    const room = new Room()
    roomRef.current = room

    function attachIfVideo(track) {
      if (track.kind === Track.Kind.Video && videoRef.current) {
        track.attach(videoRef.current)
        setStatus('live')
      }
    }

    room.on(RoomEvent.TrackSubscribed, (track) => attachIfVideo(track))
    room.on(RoomEvent.Disconnected, () => {
      if (!cancelled) setStatus('ended')
    })

    async function connect() {
      try {
        const { livekit_url: url, token } = await getViewerToken(sessionId)
        if (cancelled) return
        await room.connect(url, token)
        // Pick up any track already publishing before we joined.
        for (const participant of room.remoteParticipants.values()) {
          for (const publication of participant.trackPublications.values()) {
            if (publication.track) attachIfVideo(publication.track)
          }
        }
      } catch (err) {
        if (!cancelled) {
          setStatus('error')
          setError(friendlyErrorMessage(err))
        }
      }
    }
    connect()

    return () => {
      cancelled = true
      room.disconnect()
    }
  }, [sessionId])

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
      <video ref={videoRef} autoPlay playsInline muted={false} className="aspect-video w-full bg-black" />
    </div>
  )
}
