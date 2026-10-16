import 'leaflet/dist/leaflet.css'
import { useEffect, useMemo, useRef, useState } from 'react'
import L from 'leaflet'
import { MapContainer, TileLayer, Marker, Popup, Polygon, Circle, Tooltip, useMap } from 'react-leaflet'
import { Link } from 'react-router-dom'
import { MapPin, Navigation, Radio, Wifi, Shield } from 'lucide-react'
import { useOperations } from '../context/OperationsContext.jsx'
import { useConstableLookup } from '../hooks/useConstableLookup.js'
import { LoadingSkeleton, ErrorState, PageHeader } from '../components/Primitives.jsx'
import { Card } from '../components/ui/Card.jsx'
import StatusBadge from '../components/StatusBadge.jsx'
import { formatDateTime, formatRelativeTime } from '../utils/format.js'

// Same three-way palette as StatusBadge's own online/offline tones
const ACTIVE_COLOR = '#22C55E'
const OFFLINE_COLOR = '#EF4444'
const NO_LOCATION_COLOR = '#9CA3AF'

// Zone type color mapping for geographic boundary display
const ZONE_COLORS = {
  ENTRY_POINT: '#3B82F6',
  TEMPLE: '#8B5CF6',
  PARKING: '#F59E0B',
  EMERGENCY_ROUTE: '#EF4444',
  HOLDING_AREA: '#10B981',
  COMMAND_POST: '#06B6D4',
  PERIMETER: '#6366F1',
  VIP_CORRIDOR: '#EC4899',
}

function getZoneColor(zone) {
  if (zone.color) return zone.color
  return ZONE_COLORS[zone.zone_type] || '#6366F1'
}

// Convert GeoJSON polygon coordinates ([lon, lat]) to Leaflet positions ([lat, lon])
function toLeafletPolygon(geojsonPolygon) {
  if (!geojsonPolygon || !Array.isArray(geojsonPolygon.coordinates)) return []
  return geojsonPolygon.coordinates.map((ring) =>
    ring.map(([lon, lat]) => [lat, lon])
  )
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
}

function labeledIcon(color, label) {
  return L.divIcon({
    className: 'live-map-marker',
    html: `<div style="display:flex;flex-direction:column;align-items:center;pointer-events:none;">
      <div style="width:18px;height:18px;border-radius:50%;background:${color};border:3px solid white;box-shadow:0 2px 6px rgba(16,24,40,0.35)"></div>
      <div style="margin-top:3px;padding:2px 8px;background:#fff;color:#101828;font-size:12px;line-height:1.5;border-radius:999px;white-space:nowrap;font-weight:600;box-shadow:0 1px 4px rgba(16,24,40,0.25);">${escapeHtml(label)}</div>
    </div>`,
    iconSize: undefined,
    iconAnchor: [9, 9],
    popupAnchor: [0, -9],
  })
}

function MapController({ mapRef }) {
  const map = useMap()
  useEffect(() => {
    mapRef.current = map
  }, [map, mapRef])
  return null
}

function isActiveStatus(status) {
  return status === 'online' || status === 'recording'
}

function pickDeviceForConstable(devices, constableId) {
  const owned = devices.filter((d) => d.constable_id === constableId)
  if (owned.length === 0) return null
  const withLocation = owned.filter((d) => d.latitude != null && d.longitude != null)
  if (withLocation.length > 0) {
    return withLocation.reduce((a, b) => (new Date(b.location_updated_at || 0) > new Date(a.location_updated_at || 0) ? b : a))
  }
  return owned[0]
}

function constableLabel(c) {
  return c.badge_number || c.phone || String(c.id).slice(0, 8)
}

function computeFreshness(timestamp) {
  if (!timestamp) return { label: 'Unknown', tone: 'neutral' }
  const ageMs = Date.now() - new Date(timestamp).getTime()
  if (ageMs < 60000) return { label: 'Live (<60s)', tone: 'green' }
  if (ageMs < 300000) return { label: 'Delayed', tone: 'amber' }
  return { label: 'Stale (>5m)', tone: 'red' }
}

