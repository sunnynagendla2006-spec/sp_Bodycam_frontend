import { Link } from 'react-router-dom'
import { Bell, Camera, CircleCheck, Clock, Radio, TriangleAlert, Wifi, WifiOff } from 'lucide-react'
import { useOperations } from '../context/OperationsContext.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { useConstableLookup } from '../hooks/useConstableLookup.js'
import { LoadingSkeleton, ErrorState, EmptyState, PageHeader } from '../components/Primitives.jsx'
import StatusBadge from '../components/StatusBadge.jsx'
import Battery from '../components/ui/Battery.jsx'
import { Card, CardHeader, StatCard } from '../components/ui/Card.jsx'
import { canViewOperations } from '../utils/roles.js'
import { formatElapsed, formatRelativeTime } from '../utils/format.js'
import { alertTypeLabel } from '../utils/labels.js'

function greeting() {
  const hour = Number(new Intl.DateTimeFormat('en-IN', { hour: 'numeric', hour12: false, timeZone: 'Asia/Kolkata' }).format(new Date())) % 24
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

const TODAY = () =>
  new Intl.DateTimeFormat('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' }).format(new Date())

export default function Dashboard() {
  const { user } = useAuth()
  const { devices, alerts, recordings, loading, error, refresh } = useOperations()
  const { label: constableLabel } = useConstableLookup()

  if (!canViewOperations(user?.role)) {
    return (
      <div>
        <PageHeader title={greeting()} subtitle={TODAY()} />
        <EmptyState icon={Camera} title="Nothing to show here yet" hint="Use the menu to open the sections you have access to." />
      </div>
    )
  }
  if (loading) return <LoadingSkeleton rows={6} />
  if (error) return <ErrorState message={error} onRetry={refresh} />

  const deviceById = Object.fromEntries(devices.map((d) => [d.id, d]))
  const activeRecordings = recordings.filter((r) => r.status === 'recording')
  const urgentAlerts = alerts.filter((a) => a.status === 'open' && a.severity === 'critical')
  const onlineCount = devices.filter((d) => d.status === 'online' || d.status === 'recording').length
  const offlineCount = devices.filter((d) => d.status === 'offline').length
  const needAttention = urgentAlerts.length + offlineCount

  return (
    <div>
      <PageHeader
        title={greeting()}
        subtitle={TODAY()}
      />

      {needAttention > 0 ? (
        <Link
          to={urgentAlerts.length > 0 ? '/alerts' : '/monitoring'}
          className="group mb-6 flex animate-rise-in items-center gap-4 rounded-2xl border border-red-200 bg-red-50 p-4 transition-colors hover:bg-red-100/70"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-red-100 text-signal-red">
            <TriangleAlert className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-red-900">
              {urgentAlerts.length > 0 && `${urgentAlerts.length} urgent ${urgentAlerts.length === 1 ? 'alert needs' : 'alerts need'} your attention`}
              {urgentAlerts.length > 0 && offlineCount > 0 && ' and '}
              {offlineCount > 0 && `${offlineCount} ${offlineCount === 1 ? 'camera is' : 'cameras are'} offline`}
            </p>
            <p className="text-sm text-red-800/80">Tap to take a look.</p>
          </div>
        </Link>
      ) : (
        <div className="mb-6 flex animate-rise-in items-center gap-4 rounded-2xl border border-green-200 bg-green-50 p-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-green-100 text-signal-green">
            <CircleCheck className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <p className="font-semibold text-green-900">Everything looks normal</p>
            <p className="text-sm text-green-800/80">No urgent alerts and no cameras offline.</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard index={0} icon={Wifi} tone="green" label="Cameras online" value={onlineCount} hint={`out of ${devices.length}`} to="/monitoring" />
        <StatCard index={1} icon={Radio} tone={activeRecordings.length > 0 ? 'red' : 'neutral'} label="Recording right now" value={activeRecordings.length} to="/recordings" />
        <StatCard index={2} icon={Bell} tone={urgentAlerts.length > 0 ? 'red' : 'neutral'} label="Urgent alerts" value={urgentAlerts.length} to="/alerts" />
        <StatCard index={3} icon={WifiOff} tone={offlineCount > 0 ? 'amber' : 'neutral'} label="Cameras offline" value={offlineCount} to="/monitoring" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card className="animate-rise-in">
          <CardHeader icon={Radio} title="Recording right now" to="/recordings" />
          <div className="p-4">
            {activeRecordings.length === 0 ? (
              <EmptyState icon={Radio} title="No one is recording" hint="Recordings will show up here as soon as a constable starts one." />
            ) : (
              <ul className="space-y-3">
                {activeRecordings.map((r, i) => {
                  const device = deviceById[r.device_id]
                  return (
                    <li key={r.id} style={{ '--i': i }} className="stagger animate-rise-in">
                      <Link
                        to={`/recordings/${r.id}`}
                        className="card-hover flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50/60 p-4"
                      >
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-ink-900">{constableLabel(r.constable_id)}</p>
                          <p className="mt-1 flex items-center gap-1.5 text-sm text-ink-500">
                            <Clock className="h-4 w-4" aria-hidden="true" />
                            Recording for {formatElapsed(r.started_at)}
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1.5 text-sm">
                          <StatusBadge status="recording" />
                          {device && <Battery percent={device.battery_percent} charging={device.is_charging} />}
                        </div>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </Card>

        <Card className="animate-rise-in">
          <CardHeader icon={Bell} title="Urgent alerts" to="/alerts" />
          <div className="p-4">
            {urgentAlerts.length === 0 ? (
              <EmptyState icon={CircleCheck} title="No urgent alerts" hint="All cameras are working as expected." />
            ) : (
              <ul className="space-y-3">
                {urgentAlerts.slice(0, 6).map((a, i) => (
                  <li key={a.id} style={{ '--i': i }} className="stagger animate-rise-in rounded-xl border border-red-200 bg-red-50/60 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <p className="font-semibold text-ink-900">{alertTypeLabel(a.type)}</p>
                      <span className="shrink-0 text-sm text-ink-500">{formatRelativeTime(a.created_at)}</span>
                    </div>
                    <p className="mt-1 text-sm text-ink-700">{constableLabel(a.constable_id)}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>
      </div>

      <Card className="mt-6 animate-rise-in">
        <CardHeader icon={Camera} title="Body cameras" subtitle="Latest status of each camera" to="/monitoring" linkLabel="See all" />
        {devices.length === 0 ? (
          <div className="p-4">
            <EmptyState icon={Camera} title="No cameras added yet" />
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {devices.slice(0, 6).map((d) => (
              <li key={d.id}>
                <Link to={`/devices/${d.id}`} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-5 py-3.5 transition-colors hover:bg-brand-50/40">
                  <span className="font-medium text-ink-900">{constableLabel(d.constable_id)}</span>
                  <span className="flex items-center gap-4 text-sm text-ink-500">
                    <span className="hidden sm:inline">{formatRelativeTime(d.last_seen_at)}</span>
                    <Battery percent={d.battery_percent} charging={d.is_charging} />
                    <StatusBadge status={d.status} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
