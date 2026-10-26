import { useEffect, useState } from 'react'

import { errorMessage } from '../api/client'
import { reportApi } from '../api/endpoints'
import RevisionHistory from './RevisionHistory'
import Spinner from './Spinner'
import { Empty, Modal, formatDateTime } from './ui'

/**
 * The approval trail or the revision changes of a report - or of every unit of
 * a visit - in a pop-up. Opened from the ⋮ menu on a Reports row.
 *
 * `target` is { mode: 'trail' | 'revisions', title, units: [{ id, sequence }], unitNoun }.
 */
export default function ReportHistoryDialog({ target, onClose }) {
  return (
    <Modal open={Boolean(target)} title={target?.title || ''} onClose={onClose} wide>
      {target?.mode === 'trail' && <Trail units={target.units} unitNoun={target.unitNoun} />}
      {target?.mode === 'revisions' && <Revisions units={target.units} unitNoun={target.unitNoun} />}
    </Modal>
  )
}

const unitLabel = (noun, sequence) => `${noun.charAt(0).toUpperCase()}${noun.slice(1)} #${sequence}`

/** Every unit's trail merged into one timeline, newest first. */
function Trail({ units, unitNoun = 'unit' }) {
  const [state, setState] = useState({ loading: true, error: null, events: [] })

  useEffect(() => {
    let cancelled = false
    Promise.all(units.map((u) => reportApi.get(u.id).then(({ report }) => ({ unit: u, events: report.events || [] }))))
      .then((results) => {
        if (cancelled) return
        // The same action on several units at once (a whole-visit submit or
        // approval) shows as one line naming the units.
        const merged = new Map()
        for (const { unit, events } of results) {
          for (const event of events) {
            const revision = event.meta?.revision ?? ''
            const key = `${event.event_type}|${revision}|${event.user_name}|${event.note || ''}|${(event.created_at || '').slice(0, 16)}`
            const line = merged.get(key) || { ...event, sequences: [] }
            if (!line.sequences.includes(unit.sequence)) line.sequences.push(unit.sequence)
            merged.set(key, line)
          }
        }
        const events = [...merged.values()].sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
        setState({ loading: false, error: null, events })
      })
      .catch((err) => !cancelled && setState({ loading: false, error: errorMessage(err), events: [] }))
    return () => {
      cancelled = true
    }
  }, [units])

  if (state.loading) return <Spinner label="Loading the trail" />
  if (state.error) return <p className="cell-sub">{state.error}</p>
  if (!state.events.length) return <Empty icon="fa-clock" title="No events recorded yet" />

  const many = units.length > 1
  return (
    <ul className="timeline">
      {state.events.map((event) => (
        <li key={`${event.id}-${event.sequences.join('-')}`} className={event.event_type}>
          <div className="t-head">
            <span className="t-title">
              {event.event_label}
              {event.meta?.revision != null && ` · Rev ${event.meta.revision}`}
            </span>
            <span className="t-meta">
              {event.user_name} · {formatDateTime(event.created_at)}
              {many &&
                ` · ${
                  event.sequences.length === units.length
                    ? `all ${units.length} ${unitNoun}s`
                    : event.sequences
                        .sort((a, b) => a - b)
                        .map((s) => unitLabel(unitNoun, s))
                        .join(', ')
                }`}
            </span>
          </div>
          {event.note && <div className="t-note">{event.note}</div>}
        </li>
      ))}
    </ul>
  )
}

/** Each unit's revisions and what changed in each. */
function Revisions({ units, unitNoun = 'unit' }) {
  if (units.length === 1) return <RevisionHistory reportId={units[0].id} embedded />
  return (
    <div className="revision-units">
      {units.map((u) => (
        <section key={u.id}>
          <h4 className="revision-unit-title">{unitLabel(unitNoun, u.sequence)}</h4>
          <RevisionHistory reportId={u.id} embedded />
        </section>
      ))}
    </div>
  )
}
