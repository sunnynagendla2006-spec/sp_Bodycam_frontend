// Minimal WebRTC-HTTP Egress Protocol (WHEP) receiver for the CCTV gateway
// (MediaMTX). One WhepSession = one RTCPeerConnection watching one camera.
//
// Video only: no audio transceiver is requested, so a slot can never autoplay sound.
// Credentials never reach this file: `getPlayback()` returns only a short-lived
// playback token and the gateway's WHEP URL (see api/buildings.js requestPlayback).

const ICE_GATHER_TIMEOUT_MS = 2000
const CONNECT_TIMEOUT_MS = 15000
const DISCONNECT_GRACE_MS = 4000

// Optional STUN/TURN for deployments where the browser cannot reach the gateway's
// UDP port directly. JSON array, e.g. [{"urls":"stun:stun.example.org:3478"}].
function iceServers() {
  try {
    const raw = import.meta.env.VITE_CCTV_ICE_SERVERS
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

export class WhepError extends Error {
  constructor(code, message) {
    super(message)
    this.code = code
  }
}

export class WhepSession {
  /**
   * @param {{ getPlayback: () => Promise<{whep_url: string, token: string}>, onFailure?: (err: WhepError) => void }} opts
   */
  constructor({ getPlayback, onFailure }) {
    this.getPlayback = getPlayback
    this.onFailure = onFailure
    this.closed = false
    this.pc = null
    this.sessionUrl = null
    this.token = null
    this.abort = new AbortController()
    this._disconnectTimer = null
  }

  /** Resolves with a MediaStream once the first video track arrives. Rejects with WhepError. */
  async connect() {
    const playback = await this.getPlayback()
    if (this.closed) throw new WhepError('closed', 'Session closed')
    this.token = playback.token
    const endpoint = `${playback.whep_url}?token=${encodeURIComponent(playback.token)}`

    const pc = new RTCPeerConnection({ iceServers: iceServers() })
    this.pc = pc
    pc.addTransceiver('video', { direction: 'recvonly' })

    const stream = new MediaStream()
    const gotTrack = new Promise((resolve, reject) => {
      pc.ontrack = (event) => {
        stream.addTrack(event.track)
        resolve(stream)
      }
      this._rejectTrack = reject
    })
    // The track promise can reject after we have stopped awaiting it (session closed);
    // attach a no-op handler so that never surfaces as an unhandled rejection.
    gotTrack.catch(() => {})

    pc.onconnectionstatechange = () => {
      if (this.closed) return
      const state = pc.connectionState
      if (state === 'failed' || state === 'closed') {
        this._fail(new WhepError('connection_lost', 'The video connection was lost'))
      } else if (state === 'disconnected') {
        clearTimeout(this._disconnectTimer)
        this._disconnectTimer = setTimeout(() => {
          if (!this.closed && pc.connectionState === 'disconnected') {
            this._fail(new WhepError('connection_lost', 'The video connection was lost'))
          }
        }, DISCONNECT_GRACE_MS)
      } else if (state === 'connected') {
        clearTimeout(this._disconnectTimer)
      }
    }

    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)
    await this._iceGatheringComplete(pc)
    if (this.closed) throw new WhepError('closed', 'Session closed')

    let response
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/sdp' },
        body: pc.localDescription.sdp,
        signal: this.abort.signal,
      })
    } catch (err) {
      if (this.closed) throw new WhepError('closed', 'Session closed')
      throw new WhepError('gateway_unreachable', 'Could not reach the video gateway')
    }

    if (response.status === 401 || response.status === 403) throw new WhepError('unauthorized', 'Playback was not authorized (token expired?)')
    if (response.status === 404) throw new WhepError('stream_unavailable', 'The camera stream is not available (camera or recorder unreachable)')
    if (response.status === 400 || response.status === 406) throw new WhepError('unsupported', 'The stream could not be negotiated (unsupported video codec?)')
    if (!response.ok) throw new WhepError('gateway_error', 'The video gateway returned an error')

    const location = response.headers.get('Location')
    if (location) {
      try {
        this.sessionUrl = new URL(location, playback.whep_url).toString()
      } catch {
        this.sessionUrl = null
      }
    }
    const answer = await response.text()
    await pc.setRemoteDescription({ type: 'answer', sdp: answer })

    const timeout = new Promise((_, reject) => {
      this._connectTimer = setTimeout(() => reject(new WhepError('timeout', 'No video was received from the camera')), CONNECT_TIMEOUT_MS)
    })
    try {
      return await Promise.race([gotTrack, timeout])
    } finally {
      clearTimeout(this._connectTimer)
    }
  }

  _iceGatheringComplete(pc) {
    if (pc.iceGatheringState === 'complete') return Promise.resolve()
    return new Promise((resolve) => {
      const done = () => {
        pc.removeEventListener('icegatheringstatechange', check)
        clearTimeout(timer)
        resolve()
      }
      const check = () => {
        if (pc.iceGatheringState === 'complete') done()
      }
      const timer = setTimeout(done, ICE_GATHER_TIMEOUT_MS)
      pc.addEventListener('icegatheringstatechange', check)
    })
  }

  _fail(err) {
    if (this.closed) return
    const cb = this.onFailure
    this.close()
    cb?.(err)
  }

  /** Idempotent. Closes the peer connection and tells the gateway to drop the session. */
  close() {
    if (this.closed) return
    this.closed = true
    clearTimeout(this._disconnectTimer)
    clearTimeout(this._connectTimer)
    this.abort.abort()
    if (this.pc) {
      this.pc.ontrack = null
      this.pc.onconnectionstatechange = null
      try {
        this.pc.close()
      } catch {
        // already closed
      }
    }
    if (this.sessionUrl && this.token) {
      const url = `${this.sessionUrl}${this.sessionUrl.includes('?') ? '&' : '?'}token=${encodeURIComponent(this.token)}`
      fetch(url, { method: 'DELETE', keepalive: true }).catch(() => {})
    }
  }
}
