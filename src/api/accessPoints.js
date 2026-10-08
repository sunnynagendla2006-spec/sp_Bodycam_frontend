import { client } from './client'

// admin/control_room/station (see require_role on GET /access-points/).
export async function listAccessPoints() {
  const { data } = await client.get('/access-points/')
  return data
}

// Derived view (never a stored collection) -- police_count/moving_count
// come straight from the backend's own aggregation, never recomputed here.
export async function listZones() {
  const { data } = await client.get('/access-points/zones')
  return data
}

export async function getAccessPoint(accessPointId) {
  const { data } = await client.get(`/access-points/${accessPointId}`)
  return data
}

// admin-only (require_role("admin") on the backend).
export async function createAccessPoint(payload) {
  const { data } = await client.post('/access-points/', payload)
  return data
}

export async function updateAccessPoint(accessPointId, payload) {
  const { data } = await client.patch(`/access-points/${accessPointId}`, payload)
  return data
}

export async function enableAccessPoint(accessPointId) {
  const { data } = await client.post(`/access-points/${accessPointId}/enable`)
  return data
}

export async function disableAccessPoint(accessPointId) {
  const { data } = await client.post(`/access-points/${accessPointId}/disable`)
  return data
}

// Refused with 409 when police devices are currently associated, unless
// force=true -- see app/routers/access_points.py::delete_access_point.
// The caller is expected to catch that 409 and re-call with force after
// explicit admin confirmation, never to pass force=true blindly.
export async function deleteAccessPoint(accessPointId, { force = false } = {}) {
  const { data } = await client.delete(`/access-points/${accessPointId}`, { params: force ? { force: true } : undefined })
  return data
}
