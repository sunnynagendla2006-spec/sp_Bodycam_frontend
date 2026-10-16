import { AlertTriangle, Radio, Users } from 'lucide-react'
import StatusBadge from '../../StatusBadge.jsx'
import { Card, CardHeader } from '../../ui/Card.jsx'
import { ageText, METRIC_NOTE, QUALITY_LABEL } from '../../../utils/siteLevels.js'

function Kpi({ label, value, hint }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-ink-900">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-ink-500">{hint}</p>}
    </div>
  )
}

export default function OverviewTab({ summary, roams, apName, zoneName, onSelectZone }) {
  const s = summary
  const noCollector = s.collectors.length === 0
  return (
    <div className="space-y-5">
      {noCollector && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          No collector is registered for this site, so no telemetry can arrive. Counts below are zero because nothing has been reported, not because the area is empty.
        </p>
      )}
      {s.quality === 'simulated' || s.quality === 'mixed' ? (
        <p className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900">SIMULATED data is included. These figures are artificial and must not be read as live conditions.</p>
      ) : null}
      {s.stale && !noCollector && (
        <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          No collector has reported recently. The numbers describe the last known state and may be out of date.
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Active clients" value={s.total_active_clients} hint={QUALITY_LABEL[s.stale && s.total_active_clients ? 'stale' : s.quality]} />
        <Kpi label="Open threshold breaches" value={s.open_breaches} />
        <Kpi label="APs online / stale / offline" value={`${s.ap_states.online} / ${s.ap_states.stale} / ${s.ap_states.offline}`} hint={`${s.ap_states.unknown} not yet reported`} />
        <Kpi label="Collectors online" value={`${s.collectors.filter((c) => c.state === 'online').length} / ${s.collectors.length}`} hint={`Last data ${ageText(s.last_updated)}`} />
      </div>
      <p className="text-xs text-ink-500">{METRIC_NOTE}</p>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card className="p-4">
          <CardHeader icon={Users} title="Zones" />
          {s.by_zone.length === 0 ? <p className="text-sm text-ink-500">No zones are defined.{s.unassigned_clients ? ` ${s.unassigned_clients} client(s) are on APs without a zone.` : ''}</p> : (
            <ul className="divide-y divide-line">
              {s.by_zone.map((z) => (
                <li key={z.id}>
                  <button type="button" onClick={() => onSelectZone?.(z.id)} className="flex w-full items-center justify-between gap-2 py-2 text-left text-sm hover:bg-canvas">
                    <span className="min-w-0 truncate text-ink-900">{z.name}</span>
                    <span className="flex items-center gap-2">
                      {z.level && <StatusBadge status={z.level} />}
                      <span className="tabular-nums font-medium">{z.active_clients}</span>
                      {z.capacity ? <span className="text-xs text-ink-500">/ {z.capacity} ({z.utilization_pct}%)</span> : null}
                    </span>
                  </button>
                </li>
              ))}
              {s.unassigned_clients > 0 && <li className="py-2 text-xs text-ink-500">{s.unassigned_clients} client(s) on APs not assigned to a zone</li>}
            </ul>
          )}
        </Card>

        <Card className="p-4">
          <CardHeader icon={Radio} title="Busiest access points" />
          {s.by_ap.length === 0 ? <p className="text-sm text-ink-500">No access points are registered.</p> : (
            <ul className="divide-y divide-line">
              {[...s.by_ap].sort((a, b) => b.active_clients - a.active_clients).slice(0, 10).map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                  <span className="min-w-0 truncate text-ink-900">{a.name} <span className="text-xs text-ink-500">{a.code}</span></span>
                  <span className="flex items-center gap-2">{a.level && <StatusBadge status={a.level} />}<span className="tabular-nums font-medium">{a.active_clients}</span></span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card className="p-4">
        <CardHeader icon={AlertTriangle} title="Recent roaming (live)" subtitle="Movement between access points since this page was opened. No device is identified." />
        {roams.length === 0 ? <p className="text-sm text-ink-500">No roaming seen yet.</p> : (
          <ul className="divide-y divide-line text-sm">
            {roams.map((r) => (
              <li key={r.key} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                <span>{apName(r.from_ap_id)} → {apName(r.to_ap_id)}{r.simulated ? <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">SIMULATED</span> : null}</span>
                <span className="text-xs text-ink-500">{new Date(r.at).toLocaleTimeString()}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
