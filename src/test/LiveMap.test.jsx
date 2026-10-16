import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import LiveMap from '../pages/LiveMap.jsx'

// react-leaflet's real MapContainer/Marker require actual DOM layout
// (getBoundingClientRect etc.) that jsdom doesn't provide -- these tests
// verify the DATA every marker/popup is given (position, color, label,
// status text), not Leaflet's own rendering.
vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }) => <div data-testid="map-container">{children}</div>,
  TileLayer: () => null,
  Marker: ({ children, position, icon }) => (
    <div data-testid="marker" data-position={JSON.stringify(position)} data-icon-html={icon?.options?.html}>
      {children}
    </div>
  ),
  Popup: ({ children }) => <div data-testid="popup">{children}</div>,
  Polygon: ({ children, positions, pathOptions }) => (
    <div data-testid="polygon" data-positions={JSON.stringify(positions)} data-color={pathOptions?.color}>
      {children}
    </div>
  ),
  Circle: ({ center, radius }) => (
    <div data-testid="circle" data-center={JSON.stringify(center)} data-radius={radius} />
  ),
  Tooltip: ({ children }) => <div data-testid="tooltip">{children}</div>,
  useMap: () => ({ flyTo: vi.fn() }),
}))

let mockDevices = []
let mockEventZones = []
let mockOfficerLocations = {}
let mockPresence = []
let mockOperationsError = ''
const mockRefresh = vi.fn()
vi.mock('../context/OperationsContext.jsx', () => ({
  useOperations: () => ({
    devices: mockDevices,
    eventZones: mockEventZones,
    officerLocations: mockOfficerLocations,
    presence: mockPresence,
    loading: false,
    error: mockOperationsError,
    refresh: mockRefresh,
  }),
}))

let mockById = {}
let mockRosterLoading = false
vi.mock('../hooks/useConstableLookup.js', () => ({
  useConstableLookup: () => ({ byId: mockById, loading: mockRosterLoading, label: (id) => mockById[id]?.badge_number || id }),
}))

const ACTIVE_COLOR = '#22C55E'
const OFFLINE_COLOR = '#EF4444'

function constable(id, overrides = {}) {
  return { id, badge_number: `Constable Test ${id}`, phone: `999000200${id}`, station_name: `Test Station ${id}`, ...overrides }
}

function device(constableId, overrides = {}) {
  return {
    id: `device-${constableId}`,
    constable_id: constableId,
    device_identifier: `TEST-BODYCAM-00${constableId}`,
    status: 'online',
    latitude: 17.43,
    longitude: 78.45,
    location_updated_at: new Date().toISOString(),
    ...overrides,
  }
}

function markersFor(container) {
  return within(container).queryAllByTestId('marker')
}

