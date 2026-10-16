import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Plus, Radar } from 'lucide-react'
import { getSummary, listSites } from '../api/sites.js'
import { friendlyErrorMessage } from '../api/client.js'
import { useAuth } from '../context/AuthContext.jsx'
import { EmptyState, ErrorState, LoadingSkeleton, PageHeader } from '../components/Primitives.jsx'
import SiteFormModal from '../components/sites/admin/SiteFormModal.jsx'
import StatusBadge from '../components/StatusBadge.jsx'
import { Card } from '../components/ui/Card.jsx'
import Button from '../components/ui/Button.jsx'
import SearchInput from '../components/ui/SearchInput.jsx'
import { QUALITY_LABEL } from '../utils/siteLevels.js'
import { canManageSites } from '../utils/roles.js'

const TYPE_LABEL = { campus: 'Campus', building: 'Building', mall: 'Mall', hospital: 'Hospital', transport_hub: 'Station', airport: 'Airport', stadium: 'Stadium', convention_centre: 'Convention centre', festival: 'Festival', outdoor_grounds: 'Outdoor grounds', industrial: 'Industrial', custom: 'Custom' }

function SiteCard({ site }) {
  const [summary, setSummary] = useState(null)
  useEffect(() => {
    let cancelled = false
    getSummary(site.id).then((s) => !cancelled && setSummary(s)).catch(() => {})
    return () => { cancelled = true }
  }, [site.id])
  return (
    <Link to={`/sites/${site.id}`} className="block">
      <Card className="h-full space-y-2 p-4 transition-shadow hover:shadow-pop">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate font-semibold text-ink-900">{site.name}</p>
            <p className="text-xs text-ink-500">{site.code} · {site.site_type === 'custom' && site.custom_type_label ? site.custom_type_label : TYPE_LABEL[site.site_type]}</p>
          </div>
          {!site.active && <StatusBadge status="inactive" label="Inactive" />}
        </div>
        {summary ? (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <span><strong className="text-lg tabular-nums">{summary.total_active_clients}</strong> <span className="text-xs text-ink-500">active clients</span></span>
            <span className="text-xs text-ink-500">{summary.ap_states.online}/{summary.by_ap.length} APs online</span>
            {summary.open_breaches > 0 && <StatusBadge status="warning" label={`${summary.open_breaches} breach${summary.open_breaches === 1 ? '' : 'es'}`} />}
            {(summary.quality === 'simulated' || summary.quality === 'mixed') && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">{QUALITY_LABEL[summary.quality]}</span>}
            {summary.stale && summary.collectors.length > 0 && <span className="text-xs text-amber-700">stale</span>}
            {summary.collectors.length === 0 && <span className="text-xs text-amber-700">no collector</span>}
          </div>
        ) : <div className="h-6 w-2/3 animate-pulse rounded bg-line/60" aria-hidden="true" />}
      </Card>
    </Link>
  )
}

export default function Sites() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [sites, setSites] = useState([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [creating, setCreating] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setSites(await listSites({ q: query || undefined, limit: 100 }))
      setError('')
    } catch (err) {
      setError(friendlyErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [query])

  useEffect(() => {
    const t = setTimeout(load, query ? 300 : 0)
    return () => clearTimeout(t)
  }, [load, query])

  return (
    <div>
      <PageHeader
        title="Site Monitoring"
        subtitle="Wi-Fi occupancy and movement for campuses, buildings, stations, stadiums, festival grounds and other monitored areas."
        actions={canManageSites(user?.role) && <Button icon={Plus} onClick={() => setCreating(true)}>Add site</Button>}
      />
      <SearchInput value={query} onChange={setQuery} placeholder="Search sites" className="mb-4 sm:w-72" />
      {loading && sites.length === 0 ? <LoadingSkeleton rows={4} /> : error ? <ErrorState message={error} onRetry={load} /> : sites.length === 0 ? (
        <EmptyState icon={Radar} title="No sites" hint={canManageSites(user?.role) ? 'Add a site, then its zones, access points and a collector.' : 'No site is available to your account.'} />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">{sites.map((s) => <SiteCard key={s.id} site={s} />)}</div>
      )}
      <p className="mt-4 text-xs text-ink-500">Counts are devices associated to access points according to network telemetry, not people.</p>
      {creating && <SiteFormModal onClose={() => setCreating(false)} onSaved={(s) => { setCreating(false); navigate(`/sites/${s.id}`) }} />}
    </div>
  )
}
