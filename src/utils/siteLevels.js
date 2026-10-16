// Shared presentation rules for network monitoring (colours, labels, wording).
// The metric everywhere is ACTIVE CLIENT ASSOCIATIONS from network telemetry, never a head count.

export const LEVEL_COLOR = { critical: '#dc2626', warning: '#f59e0b', ok: '#16a34a', none: '#94a3b8' }

export function levelColor(level, count) {
  if (level === 'critical') return LEVEL_COLOR.critical
  if (level === 'warning') return LEVEL_COLOR.warning
  return count > 0 ? LEVEL_COLOR.ok : LEVEL_COLOR.none
}

export const STATE_COLOR = { online: '#16a34a', stale: '#f59e0b', offline: '#dc2626', unknown: '#94a3b8' }

export const QUALITY_LABEL = {
  live: 'Live telemetry',
  simulated: 'SIMULATED data',
  mixed: 'Mixed live and simulated',
  snapshot: 'Snapshot-derived',
  stale: 'Stale',
  none: 'No data',
}

export const METRIC_NOTE =
  'Counts devices currently associated to access points according to network telemetry. It is not a count of people: one person may carry several devices, and some devices are not connected at all.'

export function ageText(date) {
  if (!date) return 'never'
  const seconds = Math.max(0, Math.round((Date.now() - new Date(date).getTime()) / 1000))
  if (seconds < 60) return `${seconds}s ago`
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h ago`
  return `${Math.round(seconds / 86400)}d ago`
}

// Lon/lat GeoJSON rings -> Leaflet [lat, lon]
export function ringsToLatLng(rings) {
  return (rings || []).map((ring) => ring.map(([lon, lat]) => [lat, lon]))
}
