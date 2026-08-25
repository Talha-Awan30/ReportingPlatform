import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import { downloadFile, reportApi } from '../../api/endpoints'
import { errorMessage } from '../../api/client'
import { useApi, useDebounced } from '../../hooks/useApi'
import PageHeader from '../../components/PageHeader'
import Spinner from '../../components/Spinner'
import { useToast } from '../../components/Toast'
import { Empty, Pager, StatusPill, formatDate } from '../../components/ui'

const STATUSES = [
  { value: 'approved', label: 'Awaiting my approval' },
  { value: 'client_query', label: 'Query raised' },
  { value: 'client_approved', label: 'Approved by me' },
]

/** Past record search: every report released to this client, by job, equipment or date. */
export default function PortalReports() {
  const toast = useToast()
  const [params, setParams] = useSearchParams()

  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const debounced = useDebounced(search)

  const status = params.get('status') || ''
  const dateFrom = params.get('date_from') || ''
  const dateTo = params.get('date_to') || ''

  const reports = useApi(
    () =>
      reportApi.list({
        page,
        per_page: 25,
        search: debounced || undefined,
        status: status || undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
      }),
    [page, debounced, status, dateFrom, dateTo],
  )

  const setFilter = (key, value) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
    setPage(1)
  }

  const download = async (report) => {
    try {
      await downloadFile(reportApi.downloadUrl(report.id), report.docx_path)
    } catch (err) {
      toast.error(errorMessage(err, 'That document is not available yet.'))
    }
  }

  return (
    <>
      <PageHeader
        icon="fa-file-lines"
        title="My Reports"
        subtitle="Search every report by job, equipment tag or inspection date, and download a copy any time."
        crumbs={[{ label: 'My Reports' }]}
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
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setFilter('date_from', e.target.value)}
            aria-label="Inspected from"
          />
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setFilter('date_to', e.target.value)}
            aria-label="Inspected to"
          />
        </div>

        {reports.loading ? (
          <Spinner label="Loading reports" />
        ) : reports.data?.items?.length ? (
          <>
            <div className="table-container">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Report</th>
                    <th>Equipment</th>
                    <th>Job</th>
                    <th>Inspected</th>
                    <th>Expires</th>
                    <th>Status</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {reports.data.items.map((report) => (
                    <tr key={report.id}>
                      <td>
                        <Link to={`/reports/${report.id}`} className="cell-strong">{report.report_number}</Link>
                        <div className="cell-sub">{report.equipment_type}</div>
                      </td>
                      <td>{report.equipment_tag}</td>
                      <td>{report.job_number}</td>
                      <td className="nowrap">{formatDate(report.inspection_date)}</td>
                      <td className="nowrap">{formatDate(report.certificate_expiry_date)}</td>
                      <td><StatusPill label={report.status_label} severity={report.status_severity} /></td>
                      <td>
                        <div className="row-actions">
                          <Link to={`/reports/${report.id}`} className="btn btn-outline btn-sm">Open</Link>
                          {report.docx_path && (
                            <button type="button" className="btn btn-primary btn-sm" onClick={() => download(report)}>
                              <i className="fas fa-download" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager meta={reports.data.meta} onPage={setPage} />
          </>
        ) : (
          <Empty icon="fa-file-circle-question" title="No reports match those filters">
            Reports appear here once the review team releases them.
          </Empty>
        )}
      </div>
    </>
  )
}
