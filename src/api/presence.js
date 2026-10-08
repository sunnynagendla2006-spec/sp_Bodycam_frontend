import { client } from './client'

// GET /presence/ -- admin/control_room: every device's presence.
// station: only their own station's constables. constable: only their own.
// (role-scoped server-side -- see backend app/routers/presence.py::list_presence)
export async function listPresence() {
  const { data } = await client.get('/presence/')
  return data
}

export async function getDevicePresence(deviceId) {
  const { data } = await client.get(`/presence/devices/${deviceId}`)
  return data
}

// Ordered movement/handoff history for one device (most recent first).
export async function getDevicePresenceHistory(deviceId, { limit = 50 } = {}) {
  const { data } = await client.get(`/presence/devices/${deviceId}/history`, { params: { limit } })
  return data
}

// admin/control_room only (see require_role on POST /presence/zones/{zone}/alert).
// The backend is the sole source of truth for who gets targeted -- this
// call's response (targeted_constable_ids/targeted_device_count) is what
// the UI displays, never a frontend-computed guess.
export async function sendZoneAlert(zone, message) {
  const { data } = await client.post(`/presence/zones/${encodeURIComponent(zone)}/alert`, { message })
  return data
}
