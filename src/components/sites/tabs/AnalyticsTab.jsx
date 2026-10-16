import { useCallback, useEffect, useMemo, useState } from 'react'
import { getOccupancySeries, getPeaks, getRoamingSummary, listBreaches } from '../../../api/sites.js'
import { friendlyErrorMessage } from '../../../api/client.js'
import { ErrorState, LoadingSkeleton } from '../../Primitives.jsx'
import StatusBadge from '../../StatusBadge.jsx'
import { Card, CardHeader } from '../../ui/Card.jsx'
import TrendChart from '../TrendChart.jsx'

const RANGES = [['6h', 6, 120], ['24h', 24, 300], ['7d', 168, 1800], ['30d', 720, 7200]]

// All figures are active client ASSOCIATIONS over the selected period; periods with no telemetry have no data and are not filled in.
export default function AnalyticsTab({ siteId, zones, aps, apName, zoneName }) {
  const [range, setRange] = useState('24h')
  const [scope, setScope] = useState('site')
  const [scopeId, setScopeId] = useState('')
  const [series, setSeries] = useState(null)
  const [roaming, setRoaming] = useState(null)
  const [peaks, setPeaks] = useState(null)
  const [breaches, setBreaches] = useState([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const [, hours, bucket] = useMemo(() => RANGES.find((r) => r[0] === range), [range])
  const needsId = scope !== 'site'

  const load = useCallback(async () => {
    setLoading(true)
    const to = new Date()
    const from = new Date(to.getTime() - hours * 3600 * 1000)
    const win = { from: from.toISOString(), to: to.toISOString() }
    try {
      const [s, r, p, b] = await Promise.all([
        needsId && !scopeId ? Promise.resolve(null) : getOccupancySeries(siteId, { ...win, scope, scope_id: needsId ? scopeId : undefined, bucket_seconds: bucket }),
        getRoamingSummary(siteId, { ...win, ...(hours > 168 ? { from: new Date(to.getTime() - 168 * 3600 * 1000).toISOString() } : {}) }),
        getPeaks(siteId, { ...win, scope: scope === 'site' ? 'zone' : scope, top: 8 }),
        listBreaches(siteId, win),
      ])
      setSeries(s)
      setRoaming(r)
      setPeaks(p)
      setBreaches(b)
      setError('')
    } catch (err) {
      setError(friendlyErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [siteId, hours, bucket, scope, scopeId, needsId])

  useEffect(() => {
    load()
  }, [load])

  const name = (id) => (scope === 'ap' ? apName(id) : zoneName(id))
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <select value={range} onChange={(e) => setRange(e.target.value)} className="input w-auto" aria-label="Time range">{RANGES.map(([k]) => <option key={k} value={k}>Last {k}</option>)}</select>
        <select value={scope} onChange={(e) => { setScope(e.target.value); setScopeId('') }} className="input w-auto" aria-label="Scope"><option value="site">Whole site</option><option value="zone">A zone</option><option value="ap">An access point</option></select>
        {scope === 'zone' && <select value={scopeId} onChange={(e) => setScopeId(e.target.value)} className="input w-auto" aria-label="Zone"><option value="">Choose zone…</option>{zones.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}</select>}
        {scope === 'ap' && <select value={scopeId} onChange={(e) => setScopeId(e.target.value)} className="input w-auto" aria-label="Access point"><option value="">Choose AP…</option>{aps.map((a) => <option key={a.id} value={a.id}>{a.code}</option>)}</select>}
      </div>
      {hours > 168 && <p className="text-xs text-ink-500">Roaming figures are limited to the most recent 7 days.</p>}

      {error ? <ErrorState message={error} onRetry={load} /> : loading && !series ? <LoadingSkeleton rows={4} /> : (
        <>
          <Card className="p-4">
            <CardHeader title="Active client associations over time" />
            {needsId && !scopeId ? <p className="text-sm text-ink-500">Choose a {scope === 'zone' ? 'zone' : 'access point'} to see its trend.</p> : series ? <TrendChart points={series.points} bucketSeconds={series.bucket_seconds} /> : null}
          </Card>

          {roaming && (
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
              {[['Associations', roaming.associations], ['Disassociations', roaming.disassociations], ['Roams', roaming.roams], ['Ignored as stale', roaming.ignored_stale], ['Unique device pseudonyms', roaming.unique_client_pseudonyms]].map(([k, v]) => (
                <div key={k} className="rounded-2xl border border-line bg-surface p-3"><p className="text-xs text-ink-500">{k}</p><p className="text-xl font-semibold tabular-nums">{v}</p></div>
              ))}
              <p className="col-span-2 text-xs text-ink-500 lg:col-span-5">
                Average association length {roaming.average_association_seconds != null ? `${Math.round(roaming.average_association_seconds / 60)} min` : 'not measurable yet'} (closed associations only). Unique pseudonyms are not unique people: devices with randomized MAC addresses are counted again when the address changes.
              </p>
            </div>
          )}

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <Card className="p-4">
              <CardHeader title={`Peak load by ${scope === 'ap' ? 'access point' : 'zone'}`} />
              {!peaks || peaks.items.length === 0 ? <p className="text-sm text-ink-500">No data in this period.</p> : (
                <ul className="divide-y divide-line text-sm">
                  {peaks.items.map((p) => (
                    <li key={p.scope_id} className="flex items-center justify-between gap-2 py-1.5">
                      <span className="truncate">{name(p.scope_id)}</span>
                      <span className="text-xs text-ink-500">peak <strong className="text-ink-900">{p.peak_clients}</strong> at {new Date(p.peak_at).toLocaleString()} · mean {p.mean_clients}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card className="p-4">
              <CardHeader title="Threshold breaches" />
              {breaches.length === 0 ? <p className="text-sm text-ink-500">None in this period.</p> : (
                <ul className="divide-y divide-line text-sm">
                  {breaches.slice(0, 15).map((b) => (
                    <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                      <span>{b.scope === 'ap' ? apName(b.scope_id) : zoneName(b.scope_id)} <StatusBadge status={b.level} /></span>
                      <span className="text-xs text-ink-500">peak {b.peak_clients} (limit {b.threshold}) · {new Date(b.started_at).toLocaleString()}{b.active ? ' · ongoing' : ''}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  )
}
