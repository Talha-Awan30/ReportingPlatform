import { useEffect, useRef, useState } from 'react'
import { Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom'

import { errorMessage } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import Spinner from '../components/Spinner'

const PHRASES = [
  'Inspection to client approval.',
  'One form. One approved format.',
  'Nothing typed twice.',
  'Every approval, recorded.',
  'Renewals chased automatically.',
  'When you need to be sure.',
]

/** Types a phrase out, holds it, erases it, then moves to the next one. */
function useTypedPhrase(enabled) {
  const [text, setText] = useState(PHRASES[0])
  const state = useRef({ index: 0, char: PHRASES[0].length, erasing: false })

  useEffect(() => {
    if (!enabled) return undefined
    let timer

    const tick = () => {
      const s = state.current
      const phrase = PHRASES[s.index]

      if (!s.erasing) {
        s.char += 1
        if (s.char >= phrase.length) {
          s.erasing = true
          timer = setTimeout(tick, 2200)
        } else {
          timer = setTimeout(tick, 45)
        }
      } else {
        s.char -= 1
        if (s.char <= 0) {
          s.erasing = false
          s.index = (s.index + 1) % PHRASES.length
          timer = setTimeout(tick, 300)
        } else {
          timer = setTimeout(tick, 25)
        }
      }
      setText(PHRASES[s.index].slice(0, Math.max(s.char, 0)))
    }

    timer = setTimeout(tick, 2200)
    return () => clearTimeout(timer)
  }, [enabled])

  return text
}

export default function Login() {
  const { login, isAuthenticated, loading, isClient } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [params] = useSearchParams()

  const [employeeId, setEmployeeId] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState(params.get('expired') ? 'Your session expired. Please sign in again.' : '')
  const [submitting, setSubmitting] = useState(false)

  const reducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

  const phrase = useTypedPhrase(!reducedMotion)

  if (loading) return <Spinner full label="Checking your session" />
  if (isAuthenticated) return <Navigate to={isClient ? '/portal' : '/'} replace />

  const onSubmit = async (event) => {
    event.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      const user = await login(employeeId.trim(), password)
      const target = location.state?.from || (user.role === 'client' ? '/portal' : '/')
      navigate(target, { replace: true })
    } catch (err) {
      setError(errorMessage(err, 'Unable to sign in. Please try again.'))
      setSubmitting(false)
    }
  }

  return (
    <div className="login-shell">
      <aside className="login-brand">
        <div className="brand-content">
          <div className="brand-logo">
            <img src="/img/sgs-logo-secondary.png" alt="SGS" />
          </div>
          <h1>Lifting Equipment Reporting</h1>
          <div className="tagline-block" aria-live="polite">
            <span className="tag-cycle">{reducedMotion ? PHRASES[0] : phrase}</span>
          </div>
          <div className="brand-features">
            <div className="brand-feature">
              <span className="feature-ico">
                <i className="fas fa-clipboard-check" />
              </span>
              <span>Digital inspection forms for every lifting item</span>
            </div>
            <div className="brand-feature">
              <span className="feature-ico">
                <i className="fas fa-file-word" />
              </span>
              <span>Word reports built from the approved template</span>
            </div>
            <div className="brand-feature">
              <span className="feature-ico">
                <i className="fas fa-bell" />
              </span>
              <span>Certification expiry alerts before they lapse</span>
            </div>
          </div>
        </div>
        <div className="brand-tagline">
          <span className="tag-line" />
          <span className="tag-word">
            When you need to be <span className="accent">sure</span>
          </span>
          <span className="tag-line" />
        </div>
      </aside>

      <main className="login-form-panel">
        <div className="form-header">
          <h2>Welcome back</h2>
          <p>Sign in to your account to continue</p>
        </div>

        {error && (
          <div className="login-error" role="alert">
            <i className="fas fa-exclamation-circle" />
            <span>{error}</span>
          </div>
        )}

        <form className="login-form" onSubmit={onSubmit}>
          <div className="form-group">
            <label htmlFor="employee_id">Employee ID</label>
            <div className="input-wrapper">
              <i className="fas fa-user input-icon" />
              <input
                type="text"
                id="employee_id"
                name="employee_id"
                placeholder="Enter your Employee ID"
                value={employeeId}
                onChange={(e) => setEmployeeId(e.target.value)}
                required
                autoFocus
                autoComplete="username"
              />
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <div className="input-wrapper">
              <i className="fas fa-lock input-icon" />
              <input
                type={showPassword ? 'text' : 'password'}
                id="password"
                name="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                style={{ paddingRight: '2.75rem' }}
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                <i className={`fas ${showPassword ? 'fa-eye-slash' : 'fa-eye'}`} />
              </button>
            </div>
          </div>

          <button type="submit" className="btn-login" disabled={submitting}>
            <i className={`fas ${submitting ? 'fa-circle-notch fa-spin' : 'fa-sign-in-alt'}`} />
            <span>{submitting ? 'Signing in…' : 'Sign in'}</span>
          </button>
        </form>

        <div className="login-footer">
          <p className="login-help">
            <i className="fas fa-info-circle" />
            First time? Contact your administrator for credentials
          </p>
        </div>
      </main>
    </div>
  )
}
