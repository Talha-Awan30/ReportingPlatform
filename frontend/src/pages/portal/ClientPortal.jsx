import { Link } from 'react-router-dom'

import { dashboardApi, reportApi } from '../../api/endpoints'
import { useApi } from '../../hooks/useApi'
import { useAuth } from '../../auth/AuthContext'
import PageHeader from '../../components/PageHeader'
import Spinner from '../../components/Spinner'
import { CertificationPill, Empty, StatusPill, formatDate } from '../../components/ui'

/** What a client lands on: what needs their approval, and what is about to expire. */
export default function ClientPortal() {
  const { user } = useAuth()

  const summary = useApi(() => dashboardApi.summary(), [])
  const pending = useApi(() => reportApi.list({ status: 'approved', per_page: 10 }), [])
  const expiring = useApi(() => dashboardApi.expiring(), [])

  if (summary.loading) return <Spinner full label="Loading your portal" />

  const cards = summary.data?.cards || {}

  return (
    <>
      <PageHeader
        icon="fa-gauge-high"
        title={user?.client_name || 'Client Portal'}
        subtitle="Reports waiting on your approval, and certifications approaching their expiry date."
      />

      <div className="kpi-grid">
        <Link to="/portal/reports?status=approved" className="kpi accent">
          <span className="kpi-icon"><i className="fas fa-user-check" /></span>
          <span>
            <span className="kpi-value">{cards.awaiting_client ?? 0}</span>
            <span className="kpi-label">Awaiting your approval</span>
          </span>
        </Link>
        <Link to="/portal/reports" className="kpi">
          <span className="kpi-icon"><i className="fas fa-file-lines" /></span>
          <span>
            <span className="kpi-value">{cards.total_reports ?? 0}</span>
            <span className="kpi-label">Reports on record</span>
          </span>
        </Link>
        <Link to="/portal/equipment" className="kpi info">
          <span className="kpi-icon"><i className="fas fa-gears" /></span>
          <span>
            <span className="kpi-value">{cards.equipment_tracked ?? 0}</span>
            <span className="kpi-label">Equipment tracked</span>
          </span>
        </Link>
        <Link to="/portal/equipment" className="kpi warning">
          <span className="kpi-icon"><i className="fas fa-bell" /></span>
          <span>
            <span className="kpi-value">{cards.expiring_soon ?? 0}</span>
            <span className="kpi-label">Expiring in 60 days</span>
          </span>
        </Link>
        <Link to="/portal/equipment?certification_status=expired" className="kpi danger">
          <span className="kpi-icon"><i className="fas fa-circle-xmark" /></span>
          <span>
            <span className="kpi-value">{cards.expired ?? 0}</span>
            <span className="kpi-label">Expired</span>
          </span>
        </Link>
      </div>

      <div className="section-card">
        <div className="card-head">
          <div>
            <h2><i className="fas fa-user-check" /> Reports to approve</h2>
            <p className="card-sub">Released by the review team and waiting on your sign-off.</p>
          </div>
          <Link to="/portal/reports" className="btn btn-outline btn-sm">All reports</Link>
        </div>

        {pending.loading ? (
          <Spinner label="Loading reports" />
        ) : pending.data?.items?.length ? (
          <div className="table-container">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Report</th>
                  <th>Equipment</th>
                  <th>Job</th>
                  <th>Inspected</th>
                  <th className="text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {pending.data.items.map((report) => (
                  <tr key={report.id}>
                    <td>
                      <Link to={`/reports/${report.id}`} className="cell-strong">{report.report_number}</Link>
                      <div className="cell-sub">{report.equipment_type}</div>
                    </td>
                    <td>{report.equipment_tag}</td>
                    <td>{report.job_number}</td>
                    <td className="nowrap">{formatDate(report.inspection_date)}</td>
                    <td className="text-right">
                      <Link to={`/reports/${report.id}`} className="btn btn-cta btn-sm">Review &amp; approve</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty icon="fa-circle-check" title="Nothing waiting on you">
            Every released report has been approved.
          </Empty>
        )}
      </div>

      <div className="section-card">
        <div className="card-head">
          <div>
            <h2><i className="fas fa-bell" /> Certifications expiring soon</h2>
            <p className="card-sub">You are emailed automatically at 60, 30 and 7 days before expiry.</p>
          </div>
        </div>

        {expiring.loading ? (
          <Spinner label="Loading equipment" />
        ) : expiring.data?.equipment?.length ? (
          <div className="table-container">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Equipment</th>
                  <th>Type</th>
                  <th>Location</th>
                  <th>Expires</th>
                  <th className="text-right">Status</th>
                </tr>
              </thead>
              <tbody>
                {expiring.data.equipment.map((item) => (
                  <tr key={item.id}>
                    <td><Link to={`/equipment/${item.id}`} className="cell-strong">{item.tag_number}</Link></td>
                    <td>{item.type_name}</td>
                    <td>{item.location || '—'}</td>
                    <td className="nowrap">{formatDate(item.certificate_expiry_date)}</td>
                    <td className="text-right">
                      <CertificationPill status={item.certification_status} days={item.days_to_expiry} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty icon="fa-circle-check" title="Nothing expiring in the next 60 days" />
        )}
      </div>
    </>
  )
}
