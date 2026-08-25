import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { authApi } from '../api/endpoints'
import { tokens } from '../api/client'

const AuthContext = createContext(null)

export const ROLES = {
  ADMIN: 'admin',
  INSPECTOR: 'inspector',
  REVIEWER: 'reviewer',
  CLIENT: 'client',
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  // Restore the session on a hard refresh - the token outlives the page.
  useEffect(() => {
    if (!tokens.access) {
      setLoading(false)
      return
    }
    authApi
      .me()
      .then((data) => setUser(data.user))
      .catch(() => tokens.clear())
      .finally(() => setLoading(false))
  }, [])

  const login = useCallback(async (employeeId, password) => {
    const data = await authApi.login(employeeId, password)
    tokens.set(data)
    setUser(data.user)
    return data.user
  }, [])

  const logout = useCallback(() => {
    tokens.clear()
    setUser(null)
  }, [])

  const value = useMemo(
    () => ({
      user,
      loading,
      login,
      logout,
      setUser,
      isAuthenticated: Boolean(user),
      // Admins are the superset role, mirroring the backend's roles_required.
      hasRole: (...roles) => Boolean(user) && (roles.includes(user.role) || user.role === ROLES.ADMIN),
      isClient: user?.role === ROLES.CLIENT,
      isStaff: Boolean(user) && user.role !== ROLES.CLIENT,
    }),
    [user, loading, login, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside an AuthProvider')
  return context
}
