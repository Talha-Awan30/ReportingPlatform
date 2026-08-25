import { useState } from 'react'

import { authApi } from '../api/endpoints'
import { errorMessage } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import PageHeader from '../components/PageHeader'
import { useToast } from '../components/Toast'
import { Pill, TextInput, formatDateTime } from '../components/ui'

export default function Profile() {
  const { user, setUser } = useAuth()
  const toast = useToast()

  const [profile, setProfile] = useState({
    full_name: user?.full_name || '',
    phone: user?.phone || '',
    job_title: user?.job_title || '',
  })
  const [passwords, setPasswords] = useState({ current_password: '', new_password: '', confirm: '' })
  const [savingProfile, setSavingProfile] = useState(false)
  const [savingPassword, setSavingPassword] = useState(false)

  const saveProfile = async (event) => {
    event.preventDefault()
    setSavingProfile(true)
    try {
      const { user: updated } = await authApi.updateProfile(profile)
      setUser(updated)
      toast.success('Profile updated.')
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setSavingProfile(false)
    }
  }

  const changePassword = async (event) => {
    event.preventDefault()
    if (passwords.new_password !== passwords.confirm) {
      toast.error('The new passwords do not match.')
      return
    }
    setSavingPassword(true)
    try {
      await authApi.changePassword({
        current_password: passwords.current_password,
        new_password: passwords.new_password,
      })
      toast.success('Password updated.')
      setPasswords({ current_password: '', new_password: '', confirm: '' })
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setSavingPassword(false)
    }
  }

  return (
    <>
      <PageHeader
        icon="fa-user"
        title="Your Profile"
        subtitle="Your details and your sign-in password."
        crumbs={[{ label: 'Profile' }]}
      />

      <div className="section-card">
        <div className="card-head">
          <div>
            <h2><i className="fas fa-id-card" /> Account</h2>
            <p className="card-sub">Employee ID and role are managed by an administrator.</p>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <Pill tone="accent">{user?.employee_id}</Pill>
            <Pill tone="info">{user?.role_label}</Pill>
          </div>
        </div>

        <div className="detail-grid" style={{ marginBottom: '1.5rem' }}>
          <div className="field">
            <div className="k">Email</div>
            <div className="v">{user?.email}</div>
          </div>
          {user?.client_name && (
            <div className="field">
              <div className="k">Client</div>
              <div className="v">{user.client_name}</div>
            </div>
          )}
          <div className="field">
            <div className="k">Last sign-in</div>
            <div className="v">{formatDateTime(user?.last_login_at)}</div>
          </div>
        </div>

        <form className="field-grid" onSubmit={saveProfile}>
          <TextInput
            label="Full name"
            required
            value={profile.full_name}
            onChange={(e) => setProfile({ ...profile, full_name: e.target.value })}
          />
          <TextInput
            label="Job title"
            value={profile.job_title}
            onChange={(e) => setProfile({ ...profile, job_title: e.target.value })}
          />
          <TextInput
            label="Phone"
            value={profile.phone}
            onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
          />
          <div className="field span-2">
            <button type="submit" className="btn btn-primary" disabled={savingProfile}>
              <i className="fas fa-floppy-disk" /> {savingProfile ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </form>
      </div>

      <div className="section-card">
        <div className="card-head">
          <div>
            <h2><i className="fas fa-key" /> Change password</h2>
            <p className="card-sub">At least 8 characters.</p>
          </div>
        </div>

        <form className="field-grid" onSubmit={changePassword}>
          <TextInput
            label="Current password"
            type="password"
            required
            autoComplete="current-password"
            value={passwords.current_password}
            onChange={(e) => setPasswords({ ...passwords, current_password: e.target.value })}
          />
          <TextInput
            label="New password"
            type="password"
            required
            autoComplete="new-password"
            value={passwords.new_password}
            onChange={(e) => setPasswords({ ...passwords, new_password: e.target.value })}
          />
          <TextInput
            label="Confirm new password"
            type="password"
            required
            autoComplete="new-password"
            value={passwords.confirm}
            onChange={(e) => setPasswords({ ...passwords, confirm: e.target.value })}
          />
          <div className="field span-2">
            <button type="submit" className="btn btn-cta" disabled={savingPassword}>
              <i className="fas fa-key" /> {savingPassword ? 'Updating…' : 'Update password'}
            </button>
          </div>
        </form>
      </div>
    </>
  )
}
