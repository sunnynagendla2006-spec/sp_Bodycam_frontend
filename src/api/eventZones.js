import { client } from './client'

export async function listEventZones(params = {}) {
  const { data } = await client.get('/event-zones/', { params })
  return data
}

export async function getEventZone(zoneId) {
  const { data } = await client.get(`/event-zones/${zoneId}`)
  return data
}

export async function createEventZone(payload) {
  const { data } = await client.post('/event-zones/', payload)
  return data
}

export async function updateEventZone(zoneId, payload) {
  const { data } = await client.patch(`/event-zones/${zoneId}`, payload)
  return data
}

export async function disableEventZone(zoneId) {
  const { data } = await client.post(`/event-zones/${zoneId}/disable`)
  return data
}
