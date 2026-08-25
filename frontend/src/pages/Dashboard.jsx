import { Link } from 'react-router-dom'
import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  Tooltip,
} from 'chart.js'
import { Bar, Doughnut } from 'react-chartjs-2'

import { dashboardApi } from '../api/endpoints'
import { useApi } from '../hooks/useApi'
import { ROLES, useAuth } from '../auth/AuthContext'
import PageHeader from '../components/PageHeader'
import Spinner from '../components/Spinner'
import { CertificationPill, Empty, StatusPill, formatDate } from '../components/ui'
import { PIE_COLORS, SGS } from '../utils/chartColors'

ChartJS.register(ArcElement, BarElement, CategoryScale, LinearScale, Tooltip, Legend)

export default function Dashboard() {
  const { user, hasRole } = useAuth()
  const summary = useApi(() => dashboardApi.summary(), [])
  const activity = useApi(() => dashboardApi.activity(), [])
  const expiring = useApi(() => dashboardApi.expiring(), [])
  const byModule = useApi(() => dashboardApi.byModule(), [])

  if (summary.loading) return <Spinner full label="Loading your dashboard" />
  if (summary.error) return <Empty icon="fa-triangle-exclamation" title="Could not load the dashboard">{summary.error}</Empty>

  const cards = summary.data?.cards || {}
  const certification = summary.data?.certification || {}

  const tiles = [
    { key: 'total_reports', label: 'Total Reports', icon: 'fa-file-lines', tone: '', to: '/reports' },
    { key: 'pending_review', label: 'Pending Review', icon: 'fa-hourglass-half', tone: 'warning', to: hasRole(ROLES.REVIEWER) ? '/review' : '/reports?status=submitted' },
    { key: 'returned', label: 'Returned', icon: 'fa-rotate-left', tone: 'danger', to: '/reports?status=returned' },
    { key: 'awaiting_client', label: 'Awaiting Client', icon: 'fa-user-check', tone: 'info', to: '/reports?status=approved' },
    { key: 'equipment_tracked', label: 'Equipment Tracked', icon: 'fa-gears', tone: '', to: '/equipment' },
    { key: 'expiring_soon', label: 'Expiring in 60 Days', icon: 'fa-bell', tone: 'accent', to: '/equipment?certification_status=due' },
    { key: 'expired', label: 'Expired', icon: 'fa-circle-xmark', tone: 'danger', to: '/equipment?certification_status=expired' },
    { key: 'active_jobs', label: 'Active Jobs', icon: 'fa-briefcase', tone: 'info', to: '/jobs' },
  ].filter((tile) => cards[tile.key] !== undefined)

  const certLabels = ['valid', 'upcoming', 'due', 'critical', 'expired', 'uncertified']
  const certData = {
    labels: ['Valid', 'Due in 60d', 'Due in 30d', 'Due in 7d', 'Expired', 'No certificate'],
    datasets: [
      {
        data: certLabels.map((key) => certification[key] || 0),
        backgroundColor: [SGS.success, SGS.info, SGS.warning, SGS.primary, SGS.danger, SGS.gray3],
        borderColor: '#ffffff',
        borderWidth: 2,
      },
    ],
  }

  const moduleRows = (byModule.data?.modules || []).filter((m) => m.count > 0)
  const moduleData = {
    labels: moduleRows.map((m) => m.name),
    datasets: [
      {
        label: 'Reports',
        data: moduleRows.map((m) => m.count),
        backgroundColor: PIE_COLORS,
        borderRadius: 6,
      },
    ],
  }

  return (
    <>
      <PageHeader
        icon="fa-gauge-high"
        title={`Welcome back, ${user?.full_name?.split(' ')[0] || 'there'}`}
        subtitle="Everything waiting on you, and everything about to expire."
        actions={
          <Link to="/modules" className="btn btn-cta">
            <i className="fas fa-plus" /> New Inspection
          </Link>
        }
      />

      <div className="kpi-grid">
        {tiles.map((tile) => (
          <Link key={tile.key} to={tile.to} className={`kpi ${tile.tone}`}>
            <span className="kpi-icon">
              <i className={`fas ${tile.icon}`} />
            </span>
            <span>
              <span className="kpi-value">{cards[tile.key]}</span>
              <span className="kpi-label">{tile.label}</span>
            </span>
          </Link>
        ))}
      </div>

      <div className="chart-row">
        <div className="section-card">
          <div className="card-head">
            <div>
              <h2><i className="fas fa-chart-column" /> Reports by inspection item</h2>
              <p className="card-sub">Where the work has actually been done.</p>
            </div>
          </div>
          {moduleRows.length ? (
            <div className="chart-box">
              <Bar
                data={moduleData}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: { legend: { display: false } },
                  scales: {
                    y: { beginAtZero: true, ticks: { precision: 0, color: SGS.gray1 } },
                    x: { ticks: { color: SGS.gray1 } },
                  },
                }}
              />
            </div>
          ) : (
            <Empty icon="fa-chart-column" title="No reports yet">
              Reports appear here as soon as the first inspection is submitted.
            </Empty>
          )}
        </div>

        <div className="section-card">
          <div className="card-head">
            <div>
              <h2><i className="fas fa-certificate" /> Certification status</h2>
              <p className="card-sub">Across all equipment you can see.</p>
            </div>
          </div>
          <div className="chart-box">
            <Doughnut
              data={certData}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                cutout: '58%',
                plugins: { legend: { position: 'bottom', labels: { color: SGS.accent, boxWidth: 12 } } },
              }}
            />
          </div>
        </div>
      </div>

      <div className="section-card">
        <div className="card-head">
          <div>
            <h2><i className="fas fa-bell" /> Expiring within 60 days</h2>
            <p className="card-sub">Reminders go out automatically at 60, 30 and 7 days.</p>
          </div>
          <Link to="/alerts" className="btn btn-outline btn-sm">
            Alert history
          </Link>
        </div>

        {expiring.loading ? (
          <Spinner label="Loading equipment" />
        ) : expiring.data?.equipment?.length ? (
          <div className="table-container">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Equipment</th>
                  <th>Client</th>
                  <th>Location</th>
                  <th>Expires</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {expiring.data.equipment.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <Link to={`/equipment/${item.id}`} className="cell-strong">
                        {item.tag_number}
                      </Link>
                      <div className="cell-sub">{item.type_name}</div>
                    </td>
                    <td>{item.client_name}</td>
                    <td>{item.location || '—'}</td>
                    <td className="nowrap">{formatDate(item.certificate_expiry_date)}</td>
                    <td>
                      <CertificationPill status={item.certification_status} days={item.days_to_expiry} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty icon="fa-circle-check" title="Nothing expiring soon">
            No certification lapses in the next 60 days.
          </Empty>
        )}
      </div>

      <div className="section-card">
        <div className="card-head">
          <div>
            <h2><i className="fas fa-clock-rotate-left" /> Recent activity</h2>
            <p className="card-sub">The reports touched most recently.</p>
          </div>
          <Link to="/reports" className="btn btn-outline btn-sm">
            All reports
          </Link>
        </div>

        {activity.loading ? (
          <Spinner label="Loading activity" />
        ) : activity.data?.reports?.length ? (
          <div className="table-container">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Report</th>
                  <th>Equipment</th>
                  <th>Client</th>
                  <th>Status</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {activity.data.reports.map((report) => (
                  <tr key={report.id}>
                    <td>
                      <Link to={`/reports/${report.id}`} className="cell-strong">
                        {report.report_number}
                      </Link>
                      <div className="cell-sub">Rev {report.revision}</div>
                    </td>
                    <td>{report.equipment_tag}</td>
                    <td>{report.client_name}</td>
                    <td>
                      <StatusPill label={report.status_label} severity={report.status_severity} />
                    </td>
                    <td className="nowrap">{formatDate(report.updated_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty icon="fa-file-lines" title="No reports yet">
            Start an inspection and it will show up here.
          </Empty>
        )}
      </div>
    </>
  )
}
