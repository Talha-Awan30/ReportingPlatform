import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import { clientApi, equipmentApi, jobApi } from '../api/endpoints'
import { errorMessage } from '../api/client'
import { useApi } from '../hooks/useApi'
import { ROLES, useAuth } from '../auth/AuthContext'
import PageHeader from '../components/PageHeader'
import Spinner from '../components/Spinner'
import { useToast } from '../components/Toast'
import {
  CertificationPill,
  Checkbox,
  Empty,
  Modal,
  Pill,
  TextInput,
  formatDate,
} from '../components/ui'
import { ClientModal } from './Clients'

export default function ClientDetail() {
  const { id } = useParams()
  const toast = useToast()
  const { hasRole } = useAuth()
  const isAdmin = hasRole(ROLES.ADMIN)

  const [editing, setEditing] = useState(false)
  const [contactModal, setContactModal] = useState(null) // null | {} | contact

  const client = useApi(() => clientApi.get(id), [id])
  const jobs = useApi(() => jobApi.list({ client_id: id, per_page: 10 }), [id])
  const equipment = useApi(() => equipmentApi.list({ client_id: id, per_page: 100 }), [id])

  if (client.loading) return <Spinner full label="Loading client" />
  if (client.error) return <Empty icon="fa-triangle-exclamation" title="Could not load this client">{client.error}</Empty>

  const data = client.data.client

  const saveClient = async (payload) => {
    try {
      await clientApi.update(id, payload)
      toast.success('Client updated.')
      setEditing(false)
      client.reload()
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  const saveContact = async (payload) => {
    try {
      if (payload.id) await clientApi.updateContact(id, payload.id, payload)
      else await clientApi.addContact(id, payload)
      toast.success('Contact saved.')
      setContactModal(null)
      client.reload()
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  const deleteContact = async (contactId) => {
    if (!window.confirm('Remove this contact?')) return
    try {
      await clientApi.deleteContact(id, contactId)
      client.reload()
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  return (
    <>
      <PageHeader
        icon="fa-building"
        title={data.name}
        subtitle={`${data.code}${data.industry ? ` · ${data.industry}` : ''}`}
        crumbs={[{ label: 'Clients', to: '/clients' }, { label: data.name }]}
        actions={
          isAdmin && (
            <button type="button" className="btn btn-primary" onClick={() => setEditing(true)}>
              <i className="fas fa-pen" /> Edit
            </button>
          )
        }
      />

      <div className="kpi-grid">
        <div className="kpi info">
          <span className="kpi-icon"><i className="fas fa-briefcase" /></span>
          <span>
            <span className="kpi-value">{data.job_count}</span>
            <span className="kpi-label">Jobs</span>
          </span>
        </div>
        <div className="kpi accent">
          <span className="kpi-icon"><i className="fas fa-gears" /></span>
          <span>
            <span className="kpi-value">{data.equipment_count}</span>
            <span className="kpi-label">Equipment items</span>
          </span>
        </div>
        <div className="kpi">
          <span className="kpi-icon"><i className="fas fa-address-book" /></span>
          <span>
            <span className="kpi-value">{data.contacts?.length || 0}</span>
            <span className="kpi-label">Contacts</span>
          </span>
        </div>
      </div>

      <div className="section-card">
        <div className="card-head">
          <div><h2><i className="fas fa-circle-info" /> Details</h2></div>
          <Pill tone={data.is_active ? 'success' : 'neutral'}>{data.is_active ? 'Active' : 'Inactive'}</Pill>
        </div>
        <div className="detail-grid">
          <Detail k="Client code" v={data.code} />
          <Detail k="Industry" v={data.industry} />
          <Detail k="City" v={data.city} />
          <Detail k="Country" v={data.country} />
          <Detail k="Address" v={data.address} />
          <Detail k="Notes" v={data.notes} />
        </div>
      </div>

      <div className="section-card">
        <div className="card-head">
          <div>
            <h2><i className="fas fa-address-book" /> Contacts</h2>
            <p className="card-sub">Contacts flagged for alerts receive the certification expiry emails.</p>
          </div>
          {isAdmin && (
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setContactModal({})}>
              <i className="fas fa-plus" /> Add contact
            </button>
          )}
        </div>

        {data.contacts?.length ? (
          <div className="table-container">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Position</th>
                  <th>Email</th>
                  <th>Phone</th>
                  <th>Alerts</th>
                  {isAdmin && <th className="text-right">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {data.contacts.map((contact) => (
                  <tr key={contact.id}>
                    <td>
                      <span className="cell-strong">{contact.name}</span>
                      {contact.is_primary && <> <Pill tone="accent">Primary</Pill></>}
                    </td>
                    <td>{contact.position || '—'}</td>
                    <td>{contact.email}</td>
                    <td>{contact.phone || '—'}</td>
                    <td>
                      <Pill tone={contact.receives_alerts ? 'success' : 'neutral'}>
                        {contact.receives_alerts ? 'Receives alerts' : 'No alerts'}
                      </Pill>
                    </td>
                    {isAdmin && (
                      <td>
                        <div className="row-actions">
                          <button
                            type="button"
                            className="btn btn-outline btn-sm"
                            onClick={() => setContactModal(contact)}
                          >
                            <i className="fas fa-pen" />
                          </button>
                          <button
                            type="button"
                            className="btn btn-danger btn-sm"
                            onClick={() => deleteContact(contact.id)}
                          >
                            <i className="fas fa-trash" />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty icon="fa-address-book" title="No contacts yet">
            Add at least one contact so expiry alerts have somewhere to go.
          </Empty>
        )}
      </div>

      <div className="section-card">
        <div className="card-head">
          <div><h2><i className="fas fa-briefcase" /> Recent jobs</h2></div>
          <Link to={`/jobs?client_id=${id}`} className="btn btn-outline btn-sm">View all</Link>
        </div>
        {jobs.loading ? (
          <Spinner label="Loading jobs" />
        ) : jobs.data?.items?.length ? (
          <div className="table-container">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Job</th>
                  <th>Site</th>
                  <th>Inspection date</th>
                  <th className="text-right">Reports</th>
                </tr>
              </thead>
              <tbody>
                {jobs.data.items.map((job) => (
                  <tr key={job.id}>
                    <td><Link to={`/jobs/${job.id}`} className="cell-strong">{job.job_number}</Link></td>
                    <td>{job.site_name || '—'}</td>
                    <td className="nowrap">{formatDate(job.inspection_date)}</td>
                    <td className="text-right">{job.report_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty icon="fa-briefcase" title="No jobs for this client yet" />
        )}
      </div>

      <div className="section-card">
        <div className="card-head">
          <div><h2><i className="fas fa-gears" /> Equipment register</h2></div>
          <Link to={`/equipment?client_id=${id}`} className="btn btn-outline btn-sm">View all</Link>
        </div>
        {equipment.loading ? (
          <Spinner label="Loading equipment" />
        ) : equipment.data?.items?.length ? (
          <div className="table-container">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Tag</th>
                  <th>Type</th>
                  <th>Location</th>
                  <th>Last inspected</th>
                  <th className="text-right">Certification</th>
                </tr>
              </thead>
              <tbody>
                {equipment.data.items.map((item) => (
                  <tr key={item.id}>
                    <td><Link to={`/equipment/${item.id}`} className="cell-strong">{item.tag_number}</Link></td>
                    <td>{item.type_name}</td>
                    <td>{item.location || '—'}</td>
                    <td className="nowrap">{formatDate(item.last_inspection_date)}</td>
                    <td className="text-right">
                      <CertificationPill status={item.certification_status} days={item.days_to_expiry} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty icon="fa-gears" title="No equipment registered for this client yet" />
        )}
      </div>

      <ClientModal open={editing} client={data} onClose={() => setEditing(false)} onSave={saveClient} />
      <ContactModal
        open={Boolean(contactModal)}
        contact={contactModal}
        onClose={() => setContactModal(null)}
        onSave={saveContact}
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

function ContactModal({ open, contact, onClose, onSave }) {
  const [form, setForm] = useState({})
  const [openedFor, setOpenedFor] = useState(null)

  if (open && openedFor !== (contact?.id ?? 'new')) {
    setOpenedFor(contact?.id ?? 'new')
    setForm({ receives_alerts: true, is_primary: false, ...(contact || {}) })
  }
  if (!open && openedFor !== null) setOpenedFor(null)

  const set = (key) => (event) => setForm((f) => ({ ...f, [key]: event.target.value }))
  const toggle = (key) => (event) => setForm((f) => ({ ...f, [key]: event.target.checked }))

  return (
    <Modal
      open={open}
      title={contact?.id ? `Edit ${contact.name}` : 'Add contact'}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-outline" onClick={onClose}>Cancel</button>
          <button type="submit" form="contact-form" className="btn btn-cta">Save contact</button>
        </>
      }
    >
      <form
        id="contact-form"
        className="field-grid"
        onSubmit={(e) => {
          e.preventDefault()
          onSave(form)
        }}
      >
        <TextInput label="Name" required value={form.name || ''} onChange={set('name')} />
        <TextInput label="Position" value={form.position || ''} onChange={set('position')} />
        <TextInput label="Email" required type="email" value={form.email || ''} onChange={set('email')} />
        <TextInput label="Phone" value={form.phone || ''} onChange={set('phone')} />
        <div className="field span-2">
          <Checkbox
            label="Receives certification expiry alerts"
            checked={Boolean(form.receives_alerts)}
            onChange={toggle('receives_alerts')}
          />
          <Checkbox
            label="Primary contact for this client"
            checked={Boolean(form.is_primary)}
            onChange={toggle('is_primary')}
          />
        </div>
      </form>
    </Modal>
  )
}
