// Client-side cap on simultaneously open camera streams across the whole
// dashboard (the backend enforces its own, gateway-reported cap as well; this
// one stops one browser tab from opening dozens of peer connections).
//
// Slots that cannot get a permit show a "waiting for capacity" state and retry,
// instead of silently opening more streams.

let max = 8
let used = 0
const listeners = new Set()

export function setMaxStreams(n) {
  max = Math.max(1, Number(n) || 8)
  notify()
}

export function tryAcquire() {
  if (used >= max) return false
  used += 1
  notify()
  return true
}

export function release() {
  used = Math.max(0, used - 1)
  notify()
}

export function snapshot() {
  return { used, max }
}

export function subscribe(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

function notify() {
  listeners.forEach((fn) => fn({ used, max }))
}

// Test helper.
export function _reset() {
  max = 8
  used = 0
  listeners.clear()
}
