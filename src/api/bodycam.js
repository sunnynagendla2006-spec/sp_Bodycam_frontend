import { client } from './client'

// Bodycam offline video transport for a monitored site: receivers, officer assignments, device
// authorizations, offline grants, recordings (with their sync state) and the audit trail.
// admin manages; control_room may view. The backend enforces every permission and site visibility.

const base = (siteId) => `/sites/${siteId}/bodycam`
const get = async (url, params) => (await client.get(url, { params })).data
const post = async (url, body) => (await client.post(url, body)).data
const patch = async (url, body) => (await client.patch(url, body)).data
const del = async (url) => (await client.delete(url)).data

export const getBodycamOverview = (siteId) => get(`${base(siteId)}/overview`)

// ---- Receivers ----------------------------------------------------------------
export const listReceivers = (siteId) => get(`${base(siteId)}/receivers`)
export const createReceiver = (siteId, body) => post(`${base(siteId)}/receivers`, body)
export const updateReceiver = (siteId, id, body) => patch(`${base(siteId)}/receivers/${id}`, body)
export const rotateReceiverToken = (siteId, id) => post(`${base(siteId)}/receivers/${id}/rotate-token`)
export const revokeReceiver = (siteId, id) => post(`${base(siteId)}/receivers/${id}/revoke`)
export const deleteReceiver = (siteId, id) => del(`${base(siteId)}/receivers/${id}`)
// type: retry_quarantined | resync | retry_recording (recording_id required for the last)
export const queueReceiverCommand = (siteId, id, body) => post(`${base(siteId)}/receivers/${id}/commands`, body)

// ---- Officer assignments ------------------------------------------------------------
export const listAssignments = (siteId, status) => get(`${base(siteId)}/assignments`, status ? { status } : undefined)
export const createAssignment = (siteId, body) => post(`${base(siteId)}/assignments`, body)
export const revokeAssignment = (siteId, id, reason) => post(`${base(siteId)}/assignments/${id}/revoke`, { reason })

// ---- Device authorizations --------------------------------------------------------------
export const listDeviceAuthorizations = (siteId) => get(`${base(siteId)}/device-authorizations`)
export const authorizeDevice = (siteId, body) => post(`${base(siteId)}/device-authorizations`, body)
export const revokeDeviceAuthorization = (siteId, id, reason) => post(`${base(siteId)}/device-authorizations/${id}/revoke`, { reason })

// ---- Offline grants ------------------------------------------------------------------------
export const listGrants = (siteId, state) => get(`${base(siteId)}/grants`, state ? { state } : undefined)
export const issueGrant = (siteId, body) => post(`${base(siteId)}/grants`, body)
export const revokeGrant = (siteId, id, reason) => post(`${base(siteId)}/grants/${id}/revoke`, { reason })

// ---- Recordings -------------------------------------------------------------------------------
export const listSiteRecordings = (siteId, params) => get(`${base(siteId)}/recordings`, params)
export const getSiteRecording = (siteId, id) => get(`${base(siteId)}/recordings/${id}`)

// What a receiver itself last reported about recordings it still holds (its own statement, bounded; see `stale`).
export const getReceiverLocalRecordings = (siteId, receiverId) => get(`${base(siteId)}/receivers/${receiverId}/local-recordings`)

export const listBodycamAudit = (siteId, limit = 100) => get(`${base(siteId)}/audit`, { limit })
