import { useMemo } from 'react'
import { levelColor, STATE_COLOR } from '../../utils/siteLevels.js'

// Slab geometry (SVG units) and oblique projection.
const W = 240
const H = 140
const SKEW_X = 0.55
const SKEW_Y = 0.5
const GAP = 78
const PAD = 24

function project(floorIndex, x, y) {
  return [PAD + x * W + y * H * SKEW_X, PAD + (floorIndex === undefined ? 0 : floorIndex * GAP) + y * H * SKEW_Y]
}

/**
 * Layered ("2.5D") view: floors stacked as slabs with zone areas and AP markers from the SAME plan
 * coordinates the floor-plan view uses. It is a schematic, NOT a surveyed 3D model: heights are only
 * used for ordering and no geometry is invented. Floors without placed APs/zones show as empty slabs.
 * This is the extension boundary for a full 3D viewer (see docs/NETWORK_MONITORING_PLATFORM.md).
 */
export default function LayersView({ floors, zones, aps, summary, selectedFloorId, onSelectFloor, selectedZoneId, onSelectZone }) {
  const zoneCount = useMemo(() => Object.fromEntries((summary?.by_zone || []).map((z) => [z.id, z])), [summary])
  const apCount = useMemo(() => Object.fromEntries((summary?.by_ap || []).map((a) => [a.id, a])), [summary])
  const floorCount = useMemo(() => Object.fromEntries((summary?.by_floor || []).map((f) => [f.id, f.active_clients])), [summary])

  // Highest floor at the top.
  const ordered = useMemo(() => [...floors].sort((a, b) => (b.level ?? b.display_order) - (a.level ?? a.display_order)), [floors])

  if (floors.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-line p-8 text-center text-sm text-ink-500">
        This site has no floors, so there is nothing to stack. Outdoor and single-level sites use the Map view.
      </div>
    )
  }

  const totalH = PAD * 2 + (ordered.length - 1) * GAP + H * SKEW_Y + 20
  const totalW = PAD * 2 + W + H * SKEW_X

  return (
    <div className="overflow-auto rounded-2xl border border-line bg-surface p-3">
      <svg viewBox={`0 0 ${totalW} ${totalH}`} className="mx-auto h-auto w-full max-w-3xl" role="img" aria-label="Layered floor view with access points and zones">
        {ordered.map((floor, i) => {
          const corners = [[0, 0], [1, 0], [1, 1], [0, 1]].map(([x, y]) => project(i, x, y).join(',')).join(' ')
          const selected = floor.id === selectedFloorId
          const floorZones = zones.filter((z) => z.floor_id === floor.id && z.plan_polygon)
          const floorAps = aps.filter((a) => a.floor_id === floor.id && a.plan_x != null)
          return (
            <g key={floor.id}>
              <polygon points={corners} fill={selected ? '#dbeafe' : '#f1f5f9'} stroke={selected ? '#2563eb' : '#94a3b8'} strokeWidth={selected ? 2 : 1} style={{ cursor: 'pointer' }} onClick={() => onSelectFloor?.(floor.id)}>
                <title>{`${floor.name}: ${floorCount[floor.id] ?? 0} active clients`}</title>
              </polygon>
              {floorZones.map((z) => {
                const c = zoneCount[z.id]
                const color = levelColor(c?.level, c?.active_clients || 0)
                return (
                  <polygon
                    key={z.id}
                    points={z.plan_polygon.map(([x, y]) => project(i, x, y).join(',')).join(' ')}
                    fill={color}
                    fillOpacity={0.35}
                    stroke={z.id === selectedZoneId ? '#0f172a' : color}
                    strokeWidth={z.id === selectedZoneId ? 2 : 1}
                    style={{ cursor: 'pointer' }}
                    onClick={() => onSelectZone?.(z.id)}
                  >
                    <title>{`${z.name}: ${c?.active_clients ?? 0} active clients`}</title>
                  </polygon>
                )
              })}
              {floorAps.map((a) => {
                const [cx, cy] = project(i, a.plan_x, a.plan_y)
                const c = apCount[a.id]
                const color = c?.level ? levelColor(c.level, 1) : STATE_COLOR[a.state] || STATE_COLOR.unknown
                return (
                  <g key={a.id}>
                    <circle cx={cx} cy={cy} r={7} fill={color} stroke="#fff" strokeWidth={1.5}>
                      <title>{`${a.code}: ${c?.active_clients ?? 0} clients · ${a.state}`}</title>
                    </circle>
                    <text x={cx} y={cy + 3} textAnchor="middle" fontSize="8" fontWeight="600" fill="#fff" pointerEvents="none">{c?.active_clients ?? 0}</text>
                  </g>
                )
              })}
              <text x={project(i, 0, 1)[0] - 6} y={project(i, 0, 1)[1] + 14} textAnchor="end" fontSize="11" fill="#334155">
                {floor.name} · {floorCount[floor.id] ?? 0}
              </text>
            </g>
          )
        })}
      </svg>
      <p className="mt-2 text-center text-xs text-ink-500">Schematic layered view. Positions come from the floor plans; it is not a surveyed 3D model.</p>
    </div>
  )
}
