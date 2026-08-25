import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import { clientApi, jobApi, userApi } from '../api/endpoints'
import { errorMessage } from '../api/client'
import { useApi, useDebounced } from '../hooks/useApi'
import PageHeader from '../components/PageHeader'
import Spinner from '../components/Spinner'
import { useToast } from '../components/Toast'
import { Empty, Modal, Pager, Pill, Select, TextArea, TextInput, formatDate } from '../components/ui'

const STATUS_TONES = {
  open: 'info',
  in_progress: 'warning',
  completed: 'success',
  cancelled: 'neutral',
}

export default function Jobs() {
  const toast = useToast()
  const [params, setParams] = useSearchParams()

  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [creating, setCreating] = useState(false)
  const debounced = useDebounced(search)

  const clientId = params.get('client_id') || ''
  const status = params.get('status') || ''

  const clients = useApi(() => clientApi.list({ per_page: 200 }), [])
  const jobs = useApi(
    () =>
      jobApi.list({
        page,
        per_page: 25,
        search: debounced || undefined,
        client_id: clientId || undefined,
        status: status || undefined,
      }),
    [page, debounced, clientId, status],
  )

  const setFilter = (key, value) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
    setPage(1)
  }

  const create = async (payload) => {
    try {
      const { job } = await jobApi.create(payload)
      toast.success(`${job.job_number} created.`)
      setCreating(false)
      jobs.reload()
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  return (
    <>
      <PageHeader
        icon="fa-briefcase"
        title="Jobs"
        subtitle="A job groups every report from one site visit."
        crumbs={[{ label: 'Jobs' }]}
        actions={
          <button type="button" className="btn btn-cta" onClick={() => setCreating(true)}>
            <i className="fas fa-plus" /> New Job
          </button>
        }
      />

      <div className="section-card">
        <div className="filter-bar">
          <div className="search-field">
            <i className="fas fa-search" />
            <input
              type="text"
              placeholder="Search job number, site or client…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setPage(1)
              }}
            />
          </div>
          <select value={clientId} onChange={(e) => setFilter('client_id', e.target.value)}>
            <option value="">All clients</option>
            {(clients.data?.items || []).map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <select value={status} onChange={(e) => setFilter('status', e.target.value)}>
            <option value="">All statuses</option>
            <option value="open">Open</option>
            <option value="in_progress">In progress</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>

        {jobs.loading ? (
          <Spinner label="Loading jobs" />
        ) : jobs.data?.items?.length ? (
          <>
            <div className="table-container">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Job</th>
                    <th>Client</th>
                    <th>Site</th>
                    <th>Inspection date</th>
                    <th>Team lead</th>
                    <th className="text-right">Reports</th>
                    <th className="text-right">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.data.items.map((job) => (
                    <tr key={job.id}>
                      <td>
                        <Link to={`/jobs/${job.id}`} className="cell-strong">{job.job_number}</Link>
                        {job.purchase_order && <div className="cell-sub">PO {job.purchase_order}</div>}
                      </td>
                      <td>{job.client_name}</td>
                      <td>{job.site_name || '—'}</td>
                      <td className="nowrap">{formatDate(job.inspection_date)}</td>
                      <td>{job.team_lead_name || '—'}</td>
                      <td className="text-right">{job.report_count}</td>
                      <td className="text-right">
                        <Pill tone={STATUS_TONES[job.status] || 'neutral'}>
                          {job.status.replace('_', ' ')}
                        </Pill>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager meta={jobs.data.meta} onPage={setPage} />
          </>
        ) : (
          <Empty icon="fa-briefcase" title="No jobs match those filters">
            Create a job before starting an inspection against it.
          </Empty>
        )}
      </div>

      <JobModal
        open={creating}
        clients={clients.data?.items || []}
        onClose={() => setCreating(false)}
        onSave={create}
      />
    </>
  )
}

export function JobModal({ open, job, clients = [], onClose, onSave }) {
  const [form, setForm] = useState({})
  const [saving, setSaving] = useState(false)
  const [openedFor, setOpenedFor] = useState(null)

  const staff = useApi(() => (open ? userApi.assignable() : null), [open])
  const nextNumber = useApi(() => (open && !job ? jobApi.nextNumber() : null), [open, job])

  if (open && openedFor !== (job?.id ?? 'new')) {
    setOpenedFor(job?.id ?? 'new')
    setForm(
      job
        ? { ...job, inspection_date: (job.inspection_date || '').slice(0, 10) }
        : { client_id: '', site_name: '', site_address: '', purchase_order: '', inspection_date: '', notes: '' },
    )
  }
  if (!open && openedFor !== null) setOpenedFor(null)

  // Show the number the job is about to receive, so it is not a surprise.
  useEffect(() => {
    if (nextNumber.data?.job_number && !job) {
      setForm((f) => ({ ...f, job_number: nextNumber.data.job_number }))
    }
  }, [nextNumber.data, job])

  const set = (key) => (event) => setForm((f) => ({ ...f, [key]: event.target.value }))

  const submit = async (event) => {
    event.preventDefault()
    setSaving(true)
    await onSave({ ...form, client_id: Number(form.client_id) || undefined })
    setSaving(false)
  }

  return (
    <Modal
      open={open}
      title={job ? `Edit ${job.job_number}` : 'New job'}
      onClose={onClose}
      wide
      footer={
        <>
          <button type="button" className="btn btn-outline" onClick={onClose}>Cancel</button>
          <button type="submit" form="job-form" className="btn btn-cta" disabled={saving}>
            {saving ? 'Saving…' : 'Save job'}
          </button>
        </>
      }
    >
      <form id="job-form" className="field-grid" onSubmit={submit}>
        <TextInput
          label="Job number"
          value={form.job_number || ''}
          onChange={set('job_number')}
          disabled={Boolean(job)}
          hint={job ? undefined : 'Assigned automatically — override only if the job already has a number.'}
        />
        <Select
          label="Client"
          required
          placeholder="Select a client…"
          value={form.client_id || ''}
          onChange={set('client_id')}
          disabled={Boolean(job)}
          options={clients.map((c) => ({ value: c.id, label: `${c.code} — ${c.name}` }))}
        />
        <TextInput label="Site name" value={form.site_name || ''} onChange={set('site_name')} />
        <TextInput label="Purchase order" value={form.purchase_order || ''} onChange={set('purchase_order')} />
        <div className="field">
          <label>Inspection date</label>
          <input type="date" value={form.inspection_date || ''} onChange={set('inspection_date')} />
        </div>
        <Select
          label="Team lead"
          placeholder="Nobody assigned"
          value={form.team_lead_id || ''}
          onChange={set('team_lead_id')}
          options={(staff.data?.users || []).map((u) => ({ value: u.id, label: `${u.full_name} (${u.role})` }))}
          hint="Copied on the certification expiry alerts for this job's equipment."
        />
        {job && (
          <Select
            label="Status"
            value={form.status || 'open'}
            onChange={set('status')}
            options={[
              { value: 'open', label: 'Open' },
              { value: 'in_progress', label: 'In progress' },
              { value: 'completed', label: 'Completed' },
              { value: 'cancelled', label: 'Cancelled' },
            ]}
          />
        )}
        <TextArea label="Site address" value={form.site_address || ''} onChange={set('site_address')} rows={3} />
        <TextArea label="Notes" value={form.notes || ''} onChange={set('notes')} rows={3} />
      </form>
    </Modal>
  )
}
