import { useState } from 'react'

import { equipmentApi, moduleApi } from '../../api/endpoints'
import { errorMessage } from '../../api/client'
import { useApi } from '../../hooks/useApi'
import PageHeader from '../../components/PageHeader'
import Spinner from '../../components/Spinner'
import { useToast } from '../../components/Toast'
import { Checkbox, Empty, Modal, Pill, Select, TextArea, TextInput } from '../../components/ui'

/**
 * Equipment types tie a piece of equipment to the module that inspects it and
 * set how long its certification stays valid.
 */
export default function EquipmentTypes() {
  const toast = useToast()
  const [editing, setEditing] = useState(null)

  const types = useApi(() => equipmentApi.types(), [])
  const modules = useApi(() => moduleApi.list({ include_disabled: 'true' }), [])

  const save = async (payload) => {
    try {
      if (payload.id) await equipmentApi.updateType(payload.id, payload)
      else await equipmentApi.createType(payload)
      toast.success('Equipment type saved.')
      setEditing(null)
      types.reload()
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  const moduleName = (slug) => modules.data?.modules?.find((m) => m.slug === slug)?.name || slug

  return (
    <>
      <PageHeader
        icon="fa-tags"
        title="Equipment Types"
        subtitle="Each type points at the inspection module that handles it, and sets its certification validity."
        crumbs={[{ label: 'Admin' }, { label: 'Equipment Types' }]}
        actions={
          <button type="button" className="btn btn-cta" onClick={() => setEditing({})}>
            <i className="fas fa-plus" /> New Type
          </button>
        }
      />

      <div className="section-card">
        {types.loading ? (
          <Spinner label="Loading equipment types" />
        ) : types.data?.types?.length ? (
          <div className="table-container">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Inspection module</th>
                  <th>Validity</th>
                  <th className="text-right">Items registered</th>
                  <th className="text-right">Status</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {types.data.types.map((type) => (
                  <tr key={type.id}>
                    <td>
                      <span className="cell-strong">{type.name}</span>
                      {type.description && <div className="cell-sub">{type.description}</div>}
                    </td>
                    <td>
                      {type.module_slug ? (
                        <Pill tone="accent">{moduleName(type.module_slug)}</Pill>
                      ) : (
                        <span className="muted">Not linked</span>
                      )}
                    </td>
                    <td>{type.default_validity_months} months</td>
                    <td className="text-right">{type.equipment_count}</td>
                    <td className="text-right">
                      <Pill tone={type.is_active ? 'success' : 'neutral'}>
                        {type.is_active ? 'Active' : 'Inactive'}
                      </Pill>
                    </td>
                    <td>
                      <div className="row-actions">
                        <button type="button" className="btn btn-outline btn-sm" onClick={() => setEditing(type)}>
                          <i className="fas fa-pen" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty icon="fa-tags" title="No equipment types yet">
            Seeding creates one type per name declared by each module manifest.
          </Empty>
        )}
      </div>

      <TypeModal
        open={Boolean(editing)}
        type={editing?.id ? editing : null}
        modules={modules.data?.modules || []}
        onClose={() => setEditing(null)}
        onSave={save}
      />
    </>
  )
}

function TypeModal({ open, type, modules, onClose, onSave }) {
  const [form, setForm] = useState({})
  const [openedFor, setOpenedFor] = useState(null)

  if (open && openedFor !== (type?.id ?? 'new')) {
    setOpenedFor(type?.id ?? 'new')
    setForm(type ? { ...type } : { default_validity_months: 12, is_active: true, module_slug: '' })
  }
  if (!open && openedFor !== null) setOpenedFor(null)

  const set = (key) => (event) => setForm((f) => ({ ...f, [key]: event.target.value }))

  return (
    <Modal
      open={open}
      title={type ? `Edit ${type.name}` : 'New equipment type'}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-outline" onClick={onClose}>Cancel</button>
          <button type="submit" form="type-form" className="btn btn-cta">Save type</button>
        </>
      }
    >
      <form
        id="type-form"
        className="field-grid single"
        onSubmit={(e) => {
          e.preventDefault()
          onSave({ ...form, default_validity_months: Number(form.default_validity_months) || 12 })
        }}
      >
        <TextInput label="Type name" required value={form.name || ''} onChange={set('name')} />
        <Select
          label="Inspection module"
          placeholder="Not linked to a module"
          value={form.module_slug || ''}
          onChange={set('module_slug')}
          options={modules.map((m) => ({ value: m.slug, label: m.name }))}
          hint="Decides which inspection form is used for equipment of this type."
        />
        <TextInput
          label="Certification validity (months)"
          type="number"
          required
          value={form.default_validity_months ?? 12}
          onChange={set('default_validity_months')}
          hint="Used to set the expiry date when a report is approved."
        />
        <TextArea label="Description" value={form.description || ''} onChange={set('description')} rows={3} />
        <div className="field">
          <Checkbox
            label="Available for selection"
            checked={form.is_active !== false}
            onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
          />
        </div>
      </form>
    </Modal>
  )
}
