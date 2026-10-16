// Pure helpers for per-building camera rotation (see hooks/useCameraRotation.js).
// Kept free of React and timers so the selection rules are easy to reason about and test.

// A camera is skipped by automatic rotation when it is disabled, known to be
// offline, or recently failed during playback. (A manual selection can still
// show any enabled camera.)
export function isRotatable(camera, failedUntil, now) {
  if (!camera.enabled) return false
  if (camera.status === 'offline' || camera.status === 'disabled') return false
  return !(failedUntil && failedUntil[camera.id] > now)
}

export function enabledCameras(cameras) {
  return cameras.filter((c) => c.enabled)
}

export function eligibleCameras(cameras, failedUntil, now) {
  return cameras.filter((c) => isRotatable(c, failedUntil, now))
}

// Next/previous rotatable camera after `currentId` (wrapping). Returns `currentId`
// unchanged when there is nowhere else to go.
export function pickNext(cameras, currentId, dir, failedUntil, now) {
  const list = enabledCameras(cameras)
  if (list.length === 0) return null
  const start = list.findIndex((c) => c.id === currentId)
  for (let step = 1; step <= list.length; step += 1) {
    const idx = (((start === -1 ? (dir > 0 ? -1 : 0) : start) + dir * step) % list.length + list.length) % list.length
    const candidate = list[idx]
    if (candidate.id !== currentId && isRotatable(candidate, failedUntil, now)) return candidate.id
  }
  return currentId
}

// Keeps the current selection valid when the camera list changes: stays put while
// the camera still exists and is enabled, otherwise falls back to the first
// rotatable camera, then the first enabled one.
export function resolveCurrent(cameras, currentId, failedUntil, now) {
  const list = enabledCameras(cameras)
  if (list.length === 0) return null
  if (currentId && list.some((c) => c.id === currentId)) return currentId
  return (eligibleCameras(cameras, failedUntil, now)[0] || list[0]).id
}

// Stable identity of what matters for the rotation order, ignoring volatile
// fields like status/last_seen so a health refresh never restarts the dwell timer.
export function rotationSignature(cameras) {
  return cameras.map((c) => `${c.id}:${c.enabled ? 1 : 0}`).join('|')
}
