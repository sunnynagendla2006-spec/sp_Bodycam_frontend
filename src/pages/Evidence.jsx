import { useEffect, useState } from 'react'
import { Archive, BadgeCheck, Ban, Download, Eye, FolderOpen, Plus, Upload } from 'lucide-react'
import { useAuth } from '../context/AuthContext.jsx'
import { useToast } from '../context/ToastContext.jsx'
import { listEvidence, uploadEvidence, verifyEvidence, rejectEvidence, archiveEvidence, evidenceStreamUrl, downloadEvidence } from '../api/evidence.js'
import { listIncidents } from '../api/incidents.js'
import { friendlyErrorMessage } from '../api/client.js'
import { LoadingSkeleton, ErrorState, EmptyState, PageHeader, ConfirmDialog } from '../components/Primitives.jsx'
import StatusBadge from '../components/StatusBadge.jsx'
import Button from '../components/ui/Button.jsx'
import DataTable from '../components/ui/DataTable.jsx'
import { Field } from '../components/ui/Form.jsx'
import Modal from '../components/ui/Modal.jsx'
import { canUploadEvidence, canVerifyEvidence } from '../utils/roles.js'
import { formatBytes, formatDateTimeShort } from '../utils/format.js'

const TYPE_LABELS = { photo: 'Photo', audio: 'Audio', video: 'Video' }

