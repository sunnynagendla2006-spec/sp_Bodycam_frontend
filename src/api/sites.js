import { client } from './client'

// Generic monitored sites (campus, mall, hospital, festival ground, ...). Admin or
// control_room may read; admin manages. The backend enforces every permission and
// site-level visibility; this file only maps endpoints.

const get = async (url, params) => (await client.get(url, { params })).data
const post = async (url, body, config) => (await client.post(url, body, config)).data
const patch = async (url, body) => (await client.patch(url, body)).data
const del = async (url, params) => (await client.delete(url, { params })).data

// ---- Sites ---------------------------------------------------------------
export const listSites = (params) => get('/sites', params)
export const getSite = (id) => get(`/sites/${id}`)
export const createSite = (body) => post('/sites', body)
export const updateSite = (id, body) => patch(`/sites/${id}`, body)
export const deleteSite = (id, force = false) => del(`/sites/${id}`, { force })
export const listSiteTypes = () => get('/sites/site-types')
export const listAdapters = () => get('/sites/adapters')
export const addToAllowlist = (id, identifiers) => post(`/sites/${id}/allowlist`, { identifiers })
export const removeFromAllowlist = (id, pseudonym) => del(`/sites/${id}/allowlist/${pseudonym}`)

// ---- Buildings / floors / zones ----------------------------------------------
export const listBuildings = (id) => get(`/sites/${id}/buildings`)
export const createBuilding = (id, body) => post(`/sites/${id}/buildings`, body)
export const updateBuilding = (id, bid, body) => patch(`/sites/${id}/buildings/${bid}`, body)
export const deleteBuilding = (id, bid) => del(`/sites/${id}/buildings/${bid}`)

export const listFloors = (id) => get(`/sites/${id}/floors`)
export const createFloor = (id, body) => post(`/sites/${id}/floors`, body)
export const updateFloor = (id, fid, body) => patch(`/sites/${id}/floors/${fid}`, body)
export const deleteFloor = (id, fid) => del(`/sites/${id}/floors/${fid}`)
export async function uploadFloorPlan(id, fid, file, { width, height } = {}) {
  const form = new FormData()
  form.append('file', file)
  return post(`/sites/${id}/floors/${fid}/plan?${new URLSearchParams({ ...(width ? { width_px: width } : {}), ...(height ? { height_px: height } : {}) })}`, form)
}
// The plan needs the bearer token, so it is fetched as a blob and shown through an object URL.
export async function fetchFloorPlanBlob(id, fid) {
  const { data } = await client.get(`/sites/${id}/floors/${fid}/plan`, { responseType: 'blob' })
  return data
}

export const listZones = (id, params) => get(`/sites/${id}/zones`, params)
export const createZone = (id, body) => post(`/sites/${id}/zones`, body)
export const updateZone = (id, zid, body) => patch(`/sites/${id}/zones/${zid}`, body)
export const deleteZone = (id, zid) => del(`/sites/${id}/zones/${zid}`)

// ---- Infrastructure ----------------------------------------------------------
export const listSiteAPs = (id, params) => get(`/sites/${id}/access-points`, params)
export const registerAP = (id, body) => post(`/sites/${id}/access-points`, body)
export const updateSiteAP = (id, apId, body) => patch(`/sites/${id}/access-points/${apId}`, body)
export const adoptAP = (id, apId) => post(`/sites/${id}/access-points/${apId}/adopt`)

export const listSwitches = (id) => get(`/sites/${id}/switches`)
export const createSwitch = (id, body) => post(`/sites/${id}/switches`, body)
export const updateSwitch = (id, sid, body) => patch(`/sites/${id}/switches/${sid}`, body)
export const deleteSwitch = (id, sid) => del(`/sites/${id}/switches/${sid}`)

export const listControllers = (id) => get(`/sites/${id}/controllers`)
export const createController = (id, body) => post(`/sites/${id}/controllers`, body)
export const updateController = (id, cid, body) => patch(`/sites/${id}/controllers/${cid}`, body)
export const deleteController = (id, cid) => del(`/sites/${id}/controllers/${cid}`)

// Collector credentials are returned ONCE (create / rotate). Never store them.
export const listCollectors = (id) => get(`/sites/${id}/collectors`)
export const createCollector = (id, body) => post(`/sites/${id}/collectors`, body)
export const updateCollector = (id, cid, body) => patch(`/sites/${id}/collectors/${cid}`, body)
export const rotateCollectorToken = (id, cid) => post(`/sites/${id}/collectors/${cid}/rotate-token`)
export const revokeCollector = (id, cid) => post(`/sites/${id}/collectors/${cid}/revoke`)
export const deleteCollector = (id, cid) => del(`/sites/${id}/collectors/${cid}`)

// ---- Monitoring ---------------------------------------------------------------
export const getSummary = (id) => get(`/sites/${id}/summary`)
export const listAssociations = (id, params) => get(`/sites/${id}/associations`, params)
export const listEvents = (id, params) => get(`/sites/${id}/events`, params)
export const getOccupancySeries = (id, params) => get(`/sites/${id}/analytics/occupancy`, params)
export const getPeaks = (id, params) => get(`/sites/${id}/analytics/peaks`, params)
export const getRoamingSummary = (id, params) => get(`/sites/${id}/analytics/roaming`, params)
export const listBreaches = (id, params) => get(`/sites/${id}/analytics/breaches`, params)
export const listAvailability = (id, params) => get(`/sites/${id}/analytics/availability`, params)
export const runMonitor = (id) => post(`/sites/${id}/monitor/run`)
export const runRetention = (id) => post(`/sites/${id}/retention/run`)
export async function downloadCsv(id, params) {
  const { data } = await client.get(`/sites/${id}/analytics/export.csv`, { params, responseType: 'blob' })
  return data
}
