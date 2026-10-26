import { useState } from 'react'
import { Link } from 'react-router-dom'

import { clientApi } from '../api/endpoints'
import { errorMessage } from '../api/client'
import { useApi, useDebounced } from '../hooks/useApi'
import { ROLES, useAuth } from '../auth/AuthContext'
import {
  SBU_OPTIONS,
  forgetSbuSubSectorMap,
  refreshClientDirectory,
  useSbuSubSectorMap,
} from '../hooks/useClientDirectory'
import ClientIdentityFields from '../components/ClientIdentityFields'
import ClientRequestModal from '../components/ClientRequestModal'
import PageHeader from '../components/PageHeader'
import Spinner from '../components/Spinner'
import { useToast } from '../components/Toast'
import { Empty, Modal, Pager, Pill, TextArea, TextInput } from '../components/ui'

export default function Clients() {
  const { hasRole } = useAuth()
  const toast = useToast()

  const [search, setSearch] = useState('')
  const [sbu, setSbu] = useState('')
  const [subSector, setSubSector] = useState('')
  const [status, setStatus] = useState('active')
  const [page, setPage] = useState(1)
  const [creating, setCreating] = useState(false)
  const [requesting, setRequesting] = useState(false)
  const debounced = useDebounced(search)
  const sbuMap = useSbuSubSectorMap()

  const clients = useApi(
    () =>
      clientApi.list({
        page,
        per_page: 50,
        search: debounced || undefined,
        sbu: sbu || undefined,
        sub_sector: subSector || undefined,
        active_only: status === 'active' ? 'true' : undefined,
        inactive_only: status === 'inactive' ? 'true' : undefined,
      }),
    [page, debounced, sbu, subSector, status],
  )

  // Sub sectors narrow to the chosen SBU; with no SBU, every one is offered.
  const subSectorOptions = sbu
    ? sbuMap[sbu] || []
    : [...new Set(Object.values(sbuMap).flat())].sort()

  const filtered = Boolean(search || sbu || subSector || status !== 'active')
  const resetFilters = () => {
    setSearch('')
    setSbu('')
    setSubSector('')
    setStatus('active')
    setPage(1)
  }

  const rows = clients.data?.items || []

  const create = async (payload) => {
    try {
      const { client } = await clientApi.create(payload)
      toast.success(`${client.name} added as ${client.code}.`)
      setCreating(false)
      clients.reload()
      refreshClientDirectory()
      forgetSbuSubSectorMap()
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  return (
    <>
      <PageHeader
        icon="fa-building"
        title="Clients"
        subtitle={
          clients.data
            ? `${clients.data.meta.total.toLocaleString()} ${filtered ? 'matching' : 'approved'} client${
                clients.data.meta.total === 1 ? '' : 's'
              }`
            : 'The SGS approved client list.'
        }
        crumbs={[{ label: 'Clients' }]}
        actions={
          hasRole(ROLES.ADMIN) ? (
            <button type="button" className="btn btn-cta" onClick={() => setCreating(true)}>
              <i className="fas fa-plus" /> New Client
            </button>
          ) : (
            <button type="button" className="btn btn-outline" onClick={() => setRequesting(true)}>
              <i className="fas fa-user-plus" /> Request new client
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
              placeholder="Search by name, code or sub sector…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setPage(1)
              }}
            />
          </div>
          <select
            value={sbu}
            onChange={(e) => {
              setSbu(e.target.value)
              setSubSector('')
              setPage(1)
            }}
          >
            <option value="">All SBUs</option>
            {SBU_OPTIONS.map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>
          <select
            value={subSector}
            onChange={(e) => {
              setSubSector(e.target.value)
              setPage(1)
            }}
          >
            <option value="">All sub sectors</option>
            {subSectorOptions.map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value)
              setPage(1)
            }}
          >
            <option value="active">Active</option>
            <option value="all">All</option>
            <option value="inactive">Inactive</option>
          </select>
          {filtered && (
            <button type="button" className="btn btn-outline btn-sm" onClick={resetFilters}>
              Reset
            </button>
          )}
        </div>

        {clients.loading ? (
          <Spinner label="Loading clients" />
        ) : rows.length ? (
          <>
            <div className="table-container">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Client</th>
                    <th>SBU</th>
                    <th>Sub sector</th>
                    <th className="text-right">Jobs</th>
                    <th className="text-right">Equipment</th>
                    <th className="text-right">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((client) => (
                    <tr key={client.id}>
                      <td style={{ whiteSpace: 'nowrap' }}><span className="cell-strong">{client.code}</span></td>
                      <td>
                        <Link to={`/clients/${client.id}`} className="cell-strong">
                          {client.name}
                        </Link>
                      </td>
                      <td>{client.sbu || '—'}</td>
                      <td className="cell-sub">{client.sub_sector || '—'}</td>
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
          <Empty icon="fa-building" title={filtered ? 'No clients match these filters' : 'No clients yet'}>
            {filtered
              ? 'Try a different search, or request the client if it is missing.'
              : 'Add the first client to start raising jobs against it.'}
          </Empty>
        )}
      </div>

      <ClientModal open={creating} onClose={() => setCreating(false)} onSave={create} />
      <ClientRequestModal open={requesting} onClose={() => setRequesting(false)} />
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
        : { name: '', sbu: '', sub_sector: '', industry: '', address: '', city: '', country: '', notes: '' },
    )
  }

  const set = (key) => (event) => setForm((f) => ({ ...f, [key]: event.target.value }))

  const submit = async (event) => {
    event.preventDefault()
    setSaving(true)
    // The code is assigned by the server for a new client, and fixed after.
    const { code: _code, ...payload } = form
    await onSave({ ...payload, sub_sector: form.sub_sector || null })
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
        {client && <TextInput label="Client code" value={form.code || ''} disabled />}
        <ClientIdentityFields value={form} onChange={setForm} />
        <TextInput label="Industry" value={form.industry || ''} onChange={set('industry')} />
        <TextInput label="City" value={form.city || ''} onChange={set('city')} />
        <TextInput label="Country" value={form.country || ''} onChange={set('country')} />
        <TextArea label="Address" value={form.address || ''} onChange={set('address')} rows={3} />
        <TextArea label="Notes" value={form.notes || ''} onChange={set('notes')} rows={3} />
      </form>
    </Modal>
  )
}
