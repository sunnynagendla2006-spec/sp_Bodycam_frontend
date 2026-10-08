import 'leaflet/dist/leaflet.css'
import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import L from 'leaflet'
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet'
import { ShieldAlert, Radio, X } from 'lucide-react'
import { useOperations } from '../context/OperationsContext.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { useConstableLookup } from '../hooks/useConstableLookup.js'
import { LoadingSkeleton, ErrorState, PageHeader } from '../components/Primitives.jsx'
import { Card, CardHeader, Info, InfoGrid } from '../components/ui/Card.jsx'
import Button from '../components/ui/Button.jsx'
import StatusBadge from '../components/StatusBadge.jsx'
import { formatDateTime, formatRelativeTime } from '../utils/format.js'
import { canSendZoneAlert, canViewCCTV } from '../utils/roles.js'
import { getDevicePresenceHistory, sendZoneAlert } from '../api/presence.js'
import { listCameras } from '../api/cctv.js'
import { ApiError, friendlyErrorMessage } from '../api/client.js'

// Same palette family StatusBadge/LiveMap already use -- not a new/separate
// color system invented for this page (see components/StatusBadge.jsx).
const AP_ONLINE_COLOR = '#22C55E'
const AP_OFFLINE_COLOR = '#EF4444'
const AP_DISABLED_COLOR = '#9CA3AF'
const POLICE_CONNECTED_COLOR = '#2563EB'
const POLICE_STALE_COLOR = '#F59E0B'
const POLICE_OFFLINE_COLOR = '#9CA3AF'
const POLICE_MOVING_COLOR = '#F59E0B'
const CCTV_COLOR = '#7C3AED'
const CCTV_DISABLED_COLOR = '#9CA3AF'

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
}

function apDivIcon(ap) {
  const color = !ap.enabled ? AP_DISABLED_COLOR : ap.status === 'online' ? AP_ONLINE_COLOR : AP_OFFLINE_COLOR
  return L.divIcon({
    className: 'ap-marker',
    html: `<div style="display:flex;flex-direction:column;align-items:center;pointer-events:none;">
      <div style="width:26px;height:26px;border-radius:8px;background:${color};border:3px solid white;box-shadow:0 2px 6px rgba(16,24,40,0.35);display:flex;align-items:center;justify-content:center;color:white;font-size:11px;font-weight:700;">AP</div>
      <div style="margin-top:3px;padding:2px 8px;background:#fff;color:#101828;font-size:12px;line-height:1.5;border-radius:999px;white-space:nowrap;font-weight:600;box-shadow:0 1px 4px rgba(16,24,40,0.25);">${escapeHtml(ap.code)}</div>
    </div>`,
    iconSize: undefined,
    iconAnchor: [13, 13],
    popupAnchor: [0, -13],
  })
}

function policeDivIcon(color, label, moving) {
  const pulse = moving
    ? `<span style="position:absolute;inset:0;border-radius:50%;background:${color};opacity:0.5;animation:ap-ping 1.4s ease-out infinite;"></span>`
    : ''
  return L.divIcon({
    className: 'police-marker',
    html: `<div style="display:flex;flex-direction:column;align-items:center;pointer-events:none;">
      <div style="position:relative;width:16px;height:16px;">
        ${pulse}
        <div style="position:relative;width:16px;height:16px;border-radius:50%;background:${color};border:3px solid white;box-shadow:0 2px 6px rgba(16,24,40,0.35)"></div>
      </div>
      <div style="margin-top:3px;padding:2px 8px;background:#fff;color:#101828;font-size:11px;line-height:1.5;border-radius:999px;white-space:nowrap;font-weight:600;box-shadow:0 1px 4px rgba(16,24,40,0.25);">${escapeHtml(label)}</div>
    </div>`,
    iconSize: undefined,
    iconAnchor: [8, 8],
    popupAnchor: [0, -8],
  })
}

