import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Pencil, RefreshCw, WifiOff } from 'lucide-react'
import { getSite, listBuildings, listCollectors, listControllers, listFloors, listSiteAPs, listSwitches, listZones } from '../api/sites.js'
import { ApiError, friendlyErrorMessage } from '../api/client.js'
import { useAuth } from '../context/AuthContext.jsx'
import { useSiteLive } from '../hooks/useSiteLive.js'
import { ErrorState, LoadingSkeleton, PageHeader } from '../components/Primitives.jsx'
import SiteMap, { MapLegend } from '../components/sites/SiteMap.jsx'
import FloorPlanView from '../components/sites/FloorPlanView.jsx'
import LayersView from '../components/sites/LayersView.jsx'
import OverviewTab from '../components/sites/tabs/OverviewTab.jsx'
import EventsTab from '../components/sites/tabs/EventsTab.jsx'
import AnalyticsTab from '../components/sites/tabs/AnalyticsTab.jsx'
import HealthTab from '../components/sites/tabs/HealthTab.jsx'
import VideoTransferTab from '../components/sites/tabs/VideoTransferTab.jsx'
import SiteFormModal from '../components/sites/admin/SiteFormModal.jsx'
import ZonesAdmin from '../components/sites/admin/ZonesAdmin.jsx'
import FloorsAdmin from '../components/sites/admin/FloorsAdmin.jsx'
import InfraAdmin from '../components/sites/admin/InfraAdmin.jsx'
import CollectorsAdmin from '../components/sites/admin/CollectorsAdmin.jsx'
import PrivacyAdmin from '../components/sites/admin/PrivacyAdmin.jsx'
import StatusBadge from '../components/StatusBadge.jsx'
import Button from '../components/ui/Button.jsx'
import { QUALITY_LABEL, ageText } from '../utils/siteLevels.js'
import { canManageSites } from '../utils/roles.js'

const TABS = [
  ['overview', 'Overview'], ['map', 'Map'], ['plan', 'Floor plan'], ['layers', 'Layers'], ['events', 'Events'],
  ['analytics', 'Analytics'], ['health', 'Health'], ['video', 'Video transfer'], ['configure', 'Configure'],
]
const CONFIG_SECTIONS = [['zones', 'Zones'], ['floors', 'Buildings & floors'], ['infra', 'Infrastructure'], ['collectors', 'Collectors'], ['privacy', 'Privacy & operations']]

