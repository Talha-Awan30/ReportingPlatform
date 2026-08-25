import { useState } from 'react'

import { clientApi, userApi } from '../../api/endpoints'
import { errorMessage } from '../../api/client'
import { useApi, useDebounced } from '../../hooks/useApi'
import PageHeader from '../../components/PageHeader'
import Spinner from '../../components/Spinner'
import { useToast } from '../../components/Toast'
import { Checkbox, Empty, Modal, Pager, Pill, Select, TextInput, formatDateTime } from '../../components/ui'

const ROLE_TONES = { admin: 'accent', reviewer: 'info', inspector: 'success', client: 'neutral' }

export default function Users() {
  const toast = useToast()

  const [search, setSearch] = useState('')
  const [role, setRole] = useState('')
  const [page, setPage] = useState(1)
  const [editing, setEditing] = useState(null) // null | {} | user
  const [credentials, setCredentials] = useState(null)
  const debounced = useDebounced(search)

  const users = useApi(
    () => userApi.list({ page, per_page: 25, search: debounced || undefined, role: role || undefined }),
    [page, debounced, role],
  )
  const clients = useApi(() => clientApi.list({ per_page: 200 }), [])
  const roles = useApi(() => userApi.roles(), [])

  const save = async (payload) => {
    try {
      if (payload.id) {
        await userApi.update(payload.id, payload)
        toast.success('User updated.')
      } else {
        const result = await userApi.create(payload)
        toast.success(`${result.user.full_name} created.`)
        if (result.generated_password) {
          setCredentials({ user: result.user, password: result.generated_password })
        }
      }
      setEditing(null)
      users.reload()
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  const resetPassword = async (user) => {
    if (!window.confirm(`Reset the password for ${user.full_name}?`)) return
    try {
      const result = await userApi.resetPassword(user.id, {})
      setCredentials({ user, password: result.generated_password })
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  const deactivate = async (user) => {
    if (!window.confirm(`Deactivate ${user.full_name}? They will no longer be able to sign in.`)) return
    try {
      await userApi.deactivate(user.id)
      toast.success('User deactivated.')
      users.reload()
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  return (
    <>
      <PageHeader
        icon="fa-users"
        title="Users & Roles"
        subtitle="Inspector, Reviewer, Client and Admin access levels."
        crumbs={[{ label: 'Admin' }, { label: 'Users & Roles' }]}
        actions={
          <button type="button" className="btn btn-cta" onClick={() => setEditing({})}>
            <i className="fas fa-user-plus" /> New User
          </button>
        }
      />

      <div className="section-card">
        <div className="filter-bar">
          <div className="search-field">
            <i className="fas fa-search" />
            <input
              type="text"
              placeholder="Search name, employee ID or email…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setPage(1)
              }}
            />
          </div>
          <select
            value={role}
            onChange={(e) => {
              setRole(e.target.value)
              setPage(1)
            }}
          >
            <option value="">All roles</option>
            {(roles.data?.roles || []).map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
        </div>

        {users.loading ? (
          <Spinner label="Loading users" />
        ) : users.data?.items?.length ? (
          <>
            <div className="table-container">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Employee ID</th>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Client</th>
                    <th>Last sign-in</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.data.items.map((user) => (
                    <tr key={user.id} style={user.is_active ? undefined : { opacity: 0.55 }}>
                      <td><span className="cell-strong">{user.employee_id}</span></td>
                      <td>
                        {user.full_name}
                        {user.job_title && <div className="cell-sub">{user.job_title}</div>}
                      </td>
                      <td className="cell-sub">{user.email}</td>
                      <td><Pill tone={ROLE_TONES[user.role] || 'neutral'}>{user.role_label}</Pill></td>
                      <td>{user.client_name || '—'}</td>
                      <td className="nowrap cell-sub">{formatDateTime(user.last_login_at)}</td>
                      <td>
                        <div className="row-actions">
                          <button type="button" className="btn btn-outline btn-sm" title="Edit" onClick={() => setEditing(user)}>
                            <i className="fas fa-pen" />
                          </button>
                          <button type="button" className="btn btn-outline btn-sm" title="Reset password" onClick={() => resetPassword(user)}>
                            <i className="fas fa-key" />
                          </button>
                          {user.is_active && (
                            <button type="button" className="btn btn-danger btn-sm" title="Deactivate" onClick={() => deactivate(user)}>
                              <i className="fas fa-user-slash" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager meta={users.data.meta} onPage={setPage} />
          </>
        ) : (
          <Empty icon="fa-users" title="No users match those filters" />
        )}
      </div>

      <UserModal
        open={Boolean(editing)}
        user={editing?.id ? editing : null}
        clients={clients.data?.items || []}
        roles={roles.data?.roles || []}
        onClose={() => setEditing(null)}
        onSave={save}
      />

      <Modal
        open={Boolean(credentials)}
        title="Temporary password"
        onClose={() => setCredentials(null)}
        footer={
          <button type="button" className="btn btn-cta" onClick={() => setCredentials(null)}>
            Done
          </button>
        }
      >
        <p style={{ marginBottom: '1rem' }}>
          Pass this to <strong>{credentials?.user?.full_name}</strong>. It is shown once and cannot be
          retrieved again — reset the password if it is lost.
        </p>
        <div className="field">
          <label>Employee ID</label>
          <input type="text" readOnly value={credentials?.user?.employee_id || ''} />
        </div>
        <div className="field" style={{ marginTop: '0.75rem' }}>
          <label>Password</label>
          <input type="text" readOnly value={credentials?.password || ''} />
        </div>
      </Modal>
    </>
  )
}

function UserModal({ open, user, clients, roles, onClose, onSave }) {
  const [form, setForm] = useState({})
  const [saving, setSaving] = useState(false)
  const [openedFor, setOpenedFor] = useState(null)

  if (open && openedFor !== (user?.id ?? 'new')) {
    setOpenedFor(user?.id ?? 'new')
    setForm(user ? { ...user } : { role: 'inspector', is_active: true })
  }
  if (!open && openedFor !== null) setOpenedFor(null)

  const set = (key) => (event) => setForm((f) => ({ ...f, [key]: event.target.value }))

  const submit = async (event) => {
    event.preventDefault()
    setSaving(true)
    await onSave({ ...form, client_id: form.client_id ? Number(form.client_id) : null })
    setSaving(false)
  }

  return (
    <Modal
      open={open}
      title={user ? `Edit ${user.full_name}` : 'New user'}
      onClose={onClose}
      wide
      footer={
        <>
          <button type="button" className="btn btn-outline" onClick={onClose}>Cancel</button>
          <button type="submit" form="user-form" className="btn btn-cta" disabled={saving}>
            {saving ? 'Saving…' : 'Save user'}
          </button>
        </>
      }
    >
      <form id="user-form" className="field-grid" onSubmit={submit}>
        <TextInput
          label="Employee ID"
          required
          value={form.employee_id || ''}
          onChange={set('employee_id')}
          disabled={Boolean(user)}
        />
        <TextInput label="Full name" required value={form.full_name || ''} onChange={set('full_name')} />
        <TextInput label="Email" required type="email" value={form.email || ''} onChange={set('email')} />
        <TextInput label="Job title" value={form.job_title || ''} onChange={set('job_title')} />
        <TextInput label="Phone" value={form.phone || ''} onChange={set('phone')} />
        <Select
          label="Role"
          required
          value={form.role || 'inspector'}
          onChange={set('role')}
          options={roles.map((r) => ({ value: r.value, label: r.label }))}
        />
        <Select
          label="Client"
          placeholder="Not linked to a client"
          value={form.client_id || ''}
          onChange={set('client_id')}
          options={clients.map((c) => ({ value: c.id, label: `${c.code} — ${c.name}` }))}
          hint="Required for client users — they only see this client's records."
          error={form.role === 'client' && !form.client_id ? 'A client user must be linked to a client.' : undefined}
        />
        {!user && (
          <TextInput
            label="Password"
            type="text"
            value={form.password || ''}
            onChange={set('password')}
            hint="Leave blank and one will be generated for you."
            span
          />
        )}
        {user && (
          <div className="field span-2">
            <Checkbox
              label="Account is active"
              checked={Boolean(form.is_active)}
              onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
            />
          </div>
        )}
      </form>
    </Modal>
  )
}
