import { useEffect, useRef, useState } from 'react'

/**
 * True while the referenced element is meaningfully on screen. Slots outside the
 * viewport use this to close their video session and keep only light status data.
 * Falls back to "visible" where IntersectionObserver does not exist.
 */
export function useInView(threshold = 0.25) {
  const ref = useRef(null)
  const [inView, setInView] = useState(typeof IntersectionObserver === 'undefined')

  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') return undefined
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), { threshold })
    observer.observe(el)
    return () => observer.disconnect()
  }, [threshold])

  return [ref, inView]
}

/** False while the browser tab is hidden, so streams and timers stop in background tabs. */
export function usePageVisible() {
  const [visible, setVisible] = useState(typeof document === 'undefined' ? true : document.visibilityState !== 'hidden')
  useEffect(() => {
    const onChange = () => setVisible(document.visibilityState !== 'hidden')
    document.addEventListener('visibilitychange', onChange)
    return () => document.removeEventListener('visibilitychange', onChange)
  }, [])
  return visible
}
