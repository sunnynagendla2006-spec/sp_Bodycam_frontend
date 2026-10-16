// Written for a later, separate testing phase -- NOT executed when added.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'

const sessions = []
vi.mock('../utils/whep.js', () => ({
  WhepSession: class {
    constructor(opts) {
      this.opts = opts
      this.closed = false
      this.close = vi.fn(() => {
        this.closed = true
      })
      sessions.push(this)
    }
    connect() {
      return Promise.resolve({ getTracks: () => [] })
    }
  },
}))
const mockRequestPlayback = vi.fn(() => Promise.resolve({ whep_url: 'https://gw/x/whep', token: 't' }))
vi.mock('../api/buildings.js', () => ({
  requestPlayback: (...a) => mockRequestPlayback(...a),
  reportPlayback: vi.fn(),
}))

import BuildingSlot from '../components/cctv/BuildingSlot.jsx'
import * as budget from '../utils/streamBudget.js'

const cams = (n) =>
  Array.from({ length: n }, (_, i) => ({
    id: `cam-${i + 1}`, name: `Camera ${i + 1}`, camera_code: `C${i + 1}`, channel: i + 1, sort_order: i, enabled: true, status: 'online',
  }))
const building = (n, extra = {}) => ({ id: 'b1', name: 'City Mall', code: 'BLD-A', zone: 'ZONE-1', enabled: true, health: 'online', cameras: cams(n), ...extra })
const CONFIG = { gateway_configured: true, rotation_seconds: 5, prefetch_next: false, max_concurrent_streams: 4 }

beforeEach(() => {
  vi.useFakeTimers()
  sessions.length = 0
  mockRequestPlayback.mockClear()
  budget._reset()
  // jsdom has no IntersectionObserver: the hook treats that as "in view".
})
afterEach(() => vi.useRealTimers())

describe('BuildingSlot', () => {
  it('shows the building and zone and starts with the first camera', async () => {
    render(<BuildingSlot building={building(4)} config={CONFIG} />)
    expect(screen.getByText('City Mall')).toBeInTheDocument()
    expect(screen.getByText(/ZONE-1/)).toBeInTheDocument()
    expect(sessions).toHaveLength(1)
    await act(async () => {
      await sessions[0].opts.getPlayback()
    })
    expect(mockRequestPlayback).toHaveBeenCalledWith('cam-1')
  })

  it('moves to the next camera every five seconds, closing the previous session', async () => {
    render(<BuildingSlot building={building(4)} config={CONFIG} />)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000)
    })
    expect(sessions).toHaveLength(2)
    expect(sessions[0].closed).toBe(true)
    expect(sessions[1].closed).toBe(false)
    expect(screen.getByText('2/4')).toBeInTheDocument()
  })

  it('never has more than one open session without prefetch', async () => {
    render(<BuildingSlot building={building(6)} config={CONFIG} />)
    for (let i = 0; i < 8; i += 1) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000)
      })
      expect(sessions.filter((s) => !s.closed)).toHaveLength(1)
    }
    expect(budget.snapshot().used).toBe(1)
  })

  it('closes its session and releases the stream permit on unmount', async () => {
    const { unmount } = render(<BuildingSlot building={building(4)} config={CONFIG} />)
    expect(budget.snapshot().used).toBe(1)
    unmount()
    expect(sessions.every((s) => s.closed)).toBe(true)
    expect(budget.snapshot().used).toBe(0)
  })

  it('does not rotate or stream a disabled building', () => {
    render(<BuildingSlot building={building(4, { enabled: false })} config={CONFIG} />)
    expect(screen.getByText('Building disabled')).toBeInTheDocument()
    expect(sessions).toHaveLength(0)
  })

  it('shows an empty state for a building without cameras', () => {
    render(<BuildingSlot building={building(0)} config={CONFIG} />)
    expect(screen.getByText('No cameras configured')).toBeInTheDocument()
    expect(sessions).toHaveLength(0)
  })

  it('opens no stream when the gateway is not configured', () => {
    render(<BuildingSlot building={building(4)} config={{ ...CONFIG, gateway_configured: false }} />)
    expect(screen.getByText('Live video not configured')).toBeInTheDocument()
    expect(sessions).toHaveLength(0)
  })

  it('pause stops rotation and resume restarts it', async () => {
    render(<BuildingSlot building={building(4)} config={CONFIG} />)
    await act(async () => {
      screen.getByLabelText('Pause rotation').click()
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20000)
    })
    expect(screen.getByText(/1\/4/)).toBeInTheDocument()
    await act(async () => {
      screen.getByLabelText('Resume rotation').click()
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000)
    })
    expect(screen.getByText(/2\/4/)).toBeInTheDocument()
  })

  it('skips an offline camera', async () => {
    const b = building(3)
    b.cameras[1].status = 'offline'
    render(<BuildingSlot building={b} config={CONFIG} />)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000)
    })
    expect(screen.getByText(/3\/3/)).toBeInTheDocument()
  })

  it('a failing camera is skipped and does not stall rotation', async () => {
    render(<BuildingSlot building={building(3)} config={CONFIG} />)
    await act(async () => {
      sessions[0].opts.onFailure({ code: 'timeout', message: 'No video was received from the camera' })
    })
    expect(screen.getByText(/2\/3/)).toBeInTheDocument()
  })
})
