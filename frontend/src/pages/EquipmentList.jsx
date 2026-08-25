import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import { clientApi, equipmentApi } from '../api/endpoints'
import { errorMessage } from '../api/client'
import { useApi, useDebounced } from '../hooks/useApi'
import PageHeader from '../components/PageHeader'
import Spinner from '../components/Spinner'
import { useToast } from '../components/Toast'
import { CertificationPill, Empty, Modal, Pager, Select, TextArea, TextInput, formatDate } from '../components/ui'

const CERT_FILTERS = [
  { value: 'valid', label: 'Valid' },
  { value: 'upcoming', label: 'Due within 60 days' },
  { value: 'due', label: 'Due within 30 days' },
  { value: 'critical', label: 'Due within 7 days' },
  { value: 'expired', label: 'Expired' },
  { value: 'uncertified', label: 'No certificate' },
]

export default function EquipmentList() {
  const toast = useToast()
  const [params, setParams] = useSearchParams()

  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [creating, setCreating] = useState(false)
  const debounced = useDebounced(search)

  const clientId = params.get('client_id') || ''
  const certStatus = params.get('certification_status') || ''

  const clients = useApi(() => clientApi.list({ per_page: 200 }), [])
  const types = useApi(() => equipmentApi.types({ active_only: 'true' }), [])
  const equipment = useApi(
    () =>
      equipmentApi.list({
        page,
        per_page: 25,
        search: debounced || undefined,
        client_id: clientId || undefined,
        certification_status: certStatus || undefined,
      }),
    [page, debounced, clientId, certStatus],
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
      await equipmentApi.create(payload)
      toast.success(`${payload.tag_number} added to the register.`)
      setCreating(false)
      equipment.reload()
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  return (
    <>
      <PageHeader
        icon="fa-gears"
        title="Equipment Register"
        subtitle="Every item that gets inspected, with its certification status."
        crumbs={[{ label: 'Equipment' }]}
        actions={
          <button type="button" className="btn btn-cta" onClick={() => setCreating(true)}>
            <i className="fas fa-plus" /> Add Equipment
          </button>
        }
      />

      <div className="section-card">
        <div className="filter-bar">
          <div className="search-field">
            <i className="fas fa-search" />
            <input
              type="text"
              placeholder="Search tag, serial number or location…"
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
          <select value={certStatus} onChange={(e) => setFilter('certification_status', e.target.value)}>
            <option value="">Any certification status</option>
            {CERT_FILTERS.map((f) => (
              <option key={f.value} value={f.value}>{f.label}</option>
            ))}
          </select>
        </div>

        {equipment.loading ? (
          <Spinner label="Loading equipment" />
        ) : equipment.data?.items?.length ? (
          <>
            <div className="table-container">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Tag</th>
                    <th>Type</th>
                    <th>Client</th>
                    <th>Location</th>
                    <th>SWL</th>
                    <th>Last inspected</th>
                    <th>Expires</th>
                    <th className="text-right">Certification</th>
                  </tr>
                </thead>
                <tbody>
                  {equipment.data.items.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <Link to={`/equipment/${item.id}`} className="cell-strong">{item.tag_number}</Link>
                        {item.serial_number && <div className="cell-sub">S/N {item.serial_number}</div>}
                      </td>
                      <td>{item.type_name}</td>
                      <td>{item.client_name}</td>
                      <td>{item.location || '—'}</td>
                      <td>{item.swl || '—'}</td>
                      <td className="nowrap">{formatDate(item.last_inspection_date)}</td>
                      <td className="nowrap">{formatDate(item.certificate_expiry_date)}</td>
                      <td className="text-right">
                        <CertificationPill status={item.certification_status} days={item.days_to_expiry} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager meta={equipment.data.meta} onPage={setPage} />
          </>
        ) : (
          <Empty icon="fa-gears" title="No equipment matches those filters">
            Add the items this client has on site so inspections can be raised against them.
          </Empty>
        )}
      </div>

      <EquipmentModal
        open={creating}
        clients={clients.data?.items || []}
        types={types.data?.types || []}
        onClose={() => setCreating(false)}
        onSave={create}
      />
    </>
  )
}

export function EquipmentModal({ open, equipment, clients = [], types = [], onClose, onSave }) {
  const [form, setForm] = useState({})
  const [saving, setSaving] = useState(false)
  const [openedFor, setOpenedFor] = useState(null)

  if (open && openedFor !== (equipment?.id ?? 'new')) {
    setOpenedFor(equipment?.id ?? 'new')
    setForm(
      equipment
        ? {
            ...equipment,
            last_inspection_date: (equipment.last_inspection_date || '').slice(0, 10),
            certificate_expiry_date: (equipment.certificate_expiry_date || '').slice(0, 10),
          }
        : { client_id: '', equipment_type_id: '', tag_number: '' },
    )
  }
  if (!open && openedFor !== null) setOpenedFor(null)

  const set = (key) => (event) => setForm((f) => ({ ...f, [key]: event.target.value }))

  const submit = async (event) => {
    event.preventDefault()
    setSaving(true)
    await onSave({
      ...form,
      client_id: Number(form.client_id) || undefined,
      equipment_type_id: Number(form.equipment_type_id) || undefined,
      year_of_manufacture: form.year_of_manufacture ? Number(form.year_of_manufacture) : null,
    })
    setSaving(false)
  }

  return (
    <Modal
      open={open}
      title={equipment ? `Edit ${equipment.tag_number}` : 'Add equipment'}
      onClose={onClose}
      wide
      footer={
        <>
          <button type="button" className="btn btn-outline" onClick={onClose}>Cancel</button>
          <button type="submit" form="equipment-form" className="btn btn-cta" disabled={saving}>
            {saving ? 'Saving…' : 'Save equipment'}
          </button>
        </>
      }
    >
      <form id="equipment-form" className="field-grid" onSubmit={submit}>
        <Select
          label="Client"
          required
          placeholder="Select a client…"
          value={form.client_id || ''}
          onChange={set('client_id')}
          disabled={Boolean(equipment)}
          options={clients.map((c) => ({ value: c.id, label: `${c.code} — ${c.name}` }))}
        />
        <Select
          label="Equipment type"
          required
          placeholder="Select a type…"
          value={form.equipment_type_id || ''}
          onChange={set('equipment_type_id')}
          options={types.map((t) => ({ value: t.id, label: t.name }))}
          hint="The type decides which inspection module handles this item."
        />
        <TextInput label="Tag / ID number" required value={form.tag_number || ''} onChange={set('tag_number')} />
        <TextInput label="Serial number" value={form.serial_number || ''} onChange={set('serial_number')} />
        <TextInput label="Manufacturer" value={form.manufacturer || ''} onChange={set('manufacturer')} />
        <TextInput label="Model" value={form.model || ''} onChange={set('model')} />
        <TextInput
          label="Year of manufacture"
          type="number"
          value={form.year_of_manufacture || ''}
          onChange={set('year_of_manufacture')}
        />
        <TextInput label="SWL" value={form.swl || ''} onChange={set('swl')} hint="Safe working load, e.g. 5 Tonne" />
        <TextInput label="Capacity" value={form.capacity || ''} onChange={set('capacity')} />
        <TextInput label="Location on site" value={form.location || ''} onChange={set('location')} />
        <div className="field">
          <label>Last inspection date</label>
          <input type="date" value={form.last_inspection_date || ''} onChange={set('last_inspection_date')} />
        </div>
        <div className="field">
          <label>Certificate expiry date</label>
          <input type="date" value={form.certificate_expiry_date || ''} onChange={set('certificate_expiry_date')} />
          <span className="hint">Approving a report updates this automatically.</span>
        </div>
        <TextArea label="Notes" value={form.notes || ''} onChange={set('notes')} rows={3} />
      </form>
    </Modal>
  )
}
