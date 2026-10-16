import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import VideoTransferTab from '../components/sites/tabs/VideoTransferTab.jsx'
import { ToastProvider } from '../context/ToastContext.jsx'

const api = vi.hoisted(() => ({
  getBodycamOverview: vi.fn(), listSiteRecordings: vi.fn(), getReceiverLocalRecordings: vi.fn(), getSiteRecording: vi.fn(),
  listAssignments: vi.fn(), listDeviceAuthorizations: vi.fn(), listGrants: vi.fn(), listBodycamAudit: vi.fn(), queueReceiverCommand: vi.fn(),
}))
vi.mock('../api/bodycam.js', () => ({
  getBodycamOverview: api.getBodycamOverview, listSiteRecordings: api.listSiteRecordings, getReceiverLocalRecordings: api.getReceiverLocalRecordings,
  getSiteRecording: api.getSiteRecording, listAssignments: api.listAssignments, listDeviceAuthorizations: api.listDeviceAuthorizations,
  listGrants: api.listGrants, listBodycamAudit: api.listBodycamAudit, queueReceiverCommand: api.queueReceiverCommand,
  createAssignment: vi.fn(), revokeAssignment: vi.fn(), authorizeDevice: vi.fn(), revokeDeviceAuthorization: vi.fn(), issueGrant: vi.fn(), revokeGrant: vi.fn(),
  createReceiver: vi.fn(), deleteReceiver: vi.fn(), revokeReceiver: vi.fn(), rotateReceiverToken: vi.fn(),
}))
vi.mock('../api/constables.js', () => ({ listConstables: vi.fn().mockResolvedValue([]) }))
vi.mock('../api/devices.js', () => ({ listDevices: vi.fn().mockResolvedValue([]) }))

const receiver = (over = {}) => ({
  id: 'r1', site_id: 's1', code: 'R1', name: 'Gate receiver', endpoint_url: 'https://r.test', local_live_enabled: false, active: true, revoked: false,
  token_version: 1, version: '0.1.0', capabilities: [], state: 'online', last_seen_at: new Date().toISOString(), last_sync_at: null, last_central_ack_at: null,
  last_local_upload_at: null, disk_total_bytes: 1e12, disk_free_bytes: 5e11, disk_used_pct: 50, accepting_uploads: true, pending_chunks: 4, syncing_chunks: 0,
  quarantined_chunks: 1, received_chunks_total: 9, failures: [], pending_commands: 0, alerts: [], ...over,
})
const overview = (over = {}) => ({ site_id: 's1', receivers: [receiver()], active_assignments: 1, authorized_devices: 1, active_grants: 1, recordings_total: 3, recordings_via_receiver: 2,
  recordings_in_progress: 0, receiver_pending_chunks: 4, receiver_quarantined_chunks: 1, alerts: [], ...over })
const rec = (over = {}) => ({ id: 'aaaaaaaa-0000-0000-0000-000000000001', site_id: 's1', receiver_id: 'r1', origin: 'site_receiver', constable_id: 'c1', constable_label: 'B-100', device_id: 'd1',
  device_identifier: 'dev-ident-12345', status: 'completed', started_at: '2026-01-01T00:00:00Z', ended_at: null, chunk_count: 3, missing_chunk_numbers: [], flags: [], sync_state: 'central', created_at: '2026-01-01T00:00:00Z', ...over })
const local = (items, over = {}) => ({ receiver_id: 'r1', reported_at: new Date().toISOString(), stale: false, items, ...over })
const localItem = (over = {}) => ({ recording_id: 'bbbbbbbb-0000-0000-0000-000000000002', status: 'completed', constable_label: 'B-200', device_identifier: 'dev-2', started_at: '2026-01-02T00:00:00Z',
  created_at: '2026-01-02T00:00:00Z', expected_chunks: null, chunks_received: 5, chunks_synced: 0, chunks_quarantined: 0, central_registered: false, central_completed: false, last_error: null,
  registered_centrally: false, ...over })

function mount(admin = false) {
  return render(<ToastProvider><VideoTransferTab siteId="s1" admin={admin} /></ToastProvider>)
}

beforeEach(() => {
  vi.clearAllMocks()
  api.getBodycamOverview.mockResolvedValue(overview())
  api.listSiteRecordings.mockResolvedValue({ items: [rec()], total: 1, limit: 25, offset: 0 })
  api.getReceiverLocalRecordings.mockResolvedValue(local([]))
})