export default function Evidence() {
  const { user } = useAuth()
  const { notify } = useToast()
  const [items, setItems] = useState([])
  const [incidents, setIncidents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showUpload, setShowUpload] = useState(false)
  const [preview, setPreview] = useState(null)
  const [busyId, setBusyId] = useState(null)
  const [rejecting, setRejecting] = useState(null)

  async function load() {
    setLoading(true)
    setError('')
    try {
      const [ev, inc] = await Promise.all([listEvidence(), listIncidents()])
      setItems(ev)
      setIncidents(inc)
    } catch (err) {
      setError(friendlyErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  async function runAction(id, fn, message) {
    setBusyId(id)
    try {
      await fn()
      notify(message, { tone: 'success' })
      await load()
    } catch (err) {
      notify(friendlyErrorMessage(err), { tone: 'error' })
    } finally {
      setBusyId(null)
    }
  }

  const incidentName = (id) => incidents.find((i) => i.id === id)?.display_id || '—'
  const canVerify = canVerifyEvidence(user?.role)

  const columns = [
    {
      key: 'file',
      header: 'File',
      primary: true,
      cell: (m) => (
        <button onClick={() => setPreview(m)} className="max-w-[16rem] truncate text-left text-brand-600 hover:text-brand-800 hover:underline">
          {m.original_filename || TYPE_LABELS[m.type] || m.type}
        </button>
      ),
    },
    { key: 'type', header: 'Kind', cell: (m) => TYPE_LABELS[m.type] || m.type || '—' },
    { key: 'status', header: 'Status', cell: (m) => <StatusBadge status={m.upload_status} /> },
    { key: 'incident', header: 'Incident', cell: (m) => incidentName(m.incident_id) },
    { key: 'size', header: 'Size', cell: (m) => <span className="text-ink-500">{formatBytes(m.file_size)}</span> },
    { key: 'uploaded', header: 'Added', cell: (m) => <span className="whitespace-nowrap text-ink-500">{formatDateTimeShort(m.timestamp)}</span> },
    {
      key: 'actions',
      header: '',
      cell: (m) => (
        <div className="flex flex-wrap justify-end gap-2 md:justify-start">
          <Button variant="secondary" size="sm" icon={Eye} onClick={() => setPreview(m)}>
            Open
          </Button>
          <Button
            variant="secondary"
            size="sm"
            icon={Download}
            onClick={() => downloadEvidence(m.id, m.original_filename).catch((err) => notify(friendlyErrorMessage(err), { tone: 'error' }))}
          >
            Download
          </Button>
          {canVerify && m.upload_status === 'uploaded' && (
            <>
              <Button size="sm" icon={BadgeCheck} disabled={busyId === m.id} onClick={() => runAction(m.id, () => verifyEvidence(m.id), 'Evidence verified')}>
                Verify
              </Button>
              <Button variant="danger-soft" size="sm" icon={Ban} disabled={busyId === m.id} onClick={() => setRejecting(m)}>
                Reject
              </Button>
            </>
          )}
          {canVerify && m.upload_status === 'verified' && (
            <Button variant="ghost" size="sm" icon={Archive} disabled={busyId === m.id} onClick={() => runAction(m.id, () => archiveEvidence(m.id), 'Evidence archived')}>
              Archive
            </Button>
          )}
        </div>
      ),
    },
  ]

  return (
    <div>
      <PageHeader
        title="Evidence"
        subtitle="Photos, audio and video attached to incidents"
        actions={
          canUploadEvidence(user?.role) && (
            <Button icon={Plus} onClick={() => setShowUpload(true)}>
              Add evidence
            </Button>
          )
        }
      />

      {loading ? (
        <LoadingSkeleton rows={6} />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : items.length === 0 ? (
        <EmptyState icon={FolderOpen} title="No evidence yet" hint="Evidence you have access to will show up here." />
      ) : (
        <DataTable columns={columns} rows={items} />
      )}

      {showUpload && (
        <UploadModal
          incidents={incidents}
          onClose={() => setShowUpload(false)}
          onUploaded={async () => {
            setShowUpload(false)
            notify('Evidence added', { tone: 'success' })
            await load()
          }}
        />
      )}

      {preview && <PreviewModal item={preview} onClose={() => setPreview(null)} />}

      <ConfirmDialog
        open={!!rejecting}
        title="Reject this evidence?"
        message={`${rejecting?.original_filename || 'This file'} will be marked as rejected.`}
        reasonLabel="Reason (optional)"
        confirmLabel="Reject"
        tone="danger"
        onCancel={() => setRejecting(null)}
        onConfirm={(reason) => {
          const target = rejecting
          setRejecting(null)
          runAction(target.id, () => rejectEvidence(target.id, reason), 'Evidence rejected')
        }}
      />
    </div>
  )
}

function UploadModal({ incidents, onClose, onUploaded }) {
  const { notify } = useToast()
  const [incidentId, setIncidentId] = useState('')
  const [type, setType] = useState('photo')
  const [comment, setComment] = useState('')
  const [file, setFile] = useState(null)
  const [progress, setProgress] = useState(0)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!file || !incidentId) return
    setSubmitting(true)
    setProgress(0)
    try {
      await uploadEvidence({
        incidentId,
        type,
        file,
        comment,
        onUploadProgress: (evt) => {
          if (evt.total) setProgress(Math.round((evt.loaded / evt.total) * 100))
        },
      })
      onUploaded()
    } catch (err) {
      notify(friendlyErrorMessage(err), { tone: 'error' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      title="Add evidence"
      onClose={submitting ? undefined : onClose}
      dismissible={!submitting}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" form="upload-evidence" icon={Upload} loading={submitting} disabled={!file || !incidentId}>
            {submitting ? `Uploading… ${progress}%` : 'Upload'}
          </Button>
        </>
      }
    >
      <form id="upload-evidence" onSubmit={handleSubmit} className="space-y-4 pt-2">
        <Field label="Which incident is this for?">
          <select required value={incidentId} onChange={(e) => setIncidentId(e.target.value)} className="input">
            <option value="">Choose an incident</option>
            {incidents.map((i) => (
              <option key={i.id} value={i.id}>
                {i.display_id || 'Incident'} - {i.description || 'No description'}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Kind of file">
          <select value={type} onChange={(e) => setType(e.target.value)} className="input">
            <option value="photo">Photo</option>
            <option value="audio">Audio</option>
            <option value="video">Video</option>
          </select>
        </Field>
        <Field label="Note (optional)">
          <input value={comment} onChange={(e) => setComment(e.target.value)} className="input" />
        </Field>
        <Field label="File">
          <input
            type="file"
            required
            accept="image/*,audio/*,video/*"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="w-full text-sm text-ink-700 file:mr-3 file:cursor-pointer file:rounded-lg file:border-0 file:bg-brand-50 file:px-4 file:py-2 file:text-sm file:font-medium file:text-brand-700 hover:file:bg-brand-100"
          />
        </Field>
        {submitting && (
          <div className="h-2 w-full overflow-hidden rounded-full bg-line">
            <div className="h-full rounded-full bg-brand-600 transition-all" style={{ width: `${progress}%` }} />
          </div>
        )}
      </form>
    </Modal>
  )
}

function PreviewModal({ item, onClose }) {
  const url = evidenceStreamUrl(item.id)
  const mime = item.mime_type || ''
  return (
    <Modal title={item.original_filename || TYPE_LABELS[item.type] || 'Evidence'} onClose={onClose} size="lg">
      {mime.startsWith('image/') ? (
        <img src={url} alt={item.original_filename || 'evidence'} className="max-h-[60vh] w-full rounded-xl object-contain" />
      ) : mime.startsWith('audio/') ? (
        <audio controls src={url} className="w-full" />
      ) : mime.startsWith('video/') ? (
        <video controls src={url} className="max-h-[60vh] w-full rounded-xl bg-black" />
      ) : (
        <p className="text-sm text-ink-700">
          This kind of file cannot be shown here.{' '}
          <a href={url} target="_blank" rel="noreferrer" className="font-medium text-brand-600 hover:underline">
            Open it in a new tab
          </a>
        </p>
      )}
    </Modal>
  )
}
