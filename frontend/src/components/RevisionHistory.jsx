import { useState } from 'react'

import { errorMessage } from '../api/client'
import { downloadFile, reportApi } from '../api/endpoints'
import { openPdfInNewTab } from '../api/openPdf'
import { useApi } from '../hooks/useApi'
import RevisionChanges from './RevisionChanges'
import Spinner from './Spinner'
import { useToast } from './Toast'
import { Pill, formatDateTime } from './ui'

const OUTCOME = {
  pending: { tone: 'warning', label: 'Awaiting review' },
  returned: { tone: 'danger', label: 'Returned' },
  approved: { tone: 'success', label: 'Approved' },
}

/**
 * Every submitted revision of a report, newest first: who submitted it, the
 * reviewer's decision and comments, what changed since the revision before,
 * and that revision's own PDF / Word file.
 *
 * `version` should change whenever the report does, so the list reloads.
 * `embedded` drops the card frame and the file buttons - for use inside a
 * pop-up where the files are offered elsewhere.
 */
export default function RevisionHistory({ reportId, version, embedded = false }) {
  const toast = useToast()
  const history = useApi(() => reportApi.revisions(reportId), [reportId, version])
  // revision -> expanded? Only the latest starts open.
  const [expanded, setExpanded] = useState({})

  const revisions = history.data?.revisions || []
  const isOpen = (rev, index) => expanded[rev] ?? index === 0
  const toggle = (rev, index) => setExpanded((current) => ({ ...current, [rev]: !isOpen(rev, index) }))

  const view = (rev) =>
    openPdfInNewTab('revision', reportId, { revision: rev }).catch((err) => toast.error(errorMessage(err)))
  const download = (rev, format) =>
    downloadFile(reportApi.revisionFileUrl(reportId, rev, format), `rev${rev}.${format}`).catch((err) =>
      toast.error(errorMessage(err)),
    )

  const body = (
    <>

      {history.loading ? (
        <Spinner label="Loading revisions" />
      ) : history.error ? (
        <p className="cell-sub">{history.error}</p>
      ) : !revisions.length ? (
        <p className="cell-sub">Not submitted yet - the first submission becomes Rev 0.</p>
      ) : (
        <ol className="revision-list">
          {revisions.map((rev, index) => {
            const outcome = OUTCOME[rev.outcome] || OUTCOME.pending
            const shown = isOpen(rev.revision, index)
            return (
              <li key={rev.revision} className="revision-item">
                <div className="revision-head">
                  <button
                    type="button"
                    className="revision-toggle"
                    onClick={() => toggle(rev.revision, index)}
                    aria-expanded={shown}
                  >
                    <i className={`fas fa-chevron-${shown ? 'down' : 'right'}`} />
                    <strong>Rev {rev.revision}</strong>
                    <Pill tone={outcome.tone}>{outcome.label}</Pill>
                    <span className="cell-sub">
                      Submitted {formatDateTime(rev.submitted_at)}
                      {rev.submitted_by ? ` by ${rev.submitted_by}` : ''}
                    </span>
                  </button>
                  {!embedded && (
                  <div className="revision-files">
                    {rev.has_pdf && (
                      <>
                        <button type="button" className="btn btn-outline btn-sm" onClick={() => view(rev.revision)}>
                          <i className="fas fa-up-right-from-square" /> View
                        </button>
                        <button type="button" className="btn btn-outline btn-sm" onClick={() => download(rev.revision, 'pdf')}>
                          <i className="fas fa-file-pdf" /> PDF
                        </button>
                      </>
                    )}
                    {rev.has_docx && (
                      <button type="button" className="btn btn-outline btn-sm" onClick={() => download(rev.revision, 'docx')}>
                        <i className="fas fa-file-word" /> Word
                      </button>
                    )}
                  </div>
                  )}
                </div>

                {shown && (
                  <div className="revision-body">
                    {rev.review_comment && (
                      <div className={`alert ${rev.outcome === 'returned' ? 'alert-danger' : 'alert-info'}`}>
                        <i className={`fas ${rev.outcome === 'returned' ? 'fa-rotate-left' : 'fa-comment'}`} />
                        <span>
                          <strong>
                            {rev.reviewed_by || 'Reviewer'}
                            {rev.reviewed_at ? `, ${formatDateTime(rev.reviewed_at)}` : ''}:
                          </strong>{' '}
                          {rev.review_comment}
                        </span>
                      </div>
                    )}
                    {rev.changes === null ? (
                      <p className="cell-sub">First submission.</p>
                    ) : (
                      <>
                        <p className="revision-caption">Changes since Rev {rev.revision - 1}</p>
                        <RevisionChanges changes={rev.changes} />
                      </>
                    )}
                  </div>
                )}
              </li>
            )
          })}
        </ol>
      )}
    </>
  )

  if (embedded) return body
  return (
    <div className="section-card">
      <div className="card-head">
        <div>
          <h2><i className="fas fa-code-branch" /> Revision history</h2>
          <p className="card-sub">
            Rev 0 is the first submission. Each correction sent back after a return is the next
            revision.
          </p>
        </div>
      </div>
      {body}
    </div>
  )
}
