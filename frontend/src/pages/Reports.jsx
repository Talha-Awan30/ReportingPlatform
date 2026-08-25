import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import { moduleApi, reportApi } from '../api/endpoints'
import { useApi, useDebounced } from '../hooks/useApi'
import { useAuth } from '../auth/AuthContext'
import PageHeader from '../components/PageHeader'
import Spinner from '../components/Spinner'
import { Empty, Pager, StatusPill, formatDate } from '../components/ui'

const STATUSES = [
  { value: 'draft', label: 'Draft' },
  { value: 'submitted', label: 'Pending Review' },
  { value: 'returned', label: 'Returned' },
  { value: 'approved', label: 'Approved' },
  { value: 'client_query', label: 'Client Query' },
  { value: 'client_approved', label: 'Client Approved' },
]

export default function Reports() {
  const { isClient } = useAuth()
  const [params, setParams] = useSearchParams()

  const [search, setSearch] = useState(params.get('search') || '')
  const [page, setPage] = useState(1)
  const debouncedSearch = useDebounced(search)

  const status = params.get('status') || ''
  const moduleSlug = params.get('module_slug') || ''

  const modules = useApi(() => moduleApi.list(), [])
  const reports = useApi(
    () =>
      reportApi.list({
        page,
        per_page: 25,
        search: debouncedSearch || undefined,
        status: status || undefined,
        module_slug: moduleSlug || undefined,
      }),
    [page, debouncedSearch, status, moduleSlug],
  )

  const setFilter = (key, value) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
    setPage(1)
  }

  return (
    <>
      <PageHeader
        icon="fa-file-lines"
        title="Reports"
        subtitle={
          isClient
            ? 'Every report released to you, with its approval status.'
            : 'Every inspection report, across every module.'
        }
        crumbs={[{ label: 'Reports' }]}
        actions={
          !isClient && (
            <Link to="/modules" className="btn btn-cta">
              <i className="fas fa-plus" /> New Inspection
            </Link>
          )
        }
      />

      <div className="section-card">
        <div className="filter-bar">
          <div className="search-field">
            <i className="fas fa-search" />
            <input
              type="text"
              placeholder="Search report number, equipment tag or job…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setPage(1)
              }}
            />
          </div>

          <select value={status} onChange={(e) => setFilter('status', e.target.value)}>
            <option value="">All statuses</option>
            {STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>

          <select value={moduleSlug} onChange={(e) => setFilter('module_slug', e.target.value)}>
            <option value="">All inspection items</option>
            {(modules.data?.modules || []).map((m) => (
              <option key={m.slug} value={m.slug}>
                {m.name}
              </option>
            ))}
          </select>

          {(status || moduleSlug || search) && (
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={() => {
                setSearch('')
                setParams(new URLSearchParams(), { replace: true })
                setPage(1)
              }}
            >
              <i className="fas fa-xmark" /> Clear
            </button>
          )}
        </div>

        {reports.loading ? (
          <Spinner label="Loading reports" />
        ) : reports.error ? (
          <Empty icon="fa-triangle-exclamation" title="Could not load reports">{reports.error}</Empty>
        ) : reports.data?.items?.length ? (
          <>
            <div className="table-container">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Report</th>
                    <th>Item</th>
                    <th>Equipment</th>
                    <th>Client / Job</th>
                    <th>Inspected</th>
                    <th>Status</th>
                    <th className="text-right">Expires</th>
                  </tr>
                </thead>
                <tbody>
                  {reports.data.items.map((report) => (
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
                      <td className="nowrap">{formatDate(report.inspection_date)}</td>
                      <td>
                        <StatusPill label={report.status_label} severity={report.status_severity} />
                      </td>
                      <td className="text-right nowrap">{formatDate(report.certificate_expiry_date)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager meta={reports.data.meta} onPage={setPage} />
          </>
        ) : (
          <Empty icon="fa-file-circle-question" title="No reports match those filters">
            Try clearing the filters, or start a new inspection.
          </Empty>
        )}
      </div>
    </>
  )
}
