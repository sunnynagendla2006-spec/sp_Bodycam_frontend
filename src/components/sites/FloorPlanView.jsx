import { useEffect, useMemo, useRef, useState } from 'react'
import { fetchFloorPlanBlob } from '../../api/sites.js'
import { levelColor, STATE_COLOR } from '../../utils/siteLevels.js'

/**
 * Indoor view: the uploaded floor-plan image with zone polygons and AP markers positioned in plan
 * coordinates (fractions 0..1 of the image). Nothing is drawn unless an administrator configured it.
 * When `placing` is set, a click on the plan reports the position (used to place APs / zone corners).
 */
export default function FloorPlanView({ siteId, floor, zones, aps, summary, selectedZoneId, onSelectZone, placing, onPlace, draftPolygon }) {
  const [url, setUrl] = useState(null)
  const [error, setError] = useState('')
  const boxRef = useRef(null)

  useEffect(() => {
    let revoked = false
    let objectUrl = null
    setUrl(null)
    setError('')
    if (!floor?.has_plan) return undefined
    fetchFloorPlanBlob(siteId, floor.id)
      .then((blob) => {
        if (revoked) return
        objectUrl = URL.createObjectURL(blob)
        setUrl(objectUrl)
      })
      .catch(() => !revoked && setError('The floor plan could not be loaded.'))
    return () => {
      revoked = true
      if (objectUrl) URL.revokeObjectURL(objectUrl) // no leaked blobs when the floor changes or the view closes
    }
  }, [siteId, floor?.id, floor?.has_plan])

  const zoneCount = useMemo(() => Object.fromEntries((summary?.by_zone || []).map((z) => [z.id, z])), [summary])
  const apCount = useMemo(() => Object.fromEntries((summary?.by_ap || []).map((a) => [a.id, a])), [summary])
  const floorZones = zones.filter((z) => z.floor_id === floor?.id && z.plan_polygon)
  const floorAps = aps.filter((a) => a.floor_id === floor?.id && a.plan_x != null)

  if (!floor) return <div className="rounded-2xl border border-dashed border-line p-8 text-center text-sm text-ink-500">Select a floor.</div>
  if (!floor.has_plan) {
    return (
      <div className="rounded-2xl border border-dashed border-line p-8 text-center text-sm text-ink-500">
        No floor plan has been uploaded for {floor.name}. An administrator can upload a PNG or JPEG under Configure → Floors.
      </div>
    )
  }
  if (error) return <div className="rounded-2xl border border-line p-8 text-center text-sm text-signal-red">{error}</div>
  if (!url) return <div className="h-64 animate-pulse rounded-2xl bg-line/50" aria-busy="true" />

  function handleClick(e) {
    if (!placing || !boxRef.current) return
    const rect = boxRef.current.getBoundingClientRect()
    const x = (e.clientX - rect.left) / rect.width
    const y = (e.clientY - rect.top) / rect.height
    if (x >= 0 && x <= 1 && y >= 0 && y <= 1) onPlace?.(Number(x.toFixed(4)), Number(y.toFixed(4)))
  }

  return (
    <div className="overflow-auto rounded-2xl border border-line bg-canvas">
      <div ref={boxRef} className={`relative mx-auto max-w-full ${placing ? 'cursor-crosshair' : ''}`} style={{ aspectRatio: floor.plan_width_px && floor.plan_height_px ? `${floor.plan_width_px} / ${floor.plan_height_px}` : undefined }} onClick={handleClick}>
        <img src={url} alt={`Floor plan: ${floor.name}`} className="block h-full w-full select-none object-contain" draggable={false} />
        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden="true">
          {floorZones.map((z) => {
            const c = zoneCount[z.id]
            const color = levelColor(c?.level, c?.active_clients || 0)
            return (
              <polygon
                key={z.id}
                points={z.plan_polygon.map(([x, y]) => `${x},${y}`).join(' ')}
                fill={color}
                fillOpacity={0.28}
                stroke={color}
                strokeWidth={z.id === selectedZoneId ? 0.006 : 0.003}
                vectorEffect="non-scaling-stroke"
                style={{ cursor: 'pointer', pointerEvents: placing ? 'none' : 'auto' }}
                onClick={(e) => {
                  e.stopPropagation()
                  onSelectZone?.(z.id)
                }}
              >
                <title>{`${z.name}: ${c?.active_clients ?? 0} active clients`}</title>
              </polygon>
            )
          })}
          {draftPolygon && draftPolygon.length > 0 && (
            <polyline points={draftPolygon.map(([x, y]) => `${x},${y}`).join(' ')} fill="none" stroke="#2563eb" strokeWidth={0.004} strokeDasharray="0.01 0.008" vectorEffect="non-scaling-stroke" />
          )}
        </svg>
        {floorAps.map((a) => {
          const c = apCount[a.id]
          const color = c?.level ? levelColor(c.level, 1) : STATE_COLOR[a.state] || STATE_COLOR.unknown
          return (
            <div
              key={a.id}
              className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white px-1.5 text-[10px] font-semibold leading-5 text-white shadow"
              style={{ left: `${a.plan_x * 100}%`, top: `${a.plan_y * 100}%`, background: color, minWidth: 22, textAlign: 'center' }}
              title={`${a.code}: ${c?.active_clients ?? 0} clients · ${a.state}`}
            >
              {c?.active_clients ?? 0}
            </div>
          )
        })}
      </div>
    </div>
  )
}
