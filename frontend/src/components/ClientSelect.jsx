import { useEffect, useMemo, useRef, useState } from 'react'
import { matchesClient, useClientDirectory } from '../hooks/useClientDirectory'
import ClientRequestModal from './ClientRequestModal'
import { Field } from './ui'

const RENDER_CAP = 200 // 2,300 clients - render only the first 200 matches.

/**
 * Searchable approved-client picker with "Request New Client".
 *
 * The box itself is read-only on purpose: client names only ever come from the
 * approved list, so "Lucky Cement" and "LUCKY CEMENT LTD" never become two
 * clients. Use it wherever a client is chosen.
 *
 *   <ClientSelect value={clientId} onChange={(id, client) => ...} />
 *
 * `value` is the client id ('' for none); `onChange` gets (id as a string, the
 * client object or null).
 *
 * variant="filter" renders a compact control for a filter bar, where clearing
 * it means "All clients".
 */
export default function ClientSelect({
  value,
  onChange,
  label = 'Client',
  required = false,
  disabled = false,
  error,
  hint,
  span,
  placeholder = 'Click to search and select a client…',
  variant = 'field',
  allowRequest = variant === 'field',
  includeInactive = variant === 'filter',
}) {
  const { clients, loading } = useClientDirectory()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [active, setActive] = useState(0)
  const [requesting, setRequesting] = useState(false)
  const boxRef = useRef(null)
  const listRef = useRef(null)

  useEffect(() => {
    const onDocClick = (e) => boxRef.current && !boxRef.current.contains(e.target) && setOpen(false)
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  const selected = useMemo(
    () => clients.find((c) => String(c.id) === String(value)) || null,
    [clients, value],
  )
  const offered = useMemo(
    () => (includeInactive ? clients : clients.filter((c) => c.is_active)),
    [clients, includeInactive],
  )
  const filtered = useMemo(() => offered.filter((c) => matchesClient(c, search)), [offered, search])
  const shown = filtered.slice(0, RENDER_CAP)

  // Keep the highlighted row in view while arrowing through the list.
  useEffect(() => {
    listRef.current?.children[active]?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const pick = (client) => {
    onChange(client ? String(client.id) : '', client)
    setOpen(false)
    setSearch('')
    setActive(0)
  }

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => Math.min(i + 1, shown.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (shown[active]) pick(shown[active])
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  const display = selected
    ? `${selected.name}${selected.is_active ? '' : ' (inactive)'}`
    : value && loading
      ? 'Loading…'
      : ''

  const control = (
    <div className={`client-select${variant === 'filter' ? ' is-filter' : ''}`} ref={boxRef}>
      <div className="client-select-box">
        <input
          type="text"
          readOnly
          disabled={disabled}
          value={display}
          placeholder={variant === 'filter' ? 'All clients' : placeholder}
          onClick={() => !disabled && setOpen((v) => !v)}
          onKeyDown={(e) => {
            if (!disabled && (e.key === 'Enter' || e.key === 'ArrowDown')) {
              e.preventDefault()
              setOpen(true)
            }
          }}
          autoComplete="off"
          aria-haspopup="listbox"
          aria-expanded={open}
        />
        {selected && !disabled ? (
          <button type="button" className="client-select-clear" aria-label="Clear client" onClick={() => pick(null)}>
            <i className="fas fa-xmark" />
          </button>
        ) : (
          <i className="fas fa-chevron-down client-select-caret" />
        )}
      </div>

      {open && (
        <div className="client-select-menu">
          <div className="client-select-search">
            <i className="fas fa-search" />
            <input
              type="text"
              autoFocus
              placeholder="Search by name, code or sub sector…"
              value={search}
              onKeyDown={onKeyDown}
              onChange={(e) => {
                setSearch(e.target.value)
                setActive(0)
              }}
            />
            <small>
              {loading ? 'Loading…' : `${filtered.length.toLocaleString()} match${filtered.length === 1 ? '' : 'es'}`}
            </small>
          </div>

          <div className="client-select-list" role="listbox" ref={listRef}>
            {shown.map((c, i) => (
              <div
                key={c.id}
                role="option"
                aria-selected={String(c.id) === String(value)}
                className={`client-select-option${i === active ? ' active' : ''}${
                  String(c.id) === String(value) ? ' selected' : ''
                }`}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => {
                  e.preventDefault()
                  pick(c)
                }}
              >
                <span className="client-select-name">
                  {c.name}
                  {!c.is_active && <em> (inactive)</em>}
                </span>
                <small>{[c.code, c.sbu, c.sub_sector].filter(Boolean).join(' · ')}</small>
              </div>
            ))}
            {!loading && filtered.length === 0 && (
              <div className="client-select-empty">
                No matches.{allowRequest ? ' Request it as a new client below.' : ''}
              </div>
            )}
            {filtered.length > RENDER_CAP && (
              <div className="client-select-empty">Showing the first {RENDER_CAP} - type more to narrow down.</div>
            )}
          </div>

          {allowRequest && (
            <button
              type="button"
              className="client-select-request"
              onMouseDown={(e) => {
                e.preventDefault()
                setOpen(false)
                setRequesting(true)
              }}
            >
              <i className="fas fa-user-plus" /> Request new client
            </button>
          )}
        </div>
      )}

      {allowRequest && (
        <ClientRequestModal open={requesting} initialName={search} onClose={() => setRequesting(false)} />
      )}
    </div>
  )

  if (variant === 'filter') return control
  return (
    <Field label={label} required={required} hint={hint} error={error} span={span}>
      {control}
    </Field>
  )
}
