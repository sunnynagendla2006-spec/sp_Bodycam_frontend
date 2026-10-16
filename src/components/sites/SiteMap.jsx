import { useEffect, useMemo } from 'react'
import { CircleMarker, MapContainer, Polygon, TileLayer, Tooltip, useMap } from 'react-leaflet'
import { LEVEL_COLOR, levelColor, ringsToLatLng, STATE_COLOR } from '../../utils/siteLevels.js'

function FitBounds({ points }) {
  const map = useMap()
  useEffect(() => {
    if (points.length === 0) return
    if (points.length === 1) {
      map.setView(points[0], 17)
      return
    }
    map.fitBounds(points, { padding: [30, 30], maxZoom: 19 })
  }, [map, points])
  return null
}

/**
 * Outdoor (geographic) view: site boundary, zone boundaries coloured by occupancy level, AP markers with
 * their current client counts. Only configured coordinates are drawn; nothing is placed by guesswork.
 */
export default function SiteMap({ site, zones, aps, summary, selectedZoneId, onSelectZone }) {
  const zoneCount = useMemo(() => Object.fromEntries((summary?.by_zone || []).map((z) => [z.id, z])), [summary])
  const apCount = useMemo(() => Object.fromEntries((summary?.by_ap || []).map((a) => [a.id, a])), [summary])

  const points = useMemo(() => {
    const pts = []
    if (site.latitude != null && site.longitude != null) pts.push([site.latitude, site.longitude])
    ringsToLatLng(site.boundary).forEach((ring) => pts.push(...ring))
    zones.forEach((z) => ringsToLatLng(z.boundary).forEach((ring) => pts.push(...ring)))
    aps.forEach((a) => a.latitude != null && pts.push([a.latitude, a.longitude]))
    return pts
  }, [site, zones, aps])

  if (points.length === 0) {
    return (
      <div className="flex h-72 items-center justify-center rounded-2xl border border-dashed border-line px-6 text-center text-sm text-ink-500">
        No geographic coordinates are configured for this site yet. Add a site location, a boundary, zone boundaries or AP coordinates to see the map. Indoor sites can use the floor plan view instead.
      </div>
    )
  }

  return (
    <div className="h-[28rem] overflow-hidden rounded-2xl border border-line">
      <MapContainer center={points[0]} zoom={16} className="h-full w-full" scrollWheelZoom>
        <TileLayer
          attribution="&copy; OpenStreetMap contributors"
          url={import.meta.env.VITE_MAP_TILE_URL || 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'}
        />
        <FitBounds points={points} />
        {site.boundary && (
          <Polygon positions={ringsToLatLng(site.boundary)} pathOptions={{ color: '#1d4ed8', weight: 2, fill: false, dashArray: '6 4' }} />
        )}
        {zones.filter((z) => z.boundary).map((z) => {
          const c = zoneCount[z.id]
          const color = levelColor(c?.level, c?.active_clients || 0)
          return (
            <Polygon
              key={z.id}
              positions={ringsToLatLng(z.boundary)}
              pathOptions={{ color, weight: z.id === selectedZoneId ? 4 : 2, fillColor: color, fillOpacity: 0.25 }}
              eventHandlers={{ click: () => onSelectZone?.(z.id) }}
            >
              <Tooltip sticky>{`${z.name}: ${c?.active_clients ?? 0} active client${(c?.active_clients ?? 0) === 1 ? '' : 's'}`}</Tooltip>
            </Polygon>
          )
        })}
        {aps.filter((a) => a.latitude != null).map((a) => {
          const c = apCount[a.id]
          const ring = c?.level ? levelColor(c.level, 1) : STATE_COLOR[a.state] || STATE_COLOR.unknown
          return (
            <CircleMarker key={a.id} center={[a.latitude, a.longitude]} radius={9} pathOptions={{ color: ring, fillColor: ring, fillOpacity: 0.85, weight: 2 }}>
              <Tooltip>{`${a.code}: ${c?.active_clients ?? 0} client${(c?.active_clients ?? 0) === 1 ? '' : 's'} · ${a.state}${c?.level ? ` · ${c.level}` : ''}`}</Tooltip>
            </CircleMarker>
          )
        })}
      </MapContainer>
      <p className="sr-only">Legend: green normal, amber warning, red critical, grey no clients or unknown.</p>
    </div>
  )
}

export function MapLegend() {
  return (
    <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-500" aria-label="Map legend">
      {[['Normal', LEVEL_COLOR.ok], ['Warning', LEVEL_COLOR.warning], ['Critical', LEVEL_COLOR.critical], ['No clients / unknown', LEVEL_COLOR.none]].map(([label, color]) => (
        <li key={label} className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} aria-hidden="true" />
          {label}
        </li>
      ))}
    </ul>
  )
}
