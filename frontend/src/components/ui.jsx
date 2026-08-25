import { useEffect } from 'react'

/* ------------------------------------------------------------------ badges */
export function Pill({ tone = 'neutral', icon, children }) {
  return (
    <span className={`pill ${tone}`}>
      {icon && <i className={`fas ${icon}`} />}
      {children}
    </span>
  )
}

const CERT_TONES = {
  valid: { tone: 'success', icon: 'fa-circle-check', label: 'Valid' },
  upcoming: { tone: 'info', icon: 'fa-clock', label: 'Due in 60 days' },
  due: { tone: 'warning', icon: 'fa-clock', label: 'Due in 30 days' },
  critical: { tone: 'danger', icon: 'fa-triangle-exclamation', label: 'Due in 7 days' },
  expired: { tone: 'danger', icon: 'fa-circle-xmark', label: 'Expired' },
  uncertified: { tone: 'neutral', icon: 'fa-minus', label: 'No certificate' },
}

export function CertificationPill({ status, days }) {
  const config = CERT_TONES[status] || CERT_TONES.uncertified
  const suffix =
    status === 'expired' && days != null
      ? ` (${Math.abs(days)}d ago)`
      : days != null && status !== 'uncertified'
        ? ` (${days}d)`
        : ''
  return (
    <Pill tone={config.tone} icon={config.icon}>
      {config.label}
      {suffix}
    </Pill>
  )
}

export function StatusPill({ status, label, severity }) {
  return <Pill tone={severity || 'neutral'}>{label || status}</Pill>
}

/* ------------------------------------------------------------------- empty */
export function Empty({ icon = 'fa-inbox', title = 'Nothing here yet', children, action }) {
  return (
    <div className="empty">
      <i className={`fas ${icon}`} />
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  )
}

/* ------------------------------------------------------------------- modal */
export function Modal({ open, title, onClose, children, footer, wide = false }) {
  useEffect(() => {
    if (!open) return undefined
    const onKey = (event) => event.key === 'Escape' && onClose?.()
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={`modal${wide ? ' wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button type="button" onClick={onClose} aria-label="Close">
            <i className="fas fa-xmark" />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------- forms */
export function Field({ label, required, hint, error, children, span }) {
  return (
    <div className={`field${error ? ' invalid' : ''}${span ? ' span-2' : ''}`}>
      {label && (
        <label>
          {label}
          {required && <span className="req">*</span>}
        </label>
      )}
      {children}
      {(error || hint) && <span className="hint">{error || hint}</span>}
    </div>
  )
}

export function TextInput({ label, required, hint, error, span, ...props }) {
  return (
    <Field label={label} required={required} hint={hint} error={error} span={span}>
      <input type="text" {...props} />
    </Field>
  )
}

export function Select({ label, required, hint, error, span, options = [], placeholder, ...props }) {
  return (
    <Field label={label} required={required} hint={hint} error={error} span={span}>
      <select {...props}>
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </Field>
  )
}

export function TextArea({ label, required, hint, error, span = true, ...props }) {
  return (
    <Field label={label} required={required} hint={hint} error={error} span={span}>
      <textarea {...props} />
    </Field>
  )
}

export function Checkbox({ label, ...props }) {
  return (
    <label className="check-row">
      <input type="checkbox" {...props} />
      <span>{label}</span>
    </label>
  )
}

/* -------------------------------------------------------------- pagination */
export function Pager({ meta, onPage }) {
  if (!meta || meta.pages <= 1) {
    return meta ? <div className="pager"><span className="pager-info">{meta.total} record(s)</span></div> : null
  }

  const first = (meta.page - 1) * meta.per_page + 1
  const last = Math.min(meta.page * meta.per_page, meta.total)

  return (
    <div className="pager">
      <span className="pager-info">
        Showing {first}–{last} of {meta.total}
      </span>
      <div className="pager-buttons">
        <button
          type="button"
          className="btn btn-outline btn-sm"
          disabled={!meta.has_prev}
          onClick={() => onPage(meta.page - 1)}
        >
          <i className="fas fa-chevron-left" /> Previous
        </button>
        <span className="pager-info nowrap">
          Page {meta.page} of {meta.pages}
        </span>
        <button
          type="button"
          className="btn btn-outline btn-sm"
          disabled={!meta.has_next}
          onClick={() => onPage(meta.page + 1)}
        >
          Next <i className="fas fa-chevron-right" />
        </button>
      </div>
    </div>
  )
}

/* --------------------------------------------------------------- formatting */
export function formatDate(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function formatDateTime(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** An <input type="date"> needs YYYY-MM-DD, never a full ISO timestamp. */
export function toDateInput(value) {
  if (!value) return ''
  return String(value).slice(0, 10)
}
