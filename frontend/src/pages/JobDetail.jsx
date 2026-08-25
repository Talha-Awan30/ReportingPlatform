import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import { clientApi, jobApi } from '../api/endpoints'
import { errorMessage } from '../api/client'
import { useApi } from '../hooks/useApi'
import PageHeader from '../components/PageHeader'
import Spinner from '../components/Spinner'
import { useToast } from '../components/Toast'
import { Empty, Pill, StatusPill, formatDate } from '../components/ui'
import { JobModal } from './Jobs'

const STATUS_TONES = {
  open: 'info',
  in_progress: 'warning',
  completed: 'success',
  cancelled: 'neutral',
}

export default function JobDetail() {
  const { id } = useParams()
  const toast = useToast()
  const [editing, setEditing] = useState(false)

  const job = useApi(() => jobApi.get(id), [id])
  const clients = useApi(() => clientApi.list({ per_page: 200 }), [])

  if (job.loading) return <Spinner full label="Loading job" />
  if (job.error) return <Empty icon="fa-triangle-exclamation" title="Could not load this job">{job.error}</Empty>

  const data = job.data.job

  const save = async (payload) => {
    try {
      await jobApi.update(id, payload)
      toast.success('Job updated.')
      setEditing(false)
      job.reload()
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  return (
    <>
      <PageHeader
        icon="fa-briefcase"
        title={data.job_number}
        subtitle={`${data.client_name}${data.site_name ? ` · ${data.site_name}` : ''}`}
        crumbs={[{ label: 'Jobs', to: '/jobs' }, { label: data.job_number }]}
        actions={
          <>
            <Link to="/modules" className="btn btn-cta">
              <i className="fas fa-plus" /> New Inspection
            </Link>
            <button type="button" className="btn btn-primary" onClick={() => setEditing(true)}>
              <i className="fas fa-pen" /> Edit
            </button>
          </>
        }
      />

      <div className="section-card">
        <div className="card-head">
          <div><h2><i className="fas fa-circle-info" /> Job details</h2></div>
          <Pill tone={STATUS_TONES[data.status] || 'neutral'}>{data.status.replace('_', ' ')}</Pill>
        </div>
        <div className="detail-grid">
          <Detail k="Client" v={<Link to={`/clients/${data.client_id}`}>{data.client_name}</Link>} />
          <Detail k="Site" v={data.site_name} />
          <Detail k="Site address" v={data.site_address} />
          <Detail k="Contact" v={data.contact_name} />
          <Detail k="Purchase order" v={data.purchase_order} />
          <Detail k="Inspection date" v={formatDate(data.inspection_date)} />
          <Detail k="Team lead" v={data.team_lead_name} />
          <Detail k="Notes" v={data.notes} />
        </div>
      </div>

      <div className="section-card">
        <div className="card-head">
          <div>
            <h2><i className="fas fa-file-lines" /> Reports on this job</h2>
            <p className="card-sub">{data.reports?.length || 0} report(s) raised against this visit.</p>
          </div>
        </div>

        {data.reports?.length ? (
          <div className="table-container">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Report</th>
                  <th>Item</th>
                  <th>Equipment</th>
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
                    <td className="cell-sub">{report.equipment_type}</td>
                    <td>{report.equipment_tag}</td>
                    <td>{report.inspector_name || '—'}</td>
                    <td><StatusPill label={report.status_label} severity={report.status_severity} /></td>
                    <td className="text-right nowrap">{formatDate(report.certificate_expiry_date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            icon="fa-file-circle-plus"
            title="No reports on this job yet"
            action={<Link to="/modules" className="btn btn-cta">Start an inspection</Link>}
          >
            Pick the inspection item and this job to raise the first report.
          </Empty>
        )}
      </div>

      <JobModal
        open={editing}
        job={data}
        clients={clients.data?.items || []}
        onClose={() => setEditing(false)}
        onSave={save}
      />
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
