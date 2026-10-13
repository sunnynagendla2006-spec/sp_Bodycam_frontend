import { apiFetch } from './client.js'

export async function listEventZones(params = {}) {
  const query = new URLSearchParams()
  if (params.deployment) query.set('deployment', params.deployment)
  if (params.enabled !== undefined) query.set('enabled', String(params.enabled))
  const qs = query.toString()
  return apiFetch(`/event-zones/${qs ? `?${qs}` : ''}`)
}

export async function getEventZone(zoneId) {
  return apiFetch(`/event-zones/${zoneId}`)
}

export async function createEventZone(payload) {
  return apiFetch('/event-zones/', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function updateEventZone(zoneId, payload) {
  return apiFetch(`/event-zones/${zoneId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
}

export async function disableEventZone(zoneId) {
  return apiFetch(`/event-zones/${zoneId}/disable`, {
    method: 'POST',
  })
}
