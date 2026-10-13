import 'leaflet/dist/leaflet.css'
import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import L from 'leaflet'
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet'
import {
  ShieldAlert,
  Radio,
  X,
  Wifi,
  Users,
  LayoutGrid,
  Map as MapIcon,
  RefreshCw,
  Power,
  PowerOff,
  Shield,
  Signal,
  Video,
  ArrowRight,
  Activity,
  MapPin,
  Landmark,
  Car,
  ShoppingBag,
  Eye,
  AlertTriangle,
} from 'lucide-react'
import { useOperations } from '../context/OperationsContext.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { useConstableLookup } from '../hooks/useConstableLookup.js'
import { useToast } from '../context/ToastContext.jsx'
import { LoadingSkeleton, ErrorState, PageHeader } from '../components/Primitives.jsx'
import { Card, CardHeader, Info, InfoGrid } from '../components/ui/Card.jsx'
import Button from '../components/ui/Button.jsx'
import StatusBadge from '../components/StatusBadge.jsx'
import { formatDateTime, formatRelativeTime } from '../utils/format.js'
import { canSendZoneAlert, canViewCCTV, canManageAccessPoints } from '../utils/roles.js'
import { getDevicePresenceHistory, sendZoneAlert } from '../api/presence.js'
import { listCameras } from '../api/cctv.js'
import { enableZone, disableZone, enableAccessPoint, disableAccessPoint } from '../api/accessPoints.js'
import { ApiError, friendlyErrorMessage } from '../api/client.js'

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

function getZoneIcon(code, name) {
  const text = `${code} ${name}`.toUpperCase()
  if (text.includes('TEMPLE') || text.includes('SANCTUM')) return Landmark
  if (text.includes('PARK') || text.includes('VEHICLE')) return Car
  if (text.includes('EMERGENCY') || text.includes('VIP') || text.includes('ROUTE')) return ShieldAlert
  if (text.includes('FOOD') || text.includes('MARKET')) return ShoppingBag
  return Shield
}

