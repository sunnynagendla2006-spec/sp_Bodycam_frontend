import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import ProtectedRoute from './components/layout/ProtectedRoute.jsx'
import AppShell from './components/layout/AppShell.jsx'
import { LoadingSkeleton } from './components/Primitives.jsx'

// Lazy-loaded so the browser only downloads the JS for the page the
// operator is actually looking at, instead of one single bundle with
// every page in it upfront -- the whole app was previously shipping as a
// single 1MB+ chunk that had to fully download and parse before ANYTHING
// was interactive, a real, measurable contributor to slow first loads
// (confirmed via `npm run build`'s own chunk-size warning), especially
// over the weaker mobile connections this app is actually used on.
const Login = lazy(() => import('./pages/Login.jsx'))
const Dashboard = lazy(() => import('./pages/Dashboard.jsx'))
const Monitoring = lazy(() => import('./pages/Monitoring.jsx'))
const LiveMap = lazy(() => import('./pages/LiveMap.jsx'))
const DeviceDetails = lazy(() => import('./pages/DeviceDetails.jsx'))
const Recordings = lazy(() => import('./pages/Recordings.jsx'))
const RecordingDetails = lazy(() => import('./pages/RecordingDetails.jsx'))
const Alerts = lazy(() => import('./pages/Alerts.jsx'))
const Commands = lazy(() => import('./pages/Commands.jsx'))
const Constables = lazy(() => import('./pages/Constables.jsx'))
const ConstableDetails = lazy(() => import('./pages/ConstableDetails.jsx'))
const Incidents = lazy(() => import('./pages/Incidents.jsx'))
const IncidentDetails = lazy(() => import('./pages/IncidentDetails.jsx'))
const Evidence = lazy(() => import('./pages/Evidence.jsx'))
const PoliceStations = lazy(() => import('./pages/PoliceStations.jsx'))
const AuditLogs = lazy(() => import('./pages/AuditLogs.jsx'))
const Settings = lazy(() => import('./pages/Settings.jsx'))
const Profile = lazy(() => import('./pages/Profile.jsx'))

export default function App() {
  return (
    <Suspense fallback={<LoadingSkeleton rows={8} />}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <AppShell />
            </ProtectedRoute>
          }
        >
          <Route index element={<Dashboard />} />
          <Route path="monitoring" element={<Monitoring />} />
          <Route path="map" element={<LiveMap />} />
          <Route path="devices" element={<Navigate to="/monitoring" replace />} />
          <Route path="devices/:id" element={<DeviceDetails />} />
          <Route path="recordings" element={<Recordings />} />
          <Route path="recordings/:id" element={<RecordingDetails />} />
          <Route path="alerts" element={<Alerts />} />
          <Route path="commands" element={<Commands />} />
          <Route path="constables" element={<Constables />} />
          <Route path="constables/:id" element={<ConstableDetails />} />
          <Route path="stations" element={<PoliceStations />} />
          <Route path="audit" element={<AuditLogs />} />
          <Route path="settings" element={<Settings />} />
          <Route path="profile" element={<Profile />} />
          <Route path="incidents" element={<Incidents />} />
          <Route path="incidents/:id" element={<IncidentDetails />} />
          <Route path="evidence" element={<Evidence />} />
        </Route>
      </Routes>
    </Suspense>
  )
}
