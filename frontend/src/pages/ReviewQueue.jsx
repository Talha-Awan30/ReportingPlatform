import { useState } from 'react'
import { Link } from 'react-router-dom'

import { moduleApi, reportApi } from '../api/endpoints'
import { useApi } from '../hooks/useApi'
import PageHeader from '../components/PageHeader'
import Spinner from '../components/Spinner'
import { Empty, Pager, Pill, formatDate, formatDateTime } from '../components/ui'

/** Every submitted report waiting for review, oldest first. */
export default function ReviewQueue() {
  const [page, setPage] = useState(1)
  const [moduleSlug, setModuleSlug] = useState('')

  const modules = useApi(() => moduleApi.list(), [])
  const queue = useApi(
    () => reportApi.queue({ page, per_page: 25, module_slug: moduleSlug || undefined }),
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
        subtitle="Reports submitted from site, waiting on your decision."
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
                    <th>Item</th>
                    <th>Equipment</th>
                    <th>Client / Job</th>
                    <th>Inspector</th>
                    <th>Submitted</th>
                    <th className="text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {queue.data.items.map((report) => {
                    const days = waitingDays(report.submitted_at)
                    return (
                      <tr key={report.id}>
                        <td>
                          <Link to={`/reports/${report.id}`} className="cell-strong">
                            {report.report_number}
                          </Link>
                          <div className="cell-sub">Rev {report.revision}</div>
                        </td>
                        <td className="cell-sub">{report.equipment_type}</td>
                        <td>{report.equipment_tag}</td>
                        <td>
                          <div>{report.client_name}</div>
                          <div className="cell-sub">{report.job_number}</div>
                        </td>
                        <td>{report.inspector_name}</td>
                        <td className="nowrap">
                          <div>{formatDateTime(report.submitted_at)}</div>
                          {days != null && (
                            <div className="cell-sub">
                              <Pill tone={days > 3 ? 'danger' : days > 1 ? 'warning' : 'neutral'}>
                                {days === 0 ? 'today' : `${days}d waiting`}
                              </Pill>
                            </div>
                          )}
                        </td>
                        <td className="text-right">
                          <Link to={`/reports/${report.id}`} className="btn btn-primary btn-sm">
                            Open
                          </Link>
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
    </>
  )
}
