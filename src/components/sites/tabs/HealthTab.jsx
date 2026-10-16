import { useEffect, useState } from 'react'
import { listAvailability } from '../../../api/sites.js'
import { friendlyErrorMessage } from '../../../api/client.js'
import StatusBadge from '../../StatusBadge.jsx'
import { Card, CardHeader } from '../../ui/Card.jsx'
import { ageText } from '../../../utils/siteLevels.js'

// Health shown here comes only from real telemetry age. "Unknown" means nothing has ever been reported, never "fine".
export default function HealthTab({ siteId, summary, aps, controllers, apName }) {
  const [history, setHistory] = useState([])
  const [error, setError] = useState('')
  useEffect(() => {
    let cancelled = false
    listAvailability(siteId, { limit: 50 }).then((h) => !cancelled && setHistory(h)).catch((err) => !cancelled && setError(friendlyErrorMessage(err)))
    return () => { cancelled = true }
  }, [siteId, summary?.last_updated])

  const entityName = (e) => (e.entity_type === 'ap' ? apName(e.entity_id) : summary.collectors.find((c) => c.id === e.entity_id)?.name || e.entity_type)
  return (
    <div className="space-y-5">
      <Card className="p-4">
        <CardHeader title="Collectors" />
        {summary.collectors.length === 0 ? <p className="text-sm text-ink-500">None registered.</p> : (
          <ul className="divide-y divide-line text-sm">
            {summary.collectors.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>{c.name} <span className="text-xs text-ink-500">{c.adapter_kind}</span> {c.is_simulated && <span className="ml-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">SIMULATED</span>}</span>
                <span className="flex items-center gap-3 text-xs text-ink-500"><StatusBadge status={c.revoked ? 'offline' : c.state} label={c.revoked ? 'Revoked' : undefined} /> heard {ageText(c.last_seen_at)} · {c.buffer_depth} queued · {c.dropped_events} dropped</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card className="p-4">
        <CardHeader title="Access points" subtitle="State comes from the age of real telemetry for each AP." />
        {aps.length === 0 ? <p className="text-sm text-ink-500">None registered.</p> : (
          <ul className="grid grid-cols-1 gap-x-6 divide-y divide-line text-sm sm:grid-cols-2 sm:divide-y-0">
            {aps.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-2 py-1.5"><span className="truncate">{a.name} <span className="text-xs text-ink-500">{a.code}</span></span><span className="flex items-center gap-2 text-xs text-ink-500"><StatusBadge status={a.state} />{ageText(a.last_seen_at)}</span></li>
            ))}
          </ul>
        )}
        {controllers.length > 0 && (
          <ul className="mt-3 divide-y divide-line border-t border-line pt-2 text-sm">
            {controllers.map((c) => <li key={c.id} className="flex items-center justify-between py-1.5"><span>{c.name} <span className="text-xs text-ink-500">controller</span></span><span className="flex items-center gap-2"><StatusBadge status={c.state} /><span className="text-xs text-ink-500">reported {c.health}</span></span></li>)}
          </ul>
        )}
      </Card>
      <Card className="p-4">
        <CardHeader title="Availability changes" subtitle="Stale or offline periods are recorded when the monitor is running." />
        {error ? <p className="text-sm text-signal-red">{error}</p> : history.length === 0 ? <p className="text-sm text-ink-500">No changes recorded.</p> : (
          <ul className="divide-y divide-line text-sm">
            {history.map((h, i) => <li key={i} className="flex items-center justify-between gap-2 py-1.5"><span>{entityName(h)} <span className="text-xs text-ink-500">{h.entity_type}</span></span><span className="flex items-center gap-2"><StatusBadge status={h.state} /><span className="text-xs text-ink-500">{new Date(h.at).toLocaleString()}</span></span></li>)}
          </ul>
        )}
      </Card>
    </div>
  )
}
