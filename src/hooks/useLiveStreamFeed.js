import { useEffect, useState } from 'react'
import { getViewerToken } from '../api/liveStream'
import { friendlyErrorMessage } from '../api/client'

// How long "Connecting…" is allowed to show with no video track before
// treated as a real failure. Joining the LiveKit room itself succeeds
// even when nobody is actually publishing (e.g. the camera is offline or
// never started) -- without this, that left the UI spinning on
// "Connecting…" forever with no way to tell the operator anything was
// wrong.
const NO_VIDEO_TIMEOUT_MS = 15000

/**
 * Opens exactly ONE subscribe-only LiveKit connection for a session and
 * hands back the live VideoTrack, so any number of places in the UI
 * (a small CCTV-wall tile AND a big "currently watching" panel, for
 * example) can render the SAME feed via LiveTrackVideo without each
 * opening its own Room connection -- a track can be attach()ed to
 * multiple <video> elements at once, so there is never a reason to
 * duplicate the connection itself just to show it in two places.
 *
 * `livekit-client` is dynamically imported INSIDE the effect (never a
 * top-level import here) specifically so calling this hook at all
 * doesn't pull the whole SDK into whichever page's bundle calls it --
 * Monitoring.jsx (the CCTV wall) needs to call this unconditionally at
 * the top of the component, which a React.lazy()'d component can't do
 * for it from the outside.
 */
export function useLiveStreamFeed(sessionId) {
  const [status, setStatus] = useState('connecting') // connecting | live | error | ended
  const [error, setError] = useState('')
  const [videoTrack, setVideoTrack] = useState(null)

  useEffect(() => {
    if (!sessionId) {
      setStatus('connecting')
      setVideoTrack(null)
      return
    }
    let cancelled = false
    let room = null

    const noVideoTimer = setTimeout(() => {
      if (!cancelled) {
        setStatus('error')
        setError('No video received from the camera. It may be offline or not actually sharing video.')
      }
    }, NO_VIDEO_TIMEOUT_MS)

    async function connect() {
      const { Room, RoomEvent, Track } = await import('livekit-client')
      if (cancelled) return
      room = new Room()

      function handleTrack(track) {
        if (track.kind === Track.Kind.Video) {
          clearTimeout(noVideoTimer)
          setVideoTrack(track)
          setStatus('live')
        }
      }

      room.on(RoomEvent.TrackSubscribed, (track) => handleTrack(track))
      room.on(RoomEvent.Disconnected, () => {
        if (!cancelled) setStatus('ended')
      })

      try {
        const { livekit_url: url, token } = await getViewerToken(sessionId)
        if (cancelled) return
        await room.connect(url, token)
        // Pick up any track already publishing before we joined.
        for (const participant of room.remoteParticipants.values()) {
          for (const publication of participant.trackPublications.values()) {
            if (publication.track) handleTrack(publication.track)
          }
        }
      } catch (err) {
        if (!cancelled) {
          clearTimeout(noVideoTimer)
          setStatus('error')
          setError(friendlyErrorMessage(err))
        }
      }
    }
    connect()

    return () => {
      cancelled = true
      clearTimeout(noVideoTimer)
      setVideoTrack(null)
      room?.disconnect()
    }
  }, [sessionId])

  return { status, error, videoTrack }
}
