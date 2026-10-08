// Plain-language wording for values the backend reports as technical codes.
// Anything not listed falls back to a readable version of the raw value,
// so a new backend value never shows up as an empty or broken label.

function humanize(value) {
  if (!value) return 'Unknown'
  const text = String(value).replace(/[._]/g, ' ')
  return text.charAt(0).toUpperCase() + text.slice(1)
}

function lookup(map, value) {
  return map[value] || humanize(value)
}

const STATUS_LABELS = {
  new: 'New',
  verified: 'Verified',
  rejected: 'Rejected',
  assigned: 'Assigned',
  en_route: 'On the way',
  arrived: 'Arrived',
  resolved: 'Resolved',
  closed: 'Closed',
  needs_review: 'Needs review',
  uploading: 'Uploading',
  uploaded: 'Uploaded',
  archived: 'Archived',
  available: 'Available',
  busy: 'Busy',
  pending: 'Waiting',
  accepted: 'Accepted',
  completed: 'Completed',
  active: 'Active',
  inactive: 'Inactive',
  online: 'Online',
  stale: 'Weak signal',
  offline: 'Offline',
  recording: 'Recording',
  open: 'Open',
  acknowledged: 'Received',
  warning: 'Warning',
  critical: 'Urgent',
  cancelled: 'Cancelled',
  failed: 'Failed',
  sent: 'Sent',
  executed: 'Done',
  timeout: 'No response',
  live: 'Live',
  ended: 'Ended',
  // AP-based presence (PresenceConnectionStatus) -- "disconnected" here is
  // the officer's last-known-AP state going stale/offline, never removed
  // from view (see VirtualAP.jsx). "moving" is a client-only transient
  // label layered on top of these, never a backend enum value itself.
  connected: 'Connected',
  disconnected: 'Offline',
  moving: 'Moving',
}

const ALERT_TYPE_LABELS = {
  low_battery: 'Battery is low',
  critical_battery: 'Battery almost empty',
  device_offline: 'Camera went offline',
  device_stale: 'Camera signal is weak',
  recording_device_offline: 'Camera went offline while recording',
  command_failed: 'Remote action failed',
  command_timeout: 'Camera did not respond',
}

const COMMAND_TYPE_LABELS = {
  start_recording: 'Start recording',
  stop_recording: 'Stop recording',
  start_live_stream: 'Start live view',
  stop_live_stream: 'Stop live view',
  switch_camera_front: 'Use front camera',
  switch_camera_back: 'Use back camera',
}

const TRIGGER_LABELS = {
  emergency_button: 'Emergency button pressed',
  manual: 'Started by the constable',
  remote: 'Started from the control room',
  live_stream: 'Live view',
}

const ACTIVITY_LABELS = {
  'auth.login_success': 'Signed in',
  'auth.login_failed': 'Failed sign-in attempt',
  'incident.created': 'Incident created',
  'incident.verified': 'Incident verified',
  'incident.rejected': 'Incident rejected',
  'incident.needs_review': 'Incident marked for review',
  'incident.dispatched': 'Incident sent to a constable',
  'incident.status_changed': 'Incident status changed',
  'assignment.created': 'Constable assigned',
  'assignment.accepted': 'Assignment accepted',
  'assignment.rejected': 'Assignment declined',
  'assignment.status_changed': 'Assignment progress updated',
  'evidence.uploaded': 'Evidence uploaded',
  'evidence.verified': 'Evidence verified',
  'evidence.rejected': 'Evidence rejected',
  'evidence.archived': 'Evidence archived',
  'evidence.downloaded': 'Evidence downloaded',
  'device.registered': 'Camera registered',
  'device.re_registered': 'Camera registered again',
  'device.status_changed': 'Camera status changed',
  'command.created': 'Remote action requested',
  'command.cancelled': 'Remote action cancelled',
  'recording.started': 'Recording started',
  'recording.completed': 'Recording finished',
  'recording.cancelled': 'Recording cancelled',
  'recording.failed': 'Recording failed',
  'recording.played': 'Recording watched',
  'recording.chunk_streamed': 'Recording watched',
  'live_stream.started': 'Live view started',
  'live_stream.ended': 'Live view ended',
  'live_stream.recorded': 'Live view saved',
  'police_station.created': 'Police station added',
  'police_station.updated': 'Police station updated',
  'police_station.deleted': 'Police station removed',
  'settings.updated': 'Settings changed',
  'alert.created': 'Alert raised',
  'alert.updated': 'Alert updated',
  'alert.resolved': 'Alert resolved',
  'command.sent': 'Remote action sent to the camera',
  'command.acknowledged': 'Camera received the action',
  'command.executed': 'Camera completed the action',
  'command.failed': 'Remote action failed',
  'constable.location_updated': 'Constable location updated',
  'battery.updated': 'Battery level updated',
  'battery.warning': 'Battery is low',
  'battery.critical': 'Battery almost empty',
  'device.online': 'Camera came online',
  'device.offline': 'Camera went offline',
  'device.stale': 'Camera signal is weak',
  'device.heartbeat': 'Camera checked in',
  // AP-based presence / Virtual AP (see app/routers/presence.py,
  // access_points.py log_action calls -- exact action strings, not guessed).
  'presence.connected': 'Officer connected to an access point',
  'presence.handoff': 'Officer handed off between access points',
  'presence_virtual.connected': 'Officer connected to a virtual access point',
  'presence_virtual.handoff': 'Officer handed off between virtual access points',
  zone_emergency_alert_sent: 'Zone emergency alert sent',
  access_point_created: 'Access point registered',
  access_point_updated: 'Access point updated',
  access_point_enabled: 'Access point enabled',
  access_point_disabled: 'Access point disabled',
  access_point_deleted: 'Access point removed',
  zone_enabled: 'Zone enabled',
  zone_disabled: 'Zone disabled',
}

export const ACTIVITY_FILTER_OPTIONS = [
  'auth.login_success',
  'auth.login_failed',
  'incident.created',
  'incident.verified',
  'incident.rejected',
  'incident.dispatched',
  'evidence.uploaded',
  'evidence.verified',
  'evidence.rejected',
  'evidence.downloaded',
  'command.created',
  'command.executed',
  'alert.created',
  'device.offline',
  'recording.started',
  'recording.completed',
  'recording.played',
  'live_stream.started',
  'police_station.created',
  'police_station.updated',
  'police_station.deleted',
  'settings.updated',
  'presence.handoff',
  'presence_virtual.handoff',
  'zone_emergency_alert_sent',
]

export const statusLabel = (value) => lookup(STATUS_LABELS, value)
export const alertTypeLabel = (value) => lookup(ALERT_TYPE_LABELS, value)
export const commandTypeLabel = (value) => lookup(COMMAND_TYPE_LABELS, value)
export const triggerLabel = (value) => lookup(TRIGGER_LABELS, value)
export const activityLabel = (value) => lookup(ACTIVITY_LABELS, value)

export const ALERT_TYPE_OPTIONS = Object.keys(ALERT_TYPE_LABELS)
export const COMMAND_TYPE_OPTIONS = ['start_recording', 'stop_recording', 'start_live_stream', 'stop_live_stream']

// Failure reasons come straight from the camera or server and are sometimes
// raw error text. Short, readable reasons are shown as they are; anything
// that looks technical becomes a plain sentence (the original stays
// available as a hover tooltip via rawFailure).
export function friendlyFailure(reason) {
  if (!reason) return '—'
  const technical = reason.length > 80 || /exception|error|traceback|:\/\/|errno|stack/i.test(reason)
  return technical ? 'The camera could not complete this action.' : reason
}