describe('LiveMap constable identity + status visualization', () => {
  beforeEach(() => {
    mockDevices = []
    mockEventZones = []
    mockOfficerLocations = {}
    mockPresence = []
    mockById = {}
    mockOperationsError = ''
    mockRosterLoading = false
    mockRefresh.mockReset()
  })

  it('1+2. an active constable renders a GREEN marker with their real name, never a UUID/placeholder', () => {
    mockById = { '1': constable('1') }
    mockDevices = [device('1', { status: 'online' })]
    const { container } = render(<LiveMap />, { wrapper: MemoryRouter })

    const markers = markersFor(container)
    expect(markers).toHaveLength(1)
    expect(markers[0].dataset.iconHtml).toContain(ACTIVE_COLOR)
    expect(markers[0].dataset.iconHtml).toContain('Constable Test 1')
    expect(screen.getAllByText('Constable Test 1').length).toBeGreaterThan(0)
    expect(screen.getByText('Online')).toBeInTheDocument()
  })

  it('3+4+5. an offline constable renders a RED marker AT THEIR LAST KNOWN COORDINATES, with their real name', () => {
    mockById = { '2': constable('2') }
    mockDevices = [device('2', { status: 'offline', latitude: 12.34, longitude: 56.78 })]
    const { container } = render(<LiveMap />, { wrapper: MemoryRouter })

    const markers = markersFor(container)
    expect(markers).toHaveLength(1)
    expect(JSON.parse(markers[0].dataset.position)).toEqual([12.34, 56.78])
    expect(markers[0].dataset.iconHtml).toContain(OFFLINE_COLOR)
    expect(markers[0].dataset.iconHtml).toContain('Constable Test 2')
    expect(screen.getByText('Offline')).toBeInTheDocument()
    expect(screen.getByText('Last known location')).toBeInTheDocument()
  })

  it('6. a constable with no reported location gets NO marker and NO fabricated coordinates -- listed under No Location instead', () => {
    mockById = { '5': constable('5') }
    mockDevices = [device('5', { latitude: null, longitude: null, location_updated_at: null })]
    const { container } = render(<LiveMap />, { wrapper: MemoryRouter })

    expect(markersFor(container)).toHaveLength(0)
    expect(screen.getByText('No location yet')).toBeInTheDocument()
    expect(screen.getByText('No location reported yet')).toBeInTheDocument()
    expect(screen.getByText('Constable Test 5')).toBeInTheDocument()
  })

  it('6b. a constable with no device at all is never given a fake map position', () => {
    mockById = { '5': constable('5') }
    mockDevices = [] // no device record exists for this constable
    const { container } = render(<LiveMap />, { wrapper: MemoryRouter })

    expect(markersFor(container)).toHaveLength(0)
    expect(screen.getByText('No location reported yet')).toBeInTheDocument()
  })

  it('7. multiple constables (active, offline, and no-location) all appear simultaneously', () => {
    mockById = { '1': constable('1'), '2': constable('2'), '5': constable('5') }
    mockDevices = [
      device('1', { status: 'online' }),
      device('2', { status: 'offline' }),
      device('5', { latitude: null, longitude: null }),
    ]
    const { container } = render(<LiveMap />, { wrapper: MemoryRouter })

    expect(markersFor(container)).toHaveLength(2) // constable 5 has no location -> no marker
    expect(screen.getByText('Online now')).toBeInTheDocument()
    expect(screen.getByText('Offline - last known place')).toBeInTheDocument()
    expect(screen.getByText('No location yet')).toBeInTheDocument()
  })

  it('8+9. a constable going online -> offline flips GREEN to RED while keeping the same last-known coordinates', () => {
    mockById = { '3': constable('3') }
    mockDevices = [device('3', { status: 'online', latitude: 10, longitude: 20 })]
    const { container, rerender } = render(<LiveMap />, { wrapper: MemoryRouter })
    expect(markersFor(container)[0].dataset.iconHtml).toContain(ACTIVE_COLOR)

    mockDevices = [device('3', { status: 'offline', latitude: 10, longitude: 20 })]
    rerender(<LiveMap />)

    const markers = markersFor(container)
    expect(markers).toHaveLength(1)
    expect(markers[0].dataset.iconHtml).toContain(OFFLINE_COLOR)
    expect(JSON.parse(markers[0].dataset.position)).toEqual([10, 20]) // coordinates preserved, never reset
  })

  it('10. a constable coming back online flips RED to GREEN and adopts the new location', () => {
    mockById = { '4': constable('4') }
    mockDevices = [device('4', { status: 'offline', latitude: 10, longitude: 20 })]
    const { container, rerender } = render(<LiveMap />, { wrapper: MemoryRouter })
    expect(markersFor(container)[0].dataset.iconHtml).toContain(OFFLINE_COLOR)

    mockDevices = [device('4', { status: 'online', latitude: 11, longitude: 21 })]
    rerender(<LiveMap />)

    const markers = markersFor(container)
    expect(markers[0].dataset.iconHtml).toContain(ACTIVE_COLOR)
    expect(JSON.parse(markers[0].dataset.position)).toEqual([11, 21])
  })

  it('11. never widens scope beyond what the (already-authorized) hooks return -- a constable-role viewer with an empty roster still sees only their own device, via the pre-existing UUID-prefix fallback, never a fabricated name', () => {
    mockById = {} // useConstableLookup gates on canViewRoster -- empty for a constable-role viewer
    mockDevices = [device('own-device-constable-id', { status: 'online' })]
    const { container } = render(<LiveMap />, { wrapper: MemoryRouter })

    const markers = markersFor(container)
    expect(markers).toHaveLength(1)
    // Falls back to the id itself (component slices to 8 chars) -- never invents a name.
    expect(markers[0].dataset.iconHtml).toContain('own-devi')
  })

  it('12. never renders duplicate markers for the same constable even if multiple device rows exist for them', () => {
    mockById = { '1': constable('1') }
    mockDevices = [
      device('1', { id: 'device-1a', status: 'offline', latitude: 1, longitude: 1, location_updated_at: '2020-01-01T00:00:00Z' }),
      device('1', { id: 'device-1b', status: 'online', latitude: 2, longitude: 2, location_updated_at: '2026-01-01T00:00:00Z' }),
    ]
    const { container } = render(<LiveMap />, { wrapper: MemoryRouter })

    const markers = markersFor(container)
    expect(markers).toHaveLength(1)
    // The most recently-updated device's location wins.
    expect(JSON.parse(markers[0].dataset.position)).toEqual([2, 2])
  })

  it('renders enabled EventZone polygons with translated lat/lon positions', () => {
    mockEventZones = [
      {
        id: 'ez-1',
        name: 'Main Gate Zone',
        code: 'GATE-01',
        zone_type: 'ENTRY_POINT',
        color: '#3B82F6',
        enabled: true,
        priority: 10,
        polygon: {
          type: 'Polygon',
          coordinates: [
            [[80.12, 16.31], [80.13, 16.31], [80.13, 16.32], [80.12, 16.32], [80.12, 16.31]]
          ]
        }
      },
      {
        id: 'ez-2',
        name: 'Disabled Zone',
        code: 'DIS-01',
        zone_type: 'PARKING',
        enabled: false,
        polygon: {
          type: 'Polygon',
          coordinates: [[[80.0, 16.0], [80.1, 16.0], [80.1, 16.1], [80.0, 16.0]]]
        }
      }
    ]

    const { container } = render(<LiveMap />, { wrapper: MemoryRouter })
    const polygons = within(container).queryAllByTestId('polygon')
    expect(polygons).toHaveLength(1) // only enabled zone is rendered
    expect(polygons[0].dataset.color).toBe('#3B82F6')
    // Coordinates translated from [lon, lat] to Leaflet [lat, lon]
    const positions = JSON.parse(polygons[0].dataset.positions)
    expect(positions[0][0]).toEqual([16.31, 80.12])
  })

  it('renders accuracy circle when officer reports accuracy > 0', () => {
    mockById = { '1': constable('1') }
    mockDevices = [device('1', { status: 'online', latitude: 16.31, longitude: 80.12, location_accuracy: 15.5 })]
    const { container } = render(<LiveMap />, { wrapper: MemoryRouter })

    const circles = within(container).queryAllByTestId('circle')
    expect(circles).toHaveLength(1)
    expect(JSON.parse(circles[0].dataset.center)).toEqual([16.31, 80.12])
    expect(parseFloat(circles[0].dataset.radius)).toBeCloseTo(15.5)
  })

  it('real-time officerLocations takes precedence over REST device snapshot without requiring page reload', () => {
    mockById = { '1': constable('1') }
    mockDevices = [device('1', { status: 'online', latitude: 10.0, longitude: 20.0 })]
    // officerLocations received via WebSocket
    mockOfficerLocations = {
      '1': {
        latitude: 16.315,
        longitude: 80.125,
        accuracy: 8.0,
        locationUpdatedAt: new Date().toISOString(),
        geographicZone: 'Main Gate Zone',
        zoneStatus: 'INSIDE',
        sequenceNumber: 42,
      }
    }

    const { container } = render(<LiveMap />, { wrapper: MemoryRouter })
    const markers = markersFor(container)
    expect(markers).toHaveLength(1)
    // Authoritative position from officerLocations, not the device's 10.0, 20.0
    expect(JSON.parse(markers[0].dataset.position)).toEqual([16.315, 80.125])
    expect(screen.getByText('Main Gate Zone')).toBeInTheDocument()
    expect(screen.getByText('Seq #42')).toBeInTheDocument()
  })

  it('clearly separates Geographic Zone from AP Association in popup', () => {
    mockById = { '1': constable('1') }
    mockDevices = [device('1', { status: 'online', latitude: 16.31, longitude: 80.12 })]
    mockOfficerLocations = {
      '1': {
        latitude: 16.31,
        longitude: 80.12,
        geographicZone: 'Temple Core',
        zoneStatus: 'INSIDE',
      }
    }
    mockPresence = [
      {
        constable_id: '1',
        access_point_code: 'AP-WEST-02',
        zone: 'West Gate',
        rssi_dbm: -58,
        source: 'PHYSICAL_CONTROLLER',
      }
    ]

    render(<LiveMap />, { wrapper: MemoryRouter })
    // Geographic Zone header and value
    expect(screen.getByText('Geographic Zone (GPS)')).toBeInTheDocument()
    expect(screen.getByText('Temple Core')).toBeInTheDocument()
    // AP Association header and value (distinct from GPS zone!)
    expect(screen.getByText('AP Association (Wi-Fi)')).toBeInTheDocument()
    expect(screen.getByText('AP-WEST-02')).toBeInTheDocument()
    expect(screen.getByText(/RSSI: -58 dBm/)).toBeInTheDocument()
  })

  it('shows an error state instead of a blank/crashed map when the operations data fails to load', () => {
    mockOperationsError = 'Failed to load operational data'
    render(<LiveMap />, { wrapper: MemoryRouter })
    expect(screen.getByText('Failed to load operational data')).toBeInTheDocument()
  })
})
