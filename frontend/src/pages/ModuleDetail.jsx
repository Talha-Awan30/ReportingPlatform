import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import { clientApi, equipmentApi, jobApi, moduleApi, reportApi } from '../api/endpoints'
import { errorMessage } from '../api/client'
import { useApi } from '../hooks/useApi'
import PageHeader from '../components/PageHeader'
import Spinner from '../components/Spinner'
import { useToast } from '../components/Toast'
import { Empty, Field, Modal, Pill, Select, StatusPill, formatDate } from '../components/ui'

/**
 * One inspection module: what it checks, its recent reports, and the entry
 * point for starting a new one. The checkpoint list is read straight from the
 * module manifest, so this page never needs editing when a module changes.
 */
export default function ModuleDetail() {
  const { slug } = useParams()
  const [starting, setStarting] = useState(false)

  const schema = useApi(() => moduleApi.formSchema(slug), [slug])
  const reports = useApi(() => reportApi.list({ module_slug: slug, per_page: 15 }), [slug])

  if (schema.loading) return <Spinner full label="Loading module" />
  if (schema.error) return <Empty icon="fa-triangle-exclamation" title="Could not load this module">{schema.error}</Empty>

  const module = schema.data.module

  return (
    <>
      <PageHeader
        icon={module.icon}
        title={module.name}
        subtitle={module.summary}
        crumbs={[{ label: 'Inspections', to: '/modules' }, { label: module.name }]}
        actions={
          module.has_title_page ? (
            <Link to={`/modules/${slug}/new`} className="btn btn-cta">
              <i className="fas fa-plus" /> Start Inspection
            </Link>
          ) : (
            <button type="button" className="btn btn-cta" onClick={() => setStarting(true)}>
              <i className="fas fa-plus" /> Start Inspection
            </button>
          )
        }
      />

      <div className="kpi-grid">
        <div className="kpi accent">
          <span className="kpi-icon"><i className="fas fa-list-check" /></span>
          <span>
            <span className="kpi-value">{module.checkpoint_count}</span>
            <span className="kpi-label">Checkpoints</span>
          </span>
        </div>
        <div className="kpi info">
          <span className="kpi-icon"><i className="fas fa-layer-group" /></span>
          <span>
            <span className="kpi-value">{module.section_count}</span>
            <span className="kpi-label">Sections</span>
          </span>
        </div>
        <div className="kpi">
          <span className="kpi-icon"><i className="fas fa-hashtag" /></span>
          <span>
            <span className="kpi-value">{module.report_prefix}</span>
            <span className="kpi-label">Report Prefix</span>
          </span>
        </div>
        <div className="kpi warning">
          <span className="kpi-icon"><i className="fas fa-calendar-check" /></span>
          <span>
            <span className="kpi-value">{module.default_validity_months}</span>
            <span className="kpi-label">Months Validity</span>
          </span>
        </div>
      </div>

      <div className="section-card">
        <div className="card-head">
          <div>
            <h2><i className="fas fa-file-lines" /> Recent reports</h2>
            <p className="card-sub">The latest inspections recorded against this item.</p>
          </div>
          <Link to={`/reports?module_slug=${slug}`} className="btn btn-outline btn-sm">
            View all
          </Link>
        </div>

        {reports.loading ? (
          <Spinner label="Loading reports" />
        ) : reports.data?.items?.length ? (
          <div className="table-container">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Report</th>
                  <th>Equipment</th>
                  <th>Client</th>
                  <th>Inspected</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {reports.data.items.map((report) => (
                  <tr key={report.id}>
                    <td>
                      <Link to={`/reports/${report.id}`} className="cell-strong">
                        {report.report_number}
                      </Link>
                    </td>
                    <td>{report.equipment_tag}</td>
                    <td>{report.client_name}</td>
                    <td className="nowrap">{formatDate(report.inspection_date)}</td>
                    <td><StatusPill label={report.status_label} severity={report.status_severity} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty icon="fa-file-circle-plus" title="No reports for this item yet">
            Start the first inspection to see it here.
          </Empty>
        )}
      </div>

      <div className="section-card">
        <div className="card-head">
          <div>
            <h2><i className="fas fa-list-check" /> Checkpoint list</h2>
            <p className="card-sub">
              Read from this module&apos;s manifest. Edit the wording behind each dropdown under
              Admin &rarr; Master Lists.
            </p>
          </div>
        </div>

        <div className="stack">
          {module.sections.map((section) => (
            <div key={section.key}>
              <div className="row-between" style={{ marginBottom: '0.6rem' }}>
                <h3 style={{ fontSize: '0.9rem', color: 'var(--secondary-color)', fontWeight: 700 }}>
                  {section.title}
                </h3>
                <Pill tone="neutral">{section.checkpoints.length} checks</Pill>
              </div>
              {section.description && <p className="card-sub" style={{ marginBottom: '0.6rem' }}>{section.description}</p>}
              <div className="table-container">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th style={{ width: '55%' }}>Check point</th>
                      <th>Control</th>
                      <th>Options from</th>
                      <th className="text-right">Required</th>
                    </tr>
                  </thead>
                  <tbody>
                    {section.checkpoints.map((cp) => (
                      <tr key={cp.key}>
                        <td>
                          <span className="cell-strong">{cp.label}</span>
                          {cp.help_text && <div className="cell-sub">{cp.help_text}</div>}
                        </td>
                        <td><Pill tone="info">{cp.kind}</Pill></td>
                        <td className="cell-sub">
                          {cp.options_key
                            ? schema.data.options[cp.options_key]?.name || cp.options_key
                            : '—'}
                        </td>
                        <td className="text-right">
                          {cp.required ? <Pill tone="accent">Required</Pill> : <span className="muted">Optional</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      </div>

      <StartInspectionModal
        open={starting}
        module={module}
        onClose={() => setStarting(false)}
      />
    </>
  )
}

/** Picks the client, job and equipment, then creates the draft report. */
function StartInspectionModal({ open, module, onClose }) {
  const navigate = useNavigate()
  const toast = useToast()

  const [clientId, setClientId] = useState('')
  const [jobId, setJobId] = useState('')
  const [equipmentId, setEquipmentId] = useState('')
  const [saving, setSaving] = useState(false)

  const clients = useApi(() => (open ? clientApi.list({ per_page: 200, active_only: 'true' }) : null), [open])
  const jobs = useApi(
    () => (clientId ? jobApi.list({ client_id: clientId, per_page: 200 }) : Promise.resolve({ items: [] })),
    [clientId],
  )
  const equipment = useApi(
    () =>
      clientId
        ? equipmentApi.list({ client_id: clientId, module_slug: module.slug, active_only: 'true', per_page: 200 })
        : Promise.resolve({ items: [] }),
    [clientId, module.slug],
  )

  const submit = async (event) => {
    event.preventDefault()
    setSaving(true)
    try {
      const { report } = await reportApi.create({
        module_slug: module.slug,
        job_id: Number(jobId),
        equipment_id: Number(equipmentId),
      })
      toast.success(`Draft ${report.report_number} created.`)
      navigate(`/reports/${report.id}`)
    } catch (err) {
      toast.error(errorMessage(err))
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      title={`Start a ${module.name} inspection`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-outline" onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            form="start-inspection"
            className="btn btn-cta"
            disabled={saving || !jobId || !equipmentId}
          >
            {saving ? 'Creating…' : 'Create draft'}
          </button>
        </>
      }
    >
      <form id="start-inspection" onSubmit={submit} className="field-grid single">
        <Select
          label="Client"
          required
          placeholder="Select a client…"
          value={clientId}
          onChange={(e) => {
            setClientId(e.target.value)
            setJobId('')
            setEquipmentId('')
          }}
          options={(clients.data?.items || []).map((c) => ({ value: c.id, label: `${c.code} — ${c.name}` }))}
        />

        <Select
          label="Job"
          required
          disabled={!clientId}
          placeholder={clientId ? 'Select a job…' : 'Pick a client first'}
          value={jobId}
          onChange={(e) => setJobId(e.target.value)}
          options={(jobs.data?.items || []).map((j) => ({
            value: j.id,
            label: `${j.job_number} — ${j.site_name || 'No site'}`,
          }))}
          hint={
            clientId && !jobs.loading && !jobs.data?.items?.length
              ? 'This client has no jobs yet — create one under Registers → Jobs.'
              : undefined
          }
        />

        <Select
          label="Equipment"
          required
          disabled={!clientId}
          placeholder={clientId ? 'Select the item…' : 'Pick a client first'}
          value={equipmentId}
          onChange={(e) => setEquipmentId(e.target.value)}
          options={(equipment.data?.items || []).map((e) => ({
            value: e.id,
            label: `${e.tag_number} — ${e.type_name}`,
          }))}
          hint={
            clientId && !equipment.loading && !equipment.data?.items?.length
              ? `No ${module.name.toLowerCase()} equipment registered for this client.`
              : undefined
          }
        />

        <Field>
          <p className="hint">
            The report number is assigned automatically as{' '}
            <strong>{module.report_prefix}-{new Date().getFullYear()}-nnnn</strong>.
          </p>
        </Field>
      </form>
    </Modal>
  )
}
