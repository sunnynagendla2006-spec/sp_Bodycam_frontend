import { useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { friendlyErrorMessage } from '../../api/client.js'
import { WhepSession } from '../../utils/whep.js'

/**
 * A single live camera view (used by the camera detail dialog). Opens one WebRTC
 * session on mount, closes it on unmount. `getPlayback` must return the short-lived
 * playback token and WHEP URL; it is called once per session.
 */
export default function CameraPlayer({ getPlayback, label }) {
  const videoRef = useRef(null)
  const [state, setState] = useState({ status: 'connecting', message: '' })

  useEffect(() => {
    let cancelled = false
    const session = new WhepSession({
      getPlayback,
      onFailure: (err) => !cancelled && setState({ status: 'error', message: err.message }),
    })
    session
      .connect()
      .then((stream) => {
        if (cancelled) return
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          videoRef.current.play?.().catch(() => {})
        }
        setState({ status: 'playing', message: '' })
      })
      .catch((err) => {
        if (!cancelled) setState({ status: 'error', message: err?.code ? err.message : friendlyErrorMessage(err) })
      })
    const el = videoRef.current
    return () => {
      cancelled = true
      session.close()
      if (el) el.srcObject = null
    }
  }, [getPlayback])

  return (
    <div className="absolute inset-0 bg-ink-900">
      <video ref={videoRef} className="h-full w-full object-contain" muted playsInline autoPlay aria-label={label || 'Live camera view'} />
      {state.status === 'connecting' && (
        <div className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-white">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> Connecting…
        </div>
      )}
      {state.status === 'error' && (
        <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-ink-300">{state.message || 'Playback failed'}</div>
      )}
    </div>
  )
}
