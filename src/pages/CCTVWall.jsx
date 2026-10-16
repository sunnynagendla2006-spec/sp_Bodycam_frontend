import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Building2, Settings2 } from 'lucide-react'
import { getStreamingConfig, listBuildings, listBuildingZones } from '../api/buildings.js'
import { friendlyErrorMessage, getToken } from '../api/client.js'
import { useAuth } from '../context/AuthContext.jsx'
import { useOpsSocket } from '../hooks/useOpsSocket.js'
import { EmptyState, ErrorState, LoadingSkeleton, PageHeader } from '../components/Primitives.jsx'
import BuildingSlot from '../components/cctv/BuildingSlot.jsx'
import Pagination from '../components/ui/Pagination.jsx'
import SearchInput from '../components/ui/SearchInput.jsx'
import { LinkButton } from '../components/ui/Button.jsx'
import { canManageCCTV } from '../utils/roles.js'
import { setMaxStreams } from '../utils/streamBudget.js'

// One slot = one building = at most one live stream. A page holds a bounded number of
// slots; only slots actually on screen open video (see BuildingSlot / useInView), and the
// global stream budget caps open connections across the whole page.
const PAGE_SIZE = 12

const CAMERA_STATUS_EVENTS = new Set(['cctv.online', 'cctv.offline', 'cctv.status_changed'])
const BUILDING_RELOAD_EVENTS = new Set([
  'cctv.building_created', 'cctv.building_updated', 'cctv.building_enabled', 'cctv.building_disabled', 'cctv.building_deleted',
  'cctv.registered', 'cctv.updated', 'cctv.deleted', 'cctv.enabled', 'cctv.disabled',
])

export default function CCTVWall() {
  const { user } = useAuth()
  const [config, setConfig] = useState(null)
  const [zones, setZones] = useState([])
  const [zone, setZone] = useState('')
  const [query, setQuery] = useState('')
  const [offset, setOffset] = useState(0)
  const [page, setPage] = useState({ items: [], total: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const filtersRef = useRef({ zone, query, offset })
  filtersRef.current = { zone, query, offset }

  const load = useCallback(async () => {
    const f = filtersRef.current
    try {
      const data = await listBuildings({ zone: f.zone || undefined, q: f.query || undefined, enabled: true, limit: PAGE_SIZE, offset: f.offset })
      setPage({ items: data.items, total: data.total })
      setError('')
    } catch (err) {
      setError(friendlyErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    Promise.all([getStreamingConfig(), listBuildingZones()])
      .then(([cfg, zs]) => {
        if (cancelled) return
        setConfig(cfg)
        setMaxStreams(cfg.max_concurrent_streams)
        setZones(zs)
      })
      .catch((err) => !cancelled && setError(friendlyErrorMessage(err)))
    return () => {
      cancelled = true
    }
  }, [])

  // Reload when the filter, search or page changes (search is debounced).
  useEffect(() => {
    setLoading(true)
    const t = setTimeout(load, query ? 300 : 0)
    return () => clearTimeout(t)
  }, [zone, query, offset, load])

  // Live updates over the existing control-room socket. Camera status events patch the
  // affected slot in place (no refetch, no player reset); structural changes reload the page.
  const reloadTimer = useRef(null)
  useEffect(() => () => clearTimeout(reloadTimer.current), [])
  const handleEvent = useCallback(
    (evt) => {
      const d = evt.data || evt.payload || evt
      if (CAMERA_STATUS_EVENTS.has(evt.event) && d.building_id) {
        setPage((prev) => ({
          ...prev,
          items: prev.items.map((b) =>
            b.id !== d.building_id ? b : { ...b, cameras: b.cameras.map((c) => (c.id === d.camera_id ? { ...c, status: d.status } : c)) },
          ),
        }))
      } else if (evt.event === 'cctv.building_health' && d.building_id) {
        setPage((prev) => ({ ...prev, items: prev.items.map((b) => (b.id === d.building_id ? { ...b, health: d.health } : b)) }))
      } else if (BUILDING_RELOAD_EVENTS.has(evt.event)) {
        clearTimeout(reloadTimer.current)
        reloadTimer.current = setTimeout(load, 500)
      }
    },
    [load],
  )
  useOpsSocket(handleEvent, { enabled: !!getToken() })

  const totalCameras = page.items.reduce((n, b) => n + b.cameras.filter((c) => c.enabled).length, 0)

  return (
    <div>
      <PageHeader
        title="CCTV Wall"
        subtitle="One slot per building, cycling through its cameras. Only slots on screen stream video."
        actions={
          canManageCCTV(user?.role) && (
            <LinkButton to="/cctv/buildings" icon={Settings2}>
              Manage buildings
            </LinkButton>
          )
        }
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <select
          value={zone}
          onChange={(e) => {
            setOffset(0)
            setZone(e.target.value)
          }}
          className="input sm:w-56"
          aria-label="Filter by zone"
        >
          <option value="">All zones</option>
          {zones.map((z) => (
            <option key={z} value={z}>{z}</option>
          ))}
        </select>
        <SearchInput
          value={query}
          onChange={(v) => {
            setOffset(0)
            setQuery(v)
          }}
          placeholder="Search building name or code"
          className="sm:w-72"
        />
        <p className="text-sm text-ink-500 sm:ml-auto">
          {page.total} building{page.total === 1 ? '' : 's'} · {totalCameras} camera{totalCameras === 1 ? '' : 's'} on this page
        </p>
      </div>

      {config && !config.gateway_configured && (
        <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Live video is not configured on this server (media gateway missing). Building and camera status are shown, but no video will play until an administrator sets up the gateway.
        </p>
      )}

      {loading && page.items.length === 0 ? (
        <LoadingSkeleton rows={4} />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : page.items.length === 0 ? (
        <EmptyState icon={Building2} title="No buildings to show" hint={zone || query ? 'Try clearing the filters.' : 'An administrator can register buildings under Manage buildings.'} />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {page.items.map((b) => (
              <BuildingSlot key={b.id} building={b} config={config} />
            ))}
          </div>
          <Pagination offset={offset} pageSize={PAGE_SIZE} count={offset + PAGE_SIZE < page.total ? PAGE_SIZE : 0} onChange={setOffset} />
        </>
      )}
    </div>
  )
}
