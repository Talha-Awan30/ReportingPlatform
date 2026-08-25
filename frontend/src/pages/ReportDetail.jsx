import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import { downloadFile, moduleApi, reportApi } from '../api/endpoints'
import { errorDetails, errorMessage } from '../api/client'
import { useApi } from '../hooks/useApi'
import { DynamicFieldGrid } from '../components/DynamicFields'
import { ROLES, useAuth } from '../auth/AuthContext'
import PageHeader from '../components/PageHeader'
import Spinner from '../components/Spinner'
import { useToast } from '../components/Toast'
import {
  Empty,
  Modal,
  Pill,
  StatusPill,
  TextArea,
  formatDate,
  formatDateTime,
  toDateInput,
} from '../components/ui'

/**
 * One report, end to end: the inspection form (rendered from the module
 * manifest), both photo sets, the workflow actions available to this user, and
 * the full approval trail.
 */
export default function ReportDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const { user, hasRole, isClient } = useAuth()

  const report = useApi(() => reportApi.get(id), [id])
  const slug = report.data?.report?.module_slug
  const schema = useApi(() => (slug ? moduleApi.formSchema(slug) : null), [slug])

  const [answers, setAnswers] = useState({})
  const [comments, setComments] = useState('')
  const [overallResult, setOverallResult] = useState('')
  const [inspectionDate, setInspectionDate] = useState('')
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [missing, setMissing] = useState([])
  const [dialog, setDialog] = useState(null) // 'return' | 'query' | 'approve'

  // Seed the form once the report arrives, and again after any reload.
  const loadedRevision = useRef(null)
  useEffect(() => {
    const data = report.data?.report
    if (!data) return
    const stamp = `${data.id}:${data.revision}:${data.updated_at}`
    if (loadedRevision.current === stamp) return
    loadedRevision.current = stamp

    setAnswers(data.data || {})
    setComments(data.comments || '')
    setOverallResult(data.overall_result || '')
    setInspectionDate(toDateInput(data.inspection_date))
    setDirty(false)
  }, [report.data])

  const setAnswer = useCallback((key, patch) => {
    setAnswers((current) => ({ ...current, [key]: { ...(current[key] || {}), ...patch } }))
    setDirty(true)
  }, [])

  const data = report.data?.report
  const module = schema.data?.module
  const options = schema.data?.options || {}

  const canEdit = useMemo(() => {
    if (!data) return false
    if (isClient) return false
    if (!data.is_editable) return false
    if (user?.role === ROLES.INSPECTOR && data.inspector_name !== user.full_name) return false
    return true
  }, [data, isClient, user])

  const save = async ({ silent = false } = {}) => {
    setSaving(true)
    try {
      const result = await reportApi.update(id, {
        data: answers,
        comments,
        overall_result: overallResult || null,
        inspection_date: inspectionDate || null,
      })
      report.setData({ ...report.data, report: { ...report.data.report, ...result.report } })
      setDirty(false)
      if (!silent) toast.success('Draft saved.')
      return true
    } catch (err) {
      toast.error(errorMessage(err))
      return false
    } finally {
      setSaving(false)
    }
  }

  const submit = async () => {
    if (dirty && !(await save({ silent: true }))) return
    setMissing([])
    try {
      const result = await reportApi.submit(id)
      toast.success(result.message)
      report.reload()
    } catch (err) {
      const details = errorDetails(err)
      setMissing(details.missing || [])
      toast.error(errorMessage(err))
    }
  }

  const act = async (fn, successMessage) => {
    try {
      const result = await fn()
      toast.success(result.message || successMessage)
      setDialog(null)
      report.reload()
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  const download = async () => {
    try {
      await downloadFile(reportApi.downloadUrl(id), data.docx_path)
    } catch (err) {
      toast.error(errorMessage(err, 'The document is not available yet.'))
    }
  }

  const remove = async () => {
    if (!window.confirm('Delete this draft? This cannot be undone.')) return
    try {
      await reportApi.remove(id)
      toast.success('Draft deleted.')
      navigate('/reports')
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  if (report.loading) return <Spinner full label="Loading report" />
  if (report.error) return <Empty icon="fa-triangle-exclamation" title="Could not load this report">{report.error}</Empty>

  const missingKeys = new Set(missing.map((m) => m.key))
  const filledSlots = new Set(
    (data.photos || []).filter((p) => p.checkpoint_key).map((p) => p.checkpoint_key),
  )
  const slotsFilled = (module?.photo_slots || []).filter((s) => filledSlots.has(s.key)).length

  return (
    <>
      <PageHeader
        icon="fa-file-lines"
        title={data.report_number}
        subtitle={[
          data.set_number && `${data.set_number} · ${module?.unit_noun || 'unit'} #${data.sequence}`,
          data.equipment_tag,
          data.client_name,
        ]
          .filter(Boolean)
          .join(' · ')}
        crumbs={[{ label: 'Reports', to: '/reports' }, { label: data.report_number }]}
        actions={
          <>
            {data.docx_path && (
              <button type="button" className="btn btn-outline" onClick={download}>
                <i className="fas fa-file-word" /> Download Word
              </button>
            )}

            {canEdit && (
              <>
                <button type="button" className="btn btn-primary" onClick={() => save()} disabled={saving || !dirty}>
                  <i className="fas fa-floppy-disk" /> {saving ? 'Saving…' : 'Save draft'}
                </button>
                <button type="button" className="btn btn-cta" onClick={submit} disabled={saving}>
                  <i className="fas fa-paper-plane" /> Submit for review
                </button>
              </>
            )}

            {hasRole(ROLES.REVIEWER) && data.status === 'submitted' && (
              <>
                <button type="button" className="btn btn-outline" onClick={() => setDialog('return')}>
                  <i className="fas fa-rotate-left" /> Return
                </button>
                <button type="button" className="btn btn-cta" onClick={() => setDialog('approve')}>
                  <i className="fas fa-check" /> Approve &amp; release
                </button>
              </>
            )}

            {isClient && ['approved', 'client_query'].includes(data.status) && (
              <>
                <button type="button" className="btn btn-outline" onClick={() => setDialog('query')}>
                  <i className="fas fa-circle-question" /> Raise a query
                </button>
                <button
                  type="button"
                  className="btn btn-cta"
                  onClick={() => act(() => reportApi.clientApprove(id), 'Report approved.')}
                >
                  <i className="fas fa-check" /> Approve
                </button>
              </>
            )}

            {data.status === 'draft' && !isClient && (
              <button type="button" className="btn btn-danger" onClick={remove}>
                <i className="fas fa-trash" /> Delete
              </button>
            )}
          </>
        }
      />

      {data.status === 'returned' && data.return_reason && (
        <div className="alert alert-danger" style={{ marginBottom: '1.5rem' }}>
          <i className="fas fa-rotate-left" />
          <span>
            <strong>Returned for correction:</strong> {data.return_reason}
          </span>
        </div>
      )}

      {data.status === 'client_query' && data.client_query_text && (
        <div className="alert alert-warning" style={{ marginBottom: '1.5rem' }}>
          <i className="fas fa-circle-question" />
          <span>
            <strong>Client query:</strong> {data.client_query_text}
          </span>
        </div>
      )}

      {missing.length > 0 && (
        <div className="alert alert-danger" style={{ marginBottom: '1.5rem' }}>
          <i className="fas fa-triangle-exclamation" />
          <span>
            <strong>{missing.length} required checkpoint(s) are still blank.</strong> They are
            highlighted below.
          </span>
        </div>
      )}

      {/* ------------------------------------------------------------ header */}
      <div className="section-card">
        <div className="card-head">
          <div>
            <h2><i className="fas fa-circle-info" /> Report details</h2>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <StatusPill label={data.status_label} severity={data.status_severity} />
            <Pill tone="neutral">Revision {data.revision}</Pill>
          </div>
        </div>

        <div className="detail-grid">
          <Detail k="Client" v={data.client_name} />
          <Detail k="Job" v={<Link to={`/jobs/${data.job_id}`}>{data.job_number}</Link>} />
          <Detail k="Equipment" v={<Link to={`/equipment/${data.equipment_id}`}>{data.equipment_tag}</Link>} />
          <Detail k="Equipment type" v={data.equipment_type} />
          <Detail k="Serial number" v={data.equipment?.serial_number} />
          <Detail k="SWL / Capacity" v={[data.equipment?.swl, data.equipment?.capacity].filter(Boolean).join(' · ')} />
          <Detail k="Location" v={data.equipment?.location} />
          <Detail k="Inspector" v={data.inspector_name} />
          <Detail k="Reviewer" v={data.reviewer_name} />
          <Detail k="Submitted" v={formatDateTime(data.submitted_at)} />
          <Detail k="Reviewed" v={formatDateTime(data.reviewed_at)} />
          <Detail k="Certificate expires" v={formatDate(data.certificate_expiry_date)} />
        </div>

        {canEdit && (
          <div className="field-grid" style={{ marginTop: '1.5rem' }}>
            <div className="field">
              <label>Inspection date</label>
              <input
                type="date"
                value={inspectionDate}
                onChange={(e) => {
                  setInspectionDate(e.target.value)
                  setDirty(true)
                }}
              />
            </div>
            <div className="field">
              <label>Overall conclusion</label>
              <select
                value={overallResult}
                onChange={(e) => {
                  setOverallResult(e.target.value)
                  setDirty(true)
                }}
              >
                <option value="">Not set</option>
                {(options.overall_result?.options || [
                  { value: 'satisfactory', label: 'Satisfactory' },
                  { value: 'unsatisfactory', label: 'Unsatisfactory' },
                  { value: 'conditional', label: 'Conditional' },
                ]).map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
      </div>

      {/* ------------------------------------------------- particulars table */}
      {module?.unit_details?.length > 0 && (
        <div className="section-card">
          <div className="card-head">
            <div>
              <h2><i className="fas fa-table-list" /> Particulars</h2>
              <p className="card-sub">
                The detail table printed at the head of this {module.unit_noun}&apos;s report.
              </p>
            </div>
            {data.set_number && (
              <Link to={`/inspection-sets/${data.inspection_set_id}`} className="btn btn-outline btn-sm">
                <i className="fas fa-layer-group" /> {data.set_number} · {module.unit_noun} #{data.sequence}
              </Link>
            )}
          </div>
          <DynamicFieldGrid
            fields={module.unit_details}
            values={answers}
            options={options}
            editable={canEdit}
            missingKeys={missingKeys}
            onChange={(key, patch) => setAnswer(key, patch)}
          />
        </div>
      )}

      {/* -------------------------------------------------------------- form */}
      {schema.loading ? (
        <Spinner label="Loading the inspection form" />
      ) : module && module.sections.length ? (
        module.sections.map((section) => (
          <div className="section-card" key={section.key}>
            <div className="card-head">
              <div>
                <h2>{section.title}</h2>
                {section.description && <p className="card-sub">{section.description}</p>}
              </div>
              <Pill tone="neutral">{section.checkpoints.length} checks</Pill>
            </div>

            <div className="table-container">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th style={{ width: '42%' }}>Check point</th>
                    <th style={{ width: '25%' }}>Result</th>
                    <th>Remarks / Recommendations</th>
                  </tr>
                </thead>
                <tbody>
                  {section.checkpoints.map((cp) => (
                    <CheckpointRow
                      key={cp.key}
                      checkpoint={cp}
                      value={answers[cp.key] || {}}
                      options={options[cp.options_key]?.options || []}
                      editable={canEdit}
                      flagged={missingKeys.has(cp.key)}
                      onChange={(patch) => setAnswer(cp.key, patch)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))
      ) : (
        <div className="section-card">
          <Empty icon="fa-hammer" title="This module has no checkpoints yet">
            The <strong>{data.module_slug}</strong> module is scaffolded but its checkpoint list has
            not been built out. Add sections to its <code>module.py</code> and they appear here.
          </Empty>
        </div>
      )}

      {/* --------------------------------------------- findings & conclusion */}
      {module?.conclusion?.length > 0 && (
        <div className="section-card">
          <div className="card-head">
            <div>
              <h2><i className="fas fa-gavel" /> Findings &amp; conclusion</h2>
              <p className="card-sub">Closes this {module.unit_noun}&apos;s report.</p>
            </div>
          </div>
          <DynamicFieldGrid
            fields={module.conclusion}
            values={answers}
            options={options}
            editable={canEdit}
            missingKeys={missingKeys}
            onChange={(key, patch) => setAnswer(key, patch)}
          />
        </div>
      )}

      {/* ---------------------------------------------------------- comments */}
      <div className="section-card">
        <div className="card-head">
          <div>
            <h2><i className="fas fa-comment-dots" /> Observations &amp; recommendations</h2>
            <p className="card-sub">Free text that carries straight into the Word report.</p>
          </div>
        </div>
        {canEdit ? (
          <TextArea
            value={comments}
            onChange={(e) => {
              setComments(e.target.value)
              setDirty(true)
            }}
            placeholder="Defects found, recommendations, anything the client should act on…"
            rows={5}
          />
        ) : (
          <p style={{ whiteSpace: 'pre-wrap' }}>{comments || <span className="muted">No comments recorded.</span>}</p>
        )}
      </div>

      {/* ------------------------------------------------------------ photos */}
      {module?.photo_slots?.length > 0 ? (
        <div className="section-card">
          <div className="card-head">
            <div>
              <h2><i className="fas fa-images" /> Photographic presentation</h2>
              <p className="card-sub">
                One photograph per box, laid out exactly as the approved report format.
              </p>
            </div>
            <Pill tone={slotsFilled === module.photo_slots.length ? 'success' : 'warning'}>
              {slotsFilled} of {module.photo_slots.length} filled
            </Pill>
          </div>
          <div className="photo-grid">
            {module.photo_slots.map((slot) => (
              <ReportPhotoSlot
                key={slot.key}
                reportId={id}
                slot={slot}
                photos={(data.photos || []).filter(
                  (p) => p.kind === 'inspection' && p.checkpoint_key === slot.key,
                )}
                editable={canEdit}
                onChanged={report.reload}
              />
            ))}
          </div>
        </div>
      ) : (
        <>
          <PhotoSection
            reportId={id}
            title="Front-page photographs"
            subtitle="Used only on the report cover — kept separate on purpose."
            icon="fa-image"
            kind="front_page"
            photos={(data.photos || []).filter((p) => p.kind === 'front_page')}
            editable={canEdit}
            onChanged={report.reload}
          />

          <PhotoSection
            reportId={id}
            title="Inspection photographs"
            subtitle="Evidence for the body of the report."
            icon="fa-images"
            kind="inspection"
            photos={(data.photos || []).filter((p) => p.kind === 'inspection')}
            editable={canEdit}
            onChanged={report.reload}
          />
        </>
      )}

      {/* ------------------------------------------------------------- trail */}
      <div className="section-card">
        <div className="card-head">
          <div>
            <h2><i className="fas fa-clock-rotate-left" /> Approval trail</h2>
            <p className="card-sub">Who submitted, who reviewed, who approved — with dates.</p>
          </div>
        </div>
        {data.events?.length ? (
          <ul className="timeline">
            {data.events.map((event) => (
              <li key={event.id} className={event.event_type}>
                <div className="t-head">
                  <span className="t-title">{event.event_label}</span>
                  <span className="t-meta">
                    {event.user_name} · {formatDateTime(event.created_at)}
                  </span>
                </div>
                {event.note && <div className="t-note">{event.note}</div>}
              </li>
            ))}
          </ul>
        ) : (
          <Empty icon="fa-clock" title="No events recorded yet" />
        )}
      </div>

      {/* ----------------------------------------------------------- dialogs */}
      <ReasonDialog
        open={dialog === 'return'}
        title="Return for correction"
        label="What needs to be fixed?"
        confirmLabel="Return to inspector"
        onClose={() => setDialog(null)}
        onConfirm={(reason) => act(() => reportApi.returnForCorrection(id, reason), 'Returned.')}
      />

      <ReasonDialog
        open={dialog === 'query'}
        title="Raise a query"
        label="What would you like clarified?"
        confirmLabel="Send query"
        onClose={() => setDialog(null)}
        onConfirm={(query) => act(() => reportApi.clientQuery(id, query), 'Query raised.')}
      />

      <ApproveDialog
        open={dialog === 'approve'}
        report={data}
        onClose={() => setDialog(null)}
        onConfirm={(payload) => act(() => reportApi.approve(id, payload), 'Approved.')}
      />
    </>
  )
}

/* ------------------------------------------------------------------ pieces */
function Detail({ k, v }) {
  return (
    <div className="field">
      <div className="k">{k}</div>
      <div className="v">{v || <span className="muted">—</span>}</div>
    </div>
  )
}

function CheckpointRow({ checkpoint, value, options, editable, flagged, onChange }) {
  const selected = options.find((o) => o.value === value.value)

  const control = () => {
    if (!editable) {
      if (checkpoint.kind === 'dropdown') {
        return selected ? (
          <Pill tone={selected.severity === 'neutral' ? 'neutral' : selected.severity}>{selected.label}</Pill>
        ) : (
          <span className="muted">—</span>
        )
      }
      return <span>{value.value || <span className="muted">—</span>}</span>
    }

    switch (checkpoint.kind) {
      case 'dropdown':
        return (
          <select value={value.value || ''} onChange={(e) => onChange({ value: e.target.value })}>
            <option value="">Select…</option>
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        )
      case 'textarea':
        return (
          <textarea
            rows={2}
            value={value.value || ''}
            onChange={(e) => onChange({ value: e.target.value })}
          />
        )
      case 'number':
        return (
          <input type="number" value={value.value ?? ''} onChange={(e) => onChange({ value: e.target.value })} />
        )
      case 'date':
        return (
          <input type="date" value={value.value || ''} onChange={(e) => onChange({ value: e.target.value })} />
        )
      case 'checkbox':
        return (
          <input
            type="checkbox"
            checked={Boolean(value.value)}
            onChange={(e) => onChange({ value: e.target.checked })}
          />
        )
      default:
        return <input type="text" value={value.value || ''} onChange={(e) => onChange({ value: e.target.value })} />
    }
  }

  return (
    <tr style={flagged ? { background: 'rgba(245, 38, 46, 0.05)' } : undefined}>
      <td>
        <span className="cell-strong">
          {checkpoint.label}
          {checkpoint.required && <span style={{ color: 'var(--danger-color)' }}> *</span>}
        </span>
        {checkpoint.help_text && <div className="cell-sub">{checkpoint.help_text}</div>}
        {checkpoint.reference && <div className="cell-sub">Ref: {checkpoint.reference}</div>}
      </td>
      <td className="field">{control()}</td>
      <td className="field">
        {editable ? (
          <input
            type="text"
            placeholder="Remarks…"
            value={value.remarks || ''}
            onChange={(e) => onChange({ remarks: e.target.value })}
          />
        ) : (
          value.remarks || <span className="muted">—</span>
        )}
      </td>
    </tr>
  )
}

function PhotoSection({ reportId, title, subtitle, icon, kind, photos, editable, onChanged }) {
  const toast = useToast()
  const inputRef = useRef(null)
  const [uploading, setUploading] = useState(false)

  const upload = async (event) => {
    const files = event.target.files
    if (!files?.length) return
    setUploading(true)
    try {
      await reportApi.uploadPhotos(reportId, files, kind)
      toast.success(`${files.length} photo(s) uploaded.`)
      onChanged()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const remove = async (photoId) => {
    try {
      await reportApi.deletePhoto(reportId, photoId)
      onChanged()
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  return (
    <div className="section-card">
      <div className="card-head">
        <div>
          <h2><i className={`fas ${icon}`} /> {title}</h2>
          <p className="card-sub">{subtitle}</p>
        </div>
        {editable && (
          <>
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              multiple
              style={{ display: 'none' }}
              onChange={upload}
            />
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
            >
              <i className={`fas ${uploading ? 'fa-circle-notch fa-spin' : 'fa-upload'}`} />{' '}
              {uploading ? 'Uploading…' : 'Upload photos'}
            </button>
          </>
        )}
      </div>

      {photos.length ? (
        <div className="photo-grid">
          {photos.map((photo) => (
            <figure className="photo-tile" key={photo.id}>
              <img src={photo.url} alt={photo.caption || photo.original_name} loading="lazy" />
              <figcaption className="photo-meta">
                <span title={photo.caption || photo.original_name}>
                  {photo.caption || photo.original_name}
                </span>
                {editable && (
                  <button
                    type="button"
                    className="toast-close"
                    onClick={() => remove(photo.id)}
                    aria-label="Remove photo"
                  >
                    <i className="fas fa-trash" />
                  </button>
                )}
              </figcaption>
            </figure>
          ))}
        </div>
      ) : (
        <Empty icon="fa-image" title="No photos in this set">
          {editable ? 'Upload the images that belong in this part of the report.' : 'Nothing was attached.'}
        </Empty>
      )}
    </div>
  )
}

/** One labelled box of the photographic presentation. */
function ReportPhotoSlot({ reportId, slot, photos, editable, onChanged }) {
  const toast = useToast()
  const inputRef = useRef(null)
  const [busy, setBusy] = useState(false)

  const upload = async (event) => {
    const files = event.target.files
    if (!files?.length) return
    setBusy(true)
    try {
      await reportApi.uploadPhotos(reportId, files, 'inspection', { checkpoint_key: slot.key })
      toast.success(`${slot.label} uploaded.`)
      onChanged()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const remove = async (photoId) => {
    try {
      await reportApi.deletePhoto(reportId, photoId)
      onChanged()
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  const first = photos[0]

  return (
    <figure className="photo-tile">
      {first ? (
        <img src={first.url} alt={slot.label} loading="lazy" />
      ) : (
        <div
          style={{
            height: 130,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--text-muted)',
            fontSize: '1.5rem',
            background: 'var(--bg-secondary)',
          }}
        >
          <i className="fas fa-camera" />
        </div>
      )}
      <figcaption className="photo-meta">
        <span title={slot.label}>
          {slot.label}
          {slot.required && !first && <span style={{ color: 'var(--danger-color)' }}> *</span>}
        </span>
        {editable && (
          <span style={{ display: 'flex', gap: '0.35rem' }}>
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={upload}
            />
            <button
              type="button"
              className="toast-close"
              onClick={() => inputRef.current?.click()}
              disabled={busy}
              aria-label={`Upload ${slot.label}`}
            >
              <i className={`fas ${busy ? 'fa-circle-notch fa-spin' : 'fa-upload'}`} />
            </button>
            {first && (
              <button
                type="button"
                className="toast-close"
                onClick={() => remove(first.id)}
                aria-label={`Remove ${slot.label}`}
              >
                <i className="fas fa-trash" />
              </button>
            )}
          </span>
        )}
      </figcaption>
    </figure>
  )
}

function ReasonDialog({ open, title, label, confirmLabel, onClose, onConfirm }) {
  const [text, setText] = useState('')
  useEffect(() => {
    if (open) setText('')
  }, [open])

  return (
    <Modal
      open={open}
      title={title}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-outline" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-cta" disabled={!text.trim()} onClick={() => onConfirm(text.trim())}>
            {confirmLabel}
          </button>
        </>
      }
    >
      <TextArea label={label} required value={text} onChange={(e) => setText(e.target.value)} rows={5} autoFocus />
    </Modal>
  )
}

function ApproveDialog({ open, report, onClose, onConfirm }) {
  const [expiry, setExpiry] = useState('')
  const [note, setNote] = useState('')

  useEffect(() => {
    if (open) {
      setExpiry(toDateInput(report?.certificate_expiry_date))
      setNote('')
    }
  }, [open, report])

  return (
    <Modal
      open={open}
      title="Approve and release to the client"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-outline" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-cta"
            onClick={() => onConfirm({ certificate_expiry_date: expiry || null, note: note || null })}
          >
            <i className="fas fa-check" /> Approve
          </button>
        </>
      }
    >
      <div className="field-grid single">
        <div className="field">
          <label>Certificate expiry date</label>
          <input type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} />
          <span className="hint">
            Leave blank to use the validity configured for this equipment type. The equipment record
            and the expiry alerts both follow this date.
          </span>
        </div>
        <TextArea label="Approval note" value={note} onChange={(e) => setNote(e.target.value)} rows={3} />
      </div>
    </Modal>
  )
}