export default function LiveMap() {
  const { devices, eventZones, officerLocations, presence, loading, error, refresh } = useOperations()
  const { byId, loading: rosterLoading } = useConstableLookup()
  const mapRef = useRef(null)
  const [, setTick] = useState(0)

  // Periodic tick for relative timestamps
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 5000)
    return () => clearInterval(id)
  }, [])

  const rows = useMemo(() => {
    const knownIds = new Set(Object.keys(byId))
    const extraIds = new Set(devices.map((d) => d.constable_id).filter((id) => id && !knownIds.has(id)))
    const allConstables = [
      ...Object.values(byId),
      ...Array.from(extraIds).map((id) => ({ id, badge_number: null, phone: null, station_name: null })),
    ]

    return allConstables.map((c) => {
      const device = pickDeviceForConstable(devices, c.id)
      const loc = officerLocations[c.id]

      // Canonical location resolution: officerLocations projection is authoritative, device record is fallback
      const latitude = loc?.latitude != null ? loc.latitude : device?.latitude ?? null
      const longitude = loc?.longitude != null ? loc.longitude : device?.longitude ?? null
      const accuracy = loc?.accuracy != null ? loc.accuracy : device?.location_accuracy ?? null
      const locationUpdatedAt = loc?.locationUpdatedAt || device?.location_updated_at || null
      const geographicZone = loc?.geographicZone || device?.geographic_zone || null
      const zoneStatus = loc?.zoneStatus || device?.zone_status || null
      const sequenceNumber = loc?.sequenceNumber ?? null
      const source = loc?.source || 'gps'

      const hasLocation = latitude != null && longitude != null
      const active = hasLocation && isActiveStatus(device?.status)
      const category = !hasLocation ? 'no-location' : active ? 'active' : 'offline'

      // Separate AP presence lookup
      const apPresence = presence.find((p) => p.constable_id === c.id) || null
      const freshness = computeFreshness(locationUpdatedAt)

      return {
        constable: c,
        device,
        latitude,
        longitude,
        accuracy,
        locationUpdatedAt,
        geographicZone,
        zoneStatus,
        sequenceNumber,
        source,
        apPresence,
        freshness,
        hasLocation,
        active,
        category,
      }
    })
  }, [byId, devices, officerLocations, presence])

  if (loading || rosterLoading) return <LoadingSkeleton rows={8} />
  if (error) return <ErrorState message={error} onRetry={refresh} />

  const activeRows = rows.filter((r) => r.category === 'active')
  const offlineRows = rows.filter((r) => r.category === 'offline')
  const noLocationRows = rows.filter((r) => r.category === 'no-location')
  const located = rows.filter((r) => r.hasLocation)

  const center =
    located.length > 0
      ? [located[0].latitude, located[0].longitude]
      : [20.5937, 78.9629] // India centroid fallback

  function focusOn(row) {
    if (!row.hasLocation || !mapRef.current) return
    mapRef.current.flyTo([row.latitude, row.longitude], 15, { duration: 0.6 })
  }

  return (
    <div>
      <PageHeader
        title="Live Map"
        subtitle={`${activeRows.length} online, ${offlineRows.length} offline, ${noLocationRows.length} with no location | ${eventZones.length} geographic zones`}
      />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_360px]">
        <Card className="relative h-[55vh] animate-rise-in overflow-hidden lg:h-[72vh]">
          <MapContainer center={center} zoom={located.length > 0 ? 12 : 5} style={{ height: '100%', width: '100%' }}>
            <MapController mapRef={mapRef} />
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url={import.meta.env.VITE_MAP_TILE_URL || "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"}
            />


            {/* Geographic Event Zones Polygons */}
            {eventZones.filter((z) => z.enabled).map((z) => {
              const positions = toLeafletPolygon(z.polygon)
              if (positions.length === 0) return null
              const color = getZoneColor(z)
              return (
                <Polygon
                  key={z.id}
                  positions={positions}
                  pathOptions={{
                    color,
                    fillColor: z.fill_color || color,
                    fillOpacity: 0.18,
                    weight: 2,
                    dashArray: z.zone_type === 'EMERGENCY_ROUTE' ? '6, 6' : undefined,
                  }}
                >
                  <Tooltip sticky>
                    <div className="font-semibold text-xs">
                      {z.name} <span className="text-ink-500">({z.code})</span>
                    </div>
                  </Tooltip>
                  <Popup>
                    <div className="min-w-[200px] space-y-1.5 text-xs">
                      <p className="text-sm font-bold text-ink-900">{z.name}</p>
                      <p className="text-ink-600"><span className="font-semibold">Code:</span> {z.code}</p>
                      <p className="text-ink-600"><span className="font-semibold">Type:</span> {z.zone_type}</p>
                      <p className="text-ink-600"><span className="font-semibold">Priority:</span> {z.priority}</p>
                      {z.description && <p className="text-ink-500 italic">{z.description}</p>}
                    </div>
                  </Popup>
                </Polygon>
              )
            })}

            {/* Officer Accuracy Circles */}
            {located.map((r) => {
              if (r.accuracy == null || r.accuracy <= 0) return null
              const circleColor = r.active ? ACTIVE_COLOR : OFFLINE_COLOR
              return (
                <Circle
                  key={`acc-${r.constable.id}`}
                  center={[r.latitude, r.longitude]}
                  radius={r.accuracy}
                  pathOptions={{
                    color: circleColor,
                    fillColor: circleColor,
                    fillOpacity: 0.08,
                    weight: 1,
                    dashArray: '3, 4',
                  }}
                />
              )
            })}

            {/* Officer Markers */}
            {located.map((r) => (
              <Marker
                key={r.constable.id}
                position={[r.latitude, r.longitude]}
                icon={labeledIcon(r.active ? ACTIVE_COLOR : OFFLINE_COLOR, constableLabel(r.constable))}
              >
                <Popup>
                  <div className="min-w-[220px] space-y-2 text-xs">
                    <div className="flex items-center justify-between gap-2 border-b pb-1.5">
                      <p className="text-sm font-bold text-ink-900">{constableLabel(r.constable)}</p>
                      <StatusBadge status={r.active ? 'online' : 'offline'} label={r.active ? 'Online' : 'Offline'} />
                    </div>
                    {!r.active && <p className="text-xs text-ink-500">Last known location</p>}

                    {/* Freshness Badge */}
                    <div className="flex items-center justify-between text-ink-600">
                      <span>Telemetry:</span>
                      <StatusBadge status={r.freshness.tone} label={r.freshness.label} />
                    </div>

                    {/* Geographic Zone Section */}
                    <div className="rounded-lg bg-surface-muted/60 p-2 space-y-1 border border-line">
                      <div className="flex items-center gap-1.5 font-semibold text-ink-800">
                        <Shield className="h-3.5 w-3.5 text-brand-600" />
                        <span>Geographic Zone (GPS)</span>
                      </div>
                      <p className="text-ink-700">
                        {r.geographicZone ? (
                          <span className="font-medium text-brand-700">{r.geographicZone}</span>
                        ) : (
                          <span className="italic text-ink-500">Outside defined zones</span>
                        )}
                        {r.zoneStatus && <span className="ml-1 text-[10px] text-ink-500">({r.zoneStatus})</span>}
                      </p>
                      {r.accuracy != null && (
                        <p className="text-[11px] text-ink-500">Accuracy: &plusmn;{Math.round(r.accuracy)}m</p>
                      )}
                    </div>

                    {/* AP Association Section */}
                    <div className="rounded-lg bg-surface-muted/60 p-2 space-y-1 border border-line">
                      <div className="flex items-center gap-1.5 font-semibold text-ink-800">
                        <Wifi className="h-3.5 w-3.5 text-emerald-600" />
                        <span>AP Association (Wi-Fi)</span>
                      </div>
                      {r.apPresence ? (
                        <div className="text-ink-700 space-y-0.5">
                          <p><span className="font-medium">{r.apPresence.access_point_code}</span> ({r.apPresence.zone || 'No Zone'})</p>
                          <p className="text-[10px] text-ink-500">
                            RSSI: {r.apPresence.rssi_dbm ? `${r.apPresence.rssi_dbm} dBm` : 'N/A'} | Source: {r.apPresence.source || 'PHYSICAL'}
                          </p>
                        </div>
                      ) : (
                        <p className="italic text-ink-500">Not associated with AP</p>
                      )}
                    </div>

                    <div className="text-ink-500 space-y-0.5 text-[11px] pt-1">
                      <p>Updated: {formatDateTime(r.locationUpdatedAt)}</p>
                      {r.sequenceNumber != null && <p>Seq #{r.sequenceNumber}</p>}
                      {r.constable.station_name && <p>Station: {r.constable.station_name}</p>}
                    </div>

                    {r.device && (
                      <Link to={`/devices/${r.device.id}`} className="block pt-1 font-semibold text-brand-600 hover:underline">
                        View camera details &rarr;
                      </Link>
                    )}
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>

          {/* Map Legend */}
          <div className="absolute bottom-3 left-3 z-[1000] space-y-1 rounded-xl border border-line bg-surface/95 px-3 py-2 text-xs text-ink-700 shadow-lift backdrop-blur">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: ACTIVE_COLOR }} /> Online officer
            </div>
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: OFFLINE_COLOR }} /> Offline officer
            </div>
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-sm border border-brand-500 bg-brand-500/20" /> Event Zone
            </div>
          </div>
        </Card>

        {/* Sidebar */}
        <Card className="max-h-[60vh] animate-rise-in overflow-y-auto p-4 lg:h-[72vh] lg:max-h-none">
          <SidebarSection title="Online now" tone="active" rows={activeRows} onSelect={focusOn} />
          <SidebarSection title="Offline - last known place" tone="offline" rows={offlineRows} onSelect={focusOn} />
          <SidebarSection title="No location yet" tone="no-location" rows={noLocationRows} onSelect={focusOn} />
          {rows.length === 0 && <p className="text-sm text-ink-500">No constables to display.</p>}
        </Card>
      </div>
    </div>
  )
}

