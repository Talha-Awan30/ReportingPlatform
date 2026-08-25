import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import { alertApi, clientApi, equipmentApi } from '../api/endpoints'
import { errorMessage } from '../api/client'
import { useApi } from '../hooks/useApi'
import { ROLES, useAuth } from '../auth/AuthContext'
import PageHeader from '../components/PageHeader'
import Spinner from '../components/Spinner'
import { useToast } from '../components/Toast'
import { CertificationPill, Empty, Pill, StatusPill, formatDate, formatDateTime } from '../components/ui'
import { EquipmentModal } from './EquipmentList'

export default function EquipmentDetail() {
  const { id } = useParams()
  const toast = useToast()
  const { hasRole, isClient } = useAuth()
  const canEdit = hasRole(ROLES.ADMIN, ROLES.INSPECTOR, ROLES.REVIEWER) && !isClient

  const [editing, setEditing] = useState(false)

  const equipment = useApi(() => equipmentApi.get(id), [id])
  const alerts = useApi(() => alertApi.list({ equipment_id: id, per_page: 20 }), [id])
  const clients = useApi(() => (canEdit ? clientApi.list({ per_page: 200 }) : null), [canEdit])
  const types = useApi(() => (canEdit ? equipmentApi.types() : null), [canEdit])

  if (equipment.loading) return <Spinner full label="Loading equipment" />
  if (equipment.error) {
    return <Empty icon="fa-triangle-exclamation" title="Could not load this equipment">{equipment.error}</Empty>
  }

  const data = equipment.data.equipment

  const save = async (payload) => {
    try {
      await equipmentApi.update(id, payload)
      toast.success('Equipment updated.')
      setEditing(false)
      equipment.reload()
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  return (
    <>
      <PageHeader
        icon="fa-gears"
        title={data.tag_number}
        subtitle={`${data.type_name} · ${data.client_name}`}
        crumbs={[
          ...(isClient ? [{ label: 'My Equipment', to: '/portal/equipment' }] : [{ label: 'Equipment', to: '/equipment' }]),
          { label: data.tag_number },
        ]}
        actions={
          canEdit && (
            <button type="button" className="btn btn-primary" onClick={() => setEditing(true)}>
              <i className="fas fa-pen" /> Edit
            </button>
          )
        }
      />

      <div className="kpi-grid">
        <div className={`kpi ${data.certification_status === 'expired' ? 'danger' : 'success'}`}>
          <span className="kpi-icon"><i className="fas fa-certificate" /></span>
          <span>
            <span className="kpi-value" style={{ fontSize: '1.05rem' }}>
              {formatDate(data.certificate_expiry_date)}
            </span>
            <span className="kpi-label">Certificate expires</span>
          </span>
        </div>
        <div className="kpi info">
          <span className="kpi-icon"><i className="fas fa-calendar-check" /></span>
          <span>
            <span className="kpi-value" style={{ fontSize: '1.05rem' }}>
              {formatDate(data.last_inspection_date)}
            </span>
            <span className="kpi-label">Last inspected</span>
          </span>
        </div>
        <div className="kpi accent">
          <span className="kpi-icon"><i className="fas fa-file-lines" /></span>
          <span>
            <span className="kpi-value">{data.reports?.length || 0}</span>
            <span className="kpi-label">Reports on record</span>
          </span>
        </div>
      </div>

      <div className="section-card">
        <div className="card-head">
          <div><h2><i className="fas fa-circle-info" /> Equipment details</h2></div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <CertificationPill status={data.certification_status} days={data.days_to_expiry} />
            <Pill tone={data.is_active ? 'success' : 'neutral'}>{data.is_active ? 'Active' : 'Inactive'}</Pill>
          </div>
        </div>
        <div className="detail-grid">
          <Detail k="Client" v={isClient ? data.client_name : <Link to={`/clients/${data.client_id}`}>{data.client_name}</Link>} />
          <Detail k="Equipment type" v={data.type_name} />
          <Detail k="Inspection module" v={data.module_slug} />
          <Detail k="Serial number" v={data.serial_number} />
          <Detail k="Manufacturer" v={data.manufacturer} />
          <Detail k="Model" v={data.model} />
          <Detail k="Year of manufacture" v={data.year_of_manufacture} />
          <Detail k="SWL" v={data.swl} />
          <Detail k="Capacity" v={data.capacity} />
          <Detail k="Location" v={data.location} />
          <Detail k="Notes" v={data.notes} />
        </div>
      </div>

      <div className="section-card">
        <div className="card-head">
          <div>
            <h2><i className="fas fa-clock-rotate-left" /> Inspection history</h2>
            <p className="card-sub">Every report raised against this item.</p>
          </div>
        </div>
        {data.reports?.length ? (
          <div className="table-container">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Report</th>
                  <th>Job</th>
                  <th>Inspected</th>
                  <th>Inspector</th>
                  <th>Status</th>
                  <th className="text-right">Expires</th>
                </tr>
              </thead>
              <tbody>
                {data.reports.map((report) => (
                  <tr key={report.id}>
                    <td>
                      <Link to={`/reports/${report.id}`} className="cell-strong">{report.report_number}</Link>
                      <div className="cell-sub">Rev {report.revision}</div>
                    </td>
                    <td>{report.job_number}</td>
                    <td className="nowrap">{formatDate(report.inspection_date)}</td>
                    <td>{report.inspector_name || '—'}</td>
                    <td><StatusPill label={report.status_label} severity={report.status_severity} /></td>
                    <td className="text-right nowrap">{formatDate(report.certificate_expiry_date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty icon="fa-file-circle-question" title="No inspections recorded yet" />
        )}
      </div>

      <div className="section-card">
        <div className="card-head">
          <div>
            <h2><i className="fas fa-bell" /> Expiry alerts sent</h2>
            <p className="card-sub">Reminders raised automatically as the certification date approached.</p>
          </div>
        </div>
        {alerts.loading ? (
          <Spinner label="Loading alerts" />
        ) : alerts.data?.items?.length ? (
          <div className="table-container">
            <table className="admin-table">
              <thead>
                <tr>
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
                      <Pill tone={alert.threshold_days === 0 ? 'danger' : 'warning'}>
                        {alert.threshold_days === 0 ? 'After expiry' : `${alert.threshold_days} days before`}
                      </Pill>
                    </td>
                    <td className="nowrap">{formatDate(alert.expiry_date)}</td>
                    <td className="cell-sub">{(alert.recipients || []).join(', ') || '—'}</td>
                    <td className="nowrap">{formatDateTime(alert.sent_at)}</td>
                    <td className="text-right">
                      <Pill tone={alert.delivery_status === 'sent' ? 'success' : alert.delivery_status === 'failed' ? 'danger' : 'neutral'}>
                        {alert.delivery_status}
                      </Pill>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty icon="fa-bell-slash" title="No alerts raised for this item yet">
            Reminders go out at 60, 30 and 7 days before the certificate expires.
          </Empty>
        )}
      </div>

      {canEdit && (
        <EquipmentModal
          open={editing}
          equipment={data}
          clients={clients.data?.items || []}
          types={types.data?.types || []}
          onClose={() => setEditing(false)}
          onSave={save}
        />
      )}
    </>
  )
}

function Detail({ k, v }) {
  return (
    <div className="field">
      <div className="k">{k}</div>
      <div className="v">{v || <span className="muted">—</span>}</div>
    </div>
  )
}