function cctvDivIcon(camera) {
  const color = !camera.enabled ? CCTV_DISABLED_COLOR : CCTV_COLOR
  return L.divIcon({
    className: 'cctv-marker',
    html: `<div style="display:flex;flex-direction:column;align-items:center;pointer-events:none;">
      <div style="width:24px;height:24px;border-radius:50%;background:${color};border:3px solid white;box-shadow:0 2px 6px rgba(16,24,40,0.35);display:flex;align-items:center;justify-content:center;color:white;font-size:12px;">&#128247;</div>
      <div style="margin-top:3px;padding:2px 8px;background:#fff;color:#101828;font-size:11px;line-height:1.5;border-radius:999px;white-space:nowrap;font-weight:600;box-shadow:0 1px 4px rgba(16,24,40,0.25);">${escapeHtml(camera.camera_code)}</div>
    </div>`,
    iconSize: undefined,
    iconAnchor: [12, 12],
    popupAnchor: [0, -12],
  })
}

function MapController({ mapRef }) {
  const map = useMap()
  useEffect(() => {
    mapRef.current = map
  }, [map, mapRef])
  return null
}

function interpolate(a, b, t) {
  return a + (b - a) * t
}

// Small deterministic radial offset so 2+ officers sharing the same AP
// don't render as one indistinguishable dot -- purely a DISPLAY nudge,
// never written back anywhere and never mistaken for a real coordinate.
function jitter([lat, lon], index, total) {
  if (total <= 1) return [lat, lon]
  const angle = (2 * Math.PI * index) / total
  const r = 0.0006
  return [lat + r * Math.sin(angle), lon + r * Math.cos(angle)]
}

function presenceTone(status) {
  if (status === 'connected') return POLICE_CONNECTED_COLOR
  if (status === 'stale') return POLICE_STALE_COLOR
  return POLICE_OFFLINE_COLOR
}