function SidebarSection({ title, tone, rows, onSelect }) {
  if (rows.length === 0) return null
  const dotColor = tone === 'active' ? ACTIVE_COLOR : tone === 'offline' ? OFFLINE_COLOR : NO_LOCATION_COLOR
  return (
    <div className="mb-5 last:mb-0">
      <h3 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-ink-500">{title}</h3>
      <div className="space-y-2">
        {rows.map((r) => (
          <button
            key={r.constable.id}
            type="button"
            onClick={() => onSelect(r)}
            disabled={!r.hasLocation}
            className={`flex w-full items-center gap-3 rounded-xl border border-line px-3.5 py-3 text-left text-sm transition-all duration-150 ${
              r.hasLocation ? 'cursor-pointer hover:-translate-y-0.5 hover:border-brand-200 hover:bg-brand-50/50 hover:shadow-card' : 'cursor-default opacity-70'
            }`}
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full" style={{ background: `${dotColor}1A`, color: dotColor }}>
              {r.hasLocation ? <Navigation className="h-4 w-4" aria-hidden="true" /> : <MapPin className="h-4 w-4" aria-hidden="true" />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center justify-between gap-1">
                <span className="truncate font-medium text-ink-900">{constableLabel(r.constable)}</span>
                {r.hasLocation && r.freshness && (
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                    r.freshness.tone === 'green' ? 'bg-emerald-100 text-emerald-800' :
                    r.freshness.tone === 'amber' ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-800'
                  }`}>
                    {r.freshness.label}
                  </span>
                )}
              </span>
              <span className="block text-xs text-ink-500">
                {tone === 'no-location' ? (
                  'No location reported yet'
                ) : (
                  <span>
                    {r.geographicZone ? `Zone: ${r.geographicZone}` : 'Outside Zone'} &middot; {formatRelativeTime(r.locationUpdatedAt)}
                  </span>
                )}
              </span>
              {r.apPresence && (
                <span className="mt-0.5 flex items-center gap-1 text-[11px] text-brand-600 font-medium">
                  <Wifi className="h-3 w-3" /> AP: {r.apPresence.access_point_code}
                </span>
              )}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