export default function SiteDetail() {
  const { id } = useParams()
  const { user } = useAuth()
  const admin = canManageSites(user?.role)
  const [tab, setTab] = useState('overview')
  const [section, setSection] = useState('zones')
  const [site, setSite] = useState(null)
  const [data, setData] = useState({ zones: [], floors: [], buildings: [], aps: [], switches: [], controllers: [], collectors: [] })
  const [floorId, setFloorId] = useState('')
  const [selectedZone, setSelectedZone] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(false)
  const live = useSiteLive(id)

  const loadStatic = useCallback(async () => {
    try {
      const [s, zones, floors, buildings, aps, switches, controllers, collectors] = await Promise.all([
        getSite(id), listZones(id), listFloors(id), listBuildings(id), listSiteAPs(id),
        admin ? listSwitches(id) : Promise.resolve([]), listControllers(id), listCollectors(id),
      ])
      setSite(s)
      setData({ zones, floors, buildings, aps, switches, controllers, collectors })
      setFloorId((cur) => cur || floors[0]?.id || '')
      setError('')
    } catch (err) {
      setError(err instanceof ApiError && err.status === 404 ? 'This site does not exist or you do not have access to it.' : friendlyErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [id, admin])

  useEffect(() => {
    setLoading(true)
    loadStatic()
  }, [loadStatic])

  // AP state/counts change with telemetry; refresh the inventory when the live summary changes.
  useEffect(() => {
    if (!live.lastUpdate || loading) return undefined
    const t = setTimeout(() => listSiteAPs(id).then((aps) => setData((d) => ({ ...d, aps }))).catch(() => {}), 500)
    return () => clearTimeout(t)
  }, [live.lastUpdate, id, loading])

  const apName = useMemo(() => {
    const m = Object.fromEntries(data.aps.map((a) => [a.id, a.code]))
    return (apId) => m[apId] || (apId ? 'unknown AP' : '—')
  }, [data.aps])
  const zoneName = useMemo(() => {
    const m = Object.fromEntries(data.zones.map((z) => [z.id, z.name]))
    return (zid) => m[zid] || '—'
  }, [data.zones])

  if (loading) return <LoadingSkeleton rows={6} />
  if (error) return <ErrorState message={error} onRetry={loadStatic} />
  if (!site) return null
  const summary = live.summary
  const floor = data.floors.find((f) => f.id === floorId)
  const visibleTabs = TABS.filter(([k]) => k !== 'configure' || admin)

  return (
    <div>
      <PageHeader
        back={{ to: "/sites", label: "All sites" }}
        title={site.name}
        subtitle={`${site.code}${site.address ? ` · ${site.address}` : ''}`}
        actions={admin && <Button variant="secondary" icon={Pencil} onClick={() => setEditing(true)}>Edit site</Button>}
      />

      <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-ink-500" aria-live="polite">
        {!site.active && <StatusBadge status="inactive" label="Inactive site" />}
        {summary && <span className={`rounded-full border px-2 py-0.5 font-medium ${summary.quality === 'simulated' || summary.quality === 'mixed' ? 'border-amber-300 bg-amber-50 text-amber-800' : 'border-line'}`}>{QUALITY_LABEL[summary.quality]}</span>}
        <span className="inline-flex items-center gap-1">
          {live.connected ? <><span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden="true" /> Live updates connected</> : <><WifiOff className="h-3.5 w-3.5 text-amber-600" aria-hidden="true" /> Live updates disconnected, reconnecting. Showing the last loaded data.</>}
        </span>
        <span>Updated {ageText(live.lastUpdate)}</span>
        <button type="button" onClick={() => { live.reload(); loadStatic() }} className="inline-flex items-center gap-1 text-brand-700 hover:underline"><RefreshCw className="h-3 w-3" aria-hidden="true" /> Refresh</button>
        {live.error && <span className="text-signal-red">{live.error}</span>}
      </div>

      <div role="tablist" aria-label="Site views" className="mb-5 flex gap-1 overflow-x-auto border-b border-line">
        {visibleTabs.map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} type="button" onClick={() => setTab(k)}
            className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium ${tab === k ? 'border-brand-600 text-brand-700' : 'border-transparent text-ink-600 hover:text-ink-900'}`}>{label}</button>
        ))}
      </div>

      {!summary && tab !== 'configure' && tab !== 'events' && tab !== 'analytics' ? <LoadingSkeleton rows={4} /> : null}

      {summary && tab === 'overview' && <OverviewTab summary={summary} roams={live.roams} apName={apName} zoneName={zoneName} onSelectZone={(zid) => { setSelectedZone(zid); setTab('map') }} />}

      {summary && tab === 'map' && (
        <div>
          <SiteMap site={site} zones={data.zones} aps={data.aps} summary={summary} selectedZoneId={selectedZone} onSelectZone={setSelectedZone} />
          <MapLegend />
          {selectedZone && <ZoneDetail zone={data.zones.find((z) => z.id === selectedZone)} item={summary.by_zone.find((z) => z.id === selectedZone)} aps={data.aps.filter((a) => a.zone_id === selectedZone)} />}
          <p className="mt-2 text-xs text-ink-500">Markers appear only for APs with configured coordinates. Indoor APs are shown on the Floor plan view.</p>
        </div>
      )}

      {summary && tab === 'plan' && (
        <div className="space-y-3">
          {data.floors.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-line p-8 text-center text-sm text-ink-500">This site has no floors. Floors and plans are optional; use the Map view for outdoor areas.</p>
          ) : (
            <>
              <select value={floorId} onChange={(e) => setFloorId(e.target.value)} className="input w-auto" aria-label="Floor">{data.floors.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select>
              <FloorPlanView siteId={id} floor={floor} zones={data.zones} aps={data.aps} summary={summary} selectedZoneId={selectedZone} onSelectZone={setSelectedZone} />
              {selectedZone && <ZoneDetail zone={data.zones.find((z) => z.id === selectedZone)} item={summary.by_zone.find((z) => z.id === selectedZone)} aps={data.aps.filter((a) => a.zone_id === selectedZone)} />}
            </>
          )}
        </div>
      )}

      {summary && tab === 'layers' && (
        <div className="space-y-3">
          <LayersView floors={data.floors} zones={data.zones} aps={data.aps} summary={summary} selectedFloorId={floorId} onSelectFloor={(fid) => { setFloorId(fid); setTab('plan') }} selectedZoneId={selectedZone} onSelectZone={setSelectedZone} />
          {selectedZone && <ZoneDetail zone={data.zones.find((z) => z.id === selectedZone)} item={summary.by_zone.find((z) => z.id === selectedZone)} aps={data.aps.filter((a) => a.zone_id === selectedZone)} />}
        </div>
      )}

      {tab === 'events' && <EventsTab siteId={id} apName={apName} zoneName={zoneName} />}
      {tab === 'analytics' && <AnalyticsTab siteId={id} zones={data.zones} aps={data.aps} apName={apName} zoneName={zoneName} />}
      {summary && tab === 'health' && <HealthTab siteId={id} summary={summary} aps={data.aps} controllers={data.controllers} apName={apName} />}

      {tab === 'video' && <VideoTransferTab siteId={id} admin={admin} />}

      {admin && tab === 'configure' && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Configuration sections">
            {CONFIG_SECTIONS.map(([k, label]) => <button key={k} type="button" role="tab" aria-selected={section === k} onClick={() => setSection(k)} className={`rounded-full border px-3 py-1 text-sm ${section === k ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-line text-ink-600'}`}>{label}</button>)}
          </div>
          {section === 'zones' && <ZonesAdmin siteId={id} zones={data.zones} buildings={data.buildings} floors={data.floors} aps={data.aps} onChanged={loadStatic} />}
          {section === 'floors' && <FloorsAdmin siteId={id} buildings={data.buildings} floors={data.floors} onChanged={loadStatic} />}
          {section === 'infra' && <InfraAdmin siteId={id} {...data} onChanged={loadStatic} />}
          {section === 'collectors' && <CollectorsAdmin siteId={id} collectors={summary?.collectors || data.collectors} onChanged={async () => { await loadStatic(); live.reload() }} />}
          {section === 'privacy' && <PrivacyAdmin site={site} onChanged={loadStatic} />}
        </div>
      )}

      {editing && <SiteFormModal site={site} onClose={() => setEditing(false)} onSaved={(s) => { setEditing(false); setSite(s); loadStatic() }} />}
    </div>
  )
}

function ZoneDetail({ zone, item, aps }) {
  if (!zone) return null
  return (
    <div className="mt-3 rounded-2xl border border-line bg-surface p-4 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold text-ink-900">{zone.name} <span className="text-xs font-normal text-ink-500">{zone.zone_type}</span></p>
        <span className="flex items-center gap-2">{item?.level && <StatusBadge status={item.level} />}<strong className="tabular-nums">{item?.active_clients ?? 0}</strong> active clients{item?.capacity ? ` of ${item.capacity} (${item.utilization_pct}%)` : ''}</span>
      </div>
      <p className="mt-1 text-xs text-ink-500">Warning at {zone.warning_threshold ?? '—'}, critical at {zone.critical_threshold ?? '—'}. {aps.length} access point(s) serve this zone.</p>
    </div>
  )
}
