import { Navigate, Route, Routes } from 'react-router-dom'

import Layout from './components/Layout'
import ProtectedRoute from './auth/ProtectedRoute'
import { ROLES } from './auth/AuthContext'

import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Modules from './pages/Modules'
import ModuleDetail from './pages/ModuleDetail'
import Reports from './pages/Reports'
import ReportDetail from './pages/ReportDetail'
import ReviewQueue from './pages/ReviewQueue'
import Clients from './pages/Clients'
import ClientDetail from './pages/ClientDetail'
import Jobs from './pages/Jobs'
import JobDetail from './pages/JobDetail'
import EquipmentList from './pages/EquipmentList'
import EquipmentDetail from './pages/EquipmentDetail'
import Alerts from './pages/Alerts'
import Profile from './pages/Profile'
import Users from './pages/admin/Users'
import MasterLists from './pages/admin/MasterLists'
import EquipmentTypes from './pages/admin/EquipmentTypes'
import ClientPortal from './pages/portal/ClientPortal'
import PortalReports from './pages/portal/PortalReports'
import PortalEquipment from './pages/portal/PortalEquipment'
import NotFound from './pages/NotFound'

const STAFF = [ROLES.ADMIN, ROLES.INSPECTOR, ROLES.REVIEWER]

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        {/* ---------------------------------------------------------- staff */}
        <Route index element={<ProtectedRoute roles={STAFF}><Dashboard /></ProtectedRoute>} />
        <Route path="modules" element={<ProtectedRoute roles={STAFF}><Modules /></ProtectedRoute>} />
        <Route path="modules/:slug" element={<ProtectedRoute roles={STAFF}><ModuleDetail /></ProtectedRoute>} />

        <Route path="reports" element={<Reports />} />
        <Route path="reports/:id" element={<ReportDetail />} />

        <Route
          path="review"
          element={
            <ProtectedRoute roles={[ROLES.REVIEWER, ROLES.ADMIN]}>
              <ReviewQueue />
            </ProtectedRoute>
          }
        />

        <Route path="clients" element={<ProtectedRoute roles={STAFF}><Clients /></ProtectedRoute>} />
        <Route path="clients/:id" element={<ProtectedRoute roles={STAFF}><ClientDetail /></ProtectedRoute>} />
        <Route path="jobs" element={<ProtectedRoute roles={STAFF}><Jobs /></ProtectedRoute>} />
        <Route path="jobs/:id" element={<ProtectedRoute roles={STAFF}><JobDetail /></ProtectedRoute>} />
        <Route path="equipment" element={<ProtectedRoute roles={STAFF}><EquipmentList /></ProtectedRoute>} />
        <Route path="equipment/:id" element={<EquipmentDetail />} />
        <Route path="alerts" element={<Alerts />} />
        <Route path="profile" element={<Profile />} />

        {/* ---------------------------------------------------------- admin */}
        <Route
          path="admin/users"
          element={<ProtectedRoute roles={[ROLES.ADMIN]}><Users /></ProtectedRoute>}
        />
        <Route
          path="admin/master-lists"
          element={<ProtectedRoute roles={[ROLES.ADMIN]}><MasterLists /></ProtectedRoute>}
        />
        <Route
          path="admin/equipment-types"
          element={<ProtectedRoute roles={[ROLES.ADMIN]}><EquipmentTypes /></ProtectedRoute>}
        />

        {/* --------------------------------------------------- client portal */}
        <Route path="portal" element={<ProtectedRoute roles={[ROLES.CLIENT]}><ClientPortal /></ProtectedRoute>} />
        <Route
          path="portal/reports"
          element={<ProtectedRoute roles={[ROLES.CLIENT]}><PortalReports /></ProtectedRoute>}
        />
        <Route
          path="portal/equipment"
          element={<ProtectedRoute roles={[ROLES.CLIENT]}><PortalEquipment /></ProtectedRoute>}
        />

        <Route path="404" element={<NotFound />} />
        <Route path="*" element={<Navigate to="/404" replace />} />
      </Route>
    </Routes>
  )
}
