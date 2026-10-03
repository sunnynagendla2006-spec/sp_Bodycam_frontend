import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { Bell, Camera, CircleCheck, CircleDot, Clapperboard, Clock, Eye, MapPin, Radio, Square, SwitchCamera, Video, X } from 'lucide-react'
import { useAuth } from '../context/AuthContext.jsx'
import { useToast } from '../context/ToastContext.jsx'
import { useOperations } from '../context/OperationsContext.jsx'
import { useConstableLookup } from '../hooks/useConstableLookup.js'
import { getDevice } from '../api/devices.js'
import { listAlerts } from '../api/alerts.js'
import { listDeviceCommands, issueCommand, cancelCommand } from '../api/commands.js'
import { friendlyErrorMessage } from '../api/client.js'
import { LoadingSkeleton, ErrorState, EmptyState, ConfirmDialog, PageHeader } from '../components/Primitives.jsx'
import StatusBadge from '../components/StatusBadge.jsx'
import LiveVideoView from '../components/LiveVideoView.jsx'
import Battery from '../components/ui/Battery.jsx'
import Button from '../components/ui/Button.jsx'
import DataTable from '../components/ui/DataTable.jsx'
import { Card, CardHeader, Info, InfoGrid } from '../components/ui/Card.jsx'
import { canIssueCommands } from '../utils/roles.js'
import { formatDateTime, formatDateTimeShort, formatRelativeTime } from '../utils/format.js'
import { alertTypeLabel, commandTypeLabel, friendlyFailure, statusLabel, triggerLabel } from '../utils/labels.js'

const COMMAND_STAGES = ['pending', 'sent', 'acknowledged', 'executed']

// Shows how far a remote action has got: waiting, sent, received, done.
function CommandProgress({ status }) {
  if (status === 'failed' || status === 'timeout' || status === 'cancelled') {
    return <StatusBadge status={status} />
  }
  const idx = COMMAND_STAGES.indexOf(status)
  return (
    <div className="flex items-center gap-1.5">
      {COMMAND_STAGES.map((stage, i) => (
        <span
          key={stage}
          title={statusLabel(stage)}
          className={`h-1.5 w-6 rounded-full transition-colors ${i <= idx ? (idx === COMMAND_STAGES.length - 1 ? 'bg-signal-green' : 'bg-brand-500') : 'bg-line-strong'}`}
        />
      ))}
      <span className="ml-2 whitespace-nowrap text-xs font-medium text-ink-700">{statusLabel(status)}</span>
    </div>
  )
}

