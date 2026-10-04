import { useEffect, useRef, useState } from 'react'
import { Pause, Play } from 'lucide-react'

/**
 * Renders a LiveKit VideoTrack into its own <video> element. Multiple
 * instances can attach() the SAME track at once (a small CCTV-wall tile
 * and the big "currently watching" panel, for example) -- each gets its
 * own element and its own independent pause state, without opening a
 * second network connection for the same feed.
 *
 * "Pause" only freezes this element's local playback (the network stream
 * keeps flowing in the background) -- pressing it again resumes live,
 * it never rewinds, since this is a live feed with nothing buffered to
 * seek back to.
 */
export default function LiveTrackVideo({ track, className, showControls = true }) {
  const videoRef = useRef(null)
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    const el = videoRef.current
    if (track && el) {
      track.attach(el)
      return () => track.detach(el)
    }
  }, [track])

  function togglePause() {
    const el = videoRef.current
    if (!el) return
    if (paused) {
      el.play()
      setPaused(false)
    } else {
      el.pause()
      setPaused(true)
    }
  }

  return (
    <div className="group relative h-full w-full">
      <video ref={videoRef} autoPlay playsInline muted={false} className={className} />
      {showControls && track && (
        <button
          type="button"
          title={paused ? 'Resume' : 'Pause'}
          aria-label={paused ? 'Resume live view' : 'Pause live view'}
          onClick={(e) => {
            e.stopPropagation()
            togglePause()
          }}
          className="absolute bottom-2.5 right-2.5 flex h-8 w-8 items-center justify-center rounded-lg bg-black/60 text-white opacity-0 transition-opacity hover:bg-black/80 group-hover:opacity-100 focus-visible:opacity-100"
        >
          {paused ? <Play className="h-4 w-4" aria-hidden="true" /> : <Pause className="h-4 w-4" aria-hidden="true" />}
        </button>
      )}
    </div>
  )
}
