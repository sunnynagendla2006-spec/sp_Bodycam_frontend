import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ClipboardList, LocateFixed, Send, UserRound } from 'lucide-react'
import { useAuth } from '../context/AuthContext.jsx'
import { useToast } from '../context/ToastContext.jsx'
import { fetchMyConstableProfile, fetchMyIncidents, updateMyLocation } from '../api/constables.js'
import { friendlyErrorMessage } from '../api/client.js'
import { LoadingSkeleton, ErrorState, EmptyState, PageHeader } from '../components/Primitives.jsx'
import StatusBadge from '../components/StatusBadge.jsx'
import Battery from '../components/ui/Battery.jsx'
import Button from '../components/ui/Button.jsx'
import { Card, CardHeader, Info, InfoGrid } from '../components/ui/Card.jsx'
import { Field } from '../components/ui/Form.jsx'
import { isConstable, ROLE_LABELS } from '../utils/roles.js'
import { formatDateTime } from '../utils/format.js'

export default function Profile() {
  const { user } = useAuth()
  const { notify } = useToast()
  const [constable, setConstable] = useState(null)
  const [myIncidents, setMyIncidents] = useState([])
  const [loading, setLoading] = useState(isConstable(user?.role))
  const [error, setError] = useState('')
  const [lat, setLat] = useState('')
  const [lon, setLon] = useState('')
  const [accuracy, setAccuracy] = useState('')
  const [sendingLocation, setSendingLocation] = useState(false)

  async function load() {
    if (!isConstable(user?.role)) return
    setLoading(true)
    setError('')
    try {
      const [profile, incidents] = await Promise.all([fetchMyConstableProfile(), fetchMyIncidents()])
      setConstable(profile)
      setMyIncidents(incidents)
    } catch (err) {
      setError(friendlyErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.role])

  async function handleLocationSubmit(e) {
    e.preventDefault()
    setSendingLocation(true)
    try {
      await updateMyLocation({ latitude: Number(lat), longitude: Number(lon), accuracy: accuracy ? Number(accuracy) : undefined })
      notify('Your location was shared', { tone: 'success' })
      await load()
    } catch (err) {
      notify(friendlyErrorMessage(err), { tone: 'error' })
    } finally {
      setSendingLocation(false)
    }
  }

  function useBrowserLocation() {
    if (!navigator.geolocation) {
      notify('This browser cannot find your location', { tone: 'error' })
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(String(pos.coords.latitude))
        setLon(String(pos.coords.longitude))
        setAccuracy(String(pos.coords.accuracy))
      },
      (err) => notify(err.message, { tone: 'error' }),
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader title="My account" subtitle="Your sign-in details" />

      <Card className="animate-rise-in">
        <CardHeader icon={UserRound} title="Account" />
        <div className="p-5">
          <InfoGrid>
            <Info label="Phone">{user?.phone}</Info>
            <Info label="Role">{ROLE_LABELS[user?.role] || user?.role}</Info>
            <Info label="Account status">
              <StatusBadge status={user?.is_active ? 'active' : 'inactive'} />
            </Info>
            <Info label="Member since">{formatDateTime(user?.created_at)}</Info>
          </InfoGrid>
        </div>
      </Card>

      {isConstable(user?.role) && (
        <>
          {loading ? (
            <LoadingSkeleton rows={4} />
          ) : error ? (
            <ErrorState message={error} onRetry={load} />
          ) : (
            <>
              <Card className="animate-rise-in">
                <CardHeader icon={LocateFixed} title="My status and location" />
                <div className="p-5">
                  <InfoGrid>
                    <Info label="Badge number">{constable?.badge_number || '—'}</Info>
                    <Info label="Status"><StatusBadge status={constable?.status} /></Info>
                    <Info label="Battery"><Battery percent={constable?.battery_level} /></Info>
                    <Info label="Location last shared">{formatDateTime(constable?.last_location_at)}</Info>
                  </InfoGrid>

                  <form onSubmit={handleLocationSubmit} className="mt-6 border-t border-line pt-5">
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                      <h3 className="font-semibold text-ink-900">Share my location</h3>
                      <Button variant="secondary" size="sm" icon={LocateFixed} onClick={useBrowserLocation}>
                        Use my current location
                      </Button>
                    </div>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                      <Field label="Latitude">
                        <input required type="number" step="any" value={lat} onChange={(e) => setLat(e.target.value)} className="input" />
                      </Field>
                      <Field label="Longitude">
                        <input required type="number" step="any" value={lon} onChange={(e) => setLon(e.target.value)} className="input" />
                      </Field>
                      <Field label="Accuracy (metres)">
                        <input type="number" step="any" value={accuracy} onChange={(e) => setAccuracy(e.target.value)} className="input" />
                      </Field>
                    </div>
                    <Button type="submit" icon={Send} loading={sendingLocation} className="mt-4">
                      {sendingLocation ? 'Sending…' : 'Share location'}
                    </Button>
                  </form>
                </div>
              </Card>

              <Card className="animate-rise-in">
                <CardHeader icon={ClipboardList} title="My assignments" />
                <div className="p-4">
                  {myIncidents.length === 0 ? (
                    <EmptyState icon={ClipboardList} title="No assignments" hint="Incidents sent to you will show up here." />
                  ) : (
                    <ul className="space-y-2">
                      {myIncidents.map((row) => (
                        <li key={row.assignment_id}>
                          <Link to={`/incidents/${row.incident_id}`} className="card-hover flex items-center justify-between gap-3 rounded-xl border border-line p-3.5 text-sm">
                            <span>
                              <span className="block font-medium text-ink-900">{row.display_id || 'Incident'}</span>
                              <span className="block text-xs text-ink-500">{formatDateTime(row.assigned_at)}</span>
                            </span>
                            <StatusBadge status={row.assignment_status} />
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </Card>
            </>
          )}
        </>
      )}
    </div>
  )
}