export default function VirtualAP() {
  const { presence, accessPoints, zones, movingOfficers, devices, loading, error, refresh, refreshAccessPoints } = useOperations()
  const { user } = useAuth()
  const { byId: constablesById, label: constableLabel } = useConstableLookup()
  const mapRef = useRef(null)
  const [selectedConstableId, setSelectedConstableId] = useState(null)
  const [, setTick] = useState(0)
  const [cameras, setCameras] = useState([])

  // Keeps "Updated Xs ago" / moving-progress-derived positions fresh even
  // with no new WebSocket frame -- display only, mirrors LiveMap.jsx.
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 3000)
    return () => clearInterval(id)
  }, [])

  // CCTV is a separate RBAC gate (admin/control_room only, NOT station/
  // constable -- see require_cctv_viewer) -- fetched independently of
  // OperationsContext's own role check for presence, and silently skipped
  // (never a loud 403) for roles that can see this page but not CCTV.
  const canSeeCCTV = canViewCCTV(user?.role)
  useEffect(() => {
    if (!canSeeCCTV) return
    let cancelled = false
    listCameras()
      .then((rows) => !cancelled && setCameras(rows))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [canSeeCCTV])

  const camerasByZone = useMemo(() => {
    const m = {}
    for (const cam of cameras) {
      if (!cam.zone) continue
      ;(m[cam.zone] ||= []).push(cam)
    }
    return m
  }, [cameras])

  const apByCode = useMemo(() => {
    const m = {}
    for (const ap of accessPoints) m[ap.code] = ap
    return m
  }, [accessPoints])

  const deploymentName = accessPoints[0]?.deployment || zones[0]?.deployment || null

  // Zone display name: the human-readable name of the first AP in that
  // zone (zones themselves only carry a `zone` code + `access_point_codes`
  // -- see backend schemas.ZoneSummaryResponse -- never a separate name field).
  function zoneDisplayName(zone) {
    const firstCode = zone.access_point_codes?.[0]
    return (firstCode && apByCode[firstCode]?.name) || zone.zone
  }

  // Per-zone Connected/Stale/Offline breakdown computed from the raw
  // presence list (the backend's zone summary itself only exposes
  // police_count/moving_count -- see schemas.ZoneSummaryResponse) -- never
  // a second, independently-maintained count.
  const presenceByZone = useMemo(() => {
    const m = {}
    for (const p of presence) {
      if (!p.current_zone) continue
      ;(m[p.current_zone] ||= []).push(p)
    }
    return m
  }, [presence])

  // "Moving" is purely a live WebSocket passthrough (presence.moving is
  // never persisted -- see app/services/movement_state.py), so it's
  // derived straight from the same movingOfficers state the map animation
  // already uses, not from a debounced zones refetch -- the backend's own
  // zone.moving_count (used as the pre-WebSocket initial-load value below)
  // would otherwise only catch up on the NEXT handoff/connect event, not
  // the moving-ping itself.
  const movingCountByZone = useMemo(() => {
    const m = {}
    for (const mv of Object.values(movingOfficers)) {
      if (!mv.targetZone) continue
      m[mv.targetZone] = (m[mv.targetZone] || 0) + 1
    }
    return m
  }, [movingOfficers])

  function deviceIdentifier(deviceId) {
    return devices.find((d) => d.id === deviceId)?.device_identifier || null
  }

  function officerLabel(p) {
    const badge = constableLabel(p.constable_id)
    const dev = deviceIdentifier(p.device_id)
    return dev ? `${badge} / ${dev}` : badge
  }

  // Group located officers by current AP so same-AP officers can be
  // visually spread out (see jitter()) instead of perfectly overlapping.
  const officersByAp = useMemo(() => {
    const m = {}
    for (const p of presence) {
      if (!p.current_access_point_code) continue
      ;(m[p.current_access_point_code] ||= []).push(p)
    }
    return m
  }, [presence])

  const center = useMemo(() => {
    const first = accessPoints.find((a) => a.latitude != null && a.longitude != null)
    return first ? [first.latitude, first.longitude] : [20.5937, 78.9629]
  }, [accessPoints])

  function focusOnAp(code) {
    const ap = apByCode[code]
    if (ap?.latitude != null && mapRef.current) {
      mapRef.current.flyTo([ap.latitude, ap.longitude], 16, { duration: 0.6 })
    }
  }

  if (loading) return <LoadingSkeleton rows={8} />
  if (error) return <ErrorState message={error} onRetry={refresh} />

  const selectedPresence = selectedConstableId ? presence.find((p) => p.constable_id === selectedConstableId) : null

  return (
    <div>
      <PageHeader
        title="AP-Based Police Presence"
        subtitle={deploymentName ? `Event: ${deploymentName} · Approximate AP coverage, not exact GPS tracking` : 'Approximate AP coverage, not exact GPS tracking'}
      />

      <RecentZoneAlerts camerasByZone={canSeeCCTV ? camerasByZone : null} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[260px_1fr_320px]">
        <div className="space-y-3 lg:order-1">
          {zones.length === 0 && (
            <Card className="p-4 text-sm text-ink-500">No zones configured for this deployment yet.</Card>
          )}
          {zones.map((zone) => (
            <ZoneCard
              key={zone.zone}
              zone={zone}
              displayName={zoneDisplayName(zone)}
              rows={presenceByZone[zone.zone] || []}
              onFocusAp={focusOnAp}
              apByCode={apByCode}
              liveMovingCount={movingCountByZone[zone.zone] || 0}
              cameras={canSeeCCTV ? camerasByZone[zone.zone] || [] : null}
            />
          ))}
        </div>

        <Card className="relative h-[55vh] animate-rise-in overflow-hidden lg:order-2 lg:h-[70vh]">
          <style>{`@keyframes ap-ping { 0% { transform: scale(1); opacity: 0.6 } 100% { transform: scale(2.4); opacity: 0 } }`}</style>
          <MapContainer center={center} zoom={accessPoints.length > 0 ? 15 : 5} style={{ height: '100%', width: '100%' }}>
            <MapController mapRef={mapRef} />
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            {accessPoints.filter((ap) => ap.latitude != null).map((ap) => (
              <Marker key={ap.id} position={[ap.latitude, ap.longitude]} icon={apDivIcon(ap)}>
                <Popup>
                  <div className="min-w-[180px] space-y-1.5 text-sm">
                    <p className="text-base font-semibold text-ink-900">{ap.name}</p>
                    <p className="text-xs text-ink-500">{ap.code} · {ap.zone}</p>
                    <StatusBadge status={!ap.enabled ? 'disconnected' : ap.status} label={!ap.enabled ? 'Disabled' : ap.status === 'online' ? 'Online' : 'Offline'} />
                  </div>
                </Popup>
              </Marker>
            ))}

            {cameras.filter((cam) => cam.latitude != null).map((cam) => (
              <Marker key={cam.id} position={[cam.latitude, cam.longitude]} icon={cctvDivIcon(cam)}>
                <Popup>
                  <div className="min-w-[180px] space-y-1.5 text-sm">
                    <p className="text-base font-semibold text-ink-900">{cam.camera_code} — {cam.name}</p>
                    <p className="text-xs text-ink-500">{cam.zone || 'No zone'}</p>
                    <StatusBadge status={!cam.enabled ? 'disconnected' : cam.status} label={!cam.enabled ? 'Disabled' : undefined} />
                  </div>
                </Popup>
              </Marker>
            ))}

            {Object.entries(officersByAp).map(([code, rows]) => {
              const ap = apByCode[code]
              if (!ap || ap.latitude == null) return null
              return rows.map((p, i) => {
                const moving = movingOfficers[p.device_id]
                if (moving) return null // rendered separately below, mid-transition
                const pos = jitter([ap.latitude, ap.longitude], i, rows.length)
                return (
                  <Marker
                    key={p.device_id}
                    position={pos}
                    icon={policeDivIcon(presenceTone(p.status), officerLabel(p), false)}
                    eventHandlers={{ click: () => setSelectedConstableId(p.constable_id) }}
                  >
                    <Popup>
                      <OfficerPopup p={p} label={officerLabel(p)} apName={ap.name} />
                    </Popup>
                  </Marker>
                )
              })
            })}

            {presence.filter((p) => movingOfficers[p.device_id]).map((p) => {
              const mv = movingOfficers[p.device_id]
              const fromAp = mv.fromAccessPointCode && apByCode[mv.fromAccessPointCode]
              const targetAp = apByCode[mv.targetAccessPointCode]
              if (!targetAp || targetAp.latitude == null) return null
              const fromPos = fromAp && fromAp.latitude != null ? [fromAp.latitude, fromAp.longitude] : [targetAp.latitude, targetAp.longitude]
              const toPos = [targetAp.latitude, targetAp.longitude]
              const t = Math.max(0, Math.min(100, mv.progress ?? 0)) / 100
              const pos = [interpolate(fromPos[0], toPos[0], t), interpolate(fromPos[1], toPos[1], t)]
              return (
                <Fragment key={`moving-${p.device_id}`}>
                  <Polyline positions={[fromPos, toPos]} pathOptions={{ color: POLICE_MOVING_COLOR, dashArray: '6 8', weight: 3 }} />
                  <Marker
                    position={pos}
                    icon={policeDivIcon(POLICE_MOVING_COLOR, `${officerLabel(p)} · ${Math.round(mv.progress ?? 0)}%`, true)}
                    eventHandlers={{ click: () => setSelectedConstableId(p.constable_id) }}
                  >
                    <Popup>
                      <div className="min-w-[200px] space-y-1.5 text-sm">
                        <p className="text-base font-semibold text-ink-900">{officerLabel(p)}</p>
                        <StatusBadge status="moving" />
                        <p className="text-ink-700">
                          {mv.fromAccessPointCode || '—'} ({fromAp?.name || mv.fromZone || '—'}) &rarr; {mv.targetAccessPointCode} ({targetAp.name})
                        </p>
                        <p className="text-xs text-ink-500">Progress: {Math.round(mv.progress ?? 0)}%</p>
                      </div>
                    </Popup>
                  </Marker>
                </Fragment>
              )
            })}
          </MapContainer>

          <div className="absolute bottom-3 left-3 z-[1000] space-y-1.5 rounded-xl border border-line bg-surface/95 px-3.5 py-2.5 text-xs text-ink-700 shadow-lift backdrop-blur">
            <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: AP_ONLINE_COLOR }} /> AP online</div>
            <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: AP_DISABLED_COLOR }} /> AP disabled</div>
            <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: POLICE_CONNECTED_COLOR }} /> Officer connected</div>
            <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: POLICE_MOVING_COLOR }} /> Officer moving</div>
            {cameras.length > 0 && <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: CCTV_COLOR }} /> CCTV camera</div>}
          </div>
          <p className="absolute right-3 top-3 z-[1000] max-w-[220px] rounded-xl border border-line bg-surface/95 px-3 py-2 text-[11px] leading-snug text-ink-500 shadow-lift backdrop-blur">
            AP-based presence shows approximate AP coverage area, not exact GPS tracking.
          </p>
        </Card>

        <div className="space-y-4 lg:order-3">
          {selectedPresence ? (
            <OfficerDetailsPanel
              presence={selectedPresence}
              label={officerLabel(selectedPresence)}
              apName={apByCode[selectedPresence.current_access_point_code]?.name}
              moving={movingOfficers[selectedPresence.device_id]}
              onClose={() => setSelectedConstableId(null)}
            />
          ) : (
            <Card className="p-5 text-sm text-ink-500">Select an officer on the map to see their details and movement history.</Card>
          )}

          {canSendZoneAlert(user?.role) && <EmergencyAlertPanel zones={zones} zoneDisplayName={zoneDisplayName} constableLabel={constableLabel} constablesById={constablesById} devices={devices} />}
        </div>
      </div>
    </div>
  )
}

