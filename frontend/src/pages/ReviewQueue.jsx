import { useState } from 'react'

import { moduleApi, reportApi } from '../api/endpoints'
import { useApi } from '../hooks/useApi'
import PageHeader from '../components/PageHeader'
import ReviewDialog from '../components/ReviewDialog'
import Spinner from '../components/Spinner'
import { Empty, Pager, Pill, formatDateTime } from '../components/ui'

/**
 * What is waiting for a reviewer, latest submission first. A multi-unit visit
 * is one row - its complete report - once every unit is in. Opening a row
 * shows a pop-up to view, download, approve or return it.
 */
export default function ReviewQueue() {
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState(null)
  const [moduleSlug, setModuleSlug] = useState('')

  const modules = useApi(() => moduleApi.list(), [])
  const queue = useApi(
    () => reportApi.reviewQueue({ page, per_page: 25, module_slug: moduleSlug || undefined }),
    [page, moduleSlug],
  )

  const waitingDays = (submittedAt) => {
    if (!submittedAt) return null
    return Math.floor((Date.now() - new Date(submittedAt).getTime()) / 86400000)
  }

  return (
    <>
      <PageHeader
        icon="fa-clipboard-list"
        title="Review Queue"
        subtitle="Completed reports from site, latest first. Click one to view it and decide."
        crumbs={[{ label: 'Review Queue' }]}
      />

      <div className="section-card">
        <div className="filter-bar">
          <select
            value={moduleSlug}
            onChange={(e) => {
              setModuleSlug(e.target.value)
              setPage(1)
            }}
          >
            <option value="">All inspection items</option>
            {(modules.data?.modules || []).map((m) => (
              <option key={m.slug} value={m.slug}>
                {m.name} {m.pending_count ? `(${m.pending_count})` : ''}
              </option>
            ))}
          </select>
          <div className="spacer" />
          {queue.data?.meta && (
            <Pill tone={queue.data.meta.total ? 'warning' : 'success'}>
              {queue.data.meta.total} awaiting review
            </Pill>
          )}
        </div>

        {queue.loading ? (
          <Spinner label="Loading the queue" />
        ) : queue.error ? (
          <Empty icon="fa-triangle-exclamation" title="Could not load the queue">{queue.error}</Empty>
        ) : queue.data?.items?.length ? (
          <>
            <div className="table-container">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Report</th>
                    <th>Inspection</th>
                    <th>Client / Job</th>
                    <th>Inspector</th>
                    <th>Submitted</th>
                    <th className="text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {queue.data.items.map((item) => {
                    const days = waitingDays(item.submitted_at)
                    return (
                      <tr key={`${item.kind}-${item.id}`} className="review-row" onClick={() => setSelected(item)}>
                        <td>
                          <span className="cell-strong">{item.number}</span>
                          <div className="cell-sub">
                            {item.kind === 'set'
                              ? `${item.unit_count} ${item.unit_count === 1 ? item.unit_noun : item.unit_noun_plural}`
                              : item.equipment_tag || 'Single report'}
                            {` · Rev ${item.revision}`}
                          </div>
                        </td>
                        <td>
                          <div>{item.module_name}</div>
                          {item.item && <div className="cell-sub">{item.item}</div>}
                        </td>
                        <td>
                          <div>{item.client_name}</div>
                          <div className="cell-sub">{item.job_number}</div>
                        </td>
                        <td>{item.inspector_name}</td>
                        <td className="nowrap">
                          <div>{formatDateTime(item.submitted_at)}</div>
                          {days != null && (
                            <div className="cell-sub">
                              <Pill tone={days > 3 ? 'danger' : days > 1 ? 'warning' : 'neutral'}>
                                {days === 0 ? 'today' : `${days}d waiting`}
                              </Pill>
                            </div>
                          )}
                        </td>
                        <td className="text-right">
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            onClick={(e) => {
                              e.stopPropagation()
                              setSelected(item)
                            }}
                          >
                            <i className="fas fa-eye" /> Review
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <Pager meta={queue.data.meta} onPage={setPage} />
          </>
        ) : (
          <Empty icon="fa-circle-check" title="The queue is clear">
            Nothing is waiting for review right now.
          </Empty>
        )}
      </div>
      <ReviewDialog
        item={selected}
        onClose={() => setSelected(null)}
        onDone={() => {
          setSelected(null)
          queue.reload({ silent: true })
        }}
      />
    </>
  )
}
