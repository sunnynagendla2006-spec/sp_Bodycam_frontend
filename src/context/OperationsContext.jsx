import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from './AuthContext.jsx'
import { useToast } from './ToastContext.jsx'
import { useOpsSocket } from '../hooks/useOpsSocket.js'
import { listDevices } from '../api/devices.js'
import { listAlerts } from '../api/alerts.js'
import { listRecordings } from '../api/recordings.js'
import { listAllCommands } from '../api/commands.js'
import { listActiveLiveStreams } from '../api/liveStream.js'
import { listPresence } from '../api/presence.js'
import { listAccessPoints, listZones } from '../api/accessPoints.js'
import { listEventZones } from '../api/eventZones.js'

const OperationsContext = createContext(null)

// Event names that represent something genuinely worth interrupting the
// operator with a toast for -- everything else just updates state quietly.
// This list is exactly the set of events the backend actually publishes
// for alert-worthy conditions (see app/services/events.py) -- nothing
// invented.
const NOTIFY_EVENTS = new Set([
  'battery.critical',
  'device.offline',
  'recording.device_offline',
  'command.failed',
  'alert.created',
  'zone.emergency_alert',
])

// What the operator reads in the pop-up for each of those events.
const EVENT_MESSAGES = {
  'battery.critical': 'A camera battery is almost empty',
  'device.offline': 'A camera went offline',
  'recording.device_offline': 'A camera went offline during a recording',
  'command.failed': 'A remote action failed',
  'alert.created': 'New alert',
  'zone.emergency_alert': 'Zone emergency alert',
}

// Events that mean "a device's live status/battery/location may have
// changed" -- payload shape confirmed against _device_summary /
// publish_battery_updated in app/services/events.py.
const DEVICE_TOUCHING_EVENTS = new Set([
  'device.registered',
  'device.heartbeat',
  'device.online',
  'device.stale',
  'device.offline',
  'battery.updated',
  'battery.warning',
  'battery.critical',
  // Published by events.py::publish_constable_location_updated on every
  // GPS report -- was missing here, so a device's displayed coordinates
  // (Live Map, Monitoring, Device Details) only ever updated on the next
  // UNRELATED device-touching event (e.g. the next heartbeat), not on the
  // location update itself.
  'constable.location_updated',
])

const RECORDING_TOUCHING_EVENTS = new Set([
  'recording.started',
  'recording.chunk_uploaded',
  'recording.completed',
  'recording.cancelled',
  'recording.failed',
  'recording.device_offline',
])

const COMMAND_TOUCHING_EVENTS = new Set([
  'command.sent',
  'command.acknowledged',
  'command.executed',
  'command.failed',
  'command.cancelled',
])

const LIVE_STREAM_TOUCHING_EVENTS = new Set([
  'live_stream.started',
  'live_stream.ended',
])

const ALERT_TOUCHING_EVENTS = new Set([
  'alert.created',
  'alert.updated',
  'alert.resolved',
  'battery.warning',
  'battery.critical',
  'device.stale',
  'device.offline',
  'recording.device_offline',
])

// AP-based presence: a handoff/connect/status change means both the
// presence list AND the derived zone counts (police_count/moving_count)
// may have changed. Real event names confirmed against
// app/services/events.py -- publish_presence_status_changed emits
// "presence.stale"/"presence.offline"/"presence.online" (never a literal
// "presence.disconnected" or generic "presence.status_changed" in
// practice, since every PresenceConnectionStatus value is mapped).
const PRESENCE_TOUCHING_EVENTS = new Set([
  'presence.connected',
  'presence.handoff',
  'presence.online',
  'presence.stale',
  'presence.offline',
  'presence.status_changed',
])

// access_points.py publishes no WebSocket events at all (confirmed by
// inspection -- admin enable/disable is a rare, synchronous admin action).
// The access-point/zone list is refreshed on load and whenever a presence
// event fires (zone counts are derived from presence), plus a manual
// `refreshAccessPoints` the Virtual AP page can call after an admin
// enable/disable so the UI doesn't wait for an unrelated event.