function ZoneCard({ zone, displayName, rows, onFocusAp, apByCode, liveMovingCount, cameras }) {
  const connected = rows.filter((p) => p.status === 'connected').length
  const stale = rows.filter((p) => p.status === 'stale').length
  const offline = rows.filter((p) => p.status === 'disconnected').length
  // Never under-counts: the backend's own zone.moving_count covers the
  // moment of initial page load (before any live WS frame has arrived for
  // this zone), the live map's movingOfficers covers everything after.
  const moving = Math.max(zone.moving_count, liveMovingCount)
  return (
    <Card className="animate-rise-in p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold uppercase tracking-wider text-ink-400">{zone.zone}</p>
          <p className="truncate font-semibold text-ink-900">{displayName}</p>
        </div>
        <StatusBadge status={zone.enabled ? 'online' : 'disconnected'} label={zone.enabled ? 'Enabled' : 'Disabled'} />
      </div>
      <dl className="grid grid-cols-2 gap-2 text-sm">
        <div><dt className="text-xs text-ink-500">Police</dt><dd className="font-semibold tabular-nums text-ink-900">{zone.police_count}</dd></div>
        <div><dt className="text-xs text-ink-500">Moving</dt><dd className="font-semibold tabular-nums text-signal-amber">{moving}</dd></div>
        <div><dt className="text-xs text-ink-500">Connected</dt><dd className="font-semibold tabular-nums text-signal-green">{connected}</dd></div>
        <div><dt className="text-xs text-ink-500">Stale / Offline</dt><dd className="font-semibold tabular-nums text-ink-500">{stale + offline}</dd></div>
      </dl>
      {zone.access_point_codes?.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {zone.access_point_codes.map((code) => (
            <button
              key={code}
              type="button"
              onClick={() => onFocusAp(code)}
              className="rounded-full border border-line px-2.5 py-1 text-xs font-medium text-ink-600 transition-colors hover:border-brand-200 hover:bg-brand-50/50"
            >
              {code}{apByCode[code] && !apByCode[code].enabled ? ' (disabled)' : ''}
            </button>
          ))}
        </div>
      )}
      {cameras != null && cameras.length > 0 && (
        <div className="mt-3 border-t border-line pt-3">
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-ink-400">CCTV in this zone</p>
          <div className="flex flex-wrap gap-1.5">
            {cameras.map((cam) => (
              <span key={cam.id} className="inline-flex items-center gap-1 rounded-full border border-line px-2.5 py-1 text-xs font-medium text-ink-600">
                {cam.camera_code}
              </span>
            ))}
          </div>
        </div>
      )}
    </Card>
  )
}

