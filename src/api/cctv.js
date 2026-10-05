import { client } from './client'

// admin/control_room only (require_cctv_viewer). station/constable/citizen get a 403.
export async function listCameras({ zone, enabled, status, limit = 100 } = {}) {
  const { data } = await client.get('/cctv/cameras', { params: { zone, enabled, status, limit } })
  return data
}

export async function getCamera(cameraId) {
  const { data } = await client.get(`/cctv/cameras/${cameraId}`)
  return data
}

// admin-only (require_cctv_admin).
export async function createCamera(payload) {
  const { data } = await client.post('/cctv/cameras', payload)
  return data
}

export async function updateCamera(cameraId, payload) {
  const { data } = await client.patch(`/cctv/cameras/${cameraId}`, payload)
  return data
}

export async function deleteCamera(cameraId) {
  const { data } = await client.delete(`/cctv/cameras/${cameraId}`)
  return data
}

export async function enableCamera(cameraId) {
  const { data } = await client.post(`/cctv/cameras/${cameraId}/enable`)
  return data
}

export async function disableCamera(cameraId) {
  const { data } = await client.post(`/cctv/cameras/${cameraId}/disable`)
  return data
}

// admin/control_room -- performs a REAL connectivity probe, never fakes "online".
export async function testCamera(cameraId) {
  const { data } = await client.post(`/cctv/cameras/${cameraId}/test`)
  return data
}

export async function getCameraStatus(cameraId) {
  const { data } = await client.get(`/cctv/cameras/${cameraId}/status`)
  return data
}

// Per cctv_providers.py's documented scope: this always ends in
// status=failed with a real error today (no media gateway configured) --
// the session lifecycle/RBAC/audit/WS events are fully real, the actual
// video bridge is a documented, unimplemented extension point. Never
// treat a non-"active" session as a live picture.
export async function requestCameraStream(cameraId) {
  const { data } = await client.post(`/cctv/cameras/${cameraId}/stream`)
  return data
}

export async function stopCameraStream(cameraId) {
  const { data } = await client.post(`/cctv/cameras/${cameraId}/stream/stop`)
  return data
}

// admin-only. Real WS-Discovery scan, restricted to the backend's
// CCTV_ALLOWED_NETWORKS and inherently limited to the local multicast
// domain -- never a public/internet scan. Returns candidates only; never
// auto-registers a camera.
export async function discoverCameras({ timeoutSeconds = 3 } = {}) {
  const { data } = await client.post('/cctv/discover', null, { params: { timeout_seconds: timeoutSeconds } })
  return data
}
