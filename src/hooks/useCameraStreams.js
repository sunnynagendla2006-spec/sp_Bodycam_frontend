import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError, friendlyErrorMessage } from '../api/client.js'
import { requestPlayback } from '../api/buildings.js'
import { WhepSession } from '../utils/whep.js'
import * as streamBudget from '../utils/streamBudget.js'

const RETRY_AFTER_ERROR_MS = 15000
const RETRY_AFTER_CAPACITY_MS = 4000

// Errors a retry cannot fix; the slot shows the message instead of retrying forever.
const PERMANENT_CODES = new Set(['gateway_not_configured', 'camera_disabled', 'building_disabled', 'target_not_authorized', 'channel_missing', 'recorder_not_configured', 'path_template_missing', 'invalid_path', 'credentials_unreadable'])

function describe(err) {
  if (err instanceof ApiError) return { code: err.cctvCode || `http_${err.status}`, message: friendlyErrorMessage(err) }
  return { code: err?.code || 'error', message: err?.message || 'Playback failed' }
}

/**
 * Owns the WebRTC sessions of ONE building slot.
 *
 *  - At most one session for the camera on screen, plus (only when `prefetch`
 *    is on and the global stream budget allows) one warm session for the next camera.
 *  - Every other session is closed immediately, so rotation never accumulates connections.
 *  - All sessions are closed when the slot becomes inactive (off-screen, hidden tab,
 *    paused page) and when the component unmounts.
 *  - A failed session releases its stream permit right away and is retried only after
 *    a delay (or immediately if the camera is revisited), never in a tight loop.
 *
 * `onFailure(cameraId, { code, message })` lets the slot skip the camera and
 * report it; it is NOT called for capacity waits.
 */
export function useCameraStreams({ currentId, nextId, active, prefetch = false, onFailure }) {
  const [tick, setTick] = useState(0)
  const entriesRef = useRef(new Map())
  const failureRef = useRef(onFailure)
  failureRef.current = onFailure
  const [capacityWait, setCapacityWait] = useState(false)
  const bump = useCallback(() => setTick((t) => t + 1), [])

  const finalize = useCallback((entry) => {
    if (entry.released) return
    entry.released = true
    entry.session.close()
    streamBudget.release()
  }, [])

  const drop = useCallback(
    (id) => {
      const entry = entriesRef.current.get(id)
      if (!entry) return
      entriesRef.current.delete(id)
      finalize(entry)
    },
    [finalize],
  )

  const closeAll = useCallback(() => {
    for (const id of [...entriesRef.current.keys()]) drop(id)
  }, [drop])

  const fail = useCallback(
    (entry, err) => {
      if (entriesRef.current.get(entry.id) !== entry || entry.status === 'error') return // dropped or already failed
      const { code, message } = describe(err)
      entry.status = code === 'stream_capacity' ? 'capacity' : 'error'
      entry.code = code
      entry.error = message
      finalize(entry)
      bump()
      if (code !== 'stream_capacity') failureRef.current?.(entry.id, { code, message })
    },
    [finalize, bump],
  )

  const open = useCallback(
    (id) => {
      if (entriesRef.current.has(id)) return entriesRef.current.get(id)
      if (!streamBudget.tryAcquire()) return null
      const entry = { id, status: 'connecting', stream: null, error: null, code: null, released: false, session: null }
      entry.session = new WhepSession({ getPlayback: () => requestPlayback(id), onFailure: (err) => fail(entry, err) })
      entriesRef.current.set(id, entry)
      entry.session
        .connect()
        .then((stream) => {
          if (entriesRef.current.get(id) !== entry || entry.released) return
          entry.stream = stream
          entry.status = 'playing'
          bump()
        })
        .catch((err) => fail(entry, err))
      return entry
    },
    [fail, bump],
  )

  // Reconcile the open sessions with what the slot wants right now.
  useEffect(() => {
    if (!active || !currentId) {
      closeAll()
      setCapacityWait(false)
      return
    }
    const wanted = new Set([currentId])
    if (prefetch && nextId && nextId !== currentId) wanted.add(nextId)
    for (const id of [...entriesRef.current.keys()]) if (!wanted.has(id)) drop(id)

    if (!entriesRef.current.has(currentId)) setCapacityWait(!open(currentId))
    else setCapacityWait(false)
    if (prefetch && nextId && nextId !== currentId && !entriesRef.current.has(nextId)) open(nextId) // best effort; null = no budget
  }, [active, currentId, nextId, prefetch, tick, open, drop, closeAll])

  // Retry a failed/capacity-blocked current camera after a delay.
  const currentEntry = currentId ? entriesRef.current.get(currentId) : null
  const currentStatus = currentEntry?.status
  const currentCode = currentEntry?.code
  useEffect(() => {
    if (!active || !currentId) return undefined
    let delay = null
    if (capacityWait || currentStatus === 'capacity') delay = RETRY_AFTER_CAPACITY_MS
    else if (currentStatus === 'error' && !PERMANENT_CODES.has(currentCode)) delay = RETRY_AFTER_ERROR_MS
    if (delay == null) return undefined
    const timer = setTimeout(() => {
      drop(currentId)
      bump()
    }, delay)
    return () => clearTimeout(timer)
  }, [active, currentId, currentStatus, currentCode, capacityWait, drop, bump])

  // Release everything when the slot unmounts.
  useEffect(() => closeAll, [closeAll])

  const retry = useCallback(() => {
    if (currentId) drop(currentId)
    bump()
  }, [currentId, drop, bump])

  let status = 'idle'
  if (active && currentId) status = capacityWait ? 'capacity' : currentEntry?.status || 'connecting'
  return { status, stream: currentEntry?.stream || null, error: currentEntry?.error || null, code: currentEntry?.code || null, retry }
}