describe('Video transfer tab', () => {
  it('shows receiver health from the real overview and says a receiver that never reported has an unknown (not zero) backlog', async () => {
    api.getBodycamOverview.mockResolvedValue(overview({ receivers: [receiver({ last_seen_at: null, state: 'unknown', pending_chunks: 0, quarantined_chunks: 0, disk_free_bytes: null, disk_total_bytes: null })] }))
    mount()
    expect(await screen.findByText(/No report from this receiver yet/i)).toBeInTheDocument()
    expect(screen.queryByText(/0 quarantined/)).toBeNull()
  })

  it('shows backlog counts as the receiver\'s last report when it has reported', async () => {
    mount()
    expect(await screen.findByText(/4 stored here, waiting for the control room/)).toBeInTheDocument()
    expect(screen.getByText(/1 quarantined/)).toBeInTheDocument()
    expect(screen.getByText(/counts as of its last report/)).toBeInTheDocument()
  })

  it('lists receiver-held recordings in their own table, labelled as not yet at the control room, with unknown expected chunks', async () => {
    api.getReceiverLocalRecordings.mockResolvedValue(local([localItem()]))
    mount()
    await userEvent.click(await screen.findByRole('tab', { name: 'Recordings' }))
    await screen.findByText(/Held at the site receiver, not yet at the control room/)
    expect(screen.getByText('bbbbbbbb…')).toBeInTheDocument()
    expect(screen.getByText('unknown')).toBeInTheDocument()
    expect(screen.getByText(/Complete at site, waiting for forwarding/)).toBeInTheDocument()
  })

  it('does not list a receiver-held recording a second time once the control room has it', async () => {
    api.getReceiverLocalRecordings.mockResolvedValue(local([localItem({ registered_centrally: true, central_registered: true, chunks_synced: 2, chunks_received: 5 })]))
    api.listSiteRecordings.mockResolvedValue({ items: [rec({ id: 'bbbbbbbb-0000-0000-0000-000000000002', sync_state: 'partial' })], total: 1, limit: 25, offset: 0 })
    mount()
    await userEvent.click(await screen.findByRole('tab', { name: 'Recordings' }))
    await screen.findByText('Partly at control room')
    expect(screen.queryByText(/Held at the site receiver, not yet at the control room/)).toBeNull()
    expect(screen.getByText(/Receiver: 2\/5 chunks confirmed centrally/)).toBeInTheDocument()
  })

  it('flags an old receiver report as stale', async () => {
    api.getReceiverLocalRecordings.mockResolvedValue(local([localItem()], { stale: true }))
    mount()
    await userEvent.click(await screen.findByRole('tab', { name: 'Recordings' }))
    expect(await screen.findByText('report is old')).toBeInTheDocument()
  })

  it('never presents local receipt as central archival: each sync state has its own honest label', async () => {
    api.listSiteRecordings.mockResolvedValue({
      items: [rec({ id: 'a1', sync_state: 'local_only' }), rec({ id: 'a2', sync_state: 'partial' }), rec({ id: 'a3', sync_state: 'incomplete', missing_chunk_numbers: [2] }), rec({ id: 'a4', sync_state: 'central' })],
      total: 4, limit: 25, offset: 0,
    })
    mount()
    await userEvent.click(await screen.findByRole('tab', { name: 'Recordings' }))
    expect(await screen.findByText('Stored at site only')).toBeInTheDocument()
    expect(screen.getByText('Partly at control room')).toBeInTheDocument()
    expect(screen.getByText('Completed with missing chunks')).toBeInTheDocument()
    expect(screen.getByText('At control room')).toBeInTheDocument()
    expect(screen.getByText(/1 missing/)).toBeInTheDocument()
  })

  it('shows per-chunk original and derived hashes and a missing original honestly', async () => {
    api.getSiteRecording.mockResolvedValue({ ...rec(), chunks: [
      { chunk_id: 'k1', chunk_number: 1, file_size: 2048, original_hash: 'ab'.repeat(32), derived_hash: 'cd'.repeat(32), has_original: true, received_via: 'site_receiver', site_received_at: '2026-01-01T00:00:01Z', created_at: '2026-01-01T00:00:02Z', processing: [] },
      { chunk_id: 'k2', chunk_number: 2, file_size: 2048, original_hash: null, derived_hash: null, has_original: false, received_via: 'central', site_received_at: null, created_at: '2026-01-01T00:00:03Z', processing: [] },
    ] })
    mount()
    await userEvent.click(await screen.findByRole('tab', { name: 'Recordings' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Chunks' }))
    expect(await screen.findByText(/abababababababab…/)).toBeInTheDocument()
    expect(screen.getByText('not recorded')).toBeInTheDocument()
    expect(screen.getByText(/exactly as the phone sent it/)).toBeInTheDocument()
  })

  it('shows an error state when the overview cannot be loaded, and an empty state when there are no recordings', async () => {
    api.getBodycamOverview.mockRejectedValueOnce(new Error('boom'))
    const { unmount } = mount()
    await waitFor(() => expect(screen.getByRole('alert') || screen.getByText(/try again/i)).toBeTruthy())
    unmount()
    api.listSiteRecordings.mockResolvedValue({ items: [], total: 0, limit: 25, offset: 0 })
    mount()
    await userEvent.click(await screen.findByRole('tab', { name: 'Recordings' }))
    expect(await screen.findByText('No recordings')).toBeInTheDocument()
  })

  it('does not offer management actions to view-only users, and offers re-sync to admins', async () => {
    const { unmount } = mount(false)
    await screen.findByText('Gate receiver')
    expect(screen.queryByRole('button', { name: /Add receiver/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Re-sync/ })).toBeNull()
    unmount()
    mount(true)
    expect(await screen.findByRole('button', { name: /Add receiver/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Re-sync/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Retry quarantined/ })).toBeEnabled()
  })

  it('surfaces server-side needs-attention alerts', async () => {
    api.getBodycamOverview.mockResolvedValue(overview({ alerts: ['Receiver R1: disk is almost full'] }))
    mount()
    expect(await screen.findByText(/disk is almost full/)).toBeInTheDocument()
  })
})
