import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { Bell, Camera, CircleCheck, Clapperboard, UserRound, Users } from 'lucide-react'
import { listConstables } from '../api/constables.js'
import { useOperations } from '../context/OperationsContext.jsx'
import { friendlyErrorMessage } from '../api/client.js'
import { LoadingSkeleton, ErrorState, EmptyState, PageHeader } from '../components/Primitives.jsx'
import StatusBadge from '../components/StatusBadge.jsx'
import Battery from '../components/ui/Battery.jsx'
import { LinkButton } from '../components/ui/Button.jsx'
import { Card, CardHeader, Info, InfoGrid } from '../components/ui/Card.jsx'
import { formatDateTime, formatRelativeTime } from '../utils/format.js'
import { alertTypeLabel, triggerLabel } from '../utils/labels.js'

export default function ConstableDetails() {
  const { id } = useParams()
  const { devices, recordings, alerts } = useOperations()
  const [constable, setConstable] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    // No GET /constables/{id} endpoint exists in the backend -- the
    // roster is fetched and the matching row found client-side, the same
    // approach already used for incident details elsewhere in this app.
    listConstables()
      .then((rows) => {
        if (cancelled) return
        setConstable(rows.find((c) => c.id === id) || null)
      })
      .catch((err) => !cancelled && setError(friendlyErrorMessage(err)))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [id])

  if (loading) return <LoadingSkeleton rows={6} />
  if (error) return <ErrorState message={error} />
  if (!constable) return <EmptyState icon={Users} title="Constable not found" hint="They may not exist, or you may not have access to see them." />

  const device = devices.find((d) => d.constable_id === id)
  const constableRecordings = recordings.filter((r) => r.constable_id === id)
  const constableAlerts = alerts.filter((a) => a.constable_id === id && a.status === 'open')

  return (
    <div className="space-y-6">
      <PageHeader
        back={{ to: '/constables', label: 'Back to constables' }}
        title={constable.badge_number || constable.phone}
        actions={<StatusBadge status={constable.status} />}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="animate-rise-in">
          <CardHeader icon={UserRound} title="Constable" />
          <div className="p-5">
            <InfoGrid>
              <Info label="Badge number">{constable.badge_number || '—'}</Info>
              <Info label="Phone">{constable.phone || '—'}</Info>
              <Info label="Last signed in">{formatDateTime(constable.last_login)}</Info>
            </InfoGrid>
          </div>
        </Card>

        <Card className="animate-rise-in">
          <CardHeader icon={Camera} title="Body camera" />
          <div className="p-5">
            {device ? (
              <>
                <InfoGrid>
                  <Info label="Status"><StatusBadge status={device.status} /></Info>
                  <Info label="Battery"><Battery percent={device.battery_percent} charging={device.is_charging} /></Info>
                  <Info label="Last active">{formatRelativeTime(device.last_seen_at)}</Info>
                  <Info label="Location">{device.latitude != null ? `Updated ${formatRelativeTime(device.location_updated_at)}` : 'Not available'}</Info>
                </InfoGrid>
                <LinkButton to={`/devices/${device.id}`} icon={Camera} className="mt-5">
                  Open camera and controls
                </LinkButton>
              </>
            ) : (
              <EmptyState icon={Camera} title="No camera yet" hint="This constable has not set up a body camera yet." />
            )}
          </div>
        </Card>
      </div>

      <Card className="animate-rise-in">
        <CardHeader icon={Bell} title="Open alerts" />
        <div className="p-4">
          {constableAlerts.length === 0 ? (
            <EmptyState icon={CircleCheck} title="No open alerts" />
          ) : (
            <ul className="space-y-2">
              {constableAlerts.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-3 rounded-xl border border-line p-3.5 text-sm">
                  <span className="font-medium text-ink-900">{alertTypeLabel(a.type)}</span>
                  <StatusBadge status={a.severity} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>

      <Card className="animate-rise-in">
        <CardHeader icon={Clapperboard} title="Recent recordings" />
        <div className="p-4">
          {constableRecordings.length === 0 ? (
            <EmptyState icon={Clapperboard} title="No recordings yet" />
          ) : (
            <ul className="space-y-2">
              {constableRecordings.slice(0, 10).map((r) => (
                <li key={r.id}>
                  <Link to={`/recordings/${r.id}`} className="card-hover flex items-center justify-between gap-3 rounded-xl border border-line p-3.5 text-sm">
                    <span>
                      <span className="block font-medium text-ink-900">{formatDateTime(r.started_at)}</span>
                      <span className="block text-ink-500">{triggerLabel(r.trigger_type)}</span>
                    </span>
                    <StatusBadge status={r.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>
    </div>
  )
}
