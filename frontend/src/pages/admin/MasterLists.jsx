import { useState } from 'react'

import { masterListApi, moduleApi } from '../../api/endpoints'
import { errorMessage } from '../../api/client'
import { useApi } from '../../hooks/useApi'
import PageHeader from '../../components/PageHeader'
import Spinner from '../../components/Spinner'
import { useToast } from '../../components/Toast'
import { Checkbox, Empty, Modal, Pill, Select, TextArea, TextInput } from '../../components/ui'

const SEVERITIES = [
  { value: 'neutral', label: 'Neutral' },
  { value: 'success', label: 'Success (green)' },
  { value: 'warning', label: 'Warning (yellow)' },
  { value: 'danger', label: 'Danger (red)' },
  { value: 'info', label: 'Info (blue)' },
]

/**
 * The approved wording behind every inspection dropdown. A list scoped to a
 * module overrides the global list of the same key, so one module can reword a
 * checkpoint without affecting the others.
 */
export default function MasterLists() {
  const toast = useToast()

  const [selectedId, setSelectedId] = useState(null)
  const [listModal, setListModal] = useState(false)
  const [optionModal, setOptionModal] = useState(null) // null | {} | option

  const modules = useApi(() => moduleApi.list({ include_disabled: 'true' }), [])
  const lists = useApi(() => masterListApi.list(), [])

  const all = lists.data?.lists || []
  const selected = all.find((l) => l.id === selectedId) || all[0]

  const createList = async (payload) => {
    try {
      await masterListApi.create(payload)
      toast.success('List created.')
      setListModal(false)
      lists.reload()
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  const saveOption = async (payload) => {
    try {
      if (payload.id) await masterListApi.updateOption(selected.id, payload.id, payload)
      else await masterListApi.addOption(selected.id, payload)
      toast.success('Option saved.')
      setOptionModal(null)
      lists.reload()
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  const deleteOption = async (optionId) => {
    if (!window.confirm('Remove this option? Reports already using it keep their stored value.')) return
    try {
      await masterListApi.deleteOption(selected.id, optionId)
      lists.reload()
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  const deleteList = async () => {
    if (!window.confirm(`Delete the "${selected.name}" list and all of its options?`)) return
    try {
      await masterListApi.remove(selected.id)
      toast.success('List deleted.')
      setSelectedId(null)
      lists.reload()
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  return (
    <>
      <PageHeader
        icon="fa-list-check"
        title="Dropdown Master Lists"
        subtitle="The approved wording behind every inspection checkpoint. Edit it here, not in code."
        crumbs={[{ label: 'Admin' }, { label: 'Master Lists' }]}
        actions={
          <button type="button" className="btn btn-cta" onClick={() => setListModal(true)}>
            <i className="fas fa-plus" /> New List
          </button>
        }
      />

      {lists.loading ? (
        <Spinner full label="Loading master lists" />
      ) : !all.length ? (
        <div className="section-card">
          <Empty icon="fa-list" title="No master lists yet">
            Run <code>flask --app app seed</code> to create the standard lists, or add one here.
          </Empty>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(240px, 300px) 1fr', gap: '1.5rem' }}>
          <div className="section-card" style={{ alignSelf: 'start' }}>
            <div className="card-head">
              <div><h2><i className="fas fa-layer-group" /> Lists</h2></div>
            </div>
            <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              {all.map((list) => (
                <li key={list.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(list.id)}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      padding: '0.65rem 0.85rem',
                      borderRadius: 'var(--border-radius-sm)',
                      border: '1px solid',
                      borderColor: selected?.id === list.id ? 'var(--primary-color)' : 'var(--border-light)',
                      background: selected?.id === list.id ? 'var(--bg-secondary)' : 'transparent',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >
                    <div style={{ fontWeight: 600, color: 'var(--secondary-color)', fontSize: '0.875rem' }}>
                      {list.name}
                    </div>
                    <div className="cell-sub">
                      {list.key} · {list.option_count} option(s)
                    </div>
                    <div style={{ marginTop: '0.35rem' }}>
                      <Pill tone={list.module_slug ? 'accent' : 'info'}>
                        {list.module_slug || 'Global'}
                      </Pill>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {selected && (
            <div className="section-card">
              <div className="card-head">
                <div>
                  <h2><i className="fas fa-list-ol" /> {selected.name}</h2>
                  <p className="card-sub">
                    {selected.description || 'No description.'} Referenced as{' '}
                    <code>{selected.key}</code>.
                  </p>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button type="button" className="btn btn-primary btn-sm" onClick={() => setOptionModal({})}>
                    <i className="fas fa-plus" /> Add option
                  </button>
                  <button type="button" className="btn btn-danger btn-sm" onClick={deleteList}>
                    <i className="fas fa-trash" />
                  </button>
                </div>
              </div>

              {selected.options?.length ? (
                <div className="table-container">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Label</th>
                        <th>Stored value</th>
                        <th>Text used in the Word report</th>
                        <th>Badge</th>
                        <th className="text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selected.options.map((option) => (
                        <tr key={option.id}>
                          <td>
                            <span className="cell-strong">{option.label}</span>
                            {option.is_default && <> <Pill tone="accent">Default</Pill></>}
                          </td>
                          <td><code>{option.value}</code></td>
                          <td className="cell-sub" style={{ maxWidth: 380 }}>
                            {option.report_text || <span className="muted">Falls back to the label</span>}
                          </td>
                          <td><Pill tone={option.severity}>{option.severity}</Pill></td>
                          <td>
                            <div className="row-actions">
                              <button type="button" className="btn btn-outline btn-sm" onClick={() => setOptionModal(option)}>
                                <i className="fas fa-pen" />
                              </button>
                              <button type="button" className="btn btn-danger btn-sm" onClick={() => deleteOption(option.id)}>
                                <i className="fas fa-trash" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <Empty icon="fa-list" title="This list has no options yet">
                  Add the choices inspectors should be able to pick.
                </Empty>
              )}
            </div>
          )}
        </div>
      )}

      <ListModal
        open={listModal}
        modules={modules.data?.modules || []}
        onClose={() => setListModal(false)}
        onSave={createList}
      />
      <OptionModal
        open={Boolean(optionModal)}
        option={optionModal?.id ? optionModal : null}
        onClose={() => setOptionModal(null)}
        onSave={saveOption}
      />
    </>
  )
}

function ListModal({ open, modules, onClose, onSave }) {
  const [form, setForm] = useState({})
  const [openedFor, setOpenedFor] = useState(null)

  if (open && openedFor !== 'new') {
    setOpenedFor('new')
    setForm({ key: '', name: '', description: '', module_slug: '' })
  }
  if (!open && openedFor !== null) setOpenedFor(null)

  const set = (key) => (event) => setForm((f) => ({ ...f, [key]: event.target.value }))

  return (
    <Modal
      open={open}
      title="New master list"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-outline" onClick={onClose}>Cancel</button>
          <button type="submit" form="list-form" className="btn btn-cta">Create list</button>
        </>
      }
    >
      <form
        id="list-form"
        className="field-grid single"
        onSubmit={(e) => {
          e.preventDefault()
          onSave(form)
        }}
      >
        <TextInput
          label="Key"
          required
          value={form.key || ''}
          onChange={set('key')}
          hint="Referenced by a checkpoint's options_key, e.g. inspection_result"
        />
        <TextInput label="Display name" required value={form.name || ''} onChange={set('name')} />
        <Select
          label="Scope"
          placeholder="Global — available to every module"
          value={form.module_slug || ''}
          onChange={set('module_slug')}
          options={modules.map((m) => ({ value: m.slug, label: `${m.name} only` }))}
          hint="A module-scoped list overrides the global list with the same key."
        />
        <TextArea label="Description" value={form.description || ''} onChange={set('description')} rows={3} />
      </form>
    </Modal>
  )
}

function OptionModal({ open, option, onClose, onSave }) {
  const [form, setForm] = useState({})
  const [openedFor, setOpenedFor] = useState(null)

  if (open && openedFor !== (option?.id ?? 'new')) {
    setOpenedFor(option?.id ?? 'new')
    setForm(option ? { ...option } : { severity: 'neutral', is_default: false, is_active: true })
  }
  if (!open && openedFor !== null) setOpenedFor(null)

  const set = (key) => (event) => setForm((f) => ({ ...f, [key]: event.target.value }))

  return (
    <Modal
      open={open}
      title={option ? `Edit "${option.label}"` : 'Add option'}
      onClose={onClose}
      wide
      footer={
        <>
          <button type="button" className="btn btn-outline" onClick={onClose}>Cancel</button>
          <button type="submit" form="option-form" className="btn btn-cta">Save option</button>
        </>
      }
    >
      <form
        id="option-form"
        className="field-grid"
        onSubmit={(e) => {
          e.preventDefault()
          onSave(form)
        }}
      >
        <TextInput
          label="Stored value"
          required
          value={form.value || ''}
          onChange={set('value')}
          disabled={Boolean(option)}
          hint="Lowercase, no spaces — this is what gets saved on the report."
        />
        <TextInput
          label="Label"
          required
          value={form.label || ''}
          onChange={set('label')}
          hint="What the inspector sees in the dropdown."
        />
        <Select
          label="Badge colour"
          value={form.severity || 'neutral'}
          onChange={set('severity')}
          options={SEVERITIES}
        />
        <div className="field">
          <label>Flags</label>
          <Checkbox
            label="Pre-selected by default"
            checked={Boolean(form.is_default)}
            onChange={(e) => setForm((f) => ({ ...f, is_default: e.target.checked }))}
          />
          <Checkbox
            label="Available for selection"
            checked={form.is_active !== false}
            onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
          />
        </div>
        <TextArea
          label="Text used in the Word report"
          value={form.report_text || ''}
          onChange={set('report_text')}
          rows={4}
          hint="The approved clause printed when this option is chosen. Leave blank to use the label."
        />
      </form>
    </Modal>
  )
}
