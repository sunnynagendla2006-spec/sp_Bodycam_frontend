import { useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  Bell,
  Building2,
  Camera,
  Clapperboard,
  FileText,
  FolderOpen,
  History,
  House,
  LayoutGrid,
  LogOut,
  Map as MapIcon,
  Menu,
  Radio,
  Router,
  Settings as SettingsIcon,
  Shield,
  ShieldAlert,
  UserRound,
  Users,
  Video,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext.jsx'
import { useOperations } from '../../context/OperationsContext.jsx'
import {
  ROLE_LABELS,
  canViewStations,
  canViewRoster,
  canViewAudit,
  canViewSettings,
  canViewOperations,
  canViewPresence,
  canViewAccessPoints,
  canViewCCTV,
} from '../../utils/roles.js'

const always = () => true

// Grouped by what a person is trying to do, using everyday wording.
const NAV_GROUPS = [
  {
    heading: 'Daily work',
    items: [
      { to: '/', label: 'Home', icon: House, end: true, show: always },
      { to: '/map', label: 'Live Map', tabLabel: 'Map', icon: MapIcon, show: canViewOperations },
      { to: '/presence', label: 'AP Presence', tabLabel: 'Presence', icon: ShieldAlert, show: canViewPresence },
      { to: '/monitoring', label: 'Body Cameras', tabLabel: 'Cameras', icon: Camera, show: canViewOperations },
      { to: '/cctv', label: 'CCTV Monitoring', icon: Video, show: canViewCCTV },
      { to: '/video-wall', label: 'Live Video Wall', icon: LayoutGrid, show: canViewCCTV },
      { to: '/recordings', label: 'Recordings', icon: Clapperboard, show: canViewOperations },
      { to: '/alerts', label: 'Alerts', icon: Bell, show: canViewOperations },
    ],
  },
  {
    heading: 'Cases',
    items: [
      { to: '/incidents', label: 'Incidents', icon: FileText, show: always },
      { to: '/evidence', label: 'Evidence', icon: FolderOpen, show: always },
    ],
  },
  {
    heading: 'Manage',
    items: [
      { to: '/access-points', label: 'Access Points', icon: Router, show: canViewAccessPoints },
      { to: '/constables', label: 'Constables', icon: Users, show: canViewRoster },
      { to: '/stations', label: 'Police Stations', icon: Building2, show: canViewStations },
      { to: '/commands', label: 'Remote Actions', icon: Radio, show: canViewOperations },
      { to: '/audit', label: 'Activity History', icon: History, show: canViewAudit },
      { to: '/settings', label: 'Settings', icon: SettingsIcon, show: canViewSettings },
    ],
  },
]

// The five most-used places, pinned to the bottom of the screen on phones.
const TAB_ITEMS = ['/', '/monitoring', '/map', '/alerts']

function CountBadge({ value }) {
  if (!value) return null
  return (
    <span className="ml-auto min-w-[1.4rem] rounded-full bg-signal-red px-1.5 py-0.5 text-center text-xs font-semibold tabular-nums text-white">
      {value}
    </span>
  )
}

export default function AppShell() {
  const { user, logout } = useAuth()
  const { connected, counts } = useOperations()
  const navigate = useNavigate()
  const location = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const mainRef = useRef(null)

  // Every page opens at the top, and the phone menu closes after navigating.
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 })
    setSidebarOpen(false)
  }, [location.pathname])

  function handleLogout() {
    logout()
    navigate('/login', { replace: true })
  }

  const groups = NAV_GROUPS.map((g) => ({ ...g, items: g.items.filter((i) => i.show(user?.role)) })).filter((g) => g.items.length > 0)
  const allItems = groups.flatMap((g) => g.items)
  const tabItems = TAB_ITEMS.map((to) => allItems.find((i) => i.to === to)).filter(Boolean)
  const badgeFor = (to) => (to === '/alerts' ? counts.criticalAlerts : 0)

  return (
    <div className="flex h-screen bg-canvas text-ink-900">
      {sidebarOpen && <div className="fixed inset-0 z-30 animate-fade-in bg-ink-900/40 backdrop-blur-[2px] lg:hidden" onClick={() => setSidebarOpen(false)} aria-hidden="true" />}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-72 shrink-0 transform flex-col border-r border-line bg-surface transition-transform duration-300 ease-out lg:static lg:w-64 lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0 shadow-pop' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between gap-3 px-5 py-3">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 text-white shadow-card">
              <Shield className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <p className="font-semibold leading-tight text-ink-900">Police Control Room</p>
              <p className="text-xs text-ink-500">Body camera monitoring</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            className="rounded-lg p-2 text-ink-500 hover:bg-line/60 lg:hidden"
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 pb-1.5 scrollbar-thin" aria-label="Main">
          {groups.map((group) => (
            <div key={group.heading} className="mt-2 first:mt-0">
              <p className="mb-1 px-3 text-xs font-semibold uppercase tracking-wider text-ink-400">{group.heading}</p>
              <div className="space-y-0.5">
                {group.items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    className={({ isActive }) =>
                      `group relative flex items-center gap-3 rounded-xl px-3 py-1 text-sm font-medium transition-colors duration-150 ${
                        isActive ? 'bg-brand-50 text-brand-700' : 'text-ink-700 hover:bg-canvas hover:text-ink-900'
                      }`
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <span
                          className={`absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-brand-600 transition-all duration-200 ${
                            isActive ? 'opacity-100' : 'h-0 opacity-0'
                          }`}
                        />
                        <item.icon className={`h-5 w-5 shrink-0 transition-transform duration-150 group-hover:scale-110 ${isActive ? 'text-brand-600' : 'text-ink-500'}`} aria-hidden="true" />
                        <span>{item.label}</span>
                        <CountBadge value={badgeFor(item.to)} />
                      </>
                    )}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="border-t border-line p-1.5">
          <NavLink
            to="/profile"
            className={({ isActive }) => `flex items-center gap-3 rounded-xl px-3 py-1.5 transition-colors ${isActive ? 'bg-brand-50' : 'hover:bg-canvas'}`}
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-700">
              <UserRound className="h-4 w-4" aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium text-ink-900">{user?.phone}</span>
              <span className="block truncate text-xs text-ink-500">{ROLE_LABELS[user?.role] || user?.role}</span>
            </span>
          </NavLink>
          <button
            onClick={handleLogout}
            className="mt-0.5 flex w-full items-center gap-3 rounded-xl px-3 py-1.5 text-sm font-medium text-ink-500 transition-colors hover:bg-red-50 hover:text-signal-red"
          >
            <LogOut className="h-5 w-5" aria-hidden="true" />
            Sign out
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-3 border-b border-line bg-surface/90 px-4 py-3 backdrop-blur sm:px-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="-ml-1.5 rounded-xl p-2 text-ink-700 transition-colors hover:bg-line/60 lg:hidden"
              aria-label="Open menu"
            >
              <Menu className="h-6 w-6" />
            </button>
            <span className="font-semibold text-ink-900 lg:hidden">Police Control Room</span>
          </div>

          <div className="flex items-center gap-4">
            <span
              className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                connected ? 'bg-green-50 text-green-800' : 'bg-amber-50 text-amber-800'
              }`}
              title={connected ? 'Information on this screen updates by itself' : 'Trying to reconnect. Information may be out of date.'}
            >
              {connected ? <Wifi className="h-4 w-4" aria-hidden="true" /> : <WifiOff className="h-4 w-4" aria-hidden="true" />}
              <span className="hidden sm:inline">{connected ? 'Updating live' : 'Reconnecting'}</span>
              <span className="sm:hidden">{connected ? 'Live' : 'Offline'}</span>
            </span>
          </div>
        </header>

        <main ref={mainRef} className="flex-1 overflow-y-auto px-4 py-6 pb-28 scrollbar-thin sm:px-6 lg:pb-8">
          <div key={location.pathname} className="mx-auto w-full max-w-7xl animate-fade-in">
            <Outlet />
          </div>
        </main>

        <nav
          className="fixed inset-x-0 bottom-0 z-20 grid border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
          style={{ gridTemplateColumns: `repeat(${tabItems.length + 1}, minmax(0, 1fr))` }}
          aria-label="Quick links"
        >
          {tabItems.map((item) => {
            const badge = badgeFor(item.to)
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `relative flex flex-col items-center gap-1 px-2 py-2.5 text-xs font-medium transition-colors ${isActive ? 'text-brand-600' : 'text-ink-500'}`
                }
              >
                <span className="relative">
                  <item.icon className="h-6 w-6" aria-hidden="true" />
                  {badge > 0 && (
                    <span className="absolute -right-2 -top-1.5 min-w-[1.1rem] rounded-full bg-signal-red px-1 text-center text-[10px] font-semibold leading-[1.1rem] text-white">
                      {badge}
                    </span>
                  )}
                </span>
                {item.tabLabel || item.label}
              </NavLink>
            )
          })}
          <button type="button" onClick={() => setSidebarOpen(true)} className="flex flex-col items-center gap-1 px-2 py-2.5 text-xs font-medium text-ink-500">
            <Menu className="h-6 w-6" aria-hidden="true" />
            More
          </button>
        </nav>
      </div>
    </div>
  )
}
