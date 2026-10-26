import { useState } from 'react'
import { createPortal } from 'react-dom'
import { clientApi } from '../api/endpoints'
import { errorMessage } from '../api/client'
import ClientIdentityFields from './ClientIdentityFields'
import { useToast } from './Toast'
import { Modal } from './ui'

/**
 * "Request New Client" - for a company that is not on the approved list.
 * The request goes to an admin; the client is only selectable once approved.
 */
export default function ClientRequestModal({ open, initialName = '', onClose }) {
  const toast = useToast()
  const [form, setForm] = useState({ name: '', sbu: '', sub_sector: '' })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  // Start fresh each time it opens, seeded with what was typed in the search.
  const [wasOpen, setWasOpen] = useState(false)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setForm({ name: initialName, sbu: '', sub_sector: '' })
      setError('')
    }
  }

  const submit = async (event) => {
    event.preventDefault()
    // React bubbles events through the component tree, portal or not - keep
    // this submit from also submitting a form the picker sits inside.
    event.stopPropagation()
    const missing = [!form.name.trim() && 'Client name', !form.sbu && 'SBU'].filter(Boolean)
    if (missing.length) {
      setError(`Please fill in: ${missing.join(', ')}`)
      return
    }
    setSaving(true)
    setError('')
    try {
      await clientApi.request({ name: form.name, sbu: form.sbu, sub_sector: form.sub_sector || null })
      toast.success(`Request for ${form.name.trim()} sent. An admin will review it.`)
      onClose()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null
  // Portalled to <body> so its form is never nested inside the host form.
  return createPortal(
    <Modal
      open={open}
      title="Request new client"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-outline" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="client-request-form" className="btn btn-cta" disabled={saving}>
            {saving ? 'Sending…' : 'Submit request'}
          </button>
        </>
      }
    >
      <form id="client-request-form" className="field-grid" onSubmit={submit}>
        <ClientIdentityFields value={form} onChange={setForm} autoFocus />
      </form>
      <p className="client-request-note">
        <i className="fas fa-circle-info" /> Your request will be sent to an admin for approval. The
        client can be selected once it is approved.
      </p>
      {error && <p className="client-request-error">{error}</p>}
    </Modal>,
    document.body,
  )
}
