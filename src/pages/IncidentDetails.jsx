import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { BadgeCheck, Ban, ClipboardList, ExternalLink, FileText, FolderOpen, Send } from 'lucide-react'
import { useAuth } from '../context/AuthContext.jsx'
import { useToast } from '../context/ToastContext.jsx'
import { listIncidents, verifyIncident, rejectIncident, dispatchIncident, getResponsibleStations } from '../api/incidents.js'
import { listEvidence, evidenceStreamUrl } from '../api/evidence.js'
import { fetchMyIncidents, acceptAssignment, rejectAssignment, updateMyAssignmentStatus } from '../api/constables.js'
import { friendlyErrorMessage } from '../api/client.js'
import { LoadingSkeleton, ErrorState, EmptyState, PageHeader, ConfirmDialog } from '../components/Primitives.jsx'
import StatusBadge from '../components/StatusBadge.jsx'
import Button from '../components/ui/Button.jsx'
import { Card, CardHeader, Info, InfoGrid } from '../components/ui/Card.jsx'
import { canVerifyIncident, canDispatch, isConstable } from '../utils/roles.js'
import { formatDateTime, formatBytes } from '../utils/format.js'
import { statusLabel } from '../utils/labels.js'

const NEXT_STATUS = { accepted: 'en_route', en_route: 'arrived', arrived: 'completed' }
const NEXT_LABEL = { en_route: 'I am on the way', arrived: 'I have arrived', completed: 'Mark as completed' }

function distance(meters) {
  if (meters == null) return ''
  return meters >= 1000 ? ` (${(meters / 1000).toFixed(1)} km away)` : ` (${Math.round(meters)} m away)`
}

