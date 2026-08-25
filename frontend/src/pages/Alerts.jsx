import { useState } from 'react'
import { Link } from 'react-router-dom'

import { alertApi } from '../api/endpoints'
import { errorMessage } from '../api/client'
import { useApi } from '../hooks/useApi'
import { ROLES, useAuth } from '../auth/AuthContext'
import PageHeader from '../components/PageHeader'
import Spinner from '../components/Spinner'
import { useToast } from '../components/Toast'
import { Empty, Pager, Pill, formatDate, formatDateTime } from '../components/ui'

/** Certification expiry alert history, plus a manual scan for admins. */
export default function Alerts() {
  const toast = useToast()
  const { hasRole } = useAuth()
  const isAdmin = hasRole(ROLES.ADMIN)

  const [page, setPage] = useState(1)
  const [status, setStatus] = useState('')
  const [scanning, setScanning] = useState(false)

  const thresholds = useApi(() => alertApi.thresholds(), [])
  const alerts = useApi(
    () => alertApi.list({ page, per_page: 25, delivery_status: status || undefined }),
    [page, status],
  )

  const runScan = async (dryRun) => {
    setScanning(true)
    try {
      const { summary } = await alertApi.scan({ dry_run: dryRun })
      toast.success(
        dryRun
          ? `Dry run: ${summary.raised} alert(s) would be raised from ${summary.scanned} item(s).`
          : `Scan complete: ${summary.sent} sent, ${summary.failed} failed, ${summary.skipped} skipped.`,
      )
      alerts.reload()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setScanning(false)
    }
  }

  return (
    <>
      <PageHeader
        icon="fa-bell"
        title="Certification Expiry Alerts"
        subtitle="Every reminder the platform has raised, and who received it."
        crumbs={[{ label: 'Expiry Alerts' }]}
        actions={
          isAdmin && (
            <>
              <button type="button" className="btn btn-outline" disabled={scanning} onClick={() => runScan(true)}>
                <i className="fas fa-flask" /> Dry run
              </button>
              <button type="button" className="btn btn-cta" disabled={scanning} onClick={() => runScan(false)}>
                <i className={`fas ${scanning ? 'fa-circle-notch fa-spin' : 'fa-paper-plane'}`} /> Run scan now
              </button>
            </>
          )
        }
      />

      <div className="section-card">
        <div className="card-head">
          <div>
            <h2><i className="fas fa-sliders" /> How the reminders work</h2>
            <p className="card-sub">
              The scan runs automatically every morning. Each threshold fires once per expiry date, so
              a reminder is never sent twice.
            </p>
          </div>
        </div>
        <div className="kpi-grid" style={{ marginBottom: 0 }}>
          {(thresholds.data?.thresholds || []).map((days) => (
            <div key={days} className={`kpi ${days <= 7 ? 'danger' : days <= 30 ? 'warning' : 'info'}`}>
              <span className="kpi-icon"><i className="fas fa-clock" /></span>
              <span>
                <span className="kpi-value">{days}</span>
                <span className="kpi-label">Days before expiry</span>
              </span>
            </div>
          ))}
          <div className="kpi danger">
            <span className="kpi-icon"><i className="fas fa-circle-exclamation" /></span>
            <span>
              <span className="kpi-value">After</span>
              <span className="kpi-label">Escalation once expired</span>
            </span>
          </div>
        </div>
      </div>

      <div className="section-card">
        <div className="filter-bar">
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value)
              setPage(1)
            }}
          >
            <option value="">All delivery statuses</option>
            <option value="sent">Sent</option>
            <option value="failed">Failed</option>
            <option value="pending">Pending</option>
          </select>
        </div>

        {alerts.loading ? (
          <Spinner label="Loading alerts" />
        ) : alerts.data?.items?.length ? (
          <>
            <div className="table-container">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Equipment</th>
                    <th>Client</th>
                    <th>Threshold</th>
                    <th>Expiry date</th>
                    <th>Recipients</th>
                    <th>Sent</th>
                    <th className="text-right">Delivery</th>
                  </tr>
                </thead>
                <tbody>
                  {alerts.data.items.map((alert) => (
                    <tr key={alert.id}>
                      <td>
                        <Link to={`/equipment/${alert.equipment_id}`} className="cell-strong">
                          {alert.equipment_tag}
                        </Link>
                      </td>
                      <td>{alert.client_name}</td>
                      <td>
                        <Pill tone={alert.threshold_days === 0 ? 'danger' : alert.threshold_days <= 7 ? 'danger' : 'warning'}>
                          {alert.threshold_days === 0 ? 'After expiry' : `${alert.threshold_days}d before`}
                        </Pill>
                      </td>
                      <td className="nowrap">{formatDate(alert.expiry_date)}</td>
                      <td className="cell-sub" style={{ maxWidth: 260 }}>
                        {(alert.recipients || []).join(', ') || '—'}
                      </td>
                      <td className="nowrap">{formatDateTime(alert.sent_at)}</td>
                      <td className="text-right">
                        <Pill
                          tone={
                            alert.delivery_status === 'sent'
                              ? 'success'
                              : alert.delivery_status === 'failed'
                                ? 'danger'
                                : 'neutral'
                          }
                        >
                          {alert.delivery_status}
                        </Pill>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager meta={alerts.data.meta} onPage={setPage} />
          </>
        ) : (
          <Empty icon="fa-bell-slash" title="No alerts raised yet">
            Alerts appear here once equipment approaches its certification expiry date.
          </Empty>
        )}
      </div>
    </>
  )
}