function OfficerPopup({ p, label, apName }) {
  return (
    <div className="min-w-[200px] space-y-1.5 text-sm">
      <p className="text-base font-semibold text-ink-900">{label}</p>
      <StatusBadge status={p.status} />
      <p className="text-ink-700">AP: {p.current_access_point_code} ({apName})</p>
      <p className="text-ink-700">Zone: {p.current_zone}</p>
      <p className="text-xs text-ink-500">Last seen: {formatRelativeTime(p.last_seen_at)}</p>
    </div>
  )
}

function OfficerDetailsPanel({ presence, label, apName, moving, onClose }) {
  const [history, setHistory] = useState(null)
  const [historyError, setHistoryError] = useState('')

  useEffect(() => {
    let cancelled = false
    setHistory(null)
    setHistoryError('')
    getDevicePresenceHistory(presence.device_id, { limit: 10 })
      .then((rows) => !cancelled && setHistory(rows))
      .catch((err) => !cancelled && setHistoryError(friendlyErrorMessage(err)))
    return () => {
      cancelled = true
    }
    // Re-fetch not only when a DIFFERENT officer is selected, but also
    // whenever a new handoff lands for the one already selected --
    // handoff_count is the one field on PresenceStateResponse guaranteed
    // to change on every new handoff (confirmed live: the Info fields
    // above already re-render from the fresh `presence` prop on every
    // WebSocket-triggered refetch, but this effect's own fetched
    // `history` state was going stale, still showing the pre-handoff
    // list, since only presence.device_id was a dependency before).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presence.device_id, presence.handoff_count])

  return (
    <Card className="animate-rise-in p-5">
      <div className="mb-3 flex items-start justify-between gap-2">
        <h3 className="text-base font-semibold text-ink-900">{label}</h3>
        <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-ink-400 hover:bg-line/60 hover:text-ink-900" aria-label="Close">
          <X className="h-4 w-4" />
        </button>
      </div>

      <StatusBadge status={moving ? 'moving' : presence.status} />

      <InfoGrid columns={1}>
        {moving ? (
          <Info label="Movement">
            {moving.fromAccessPointCode || '—'} &rarr; {moving.targetAccessPointCode} ({Math.round(moving.progress ?? 0)}%)
          </Info>
        ) : (
          <Info label="Current access point">{presence.current_access_point_code} ({apName || '—'})</Info>
        )}
        <Info label="Current zone">{moving ? moving.targetZone || presence.current_zone : presence.current_zone || '—'}</Info>
        <Info label="Presence source">{presence.location_source}</Info>
        <Info label="Last seen">{formatDateTime(presence.last_seen_at)}</Info>
        <Info label="Handoffs so far">{presence.handoff_count}</Info>
      </InfoGrid>

      <p className="mt-4 mb-2 text-xs font-semibold uppercase tracking-wider text-ink-400">AP association history</p>
      {historyError && <p className="text-sm text-signal-red">{historyError}</p>}
      {!history && !historyError && <p className="text-sm text-ink-500">Loading…</p>}
      {history?.length === 0 && <p className="text-sm text-ink-500">No movement recorded yet.</p>}
      <ul className="space-y-2">
        {history?.map((h) => (
          <li key={h.id} className="rounded-lg border border-line px-3 py-2 text-sm">
            <p className="text-xs text-ink-500">{formatDateTime(h.occurred_at)} · {h.source === 'simulator' ? 'Virtual AP' : 'Real AP'}</p>
            <p className="text-ink-900">{h.previous_access_point_id ? 'Handoff' : 'Initial connection'}</p>
          </li>
        ))}
      </ul>
    </Card>
  )
}

function RecentZoneAlerts({ camerasByZone }) {
  const { zoneAlerts } = useOperations()
  const recent = zoneAlerts.filter((a) => Date.now() - a.at < 30000)
  if (recent.length === 0) return null
  return (
    <div className="mb-4 space-y-2">
      {recent.map((a, i) => {
        const relevantCameras = camerasByZone ? camerasByZone[a.zone] || [] : null
        return (
          <div key={`${a.at}-${i}`} className="animate-rise-in rounded-2xl border border-red-200 bg-red-50 px-4 py-3">
            <div className="flex items-center gap-3">
              <ShieldAlert className="h-5 w-5 shrink-0 text-signal-red" aria-hidden="true" />
              <div className="min-w-0">
                <p className="font-semibold text-red-900">EMERGENCY · {a.zone}</p>
                <p className="truncate text-sm text-red-800">{a.message} · {a.targetedCount} officer{a.targetedCount === 1 ? '' : 's'} notified</p>
              </div>
            </div>
            {relevantCameras != null && relevantCameras.length > 0 && (
              <div className="mt-2 flex flex-wrap items-center gap-1.5 pl-8">
                <span className="text-xs font-semibold uppercase tracking-wide text-red-700">CCTV coverage:</span>
                {relevantCameras.map((cam) => (
                  <span key={cam.id} className="rounded-full border border-red-300 bg-white px-2.5 py-0.5 text-xs font-medium text-red-800">
                    {cam.camera_code}
                  </span>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function EmergencyAlertPanel({ zones, zoneDisplayName, constableLabel }) {
  const [zone, setZone] = useState('')
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    if (!zone && zones.length > 0) setZone(zones[0].zone)
  }, [zones, zone])

  async function handleSend(e) {
    e.preventDefault()
    if (!zone || !message.trim()) return
    setSending(true)
    setErr('')
    try {
      const res = await sendZoneAlert(zone, message.trim())
      setResult(res)
      setMessage('')
    } catch (error) {
      setErr(error instanceof ApiError ? friendlyErrorMessage(error) : 'Failed to send the alert.')
    } finally {
      setSending(false)
    }
  }

  return (
    <Card className="animate-rise-in">
      <CardHeader icon={Radio} title="Zone emergency alert" subtitle="Sent only to officers currently connected in this zone" />
      <form onSubmit={handleSend} className="space-y-3 p-5">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-ink-700">Zone</span>
          <select className="input" value={zone} onChange={(e) => setZone(e.target.value)}>
            {zones.map((z) => (
              <option key={z.zone} value={z.zone}>{z.zone} — {zoneDisplayName(z)}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-ink-700">Message</span>
          <textarea className="input" rows={3} maxLength={500} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="EMERGENCY AT MAIN TEMPLE. RESPOND IMMEDIATELY." />
        </label>
        {err && <p className="text-sm text-signal-red">{err}</p>}
        <Button type="submit" variant="danger" icon={ShieldAlert} loading={sending} disabled={!zone || !message.trim()}>
          Send zone alert
        </Button>
      </form>

      {result && (
        <div className="border-t border-line p-5">
          <p className="mb-2 text-sm font-semibold text-ink-900">Targeted officers ({result.targeted_device_count})</p>
          {result.targeted_constable_ids.length === 0 ? (
            <p className="text-sm text-ink-500">No officer is currently connected in this zone.</p>
          ) : (
            <ul className="space-y-1">
              {result.targeted_constable_ids.map((id) => (
                <li key={id} className="text-sm text-ink-700">{constableLabel(id)}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Card>
  )
}
