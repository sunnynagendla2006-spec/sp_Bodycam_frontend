import { useMemo } from 'react'

const W = 640
const H = 200
const PAD = { l: 38, r: 10, t: 12, b: 26 }

function segments(points, bucketSeconds) {
  // Break the line where telemetry is missing; never interpolate across a gap.
  const out = []
  let cur = []
  const maxGap = bucketSeconds * 3 * 1000
  points.forEach((p, i) => {
    if (i > 0 && p.ms - points[i - 1].ms > maxGap) {
      out.push(cur)
      cur = []
    }
    cur.push(p)
  })
  if (cur.length) out.push(cur)
  return out
}

/** Minimal dependency-free time-series chart: solid = active clients, light = peak within the bucket. */
export default function TrendChart({ points, bucketSeconds = 300, label = 'Active client associations' }) {
  const data = useMemo(() => points.map((p) => ({ ...p, ms: new Date(p.t).getTime() })), [points])
  if (data.length === 0) {
    return <div className="flex h-40 items-center justify-center rounded-xl border border-dashed border-line text-sm text-ink-500">No telemetry was recorded in this period.</div>
  }
  const minT = data[0].ms
  const maxT = data[data.length - 1].ms
  const maxV = Math.max(1, ...data.map((p) => p.peak_clients))
  const x = (ms) => PAD.l + (maxT === minT ? 0.5 : (ms - minT) / (maxT - minT)) * (W - PAD.l - PAD.r)
  const y = (v) => PAD.t + (1 - v / maxV) * (H - PAD.t - PAD.b)
  const path = (key) => segments(data, bucketSeconds).map((seg) => seg.map((p, i) => `${i ? 'L' : 'M'}${x(p.ms).toFixed(1)},${y(p[key]).toFixed(1)}`).join(' ')).join(' ')
  const simulated = data.some((p) => p.quality === 'simulated' || p.quality === 'mixed')
  const fmt = (ms) => new Date(ms).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })

  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={label}>
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(maxV * f)} y2={y(maxV * f)} stroke="#e2e8f0" />
            <text x={PAD.l - 6} y={y(maxV * f) + 3} textAnchor="end" fontSize="10" fill="#64748b">{Math.round(maxV * f)}</text>
          </g>
        ))}
        <path d={path('peak_clients')} fill="none" stroke="#93c5fd" strokeWidth="1.5" />
        <path d={path('active_clients')} fill="none" stroke="#2563eb" strokeWidth="2" />
        {data.length < 60 && data.map((p) => (
          <circle key={p.ms} cx={x(p.ms)} cy={y(p.active_clients)} r="2.5" fill="#2563eb">
            <title>{`${fmt(p.ms)}: ${p.active_clients} (peak ${p.peak_clients})`}</title>
          </circle>
        ))}
        <text x={PAD.l} y={H - 8} fontSize="10" fill="#64748b">{fmt(minT)}</text>
        <text x={W - PAD.r} y={H - 8} textAnchor="end" fontSize="10" fill="#64748b">{fmt(maxT)}</text>
      </svg>
      <figcaption className="mt-1 text-xs text-ink-500">
        {label}. Gaps mean no telemetry was evaluated.{simulated ? ' Includes SIMULATED data.' : ''}
      </figcaption>
    </figure>
  )
}