export function OperationsProvider({ children }) {
  const { user } = useAuth()
  const { notify } = useToast()

  const [devices, setDevices] = useState([])
  const [alerts, setAlerts] = useState([])
  const [recordings, setRecordings] = useState([])
  const [commands, setCommands] = useState([])
  const [liveStreams, setLiveStreams] = useState([])
  const [presence, setPresence] = useState([])
  const [accessPoints, setAccessPoints] = useState([])
  const [zones, setZones] = useState([])
  const [eventZones, setEventZones] = useState([])
  const [officerLocations, setOfficerLocations] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [lastEvent, setLastEvent] = useState(null)

  // Client-side-only, never persisted (mirrors the backend's own
  // movement_state.py -- "moving" is in-memory/TTL-bound there too):
  // device_id -> {from_access_point_code, target_access_point_code,
  // from_zone, target_zone, progress, source, at}. Populated purely from
  // live presence.moving WebSocket frames, cleared the moment a real
  // arrival event (handoff/connected/stale/offline) lands for that same
  // device, or after MOVING_TTL_MS with no further ping -- so an
  // abandoned demo movement never shows "MOVING" forever.
  const [movingOfficers, setMovingOfficers] = useState({})
  const movingTimers = useRef({})

  // Most recent zone emergency alerts this control-room connection has
  // observed (zone + message + targeted_count, exactly what the backend's
  // own zone.emergency_alert broadcast carries -- see events.py
  // ::publish_zone_emergency_alert). Capped so it never grows unbounded.
  const [zoneAlerts, setZoneAlerts] = useState([])

  // Coalesce bursts of related events (e.g. many chunk_uploaded messages
  // during an active recording) into a single refetch rather than one
  // network call per WebSocket message.
  const pendingRefetch = useRef({ devices: false, alerts: false, recordings: false, commands: false, liveStreams: false, presence: false, accessPoints: false, zones: false, eventZones: false })
  const refetchTimer = useRef(null)

  const canSeeOperations = ['admin', 'control_room', 'station', 'constable'].includes(user?.role)

  const loadAll = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [d, a, r, c, l, p, ap, z, ez] = await Promise.all([
        listDevices(),
        listAlerts({ limit: 100 }),
        listRecordings({ limit: 100 }),
        listAllCommands({ limit: 100 }),
        listActiveLiveStreams().catch(() => []), // citizen role would 403 -- degrade gracefully
        listPresence().catch(() => []), // citizen role would 403 -- degrade gracefully
        listAccessPoints().catch(() => []), // constable role would 403 (admin/control_room/station only) -- degrade gracefully
        listZones().catch(() => []), // same role restriction as access points
        listEventZones().catch(() => []), // geographic event zones
      ])
      setDevices(d)
      setAlerts(a)
      setRecordings(r)
      setCommands(c)
      setLiveStreams(l)
      setPresence(p)
      setAccessPoints(ap)
      setZones(z)
      setEventZones(ez)
      // Initialize officerLocations projection from devices snapshot
      const initialLocations = {}
      d.forEach((dev) => {
        if (dev.constable_id && dev.latitude != null && dev.longitude != null) {
          initialLocations[dev.constable_id] = {
            latitude: dev.latitude,
            longitude: dev.longitude,
            accuracy: dev.location_accuracy,
            locationUpdatedAt: dev.location_updated_at,
            geographicZone: dev.geographic_zone,
            zoneStatus: dev.zone_status,
            updatedAt: Date.now(),
          }
        }
      })
      setOfficerLocations(initialLocations)
    } catch (err) {
      setError(err?.message || 'Failed to load operational data')
    } finally {
      setLoading(false)
    }
  }, [])

  // Exposed for an explicit post-admin-action refresh (AP enable/disable),
  // since access_points.py publishes no WebSocket event for either action.
  const refreshAccessPoints = useCallback(async () => {
    const [ap, z] = await Promise.all([listAccessPoints().catch(() => []), listZones().catch(() => [])])
    setAccessPoints(ap)
    setZones(z)
  }, [])

  useEffect(() => {
    if (canSeeOperations) loadAll()
    else setLoading(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canSeeOperations])

  const scheduleRefetch = useCallback((slice) => {
    pendingRefetch.current[slice] = true
    if (refetchTimer.current) return
    refetchTimer.current = setTimeout(async () => {
      const pending = pendingRefetch.current
      pendingRefetch.current = { devices: false, alerts: false, recordings: false, commands: false, liveStreams: false, presence: false, accessPoints: false, zones: false }
      refetchTimer.current = null
      try {
        if (pending.devices) setDevices(await listDevices())
        if (pending.alerts) setAlerts(await listAlerts({ limit: 100 }))
        if (pending.recordings) setRecordings(await listRecordings({ limit: 100 }))
        if (pending.commands) setCommands(await listAllCommands({ limit: 100 }))
        if (pending.liveStreams) setLiveStreams(await listActiveLiveStreams())
        if (pending.presence) setPresence(await listPresence().catch(() => []))
        if (pending.accessPoints) setAccessPoints(await listAccessPoints().catch(() => []))
        if (pending.zones) setZones(await listZones().catch(() => []))
        if (pending.eventZones) setEventZones(await listEventZones().catch(() => []))
      } catch {
        // A transient refetch failure just means the UI stays at its last
        // known-good state until the next event triggers another attempt.
      }
    }, 600)
  }, [])

  const MOVING_TTL_MS = 20000 // generously above the backend's own 15s movement_state.py TTL

  const clearMoving = useCallback((deviceId) => {
    setMovingOfficers((prev) => {
      if (!prev[deviceId]) return prev
      const next = { ...prev }
      delete next[deviceId]
      return next
    })
    if (movingTimers.current[deviceId]) {
      clearTimeout(movingTimers.current[deviceId])
      delete movingTimers.current[deviceId]
    }
  }, [])

  const handleEvent = useCallback(
    (evt) => {
      setLastEvent(evt)
      if (DEVICE_TOUCHING_EVENTS.has(evt.event)) scheduleRefetch('devices')
      if (RECORDING_TOUCHING_EVENTS.has(evt.event)) scheduleRefetch('recordings')
      if (COMMAND_TOUCHING_EVENTS.has(evt.event)) scheduleRefetch('commands')
      if (LIVE_STREAM_TOUCHING_EVENTS.has(evt.event)) scheduleRefetch('liveStreams')
      if (ALERT_TOUCHING_EVENTS.has(evt.event)) scheduleRefetch('alerts')

      if (PRESENCE_TOUCHING_EVENTS.has(evt.event)) {
        scheduleRefetch('presence')
        scheduleRefetch('zones')
        const deviceId = evt.data?.device_id
        if (deviceId) clearMoving(deviceId)
      }

      // Real-time authoritative location stream handler
      if (evt.event === 'constable.location_updated') {
        const d = evt.data || {}
        const constableId = d.constable_id
        if (constableId) {
          setOfficerLocations((prev) => {
            const existing = prev[constableId]
            // Monotonic sequence / timestamp ordering guard:
            if (
              existing &&
              existing.sequenceNumber != null &&
              d.sequence_number != null &&
              d.sequence_number < existing.sequenceNumber
            ) {
              return prev
            }
            return {
              ...prev,
              [constableId]: {
                latitude: d.latitude,
                longitude: d.longitude,
                accuracy: d.accuracy,
                recordedAt: d.recorded_at,
                serverReceivedAt: d.server_received_at,
                sequenceNumber: d.sequence_number,
                geographicZone: d.geographic_zone,
                zoneStatus: d.zone_status,
                source: d.source,
                updatedAt: Date.now(),
              },
            }
          })

          // Immediately update corresponding device in state so LiveMap, Monitoring,
          // and DeviceDetails update without waiting for debounced REST polling
          setDevices((prevDevices) =>
            prevDevices.map((dev) => {
              if (dev.constable_id === constableId) {
                return {
                  ...dev,
                  latitude: d.latitude,
                  longitude: d.longitude,
                  location_accuracy: d.accuracy,
                  location_updated_at: d.server_received_at || new Date().toISOString(),
                  geographic_zone: d.geographic_zone,
                  zone_status: d.zone_status,
                }
              }
              return dev
            }),
          )
        }
      }

      // Real-time geographic zone boundary change
      if (evt.event === 'constable.zone_changed') {
        const d = evt.data || {}
        const constableId = d.constable_id
        if (constableId) {
          setOfficerLocations((prev) => {
            const existing = prev[constableId] || {}
            return {
              ...prev,
              [constableId]: {
                ...existing,
                geographicZone: d.current_zone,
                zoneStatus: d.zone_status,
                updatedAt: Date.now(),
              },
            }
          })
          setDevices((prevDevices) =>
            prevDevices.map((dev) =>
              dev.constable_id === constableId
                ? { ...dev, geographic_zone: d.current_zone, zone_status: d.zone_status }
                : dev,
            ),
          )
        }
      }

      if (evt.event && evt.event.startsWith('event_zone.')) {
        scheduleRefetch('eventZones')
      }

      if (evt.event === 'presence.moving') {
        const d = evt.data || {}
        const deviceId = d.device_id
        if (deviceId) {
          setMovingOfficers((prev) => ({
            ...prev,
            [deviceId]: {
              fromAccessPointCode: d.from_access_point_code,
              targetAccessPointCode: d.target_access_point_code,
              fromZone: d.from_zone,
              targetZone: d.target_zone,
              progress: d.progress,
              source: d.source,
              at: Date.now(),
            },
          }))
          if (movingTimers.current[deviceId]) clearTimeout(movingTimers.current[deviceId])
          movingTimers.current[deviceId] = setTimeout(() => clearMoving(deviceId), MOVING_TTL_MS)
        }
      }

      if (evt.event === 'zone.emergency_alert') {
        const d = evt.data || {}
        setZoneAlerts((prev) => [{ zone: d.zone, message: d.message, targetedCount: d.targeted_count, at: Date.now() }, ...prev].slice(0, 20))
      }

      if (NOTIFY_EVENTS.has(evt.event)) {
        const label = EVENT_MESSAGES[evt.event] || 'New update'
        const detail = evt.data?.message || ''
        notify(detail ? `${label}: ${detail}` : label, {
          tone: evt.event.includes('critical') || evt.event === 'device.offline' || evt.event === 'recording.device_offline' || evt.event === 'zone.emergency_alert' ? 'error' : 'info',
          duration: evt.event === 'zone.emergency_alert' ? 10000 : 6000,
        })
      }
    },
    [notify, scheduleRefetch, clearMoving],
  )

  const { connected } = useOpsSocket(handleEvent, { enabled: canSeeOperations })

  // Re-fetch snapshots automatically on WebSocket reconnection
  const prevConnectedRef = useRef(false)
  useEffect(() => {
    if (connected && !prevConnectedRef.current && !loading) {
      loadAll()
    }
    prevConnectedRef.current = connected
  }, [connected, loading, loadAll])

  const counts = useMemo(() => {
    const online = devices.filter((d) => d.status === 'online' || d.status === 'recording').length
    const stale = devices.filter((d) => d.status === 'stale').length
    const offline = devices.filter((d) => d.status === 'offline').length
    const recordingNow = devices.filter((d) => d.status === 'recording').length
    const activeRecordings = recordings.filter((r) => r.status === 'recording').length
    const openAlerts = alerts.filter((a) => a.status === 'open').length
    const criticalAlerts = alerts.filter((a) => a.status === 'open' && a.severity === 'critical').length
    const pendingCommands = commands.filter((c) => ['pending', 'sent', 'acknowledged'].includes(c.status)).length
    return { online, stale, offline, recordingNow, activeRecordings, openAlerts, criticalAlerts, pendingCommands, totalDevices: devices.length }
  }, [devices, alerts, recordings, commands])

  const value = {
    devices,
    alerts,
    recordings,
    commands,
    liveStreams,
    presence,
    accessPoints,
    zones,
    eventZones,
    officerLocations,
    movingOfficers,
    zoneAlerts,
    counts,
    loading,
    error,
    connected,
    lastEvent,
    refresh: loadAll,
    refreshAccessPoints,
  }

  return <OperationsContext.Provider value={value}>{children}</OperationsContext.Provider>
}

export function useOperations() {
  const ctx = useContext(OperationsContext)
  if (!ctx) throw new Error('useOperations must be used within OperationsProvider')
  return ctx
}
