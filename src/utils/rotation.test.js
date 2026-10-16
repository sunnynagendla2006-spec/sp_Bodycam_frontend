import { describe, it, expect } from 'vitest'
import { eligibleCameras, pickNext, resolveCurrent, rotationSignature } from './rotation.js'

const cam = (id, extra = {}) => ({ id, enabled: true, status: 'online', ...extra })
const NOW = 1_000_000

describe('pickNext', () => {
  const four = [cam('a'), cam('b'), cam('c'), cam('d')]

  it('cycles through every camera and wraps', () => {
    let id = 'a'
    const seen = []
    for (let i = 0; i < 5; i += 1) {
      id = pickNext(four, id, 1, {}, NOW)
      seen.push(id)
    }
    expect(seen).toEqual(['b', 'c', 'd', 'a', 'b'])
  })

  it('supports different camera counts per building (six cameras)', () => {
    const six = ['1', '2', '3', '4', '5', '6'].map((i) => cam(i))
    let id = '1'
    for (let i = 0; i < 6; i += 1) id = pickNext(six, id, 1, {}, NOW)
    expect(id).toBe('1')
  })

  it('goes backwards and wraps', () => {
    expect(pickNext(four, 'a', -1, {}, NOW)).toBe('d')
  })

  it('skips offline, disabled and recently failed cameras', () => {
    const cams = [cam('a'), cam('b', { status: 'offline' }), cam('c', { enabled: false }), cam('d'), cam('e')]
    expect(pickNext(cams, 'a', 1, { d: NOW + 5000 }, NOW)).toBe('e')
    // the failure has expired -> d is usable again
    expect(pickNext(cams, 'a', 1, { d: NOW - 1 }, NOW)).toBe('d')
  })

  it('stays on the current camera when it is the only usable one', () => {
    const cams = [cam('a'), cam('b', { status: 'offline' })]
    expect(pickNext(cams, 'a', 1, {}, NOW)).toBe('a')
  })

  it('returns null for a building without enabled cameras', () => {
    expect(pickNext([cam('a', { enabled: false })], null, 1, {}, NOW)).toBeNull()
    expect(pickNext([], null, 1, {}, NOW)).toBeNull()
  })

  it('recovers when the current camera was removed from the list', () => {
    expect(pickNext([cam('b'), cam('c')], 'gone', 1, {}, NOW)).toBe('b')
  })
})

describe('resolveCurrent', () => {
  it('keeps a still-valid selection even if that camera is offline', () => {
    expect(resolveCurrent([cam('a'), cam('b', { status: 'offline' })], 'b', {}, NOW)).toBe('b')
  })

  it('falls back to the first rotatable camera when the selection disappears', () => {
    expect(resolveCurrent([cam('a', { status: 'offline' }), cam('b')], 'gone', {}, NOW)).toBe('b')
  })

  it('falls back to the first enabled camera when none is rotatable', () => {
    expect(resolveCurrent([cam('a', { status: 'offline' })], null, {}, NOW)).toBe('a')
  })

  it('returns null when nothing is enabled', () => {
    expect(resolveCurrent([cam('a', { enabled: false })], 'a', {}, NOW)).toBeNull()
  })
})

describe('rotationSignature', () => {
  it('ignores status changes but notices camera set or enabled changes', () => {
    const base = [cam('a'), cam('b')]
    expect(rotationSignature(base)).toBe(rotationSignature([cam('a', { status: 'offline' }), cam('b')]))
    expect(rotationSignature(base)).not.toBe(rotationSignature([cam('a'), cam('b', { enabled: false })]))
    expect(rotationSignature(base)).not.toBe(rotationSignature([cam('a')]))
  })
})

describe('eligibleCameras', () => {
  it('lists only rotatable cameras', () => {
    const cams = [cam('a'), cam('b', { status: 'offline' }), cam('c', { enabled: false })]
    expect(eligibleCameras(cams, {}, NOW).map((c) => c.id)).toEqual(['a'])
  })
})
