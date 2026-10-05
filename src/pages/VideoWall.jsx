import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Camera, Video } from 'lucide-react'
import { useOperations } from '../context/OperationsContext.jsx'
import { useConstableLookup } from '../hooks/useConstableLookup.js'
import { listCameras } from '../api/cctv.js'
import { friendlyErrorMessage } from '../api/client.js'
import { LoadingSkeleton, ErrorState, PageHeader } from '../components/Primitives.jsx'
import { Card } from '../components/ui/Card.jsx'
import StatusBadge from '../components/StatusBadge.jsx'
import { CameraDetailModal } from './CCTVMonitoring.jsx'

// A combined at-a-glance wall. Each tile here is deliberately a SUMMARY,
// not a full interactive control surface -- the full bodycam live-view/
// recording controls already live on Monitoring.jsx (the existing
// "Body Cameras" page) and the full camera test/stream/edit controls
// already live on CCTVMonitoring.jsx; this page links out to both rather
// than re-implementing either, per "do not duplicate existing pages."
export default function VideoWall() {
  const { devices, loading: devicesLoading, error: devicesError } = useOperations()
  const { label: constableLabel, loading: rosterLoading } = useConstableLookup()
  const [cameras, setCameras] = useState([])
  const [camerasLoading, setCamerasLoading] = useState(true)
  const [camerasError, setCamerasError] = useState('')
  const [viewingCamera, setViewingCamera] = useState(null)

  useEffect(() => {
    let cancelled = false
    listCameras()
      .then((rows) => !cancelled && setCameras(rows))
      .catch((err) => !cancelled && setCamerasError(friendlyErrorMessage(err)))
      .finally(() => !cancelled && setCamerasLoading(false))
    return () => {
      cancelled = true
    }
  }, [])

  const loading = devicesLoading || rosterLoading || camerasLoading
  if (loading) return <LoadingSkeleton rows={8} />
  if (devicesError) return <ErrorState message={devicesError} />

  return (
    <div>
      <PageHeader title="Live Video Wall" subtitle="Bodycam and CCTV coverage side by side" />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {devices.map((d) => (
          <Link key={d.id} to={`/devices/${d.id}`}>
            <Card className="animate-rise-in overflow-hidden transition-shadow hover:shadow-pop">
              <div className="flex aspect-video w-full items-center justify-center bg-ink-900 text-ink-400">
                <Camera className="h-8 w-8" aria-hidden="true" />
              </div>
              <div className="space-y-1.5 p-3">
                <span className="inline-flex rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-700">
                  Bodycam
                </span>
                <p className="truncate font-semibold text-ink-900">{constableLabel(d.constable_id)}</p>
                <StatusBadge status={d.status} />
              </div>
            </Card>
          </Link>
        ))}

        {camerasError && (
          <div className="col-span-full">
            <ErrorState message={camerasError} />
          </div>
        )}
        {cameras.map((cam) => (
          <button key={cam.id} type="button" onClick={() => setViewingCamera(cam)} className="text-left">
            <Card className="animate-rise-in overflow-hidden transition-shadow hover:shadow-pop">
              <div className="flex aspect-video w-full items-center justify-center bg-ink-900 text-ink-400">
                <Video className="h-8 w-8" aria-hidden="true" />
              </div>
              <div className="space-y-1.5 p-3">
                <span className="inline-flex rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-700">
                  CCTV
                </span>
                <p className="truncate font-semibold text-ink-900">{cam.camera_code} — {cam.name}</p>
                <StatusBadge status={!cam.enabled ? 'disconnected' : cam.status} label={!cam.enabled ? 'Disabled' : undefined} />
              </div>
            </Card>
          </button>
        ))}
      </div>

      {devices.length === 0 && cameras.length === 0 && <p className="mt-6 text-sm text-ink-500">No bodycams or cameras to show yet.</p>}

      {viewingCamera && <CameraDetailModal camera={viewingCamera} onClose={() => setViewingCamera(null)} />}
    </div>
  )
}
