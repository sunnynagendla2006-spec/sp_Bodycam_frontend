import { useCallback, useEffect, useState } from 'react'
import { listAssociations, listEvents } from '../../../api/sites.js'
import { friendlyErrorMessage } from '../../../api/client.js'
import { EmptyState, ErrorState, LoadingSkeleton } from '../../Primitives.jsx'
import Pagination from '../../ui/Pagination.jsx'
import { Card, CardHeader } from '../../ui/Card.jsx'

const PAGE = 25
const OUTCOME_HELP = {
  applied: 'Changed the current state',
  stale: 'Ignored: a newer event had already been applied',
  duplicate_state: 'No change: already in that state',
  ap_mismatch: 'Ignored: disassociation from an AP the client had already left',
  no_active: 'No active association to close',
  unknown_ap: 'Ignored: access point not registered at this site',
  uncertain: 'Recorded; ordering could not be established',
}

// Clients are shown only as short masked pseudonyms. Full identifiers are never available in this view.
export default function EventsTab({ siteId, apName, zoneName }) {
  const [mode, setMode] = useState('events')
  const [type, setType] = useState('')
  const [outcome, setOutcome] = useState('')
  const [offset, setOffset] = useState(0)
  const [data, setData] = useState({ items: [], total: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = mode === 'events'
        ? await listEvents(siteId, { event_type: type || undefined, outcome: outcome || undefined, limit: PAGE, offset })
        : await listAssociations(siteId, { limit: PAGE, offset })
      setData(res)
      setError('')
    } catch (err) {
      setError(friendlyErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [siteId, mode, type, outcome, offset])

  useEffect(() => {
    load()
  }, [load])

  return (
    <Card className="p-4">
      <CardHeader title={mode === 'events' ? 'Network events (last 24 hours)' : 'Current associations'} subtitle="Devices appear as masked pseudonyms only." />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <select value={mode} onChange={(e) => { setOffset(0); setMode(e.target.value) }} className="input w-auto" aria-label="View">
          <option value="events">Event history</option>
          <option value="associations">Active associations now</option>
        </select>
        {mode === 'events' && (
          <>
            <select value={type} onChange={(e) => { setOffset(0); setType(e.target.value) }} className="input w-auto" aria-label="Event type">
              <option value="">All types</option><option value="association">Association</option><option value="disassociation">Disassociation</option><option value="roam">Roam</option>
            </select>
            <select value={outcome} onChange={(e) => { setOffset(0); setOutcome(e.target.value) }} className="input w-auto" aria-label="Outcome">
              <option value="">All outcomes</option>{Object.keys(OUTCOME_HELP).map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </>
        )}
        <button type="button" onClick={load} className="ml-auto text-sm font-medium text-brand-700 hover:underline">Refresh</button>
      </div>

      {loading && data.items.length === 0 ? <LoadingSkeleton rows={4} /> : error ? <ErrorState message={error} onRetry={load} /> : data.items.length === 0 ? (
        <EmptyState title="Nothing to show" hint="No matching telemetry in this period." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            {mode === 'events' ? (
              <>
                <thead className="text-xs uppercase tracking-wide text-ink-500"><tr><th className="py-2 pr-3">Time</th><th className="pr-3">Event</th><th className="pr-3">Client</th><th className="pr-3">AP</th><th className="pr-3">Outcome</th><th>Source</th></tr></thead>
                <tbody className="divide-y divide-line">
                  {data.items.map((e) => (
                    <tr key={e.id}>
                      <td className="py-1.5 pr-3 whitespace-nowrap">{new Date(e.source_timestamp).toLocaleString()}</td>
                      <td className="pr-3">{e.event_type}</td>
                      <td className="pr-3 font-mono text-xs">{e.client}</td>
                      <td className="pr-3">{e.from_ap_id ? `${apName(e.from_ap_id)} → ` : ''}{apName(e.ap_id)}</td>
                      <td className="pr-3" title={OUTCOME_HELP[e.outcome] || e.outcome_detail || ''}>{e.outcome}{e.ordering_confidence === 'tie_break' ? ' (uncertain order)' : ''}</td>
                      <td>{e.source === 'SYNTHETIC' ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">SIMULATED</span> : e.source}</td>
                    </tr>
                  ))}
                </tbody>
              </>
            ) : (
              <>
                <thead className="text-xs uppercase tracking-wide text-ink-500"><tr><th className="py-2 pr-3">Client</th><th className="pr-3">AP</th><th className="pr-3">Zone</th><th className="pr-3">Since</th><th>Source</th></tr></thead>
                <tbody className="divide-y divide-line">
                  {data.items.map((a, i) => (
                    <tr key={`${a.client}-${i}`}>
                      <td className="py-1.5 pr-3 font-mono text-xs">{a.client}</td>
                      <td className="pr-3">{apName(a.ap_id)}</td>
                      <td className="pr-3">{zoneName(a.zone_id)}</td>
                      <td className="pr-3 whitespace-nowrap">{a.associated_at ? new Date(a.associated_at).toLocaleString() : '—'}</td>
                      <td>{a.source === 'SYNTHETIC' ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">SIMULATED</span> : a.source}</td>
                    </tr>
                  ))}
                </tbody>
              </>
            )}
          </table>
        </div>
      )}
      <p className="mt-2 text-xs text-ink-500">{data.total} total</p>
      <Pagination offset={offset} pageSize={PAGE} count={offset + PAGE < data.total ? PAGE : 0} onChange={setOffset} />
    </Card>
  )
}
