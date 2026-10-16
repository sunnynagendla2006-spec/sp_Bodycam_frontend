import { useCallback, useEffect, useRef, useState } from 'react'
import { getSummary } from '../api/sites.js'
import { friendlyErrorMessage, getToken } from '../api/client.js'
import { useOpsSocket } from './useOpsSocket.js'

const REFRESH_MS = 60000 // safety net only: updates normally arrive over the WebSocket
const RECENT_ROAMS = 20

/**
 * Live state of one site: the authoritative summary (REST) kept current by the
 * existing control-room WebSocket. Events are aggregate-only (counts, AP ids), never
 * client identifiers. Exposes connection state and the age of the data so the UI can
 * show "reconnecting" and "stale" honestly.
 */
export function useSiteLive(siteId) {
  const [summary, setSummary] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [roams, setRoams] = useState([])
  const [lastUpdate, setLastUpdate] = useState(null)
  const idRef = useRef(siteId)
  idRef.current = siteId

  const load = useCallback(async () => {
    const id = idRef.current
    if (!id) return
    try {
      const data = await getSummary(id)
      if (idRef.current !== id) return
      setSummary(data)
      setError('')
      setLastUpdate(new Date())
    } catch (err) {
      setError(friendlyErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    setSummary(null)
    setRoams([])
    setLoading(true)
    load()
    const t = setInterval(load, REFRESH_MS)
    return () => clearInterval(t)
  }, [siteId, load])

  const handleEvent = useCallback(
    (evt) => {
      const d = evt.data
      if (!d || d.site_id !== idRef.current) return
      if (evt.event === 'network.counts') {
        setSummary((prev) => {
          if (!prev) return prev
          const patchList = (list, counts, levels) => list.map((i) => ({ ...i, active_clients: counts?.[i.id] ?? i.active_clients, level: levels ? levels[i.id] ?? null : i.level }))
          return {
            ...prev,
            total_active_clients: d.total_active_clients,
            quality: d.quality,
            stale: d.stale,
            open_breaches: d.open_breaches,
            by_zone: patchList(prev.by_zone, d.by_zone, d.zone_levels),
            by_ap: patchList(prev.by_ap, d.by_ap, d.ap_levels),
            by_floor: patchList(prev.by_floor, d.by_floor, null),
          }
        })
        setLastUpdate(new Date())
      } else if (evt.event === 'network.roam') {
        setRoams((prev) => [{ ...d, key: `${d.at}-${d.from_ap_id}-${d.to_ap_id}-${Math.random()}` }, ...prev].slice(0, RECENT_ROAMS))
      } else if (evt.event === 'network.health' || evt.event === 'network.breach') {
        load()
      }
    },
    [load],
  )
  const { connected } = useOpsSocket(handleEvent, { enabled: !!getToken() && !!siteId })

  return { summary, loading, error, roams, connected, lastUpdate, reload: load }
}