export default function IncidentDetails() {
  const { id } = useParams()
  const { user } = useAuth()
  const { notify } = useToast()
  const [incident, setIncident] = useState(null)
  const [evidence, setEvidence] = useState([])
  const [stations, setStations] = useState(null)
  const [myAssignment, setMyAssignment] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [reasonFor, setReasonFor] = useState(null) // 'incident' | 'assignment' | null

  async function load() {
    setLoading(true)
    setError('')
    try {
      const [allIncidents, allEvidence] = await Promise.all([listIncidents(), listEvidence()])
      const found = allIncidents.find((i) => i.id === id)
      setIncident(found || null)
      setEvidence(allEvidence.filter((m) => m.incident_id === id))

      if (found && canVerifyIncident(user?.role)) {
        try {
          setStations(await getResponsibleStations(id))
        } catch {
          setStations(null)
        }
      }

      if (isConstable(user?.role)) {
        const mine = await fetchMyIncidents()
        setMyAssignment(mine.find((row) => row.incident_id === id) || null)
      }
    } catch (err) {
      setError(friendlyErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  async function runAction(fn, successMessage) {
    setBusy(true)
    try {
      await fn()
      notify(successMessage, { tone: 'success' })
      await load()
    } catch (err) {
      notify(friendlyErrorMessage(err), { tone: 'error' })
    } finally {
      setBusy(false)
    }
  }

  async function confirmReason(reason) {
    const kind = reasonFor
    setReasonFor(null)
    if (kind === 'incident') await runAction(() => rejectIncident(incident.id, reason), 'Incident rejected')
    else await runAction(() => rejectAssignment(incident.id, reason), 'Assignment declined')
  }

  if (loading) return <LoadingSkeleton rows={6} />
  if (error) return <ErrorState message={error} onRetry={load} />
  if (!incident) {
    return (
      <EmptyState
        icon={FileText}
        title="Incident not found"
        hint="It may not exist, or you may not have access to see it."
        action={
          <Link to="/incidents" className="text-sm font-medium text-brand-600 hover:underline">
            Back to incidents
          </Link>
        }
      />
    )
  }

  const next = myAssignment && NEXT_STATUS[myAssignment.assignment_status]

  return (
    <div className="space-y-6">
      <PageHeader
        back={{ to: '/incidents', label: 'Back to incidents' }}
        title={incident.display_id || 'Incident'}
        subtitle={`Reported ${formatDateTime(incident.created_at)}`}
        actions={<StatusBadge status={incident.status} />}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="animate-rise-in lg:col-span-2">
          <CardHeader icon={FileText} title="What happened" />
          <div className="space-y-5 p-5">
            <p className="whitespace-pre-line text-ink-900">{incident.description || 'No description was added.'}</p>

            {stations && (
              <InfoGrid>
                <Info label="Nearest station">
                  {stations.primary_station ? `${stations.primary_station.name}${distance(stations.primary_station.distance_meters)}` : '—'}
                </Info>
                <Info label="Backup station">
                  {stations.backup_station ? `${stations.backup_station.name}${distance(stations.backup_station.distance_meters)}` : '—'}
                </Info>
              </InfoGrid>
            )}

            {((canVerifyIncident(user?.role) && incident.status === 'new') || (canDispatch(user?.role) && incident.status === 'verified')) && (
              <div className="flex flex-wrap gap-3 border-t border-line pt-5">
                {canVerifyIncident(user?.role) && incident.status === 'new' && (
                  <>
                    <Button icon={BadgeCheck} disabled={busy} onClick={() => runAction(() => verifyIncident(incident.id), 'Incident verified')}>
                      Verify
                    </Button>
                    <Button variant="danger-soft" icon={Ban} disabled={busy} onClick={() => setReasonFor('incident')}>
                      Reject
                    </Button>
                  </>
                )}
                {canDispatch(user?.role) && incident.status === 'verified' && (
                  <Button icon={Send} disabled={busy} onClick={() => runAction(() => dispatchIncident(incident.id), 'Dispatch requested')}>
                    Dispatch
                  </Button>
                )}
              </div>
            )}

            {myAssignment && (
              <div className="border-t border-line pt-5">
                <h3 className="mb-3 flex items-center gap-2 font-semibold text-ink-900">
                  <ClipboardList className="h-5 w-5 text-brand-600" aria-hidden="true" />
                  My assignment
                </h3>
                <div className="flex flex-wrap items-center gap-3">
                  <StatusBadge status={myAssignment.assignment_status} />
                  {myAssignment.assignment_status === 'pending' && (
                    <>
                      <Button icon={BadgeCheck} disabled={busy} onClick={() => runAction(() => acceptAssignment(incident.id), 'Assignment accepted')}>
                        Accept
                      </Button>
                      <Button variant="danger-soft" icon={Ban} disabled={busy} onClick={() => setReasonFor('assignment')}>
                        Decline
                      </Button>
                    </>
                  )}
                  {next && (
                    <Button
                      disabled={busy}
                      onClick={() => runAction(() => updateMyAssignmentStatus(incident.id, next), `Updated: ${statusLabel(next)}`)}
                    >
                      {NEXT_LABEL[next] || `Mark ${statusLabel(next).toLowerCase()}`}
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>
        </Card>

        <Card className="animate-rise-in">
          <CardHeader icon={FolderOpen} title={`Evidence (${evidence.length})`} />
          <div className="p-4">
            {evidence.length === 0 ? (
              <EmptyState icon={FolderOpen} title="No evidence yet" hint="Photos, audio and video added to this incident show up here." />
            ) : (
              <ul className="space-y-2">
                {evidence.map((m) => (
                  <li key={m.id} className="rounded-xl border border-line p-3.5 text-sm">
                    <div className="flex items-start justify-between gap-2">
                      <span className="truncate font-medium text-ink-900">{m.original_filename || m.type}</span>
                      <StatusBadge status={m.upload_status} />
                    </div>
                    <p className="mt-1 text-xs capitalize text-ink-500">
                      {m.type} · {formatBytes(m.file_size)} · {formatDateTime(m.timestamp)}
                    </p>
                    <a
                      href={evidenceStreamUrl(m.id)}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-brand-600 hover:underline"
                    >
                      <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                      Open
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>
      </div>

      <ConfirmDialog
        open={!!reasonFor}
        title={reasonFor === 'incident' ? 'Reject this incident?' : 'Decline this assignment?'}
        message={reasonFor === 'incident' ? 'This incident will be marked as rejected.' : 'The control room will see that you cannot take this assignment.'}
        reasonLabel="Reason (optional)"
        confirmLabel={reasonFor === 'incident' ? 'Reject' : 'Decline'}
        tone="danger"
        onCancel={() => setReasonFor(null)}
        onConfirm={confirmReason}
      />
    </div>
  )
}
