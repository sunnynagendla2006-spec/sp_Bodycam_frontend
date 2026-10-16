import { useCallback, useEffect, useRef, useState } from 'react'
import { eligibleCameras, enabledCameras, pickNext, resolveCurrent, rotationSignature } from '../utils/rotation.js'

const DEFAULT_FAILURE_COOLDOWN_MS = 30000

/**
 * Independent per-building rotation: one timer per slot, advancing every
 * `dwellMs` while `running`.
 *
 *  - Exactly one timeout exists at a time; it is cleared whenever the current
 *    camera, the running flag, the dwell time or the camera set changes, and on unmount.
 *  - Volatile status updates (health refreshes) do not restart the dwell timer;
 *    only a change in WHICH cameras exist/are enabled does.
 *  - Offline, disabled and recently failed cameras are skipped by automatic
 *    rotation; a manual `select()` can still show any enabled camera.
 *  - A failure of the camera on screen (`markFailed`) advances immediately.
 */
export function useCameraRotation({ cameras, dwellMs = 5000, running = true, failureCooldownMs = DEFAULT_FAILURE_COOLDOWN_MS }) {
  const [currentId, setCurrentId] = useState(null)
  const [failedUntil, setFailedUntil] = useState({})
  const [nonce, setNonce] = useState(0)

  const camerasRef = useRef(cameras)
  const failedRef = useRef(failedUntil)
  const currentRef = useRef(currentId)
  camerasRef.current = cameras
  failedRef.current = failedUntil
  currentRef.current = currentId

  const signature = rotationSignature(cameras)
  // Which cameras automatic rotation may use right now. Changing this (a camera going
  // offline/online, a failure cooling down) re-arms the timer so rotation can never stall.
  const eligibleKey = eligibleCameras(cameras, failedUntil, Date.now()).map((c) => c.id).join(',')

  // Keep the selection valid as the camera list changes.
  useEffect(() => {
    const resolved = resolveCurrent(camerasRef.current, currentRef.current, failedRef.current, Date.now())
    if (resolved !== currentRef.current) setCurrentId(resolved)
  }, [signature])

  // The single rotation timer.
  useEffect(() => {
    if (!running || !currentId) return undefined
    const eligible = eligibleCameras(camerasRef.current, failedRef.current, Date.now())
    if (!eligible.some((c) => c.id !== currentId)) return undefined // nowhere to rotate to
    const timer = setTimeout(() => {
      setCurrentId((id) => pickNext(camerasRef.current, id, 1, failedRef.current, Date.now()))
    }, dwellMs)
    return () => clearTimeout(timer)
  }, [running, currentId, dwellMs, signature, eligibleKey, nonce])

  // Forget failures once their cool-down expires so the camera is tried again.
  useEffect(() => {
    const times = Object.values(failedUntil)
    if (times.length === 0) return undefined
    const wait = Math.max(0, Math.min(...times) - Date.now()) + 50
    const timer = setTimeout(() => {
      const now = Date.now()
      setFailedUntil((prev) => Object.fromEntries(Object.entries(prev).filter(([, t]) => t > now)))
      setNonce((n) => n + 1)
    }, wait)
    return () => clearTimeout(timer)
  }, [failedUntil])

  const goTo = useCallback((dir) => {
    setCurrentId((id) => pickNext(camerasRef.current, id, dir, failedRef.current, Date.now()))
    setNonce((n) => n + 1)
  }, [])

  const select = useCallback((id) => {
    if (!enabledCameras(camerasRef.current).some((c) => c.id === id)) return
    setCurrentId(id)
    setNonce((n) => n + 1)
  }, [])

  const markFailed = useCallback(
    (id, ms = failureCooldownMs) => {
      const until = Date.now() + ms
      const next = { ...failedRef.current, [id]: until }
      failedRef.current = next
      setFailedUntil(next)
      if (id === currentRef.current && running) {
        setCurrentId(pickNext(camerasRef.current, id, 1, next, Date.now()))
        setNonce((n) => n + 1)
      }
    },
    [failureCooldownMs, running],
  )

  const list = enabledCameras(cameras)
  const index = list.findIndex((c) => c.id === currentId)
  const nextId = pickNext(cameras, currentId, 1, failedUntil, Date.now())

  return {
    currentId,
    current: index >= 0 ? list[index] : null,
    position: index + 1, // 1-based; 0 when nothing is selected
    total: list.length,
    nextId: nextId !== currentId ? nextId : null,
    next: () => goTo(1),
    prev: () => goTo(-1),
    select,
    markFailed,
  }
}
