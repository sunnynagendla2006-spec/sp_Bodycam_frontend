// Small parsing helpers shared by the site administration forms.

export const nullable = (v) => (v === '' || v == null ? null : v)
export const numOrNull = (v) => (v === '' || v == null || Number.isNaN(Number(v)) ? null : Number(v))

/**
 * "lon,lat" per line (or "lon lat") -> a closed GeoJSON polygon ring list, or null when empty.
 * Throws an Error with a user-readable message when a line is malformed or fewer than 3 corners are given.
 */
export function parseBoundary(text) {
  const lines = (text || '').split('\n').map((l) => l.trim()).filter(Boolean)
  if (lines.length === 0) return null
  const ring = lines.map((line, i) => {
    const parts = line.split(/[\s,;]+/).filter(Boolean).map(Number)
    if (parts.length !== 2 || parts.some(Number.isNaN)) throw new Error(`Boundary line ${i + 1}: expected "longitude,latitude"`)
    const [lon, lat] = parts
    if (lon < -180 || lon > 180 || lat < -90 || lat > 90) throw new Error(`Boundary line ${i + 1}: coordinates out of range (longitude first, then latitude)`)
    return [lon, lat]
  })
  if (ring.length < 3) throw new Error('A boundary needs at least 3 corners')
  const first = ring[0]
  const last = ring[ring.length - 1]
  if (first[0] !== last[0] || first[1] !== last[1]) ring.push([...first])
  return [ring]
}

export function boundaryToText(rings) {
  if (!rings || !rings[0]) return ''
  const ring = rings[0]
  const closed = ring.length > 1 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1]
  return (closed ? ring.slice(0, -1) : ring).map(([lon, lat]) => `${lon},${lat}`).join('\n')
}

export function readImageSize(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight })
      URL.revokeObjectURL(url)
    }
    img.onerror = () => {
      resolve({})
      URL.revokeObjectURL(url)
    }
    img.src = url
  })
}