export default function DeviceDetails() {
  const { id } = useParams()
  const { user } = useAuth()
  const { notify } = useToast()
  const { recordings, liveStreams = [] } = useOperations()
  const { label: constableLabel } = useConstableLookup()

  const [device, setDevice] = useState(null)
  const [deviceAlerts, setDeviceAlerts] = useState([])
  const [commands, setCommands] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [confirming, setConfirming] = useState(null) // 'start_recording' | 'stop_recording' | 'start_live_stream' | 'stop_live_stream' | 'switch_camera_front' | 'switch_camera_back' | null
  const [busy, setBusy] = useState(false)
  const [watchingSessionId, setWatchingSessionId] = useState(null)

  async function load() {
    setLoading(true)
    setError('')
    try {
      const [d, a, c] = await Promise.all([
        getDevice(id),
        listAlerts({ device_id: id, limit: 20 }),
        listDeviceCommands(id).catch(() => []), // constable role viewing another device would 403 -- degrade gracefully
      ])
      setDevice(d)
      setDeviceAlerts(a)
      setCommands(c)
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

  async function handleIssueCommand(commandType) {
    setBusy(true)
    try {
      await issueCommand(id, commandType)
      notify(`Sent to the camera: ${commandTypeLabel(commandType)}`, { tone: 'success' })
      setConfirming(null)
      await load()
    } catch (err) {
      notify(friendlyErrorMessage(err), { tone: 'error' })
    } finally {
      setBusy(false)
    }
  }

  async function handleStopLive() {
    // Issues the SAME stop_live_stream remote command the constable's own
    // phone already handles correctly (see mobile home_screen.dart's
    // _handleRemoteCommand), rather than calling the live-stream session's
    // own /stop endpoint directly. That direct endpoint only marks the
    // session ended in the database and notifies OTHER admin/control_room
    // viewers -- it was never delivered to the publishing device itself
    // (send_to_control_room never reaches a constable-role connection), so
    // the phone's camera kept publishing indefinitely after a Control Room
    // "Stop live stream" click even though the dashboard showed it as
    // stopped. Routing through the command channel is what actually
    // reaches the phone.
    setBusy(true)
    try {
      await issueCommand(id, 'stop_live_stream')
      notify('Asked the camera to stop live view', { tone: 'success' })
      setWatchingSessionId(null)
      setConfirming(null)
      await load()
    } catch (err) {
      notify(friendlyErrorMessage(err), { tone: 'error' })
    } finally {
      setBusy(false)
    }
  }

  async function handleCancel(commandId) {
    try {
      await cancelCommand(commandId)
      notify('Action cancelled', { tone: 'success' })
      await load()
    } catch (err) {
      notify(friendlyErrorMessage(err), { tone: 'error' })
    }
  }

  if (loading) return <LoadingSkeleton rows={8} />
  if (error) return <ErrorState message={error} onRetry={load} />
  if (!device) return <EmptyState icon={Camera} title="Camera not found" />

  const name = constableLabel(device.constable_id)
  const deviceRecordings = recordings.filter((r) => r.device_id === id)
  const liveSession = liveStreams.find((s) => s.device_id === id)
  const openAlerts = deviceAlerts.filter((a) => a.status === 'open')
  const canControl = canIssueCommands(user?.role)

  const DIALOGS = {
    start_recording: {
      title: 'Start emergency recording?',
      message: `Ask ${name}'s camera to start recording right now? The camera will confirm once it has started.`,
    },
    stop_recording: {
      title: 'Stop recording?',
      message: `Ask ${name}'s camera to stop recording?`,
    },
    start_live_stream: {
      title: 'Request live camera view?',
      message: `Ask ${name}'s camera to turn on and show live video? Live video is only shown on screen and is never saved.`,
    },
    stop_live_stream: {
      title: 'Stop live view?',
      message: `Ask ${name}'s camera to stop sharing live video?`,
    },
    switch_camera_front: {
      title: 'Switch to front camera?',
      message: `${name}'s phone will use the front camera from its next recording. If it is recording now, that recording will be stopped first.`,
    },
    switch_camera_back: {
      title: 'Switch to back camera?',
      message: `${name}'s phone will use the back camera from its next recording. If it is recording now, that recording will be stopped first.`,
    },
  }

  const commandColumns = [
    { key: 'type', header: 'Action', primary: true, cell: (c) => commandTypeLabel(c.command_type) },
    { key: 'progress', header: 'Progress', cell: (c) => <CommandProgress status={c.status} /> },
    { key: 'sent', header: 'Requested', cell: (c) => <span className="whitespace-nowrap text-ink-500">{formatDateTimeShort(c.sent_at || c.created_at)}</span> },
    { key: 'executed', header: 'Completed', cell: (c) => <span className="whitespace-nowrap text-ink-500">{formatDateTimeShort(c.executed_at)}</span> },
    { key: 'failure', header: 'Problem', cell: (c) => <span className="text-signal-red" title={c.failure_reason || undefined}>{friendlyFailure(c.failure_reason)}</span> },
    {
      key: 'actions',
      header: '',
      cell: (c) =>
        canControl && ['pending', 'sent'].includes(c.status) ? (
          <Button variant="danger-soft" size="sm" icon={X} onClick={() => handleCancel(c.id)}>
            Cancel
          </Button>
        ) : null,
    },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        back={{ to: '/monitoring', label: 'Back to body cameras' }}
        title={name}
        subtitle={device.device_model ? `${device.device_model}` : undefined}
        actions={<StatusBadge status={device.status} />}
      />

      <Card className="animate-rise-in">
        <CardHeader icon={Video} title="Live camera" action={liveSession && <StatusBadge status="live" />} />
        <div className="p-5">
          {!liveSession && (
            <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-ink-500">This camera is not sharing live video right now.</p>
              {canControl && (
                <Button icon={Video} onClick={() => setConfirming('start_live_stream')}>
                  Request live view
                </Button>
              )}
            </div>
          )}

          {liveSession && !watchingSessionId && (
            <div className="flex flex-wrap gap-3">
              <Button icon={Eye} onClick={() => setWatchingSessionId(liveSession.id)}>
                Watch live
              </Button>
              {canControl && (
                <Button variant="secondary" icon={Square} onClick={() => setConfirming('stop_live_stream')}>
                  Stop live view
                </Button>
              )}
            </div>
          )}

          {liveSession && watchingSessionId === liveSession.id && (
            <div className="max-w-2xl space-y-3">
              <LiveVideoView sessionId={liveSession.id} onClose={() => setWatchingSessionId(null)} />
              {canControl && (
                <Button variant="secondary" icon={Square} onClick={() => setConfirming('stop_live_stream')}>
                  Stop live view
                </Button>
              )}
            </div>
          )}
          <p className="mt-4 text-xs text-ink-500">Live video is only shown on screen. It is never recorded or saved.</p>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="animate-rise-in lg:col-span-2">
          <CardHeader icon={Camera} title="Camera information" />
          <div className="p-5">
            <InfoGrid>
              <Info label="Battery">
                <Battery percent={device.battery_percent} charging={device.is_charging} />
              </Info>
              <Info label="Last active">
                <span className="inline-flex items-center gap-1.5">
                  <Clock className="h-4 w-4 text-ink-400" aria-hidden="true" />
                  {device.last_seen_at ? `${formatRelativeTime(device.last_seen_at)} (${formatDateTime(device.last_seen_at)})` : '—'}
                </span>
              </Info>
              <Info label="Location">
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="h-4 w-4 text-ink-400" aria-hidden="true" />
                  {device.latitude != null ? (
                    <>
                      Updated {formatRelativeTime(device.location_updated_at)}
                      <Link to="/map" className="ml-1 font-medium text-brand-600 hover:underline">
                        See on map
                      </Link>
                    </>
                  ) : (
                    'Not available'
                  )}
                </span>
              </Info>
              <Info label="Phone">{device.device_model || '—'}</Info>
            </InfoGrid>

            <details className="group mt-5 rounded-xl border border-line px-4 py-3 text-sm">
              <summary className="cursor-pointer select-none font-medium text-ink-700 marker:text-ink-400">More details</summary>
              <div className="mt-4">
                <InfoGrid>
                  <Info label="Device ID"><span className="font-mono text-xs">{device.device_identifier}</span></Info>
                  <Info label="Platform">{device.platform || '—'}</Info>
                  <Info label="App version">{device.app_version || '—'}</Info>
                  <Info label="Last signal">{formatDateTime(device.last_heartbeat_at)}</Info>
                  <Info label="Coordinates">
                    {device.latitude != null ? `${device.latitude.toFixed(5)}, ${device.longitude.toFixed(5)}` : '—'}
                  </Info>
                  <Info label="Registered">{formatDateTime(device.created_at)}</Info>
                </InfoGrid>
              </div>
            </details>
          </div>
        </Card>

        <Card className="animate-rise-in">
          <CardHeader icon={Bell} title="Open alerts" />
          <div className="p-4">
            {openAlerts.length === 0 ? (
              <EmptyState icon={CircleCheck} title="No open alerts" />
            ) : (
              <ul className="space-y-3">
                {openAlerts.map((a) => (
                  <li key={a.id} className="rounded-xl border border-line p-3.5 text-sm">
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-medium text-ink-900">{alertTypeLabel(a.type)}</span>
                      <StatusBadge status={a.severity} />
                    </div>
                    <p className="mt-1 text-xs text-ink-500">{formatDateTime(a.created_at)}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>
      </div>

      {canControl && (
        <Card className="animate-rise-in">
          <CardHeader icon={Radio} title="Remote control" subtitle="Send an action to this camera" />
          <div className="p-5">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Button variant="danger-soft" size="lg" icon={CircleDot} onClick={() => setConfirming('start_recording')}>
                Start recording
              </Button>
              <Button variant="secondary" size="lg" icon={Square} onClick={() => setConfirming('stop_recording')}>
                Stop recording
              </Button>
              <Button variant="secondary" size="lg" icon={SwitchCamera} onClick={() => setConfirming('switch_camera_front')}>
                Front camera
              </Button>
              <Button variant="secondary" size="lg" icon={SwitchCamera} onClick={() => setConfirming('switch_camera_back')}>
                Back camera
              </Button>
            </div>
            <p className="mt-4 text-sm text-ink-500">
              Sending an action does not mean it has happened yet. The camera has to receive it first, and you can follow the result under Recent actions below.
              Changing the camera only applies from the next recording.
            </p>
          </div>
        </Card>
      )}

      <section className="animate-rise-in">
        <h2 className="mb-3 text-lg font-semibold text-ink-900">Recent actions</h2>
        {commands.length === 0 ? (
          <EmptyState icon={Radio} title="No actions sent to this camera yet" />
        ) : (
          <DataTable columns={commandColumns} rows={commands} />
        )}
      </section>

      <Card className="animate-rise-in">
        <CardHeader icon={Clapperboard} title="Recordings from this camera" to="/recordings" />
        <div className="p-4">
          {deviceRecordings.length === 0 ? (
            <EmptyState icon={Clapperboard} title="No recordings yet" />
          ) : (
            <ul className="space-y-2">
              {deviceRecordings.map((r) => (
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

      <ConfirmDialog
        open={!!confirming}
        title={DIALOGS[confirming]?.title}
        message={DIALOGS[confirming]?.message}
        confirmLabel="Send now"
        tone={confirming === 'stop_live_stream' || confirming === 'stop_recording' ? 'danger' : 'default'}
        busy={busy}
        onCancel={() => setConfirming(null)}
        onConfirm={() => (confirming === 'stop_live_stream' ? handleStopLive() : handleIssueCommand(confirming))}
      />
    </div>
  )
}
