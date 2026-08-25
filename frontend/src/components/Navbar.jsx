import { useEffect, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { ROLES, useAuth } from '../auth/AuthContext'

/**
 * The theme kit navbar, wired to the router. Menu entries are filtered by role
 * so a client never sees a staff-only link at all.
 */
export default function Navbar() {
  const { user, logout, hasRole, isClient } = useAuth()
  const [open, setOpen] = useState(false)
  const location = useLocation()

  // Close the mobile drawer whenever the route changes.
  useEffect(() => setOpen(false), [location.pathname])

  const staffLinks = [
    { to: '/', label: 'Dashboard', icon: 'fa-gauge-high', end: true },
    { to: '/modules', label: 'Inspections', icon: 'fa-clipboard-check' },
    { to: '/reports', label: 'Reports', icon: 'fa-file-lines' },
  ]

  const registerLinks = [
    { to: '/clients', label: 'Clients', icon: 'fa-building' },
    { to: '/jobs', label: 'Jobs', icon: 'fa-briefcase' },
    { to: '/equipment', label: 'Equipment', icon: 'fa-gears' },
  ]

  const adminLinks = [
    { to: '/admin/users', label: 'Users & Roles', icon: 'fa-users' },
    { to: '/admin/master-lists', label: 'Master Lists', icon: 'fa-list-check' },
    { to: '/admin/equipment-types', label: 'Equipment Types', icon: 'fa-tags' },
  ]

  return (
    <nav className="navbar">
      <div className="nav-container-full">
        <Link to={isClient ? '/portal' : '/'} className="nav-logo" aria-label="Portal home">
          <img src="/img/sgs-logo.png" alt="SGS" className="nav-logo-img" />
          <span className="nav-logo-text">Reporting</span>
        </Link>

        <button
          className={`hamburger${open ? ' active' : ''}`}
          onClick={() => setOpen((v) => !v)}
          aria-label="Toggle navigation"
          aria-expanded={open}
        >
          <span />
          <span />
          <span />
        </button>

        <div className={`nav-overlay${open ? ' active' : ''}`} onClick={() => setOpen(false)} />

        <ul className={`nav-menu${open ? ' active' : ''}`}>
          {isClient ? (
            <>
              <li>
                <NavLink to="/portal" end className="nav-link">
                  <i className="fas fa-gauge-high" /> Overview
                </NavLink>
              </li>
              <li>
                <NavLink to="/portal/reports" className="nav-link">
                  <i className="fas fa-file-lines" /> My Reports
                </NavLink>
              </li>
              <li>
                <NavLink to="/portal/equipment" className="nav-link">
                  <i className="fas fa-gears" /> My Equipment
                </NavLink>
              </li>
            </>
          ) : (
            <>
              {staffLinks.map((link) => (
                <li key={link.to}>
                  <NavLink to={link.to} end={link.end} className="nav-link">
                    <i className={`fas ${link.icon}`} /> {link.label}
                  </NavLink>
                </li>
              ))}

              {hasRole(ROLES.REVIEWER) && (
                <li>
                  <NavLink to="/review" className="nav-link">
                    <i className="fas fa-clipboard-list" /> Review Queue
                  </NavLink>
                </li>
              )}

              <li className="nav-dropdown">
                <span className="nav-link dropdown-toggle" role="button" tabIndex={0}>
                  <i className="fas fa-database" /> Registers <i className="fas fa-caret-down" />
                </span>
                <ul className="dropdown-menu">
                  {registerLinks.map((link) => (
                    <li key={link.to}>
                      <Link to={link.to}>
                        <i className={`fas ${link.icon}`} /> {link.label}
                      </Link>
                    </li>
                  ))}
                  <li>
                    <Link to="/alerts">
                      <i className="fas fa-bell" /> Expiry Alerts
                    </Link>
                  </li>
                </ul>
              </li>

              {hasRole(ROLES.ADMIN) && (
                <li className="nav-dropdown">
                  <span className="nav-link dropdown-toggle" role="button" tabIndex={0}>
                    <i className="fas fa-cog" /> Admin <i className="fas fa-caret-down" />
                  </span>
                  <ul className="dropdown-menu">
                    {adminLinks.map((link) => (
                      <li key={link.to}>
                        <Link to={link.to}>
                          <i className={`fas ${link.icon}`} /> {link.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </li>
              )}
            </>
          )}

          <li className="nav-user">
            <div className="user-info">
              <span className="user-name">{user?.full_name}</span>
              <span className="user-role">{user?.role_label}</span>
            </div>
            <Link
              to="/profile"
              className="user-avatar"
              title="Your profile"
              style={{ textDecoration: 'none', color: 'white' }}
            >
              {user?.initial}
            </Link>
            <button type="button" className="logout-btn" title="Sign out" onClick={logout}>
              <i className="fas fa-sign-out-alt" />
            </button>
          </li>
        </ul>
      </div>
    </nav>
  )
}