export default function VirtualAP() {
  const { presence, accessPoints, zones, movingOfficers, devices, loading, error, refresh, refreshAccessPoints } = useOperations()
  const { user } = useAuth()
  const { byId: constablesById, label: constableLabel } = useConstableLookup()
  const { notify } = useToast()
  const mapRef = useRef(null)
  const [selectedConstableId, setSelectedConstableId] = useState(null)
  const [targetedAlertZone, setTargetedAlertZone] = useState('')
  const [viewMode, setViewMode] = useState('zones') // 'zones' (Sector division layout) or 'map' (Leaflet map)
  const [, setTick] = useState(0)
  const [cameras, setCameras] = useState([])
  const [busyZone, setBusyZone] = useState(null)

  const canManage = canManageAccessPoints(user?.role)

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 3000)
    return () => clearInterval(id)
  }, [])

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

  const deploymentName = accessPoints[0]?.deployment || zones[0]?.deployment || 'JATARA-DEMO-001'

  function zoneDisplayName(zone) {
    const firstCode = zone.access_point_codes?.[0]
    return (firstCode && apByCode[firstCode]?.name) || zone.zone
  }

  const presenceByZone = useMemo(() => {
    const m = {}
    for (const p of presence) {
      if (!p.current_zone) continue
      ;(m[p.current_zone] ||= []).push(p)
    }
    return m
  }, [presence])

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
    return first ? [first.latitude, first.longitude] : [17.4330, 78.4550]
  }, [accessPoints])

  function focusOnAp(code) {
    setViewMode('map')
    setTimeout(() => {
      const ap = apByCode[code]
      if (ap?.latitude != null && mapRef.current) {
        mapRef.current.flyTo([ap.latitude, ap.longitude], 16, { duration: 0.6 })
      }
    }, 150)
  }

  async function toggleZoneEnabled(zone) {
    setBusyZone(zone.zone)
    try {
      if (zone.enabled) {
        await disableZone(zone.zone)
        notify(`Zone ${zone.zone} disabled`, { tone: 'neutral' })
      } else {
        await enableZone(zone.zone)
        notify(`Zone ${zone.zone} enabled`, { tone: 'success' })
      }
      await refreshAccessPoints()
    } catch (err) {
      notify(friendlyErrorMessage(err), { tone: 'error' })
    } finally {
      setBusyZone(null)
    }
  }

  if (loading) return <LoadingSkeleton rows={8} />
  if (error) return <ErrorState message={error} onRetry={refresh} />

  const selectedPresence = selectedConstableId ? presence.find((p) => p.constable_id === selectedConstableId) : null

  // Aggregated operational metrics
  const totalOfficersConnected = presence.filter((p) => p.status === 'connected').length
  const totalOfficersMoving = Object.keys(movingOfficers).length
  const totalOnlineAps = accessPoints.filter((a) => a.enabled && a.status === 'online').length

  return (
    <div className="space-y-4">
      {/* Page Header with View Switcher */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink-900">AP-Based Police Presence</h1>
          <p className="mt-1 text-sm text-ink-500">
            Event: <span className="font-semibold text-ink-700">{deploymentName}</span> · Division of Zones & Approximate Access Point Coverage
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* View Mode Toggle */}
          <div className="inline-flex rounded-xl border border-line bg-surface p-1 shadow-sm">
            <button
              type="button"
              onClick={() => setViewMode('zones')}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                viewMode === 'zones'
                  ? 'bg-brand-600 text-white shadow-sm'
                  : 'text-ink-600 hover:bg-canvas hover:text-ink-900'
              }`}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              Division of Zones
            </button>
            <button
              type="button"
              onClick={() => setViewMode('map')}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                viewMode === 'map'
                  ? 'bg-brand-600 text-white shadow-sm'
                  : 'text-ink-600 hover:bg-canvas hover:text-ink-900'
              }`}
            >
              <MapIcon className="h-3.5 w-3.5" />
              Geographic Map
            </button>
          </div>

          <Button variant="secondary" size="sm" icon={RefreshCw} onClick={refresh}>
            Refresh
          </Button>
        </div>
      </div>

      {/* Operational Telemetry Banner */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
        <div className="rounded-xl border border-line bg-surface p-3.5 shadow-sm">
          <div className="flex items-center justify-between text-ink-500">
            <span className="text-xs font-semibold uppercase tracking-wider">Configured Zones</span>
            <LayoutGrid className="h-4 w-4 text-brand-500" />
          </div>
          <p className="mt-1.5 text-2xl font-bold text-ink-900">{zones.length}</p>
          <span className="text-[11px] text-ink-500">Operational sectors</span>
        </div>

        <div className="rounded-xl border border-line bg-surface p-3.5 shadow-sm">
          <div className="flex items-center justify-between text-ink-500">
            <span className="text-xs font-semibold uppercase tracking-wider">Access Points</span>
            <Wifi className="h-4 w-4 text-signal-green" />
          </div>
          <p className="mt-1.5 text-2xl font-bold text-signal-green">{totalOnlineAps} <span className="text-sm font-normal text-ink-500">/ {accessPoints.length}</span></p>
          <span className="text-[11px] text-ink-500">Enterprise APs online</span>
        </div>

        <div className="rounded-xl border border-line bg-surface p-3.5 shadow-sm">
          <div className="flex items-center justify-between text-ink-500">
            <span className="text-xs font-semibold uppercase tracking-wider">Stationed Police</span>
            <Users className="h-4 w-4 text-brand-600" />
          </div>
          <p className="mt-1.5 text-2xl font-bold text-ink-900">{totalOfficersConnected}</p>
          <span className="text-[11px] text-ink-500">Active Wi-Fi associations</span>
        </div>

        <div className="rounded-xl border border-line bg-surface p-3.5 shadow-sm">
          <div className="flex items-center justify-between text-ink-500">
            <span className="text-xs font-semibold uppercase tracking-wider">In Transit / Roam</span>
            <Activity className="h-4 w-4 text-signal-amber" />
          </div>
          <p className="mt-1.5 text-2xl font-bold text-signal-amber">{totalOfficersMoving}</p>
          <span className="text-[11px] text-ink-500">Inter-zone transitions</span>
        </div>

        {canSeeCCTV && (
          <div className="col-span-2 sm:col-span-4 lg:col-span-1 rounded-xl border border-line bg-surface p-3.5 shadow-sm">
            <div className="flex items-center justify-between text-ink-500">
              <span className="text-xs font-semibold uppercase tracking-wider">CCTV Cameras</span>
              <Video className="h-4 w-4 text-purple-600" />
            </div>
            <p className="mt-1.5 text-2xl font-bold text-ink-900">{cameras.length}</p>
            <span className="text-[11px] text-ink-500">Fixed surveillance feeds</span>
          </div>
        )}
      </div>

      <RecentZoneAlerts camerasByZone={canSeeCCTV ? camerasByZone : null} />

      {/* Main Operational Workspace: Center Area + Right Sidebar */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_340px]">
        {/* CENTER AREA */}
        <div className="space-y-4">
          {viewMode === 'zones' ? (
            /* DIVISION OF ZONES SECTOR GRID */
            <div className="space-y-4">
              <div className="flex items-center justify-between rounded-xl border border-brand-200 bg-brand-50/60 px-4 py-2.5 text-xs text-brand-900">
                <div className="flex items-center gap-2">
                  <Shield className="h-4 w-4 text-brand-600 shrink-0" />
                  <span>
                    <strong>Tactical Division of Event Zones:</strong> Officers are localized by approximate Wi-Fi radio coverage (~50–75m perimeter) around assigned AP nodes, not continuous battery-draining GPS.
                  </span>
                </div>
                <span className="font-semibold uppercase tracking-wider text-brand-700">WPA3-Enterprise</span>
              </div>

              {zones.length === 0 ? (
                <Card className="flex flex-col items-center justify-center p-12 text-center">
                  <LayoutGrid className="h-10 w-10 text-ink-300" />
                  <p className="mt-3 text-base font-semibold text-ink-900">No zones configured for this deployment yet</p>
                  <p className="mt-1 text-sm text-ink-500">Run database seeding or add access points to establish operational sectors.</p>
                </Card>
              ) : (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-2">
                  {zones.map((zone) => {
                    const zoneAps = (zone.access_point_codes || []).map((c) => apByCode[c]).filter(Boolean)
                    const zoneOfficers = presenceByZone[zone.zone] || []
                    const liveMoving = movingCountByZone[zone.zone] || 0
                    const zoneCams = camerasByZone[zone.zone] || []
                    const ZoneIconComponent = getZoneIcon(zone.zone, zoneDisplayName(zone))

                    return (
                      <ZoneSectorBay
                        key={zone.zone}
                        zone={zone}
                        displayName={zoneDisplayName(zone)}
                        icon={ZoneIconComponent}
                        aps={zoneAps}
                        officers={zoneOfficers}
                        movingCount={liveMoving}
                        cameras={canSeeCCTV ? zoneCams : null}
                        selectedConstableId={selectedConstableId}
                        onSelectOfficer={(id) => setSelectedConstableId(id)}
                        onTargetAlert={() => setTargetedAlertZone(zone.zone)}
                        onFocusAp={focusOnAp}
                        canManage={canManage}
                        onToggleEnabled={() => toggleZoneEnabled(zone)}
                        busy={busyZone === zone.zone}
                        constableLabel={constableLabel}
                        deviceIdentifier={deviceIdentifier}
                      />
                    )
                  })}
                </div>
              )}
            </div>
          ) : (
            /* GEOGRAPHIC MAP VIEW (LEAFLET) */
            <Card className="relative h-[65vh] animate-rise-in overflow-hidden">
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
                    if (moving) return null
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
              </div>
            </Card>
          )}
        </div>

        {/* RIGHT SIDEBAR: OFFICER DETAILS & EMERGENCY ALERTS */}
        <div className="space-y-4">
          {selectedPresence ? (
            <OfficerDetailsPanel
              presence={selectedPresence}
              label={officerLabel(selectedPresence)}
              apName={apByCode[selectedPresence.current_access_point_code]?.name}
              moving={movingOfficers[selectedPresence.device_id]}
              onClose={() => setSelectedConstableId(null)}
            />
          ) : (
            <Card className="p-4 text-center text-sm text-ink-500">
              <Users className="mx-auto h-7 w-7 text-ink-300 mb-1.5" />
              <p className="font-semibold text-ink-700">Officer Telemetry Inspector</p>
              <p className="text-xs mt-0.5">Click any officer badge in a sector to view their AP association and movement history.</p>
            </Card>
          )}

          {canSendZoneAlert(user?.role) && (
            <EmergencyAlertPanel
              zones={zones}
              defaultZone={targetedAlertZone}
              zoneDisplayName={zoneDisplayName}
              constableLabel={constableLabel}
            />
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * Tactical Zone Sector Bay Component:
 * Represents one clear division of the operational event area with AP coverage and connected officers.
 */
function ZoneSectorBay({
  zone,
  displayName,
  icon: ZoneIcon,
  aps,
  officers,
  movingCount,
  cameras,
  selectedConstableId,
  onSelectOfficer,
  onTargetAlert,
  onFocusAp,
  canManage,
  onToggleEnabled,
  busy,
  constableLabel,
  deviceIdentifier,
}) {
  const connectedOfficers = officers.filter((p) => p.status === 'connected')
  const staleOfficers = officers.filter((p) => p.status === 'stale' || p.status === 'disconnected')

  return (
    <Card className={`overflow-hidden transition-all duration-200 border-line ${!zone.enabled ? 'opacity-70 bg-canvas/60' : 'bg-surface shadow-card'}`}>
      {/* Zone Header */}
      <div className="border-b border-line bg-canvas/40 px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className={`rounded-xl p-2 shrink-0 ${zone.enabled ? 'bg-brand-50 text-brand-600 border border-brand-200' : 'bg-ink-100 text-ink-500'}`}>
              <ZoneIcon className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-bold uppercase tracking-wider text-brand-700">{zone.zone}</span>
                <StatusBadge status={zone.enabled ? 'online' : 'disconnected'} label={zone.enabled ? 'Active Sector' : 'Disabled'} />
              </div>
              <h3 className="truncate text-base font-bold text-ink-900 leading-tight mt-0.5">{displayName}</h3>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold ${
              connectedOfficers.length > 0 ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-canvas text-ink-500 border border-line'
            }`}>
              <Users className="h-3 w-3" />
              {connectedOfficers.length} {connectedOfficers.length === 1 ? 'Officer' : 'Officers'}
            </span>

            {canManage && (
              <button
                type="button"
                onClick={onToggleEnabled}
                disabled={busy}
                title={zone.enabled ? 'Disable sector' : 'Enable sector'}
                className="rounded-lg p-1.5 text-ink-500 hover:bg-canvas hover:text-ink-900 transition-colors"
              >
                {zone.enabled ? <PowerOff className="h-4 w-4 text-signal-amber" /> : <Power className="h-4 w-4 text-signal-green" />}
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Access Points Infrastructure Bay */}
        <div className="rounded-xl border border-line bg-canvas/40 p-3">
          <div className="flex items-center justify-between text-xs text-ink-500 mb-2">
            <span className="font-semibold uppercase tracking-wider flex items-center gap-1.5">
              <Wifi className="h-3.5 w-3.5 text-signal-green" />
              Wi-Fi AP Coverage Nodes
            </span>
            <span className="text-[11px] font-mono text-ink-400">~60–75m RF Perimeter</span>
          </div>

          {aps.length === 0 ? (
            <p className="text-xs text-ink-400 italic">No access points assigned to this sector.</p>
          ) : (
            <div className="grid grid-cols-1 gap-2">
              {aps.map((ap) => (
                <div key={ap.id} className="flex items-center justify-between rounded-lg border border-line bg-surface px-3 py-2 text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${!ap.enabled ? 'bg-ink-300' : ap.status === 'online' ? 'bg-signal-green animate-pulse' : 'bg-signal-red'}`} />
                    <div className="min-w-0">
                      <span className="font-mono font-bold text-ink-900 mr-2">{ap.code}</span>
                      <span className="text-ink-600 truncate">{ap.name}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[11px] text-ink-400 hidden sm:inline">2.4/5GHz</span>
                    <button
                      type="button"
                      onClick={() => onFocusAp(ap.code)}
                      className="rounded border border-line px-2 py-0.5 text-[11px] font-medium text-brand-600 hover:bg-brand-50"
                    >
                      Locate
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Stationed Police Officers in this Zone */}
        <div>
          <div className="flex items-center justify-between text-xs text-ink-500 mb-2">
            <span className="font-semibold uppercase tracking-wider flex items-center gap-1.5">
              <Shield className="h-3.5 w-3.5 text-brand-600" />
              Officers In Sector ({officers.length})
            </span>
            {movingCount > 0 && (
              <span className="font-semibold text-signal-amber flex items-center gap-1 animate-pulse">
                <Activity className="h-3 w-3" />
                {movingCount} Moving
              </span>
            )}
          </div>

          {officers.length === 0 ? (
            <div className="rounded-xl border border-dashed border-line p-3 text-center text-xs text-ink-400">
              No officers currently connected in this sector.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2">
              {officers.map((p) => {
                const isSelected = selectedConstableId === p.constable_id
                const badge = constableLabel(p.constable_id)
                const dev = deviceIdentifier(p.device_id)

                return (
                  <button
                    key={p.device_id}
                    type="button"
                    onClick={() => onSelectOfficer(p.constable_id)}
                    className={`w-full text-left rounded-xl p-2.5 transition-all border flex items-center justify-between gap-3 ${
                      isSelected
                        ? 'border-brand-500 bg-brand-50/70 shadow-sm ring-2 ring-brand-200'
                        : 'border-line bg-surface hover:border-line-strong hover:bg-canvas/50'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="relative shrink-0">
                        <div className={`h-8 w-8 rounded-full flex items-center justify-center font-bold text-xs text-white ${
                          p.status === 'connected' ? 'bg-brand-600' : 'bg-ink-400'
                        }`}>
                          {badge.slice(-3) || 'POL'}
                        </div>
                        <span className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white ${
                          p.status === 'connected' ? 'bg-emerald-500' : 'bg-amber-500'
                        }`} />
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="font-semibold text-xs text-ink-900 truncate">{badge}</p>
                          {dev && <span className="font-mono text-[10px] text-ink-400">({dev})</span>}
                        </div>
                        <p className="text-[11px] text-ink-500 truncate">
                          Associated: <span className="font-mono font-medium text-ink-700">{p.current_access_point_code || 'AP'}</span> · {formatRelativeTime(p.last_seen_at)}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <div className="flex items-center gap-1 text-[11px] text-emerald-600 font-medium" title="Wi-Fi Signal: Strong">
                        <Signal className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">-62 dBm</span>
                      </div>
                      <span className="text-xs text-ink-400">&rarr;</span>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Sector Footer Actions & CCTV Badges */}
        <div className="flex items-center justify-between pt-2 border-t border-line text-xs">
          <div className="flex items-center gap-1.5">
            {cameras && cameras.length > 0 ? (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-purple-700 bg-purple-50 border border-purple-200 px-2 py-0.5 rounded-full">
                <Video className="h-3 w-3" />
                {cameras.length} CCTV {cameras.length === 1 ? 'Cam' : 'Cams'}
              </span>
            ) : (
              <span className="text-[11px] text-ink-400">No CCTV cameras</span>
            )}
          </div>

          <button
            type="button"
            onClick={onTargetAlert}
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-signal-red hover:underline"
          >
            <ShieldAlert className="h-3.5 w-3.5" />
            Alert Sector
          </button>
        </div>
      </div>
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
  }, [presence.device_id, presence.handoff_count])

  return (
    <Card className="animate-rise-in p-5 shadow-card">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-brand-600">Officer Telemetry</span>
          <h3 className="text-base font-bold text-ink-900">{label}</h3>
        </div>
        <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-ink-400 hover:bg-line/60 hover:text-ink-900" aria-label="Close">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mb-3">
        <StatusBadge status={moving ? 'moving' : presence.status} />
      </div>

      <InfoGrid columns={1}>
        {moving ? (
          <Info label="Active Roaming">
            {moving.fromAccessPointCode || '—'} &rarr; {moving.targetAccessPointCode} ({Math.round(moving.progress ?? 0)}%)
          </Info>
        ) : (
          <Info label="Associated Access Point">{presence.current_access_point_code} ({apName || '—'})</Info>
        )}
        <Info label="Current Sector Zone">{moving ? moving.targetZone || presence.current_zone : presence.current_zone || '—'}</Info>
        <Info label="Telemetry Source">{presence.location_source}</Info>
        <Info label="Last Heartbeat">{formatDateTime(presence.last_seen_at)}</Info>
        <Info label="AP Handoffs Recorded">{presence.handoff_count}</Info>
      </InfoGrid>

      <div className="mt-4 border-t border-line pt-3">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-500">AP Association History</p>
        {historyError && <p className="text-sm text-signal-red">{historyError}</p>}
        {!history && !historyError && <p className="text-sm text-ink-500">Loading…</p>}
        {history?.length === 0 && <p className="text-sm text-ink-500">No roaming transitions recorded yet.</p>}
        <ul className="space-y-1.5 max-h-48 overflow-y-auto scrollbar-thin">
          {history?.map((h) => (
            <li key={h.id} className="rounded-lg border border-line bg-canvas/50 px-3 py-1.5 text-xs">
              <div className="flex items-center justify-between text-ink-400">
                <span>{formatDateTime(h.occurred_at)}</span>
                <span className="font-mono">{h.source === 'simulator' ? 'Virtual' : 'Physical'}</span>
              </div>
              <p className="font-medium text-ink-800 mt-0.5">
                {h.previous_access_point_id ? 'Roam / Handoff' : 'Initial Association'}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </Card>
  )
}

function RecentZoneAlerts({ camerasByZone }) {
  const { zoneAlerts } = useOperations()
  const recent = zoneAlerts.filter((a) => Date.now() - a.at < 30000)
  if (recent.length === 0) return null
  return (
    <div className="space-y-2">
      {recent.map((a, i) => {
        const relevantCameras = camerasByZone ? camerasByZone[a.zone] || [] : null
        return (
          <div key={`${a.at}-${i}`} className="animate-rise-in rounded-xl border border-red-200 bg-red-50 px-4 py-3 shadow-sm">
            <div className="flex items-center gap-3">
              <ShieldAlert className="h-5 w-5 shrink-0 text-signal-red" aria-hidden="true" />
              <div className="min-w-0">
                <p className="font-bold text-red-900">SECTOR EMERGENCY ALERT · {a.zone}</p>
                <p className="truncate text-sm text-red-800">{a.message} · {a.targetedCount} officer{a.targetedCount === 1 ? '' : 's'} alerted</p>
              </div>
            </div>
            {relevantCameras != null && relevantCameras.length > 0 && (
              <div className="mt-2 flex flex-wrap items-center gap-1.5 pl-8">
                <span className="text-xs font-semibold uppercase tracking-wide text-red-700">CCTV Coverage:</span>
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

function EmergencyAlertPanel({ zones, defaultZone, zoneDisplayName, constableLabel }) {
  const [zone, setZone] = useState(defaultZone || '')
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    if (defaultZone) setZone(defaultZone)
    else if (!zone && zones.length > 0) setZone(zones[0].zone)
  }, [defaultZone, zones, zone])

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
    <Card className="animate-rise-in p-4 shadow-card">
      <div className="flex items-center gap-2 mb-3">
        <Radio className="h-4 w-4 text-signal-red" />
        <div>
          <h3 className="font-bold text-sm text-ink-900">Broadcast Sector Alert</h3>
          <p className="text-[11px] text-ink-500">Transmitted only to officers connected in target sector</p>
        </div>
      </div>

      <form onSubmit={handleSend} className="space-y-3">
        <div>
          <label className="block text-xs font-semibold text-ink-700 mb-1">Target Sector Zone</label>
          <select className="input text-xs" value={zone} onChange={(e) => setZone(e.target.value)}>
            {zones.map((z) => (
              <option key={z.zone} value={z.zone}>{z.zone} — {zoneDisplayName(z)}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-ink-700 mb-1">Emergency Message</label>
          <textarea
            className="input text-xs"
            rows={2}
            maxLength={500}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="e.g. CROWD SURGE AT MAIN GATE. BACKUP REQUIRED."
          />
        </div>

        {err && <p className="text-xs text-signal-red">{err}</p>}

        <Button type="submit" variant="danger" size="sm" icon={ShieldAlert} loading={sending} disabled={!zone || !message.trim()}>
          Broadcast Alert
        </Button>
      </form>

      {result && (
        <div className="mt-3 border-t border-line pt-2 text-xs">
          <p className="font-semibold text-emerald-700 mb-1">Alert Dispatched ({result.targeted_device_count} officers notified)</p>
          {result.targeted_constable_ids.length > 0 && (
            <ul className="space-y-0.5 text-ink-600">
              {result.targeted_constable_ids.map((id) => (
                <li key={id}>✓ {constableLabel(id)}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Card>
  )
}
