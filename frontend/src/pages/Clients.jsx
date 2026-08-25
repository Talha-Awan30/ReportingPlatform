import { useState } from 'react'
import { Link } from 'react-router-dom'

import { clientApi } from '../api/endpoints'
import { errorMessage } from '../api/client'
import { useApi, useDebounced } from '../hooks/useApi'
import { ROLES, useAuth } from '../auth/AuthContext'
import PageHeader from '../components/PageHeader'
import Spinner from '../components/Spinner'
import { useToast } from '../components/Toast'
import { Empty, Modal, Pager, Pill, TextArea, TextInput } from '../components/ui'

export default function Clients() {
  const { hasRole } = useAuth()
  const toast = useToast()

  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [creating, setCreating] = useState(false)
  const debounced = useDebounced(search)

  const clients = useApi(
    () => clientApi.list({ page, per_page: 25, search: debounced || undefined }),
    [page, debounced],
  )

  const create = async (payload) => {
    try {
      await clientApi.create(payload)
      toast.success(`${payload.name} added.`)
      setCreating(false)
      clients.reload()
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  return (
    <>
      <PageHeader
        icon="fa-building"
        title="Clients"
        subtitle="Who the reports are for, and who receives the expiry alerts."
        crumbs={[{ label: 'Clients' }]}
        actions={
          hasRole(ROLES.ADMIN) && (
            <button type="button" className="btn btn-cta" onClick={() => setCreating(true)}>
              <i className="fas fa-plus" /> New Client
            </button>
          )
        }
      />

      <div className="section-card">
        <div className="filter-bar">
          <div className="search-field">
            <i className="fas fa-search" />
            <input
              type="text"
              placeholder="Search by name or code…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setPage(1)
              }}
            />
          </div>
        </div>

        {clients.loading ? (
          <Spinner label="Loading clients" />
        ) : clients.data?.items?.length ? (
          <>
            <div className="table-container">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Client</th>
                    <th>Industry</th>
                    <th>Location</th>
                    <th className="text-right">Jobs</th>
                    <th className="text-right">Equipment</th>
                    <th className="text-right">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {clients.data.items.map((client) => (
                    <tr key={client.id}>
                      <td><span className="cell-strong">{client.code}</span></td>
                      <td>
                        <Link to={`/clients/${client.id}`} className="cell-strong">
                          {client.name}
                        </Link>
                      </td>
                      <td>{client.industry || '—'}</td>
                      <td className="cell-sub">
                        {[client.city, client.country].filter(Boolean).join(', ') || '—'}
                      </td>
                      <td className="text-right">{client.job_count}</td>
                      <td className="text-right">{client.equipment_count}</td>
                      <td className="text-right">
                        <Pill tone={client.is_active ? 'success' : 'neutral'}>
                          {client.is_active ? 'Active' : 'Inactive'}
                        </Pill>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager meta={clients.data.meta} onPage={setPage} />
          </>
        ) : (
          <Empty icon="fa-building" title="No clients yet">
            Add the first client to start raising jobs against it.
          </Empty>
        )}
      </div>

      <ClientModal open={creating} onClose={() => setCreating(false)} onSave={create} />
    </>
  )
}

export function ClientModal({ open, client, onClose, onSave }) {
  const [form, setForm] = useState({})
  const [saving, setSaving] = useState(false)

  // Reset the form each time the modal opens, so it never shows stale values.
  const [openedFor, setOpenedFor] = useState(null)
  if (open && openedFor !== (client?.id ?? 'new')) {
    setOpenedFor(client?.id ?? 'new')
    setForm(
      client
        ? { ...client }
        : { code: '', name: '', industry: '', address: '', city: '', country: '', notes: '' },
    )
  }

  const set = (key) => (event) => setForm((f) => ({ ...f, [key]: event.target.value }))

  const submit = async (event) => {
    event.preventDefault()
    setSaving(true)
    await onSave(form)
    setSaving(false)
  }

  return (
    <Modal
      open={open}
      title={client ? `Edit ${client.name}` : 'New client'}
      onClose={onClose}
      wide
      footer={
        <>
          <button type="button" className="btn btn-outline" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="client-form" className="btn btn-cta" disabled={saving}>
            {saving ? 'Saving…' : 'Save client'}
          </button>
        </>
      }
    >
      <form id="client-form" className="field-grid" onSubmit={submit}>
        <TextInput
          label="Client code"
          required
          value={form.code || ''}
          onChange={set('code')}
          disabled={Boolean(client)}
          hint={client ? 'The code cannot be changed once records exist.' : 'Short unique code, e.g. ACME'}
        />
        <TextInput label="Client name" required value={form.name || ''} onChange={set('name')} />
        <TextInput label="Industry" value={form.industry || ''} onChange={set('industry')} />
        <TextInput label="City" value={form.city || ''} onChange={set('city')} />
        <TextInput label="Country" value={form.country || ''} onChange={set('country')} />
        <TextArea label="Address" value={form.address || ''} onChange={set('address')} rows={3} />
        <TextArea label="Notes" value={form.notes || ''} onChange={set('notes')} rows={3} />
      </form>
    </Modal>
  )
}
