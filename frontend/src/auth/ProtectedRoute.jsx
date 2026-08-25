import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from './AuthContext'
import Spinner from '../components/Spinner'

/**
 * Gate a route on being signed in, and optionally on holding one of `roles`.
 * Clients are bounced to their own portal rather than shown a bare 403.
 */
export default function ProtectedRoute({ roles, children }) {
  const { isAuthenticated, loading, hasRole, isClient } = useAuth()
  const location = useLocation()

  if (loading) return <Spinner full label="Checking your session" />

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />
  }

  if (roles?.length && !hasRole(...roles)) {
    return <Navigate to={isClient ? '/portal' : '/'} replace />
  }

  return children
}
