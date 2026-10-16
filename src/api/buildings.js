import { client } from './client'

// All of these are admin/control_room (viewer) or admin-only, enforced by the
// backend (app/routers/cctv_buildings.py, cctv_streaming.py) -- never by this file.

// ---- Buildings ----------------------------------------------------------

// Paginated, with each building's cameras embedded: { items, total, limit, offset }.
export async function listBuildings({ zone, enabled, q, limit = 24, offset = 0 } = {}) {
  const { data } = await client.get('/cctv/buildings', { params: { zone, enabled, q, limit, offset } })
  return data
}

export async function listBuildingZones() {
  const { data } = await client.get('/cctv/buildings/zones')
  return data
}

export async function getBuilding(buildingId) {
  const { data } = await client.get(`/cctv/buildings/${buildingId}`)
  return data
}

// admin-only. `recorder_secret` / camera `secret` are write-only: the backend
// encrypts them immediately and never returns them.
export async function createBuilding(payload) {
  const { data } = await client.post('/cctv/buildings', payload)
  return data
}

export async function updateBuilding(buildingId, payload) {
  const { data } = await client.patch(`/cctv/buildings/${buildingId}`, payload)
  return data
}

export async function enableBuilding(buildingId) {
  const { data } = await client.post(`/cctv/buildings/${buildingId}/enable`)
  return data
}

export async function disableBuilding(buildingId) {
  const { data } = await client.post(`/cctv/buildings/${buildingId}/disable`)
  return data
}

// cameras: 'reject' (409 if any exist) | 'detach' (keep as unassigned) | 'delete'
export async function deleteBuilding(buildingId, { cameras = 'reject' } = {}) {
  const { data } = await client.delete(`/cctv/buildings/${buildingId}`, { params: { cameras } })
  return data
}

export async function testBuilding(buildingId) {
  const { data } = await client.post(`/cctv/buildings/${buildingId}/test`)
  return data
}

// ---- Cameras within a building -----------------------------------------

export async function listBuildingCameras(buildingId) {
  const { data } = await client.get(`/cctv/buildings/${buildingId}/cameras`)
  return data
}

export async function addBuildingCamera(buildingId, payload) {
  const { data } = await client.post(`/cctv/buildings/${buildingId}/cameras`, payload)
  return data
}

export async function updateBuildingCamera(buildingId, cameraId, payload) {
  const { data } = await client.patch(`/cctv/buildings/${buildingId}/cameras/${cameraId}`, payload)
  return data
}

export async function reorderBuildingCameras(buildingId, cameraIds) {
  const { data } = await client.post(`/cctv/buildings/${buildingId}/cameras/reorder`, { camera_ids: cameraIds })
  return data
}

// Cameras registered before buildings existed (admin-only).
export async function listUnassignedCameras({ limit = 100, offset = 0 } = {}) {
  const { data } = await client.get('/cctv/buildings/unassigned-cameras', { params: { limit, offset } })
  return data
}

// buildingId = null detaches. NVR buildings require a free channel number.
export async function assignCameraToBuilding(cameraId, { buildingId, channel, sortOrder }) {
  const { data } = await client.put(`/cctv/cameras/${cameraId}/building`, {
    building_id: buildingId ?? null,
    channel: channel ?? null,
    sort_order: sortOrder ?? null,
  })
  return data
}

// ---- Streaming -----------------------------------------------------------

export async function getStreamingConfig() {
  const { data } = await client.get('/cctv/streaming/config')
  return data
}

// Short-lived token + WHEP URL for ONE camera. Never contains a camera credential
// or source URL. On failure the backend sends a stable code in the X-CCTV-Error header.
export async function requestPlayback(cameraId) {
  try {
    const { data } = await client.post(`/cctv/cameras/${cameraId}/playback`)
    return data
  } catch (err) {
    const code = err?.raw?.response?.headers?.['x-cctv-error']
    if (code) err.cctvCode = code
    throw err
  }
}

export async function reportPlayback(cameraId, state, reason) {
  try {
    await client.post(`/cctv/cameras/${cameraId}/playback/report`, { state, reason: reason ? String(reason).slice(0, 200) : null })
  } catch {
    // Best-effort telemetry: a failed report must never disturb playback.
  }
}
